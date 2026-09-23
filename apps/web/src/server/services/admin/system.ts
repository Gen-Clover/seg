import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "@seg/data";
import { isTitleInScope, type DomainConfig } from "@seg/domain";
import type { Session } from "../../auth/session";
import { bigquery, bigQueryConfig } from "../../bigquery";
import { collections, db } from "../../db";
import { env } from "../../env";
import { HttpError } from "../../http";
import { EVERYONE } from "../chat";
import { recordJob } from "../jobs";
import { runIngest } from "../ingest";
import { audit, domainConfig, getSettings, getSettingsWithMeta, updateSettings, type AppSettings } from "../settings";

const timed = async <T>(fn: () => Promise<T>): Promise<{ ms: number; ok: boolean; value?: T; error?: string }> => {
  const t = performance.now();
  try {
    const value = await fn();
    return { ms: Math.round(performance.now() - t), ok: true, value };
  } catch (err) {
    return { ms: Math.round(performance.now() - t), ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

export const isDemoEnvironment = () => env().AUTH_PROVIDER === "credentials";

/* ---------------- Health ---------------- */

export async function health() {
  const e = env();
  const database = await db();
  const cfg = bigQueryConfig();
  const [mongo, bq, summary, title] = await Promise.all([
    timed(() => database.command({ ping: 1 })),
    e.GCP_PROJECT_ID
      ? timed(async () => {
          const [rows] = await bigquery().query({ query: "SELECT 1 AS ok", location: cfg.location });
          return rows.length;
        })
      : Promise.resolve({ ms: 0, ok: false, error: "BigQuery is not configured in this environment." }),
    timed(async () => (await collections.titles()).countDocuments({ inScope: true })),
    timed(async () => {
      const t = await (await collections.titles()).findOne({ inScope: true }, { projection: { _id: 1 } });
      return t ? (await collections.facts()).countDocuments({ isbn: t._id }) : 0;
    }),
  ]);
  const counts = Object.fromEntries(
    await Promise.all(
      ["titles", "title_account_facts", "estimates", "estimate_events", "comments", "chat_messages", "users"].map(async (c) => [c, await database.collection(c).estimatedDocumentCount()]),
    ),
  );
  return {
    version: process.env.npm_package_version ?? "0.1.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
    database: e.MONGODB_DB,
    signIn: e.AUTH_PROVIDER === "credentials" ? "Demo e-mail and password" : "Microsoft Entra ID",
    writeback: e.WRITEBACK,
    bigQuery: { project: cfg.projectId || null, source: cfg.sourceDataset, app: cfg.appDataset },
    checks: {
      mongo: { ok: mongo.ok, ms: mongo.ms, error: mongo.error ?? null },
      bigQuery: { ok: bq.ok, ms: bq.ms, error: bq.error ?? null },
      summaryQuery: { ok: summary.ok, ms: summary.ms },
      titleQuery: { ok: title.ok, ms: title.ms },
    },
    counts,
    checkedAt: new Date().toISOString(),
  };
}

/* ---------------- BigQuery sync ---------------- */

export async function syncHealth() {
  const [events, comments, rooms, messages, users, settingsDoc, state] = await Promise.all([
    (await collections.events()).countDocuments({ syncedAt: null }),
    (await collections.comments()).countDocuments({ syncedAt: null }),
    (await collections.chatRooms()).countDocuments({ syncedAt: null }),
    (await collections.chatMessages()).countDocuments({ syncedAt: null }),
    (await collections.users()).countDocuments({ syncedAt: null }),
    (await collections.settings()).countDocuments({ syncedAt: null }),
    (await collections.syncState()).findOne({ _id: "writeback" }),
  ]);
  const oldest = await (await collections.events()).find({ syncedAt: null }).sort({ changedAt: 1 }).limit(1).next();
  return {
    mode: env().WRITEBACK,
    pending: { edits: events, comments, chatRooms: rooms, chatMessages: messages, users, settings: settingsDoc },
    oldestPendingEdit: oldest?.changedAt ?? null,
    lastSuccessAt: state?.lastSuccessAt ?? null,
    lastSent: state?.lastSent ?? 0,
    lastError: state?.lastError ?? null,
    lastErrorAt: state?.lastErrorAt ?? null,
  };
}

/* ---------------- Overview ---------------- */

export async function overview() {
  const [settingsEntry, users, sessions, sync, reports, lastIngest, failedJobs, unanswered] = await Promise.all([
    getSettingsWithMeta(),
    (await collections.users()).find({}, { projection: { active: 1, role: 1 } }).toArray(),
    (await collections.sessions()).countDocuments({ revokedAt: null, lastSeenAt: { $gte: new Date(Date.now() - 15 * 60_000).toISOString() } }),
    syncHealth(),
    (await collections.chatReports()).countDocuments({ status: "open" }),
    (await collections.jobRuns()).find({ job: "ingest" }).sort({ startedAt: -1 }).limit(1).next(),
    (await collections.jobRuns()).countDocuments({ ok: false, startedAt: { $gte: new Date(Date.now() - 7 * 86_400_000).toISOString() } }),
    (await collections.assistantLog()).countDocuments({ answered: false, at: { $gte: new Date(Date.now() - 30 * 86_400_000).toISOString() } }),
  ]);
  const s = settingsEntry.value;
  const pending = Object.values(sync.pending).reduce((a, b) => a + b, 0);
  return {
    users: { total: users.length, active: users.filter((u) => u.active).length, admins: users.filter((u) => u.active && u.role === "admin").length, online: sessions },
    locks: s.locks.length,
    maintenance: s.maintenance.on,
    featuresOff: Object.entries(s.features).filter(([, on]) => !on).map(([k]) => k),
    announcements: s.announcements.filter((a) => a.active).length,
    sync: { mode: sync.mode, pending, lastSuccessAt: sync.lastSuccessAt, lastError: sync.lastError },
    reports,
    lastIngest: lastIngest ? { at: lastIngest.startedAt, ok: lastIngest.ok } : null,
    failedJobs,
    unanswered,
    demo: { environment: isDemoEnvironment(), allowDemoLogins: s.demo.allowDemoLogins },
    settingsUpdatedAt: settingsEntry.meta.updatedAt,
    settingsUpdatedBy: settingsEntry.meta.updatedBy,
  };
}

/* ---------------- Business rules: options and impact ---------------- */

/** Real values from the catalog for the rule pickers. */
export async function ruleOptions() {
  const titles = await collections.titles();
  const [seasons, ipm, formats, channels, divisions, imprints] = await Promise.all([
    titles.distinct("season"),
    titles.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$ipmFormat", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    titles.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$format", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    (await collections.accounts()).aggregate<{ _id: { id: string; name: string } }>([{ $group: { _id: { id: "$channelId", name: "$channelName" } } }]).toArray(),
    titles.distinct("division", { inScope: true }),
    titles.distinct("imprint", { inScope: true }),
  ]);
  const names = new Set<string>();
  const years = new Set<number>();
  for (const s of seasons) {
    const m = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(s ?? "");
    if (m) {
      names.add(m[1]!);
      years.add(Number(m[2]));
    }
  }
  return {
    seasonNames: [...new Set([...names, "Spring", "Summer", "Fall", "Winter"])],
    seasonYears: [...years].sort(),
    seasons: (seasons.filter(Boolean) as string[]).sort(),
    ipmFormats: ipm.filter((x) => x._id).map((x) => ({ value: x._id, count: x.n })),
    formats: formats.filter((x) => x._id).map((x) => ({ value: x._id, count: x.n })),
    channels: channels
      .filter((c) => c._id.id)
      .map((c) => ({ value: c._id.id, label: `${c._id.name ?? c._id.id} (${c._id.id})` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    divisions: (divisions.filter(Boolean) as string[]).sort(),
    imprints: (imprints.filter(Boolean) as string[]).sort(),
  };
}

/** How many titles would be in scope with the proposed rules (before applying them). */
export async function ruleImpact(rules: AppSettings["rules"]) {
  const current = await domainConfig();
  const proposed: DomainConfig = { ...current, ...rules };
  const docs = await (await collections.titles()).find({}, { projection: { isbn: 1, season: 1, ipmFormat: 1, format: 1, division: 1, imprint: 1, inScope: 1 } }).toArray();
  let now = 0;
  let next = 0;
  let added = 0;
  let removed = 0;
  for (const t of docs) {
    const a = t.inScope;
    const b = isTitleInScope({ isbn: t.isbn, season: t.season, ipmFormat: t.ipmFormat, format: t.format, division: t.division, imprint: t.imprint }, proposed);
    if (a) now++;
    if (b) next++;
    if (b && !a) added++;
    if (a && !b) removed++;
  }
  return { catalog: docs.length, inScopeNow: now, inScopeAfter: next, added, removed, needsFullRefresh: rules.minSeasonYear !== current.minSeasonYear };
}

/* ---------------- Locks ---------------- */

export async function lock(input: { kind: "season" | "title"; value: string; note: string }, admin: Session) {
  const s = await getSettings();
  if (s.locks.some((l) => l.kind === input.kind && l.value === input.value)) throw new HttpError(409, "That is already locked.");
  let label = input.value;
  if (input.kind === "title") {
    const t = await (await collections.titles()).findOne({ _id: input.value }, { projection: { title: 1 } });
    if (!t) throw new HttpError(404, "That ISBN was not found.");
    label = `${t.title} (${input.value})`;
  } else {
    const n = await (await collections.titles()).countDocuments({ season: input.value });
    if (!n) throw new HttpError(404, "No titles in that season.");
  }
  const locks = [
    ...s.locks,
    { id: randomUUID(), kind: input.kind, value: input.value, label, note: input.note, lockedBy: admin.email, lockedByName: admin.name, lockedAt: new Date().toISOString() },
  ];
  await updateSettings("locks", locks, admin, `Locked ${input.kind} ${label}${input.note ? ` — ${input.note}` : ""}`);
}

export async function unlock(id: string, reason: string, admin: Session) {
  const s = await getSettings();
  const l = s.locks.find((x) => x.id === id);
  if (!l) throw new HttpError(404, "That lock no longer exists.");
  if (reason.trim().length < 3) throw new HttpError(400, "Give a reason for unlocking.");
  await updateSettings("locks", s.locks.filter((x) => x.id !== id), admin, `Unlocked ${l.kind} ${l.label} — reason: ${reason.trim()}`);
}

/* ---------------- Account catalog ---------------- */

export async function accountCatalog(q: string, channel: string | null, page: number) {
  const accounts = await collections.accounts();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const filter = {
    ...(channel ? { channelId: channel } : {}),
    ...(words.length ? { $and: words.map((w) => ({ search: { $regex: w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } })) } : {}),
  };
  const size = 50;
  const [items, total, byChannel, lastIngest, accountLevel] = await Promise.all([
    accounts.find(filter, { projection: { search: 0 } }).sort({ channelName: 1, orgName: 1, accountName: 1 }).skip(page * size).limit(size).toArray(),
    accounts.countDocuments(filter),
    accounts
      .aggregate<{ _id: { id: string; name: string }; accounts: number; orgs: string[] }>([
        { $group: { _id: { id: "$channelId", name: "$channelName" }, accounts: { $sum: 1 }, orgs: { $addToSet: "$orgId" } } },
        { $sort: { accounts: -1 } },
      ])
      .toArray(),
    (await collections.jobRuns()).find({ job: "ingest", ok: true }).sort({ startedAt: -1 }).limit(1).next(),
    getSettings().then((s) => s.rules.accountLevelChannels),
  ]);
  return {
    items,
    total,
    page,
    pageSize: size,
    channels: byChannel.map((c) => ({ id: c._id.id, name: c._id.name, accounts: c.accounts, orgs: c.orgs.length, accountLevel: accountLevel.includes(c._id.id) })),
    lastRefreshedAt: lastIngest?.finishedAt ?? null,
  };
}

/* ---------------- Demo reset ---------------- */

/**
 * Demo only: clears test conversations and logs, and optionally reloads every estimate from
 * BigQuery (the source of truth). Not available with Microsoft sign-in (production).
 */
export async function demoReset(input: { clearChat: boolean; clearComments: boolean; reloadEstimates: boolean }, admin: Session) {
  if (!isDemoEnvironment()) throw new HttpError(404, "Demo reset is not available in this environment.");
  return recordJob("demo-reset", admin.email, async () => {
    const database = await db();
    const cleared: Record<string, number> = {};
    const wipe = async (name: string, filter: object = {}) => {
      cleared[name] = (await database.collection(name).deleteMany(filter)).deletedCount;
    };
    if (input.clearChat) {
      await wipe(COLLECTIONS.chatMessages);
      await wipe(COLLECTIONS.chatRooms, { _id: { $ne: EVERYONE } });
      await database.collection(COLLECTIONS.chatRooms).updateOne({ _id: EVERYONE as never }, { $set: { lastMessageAt: null, lastMessage: null } });
      await wipe(COLLECTIONS.chatReads);
      await wipe(COLLECTIONS.chatReports);
      await wipe(COLLECTIONS.assistantLog);
    }
    if (input.clearComments) await wipe(COLLECTIONS.comments);
    if (input.clearChat || input.clearComments) await wipe(COLLECTIONS.notifications);
    await wipe(COLLECTIONS.presence);
    await wipe(COLLECTIONS.titleVisits);
    let reloaded = null;
    if (input.reloadEstimates) {
      // Empty estimates are restored from BigQuery's latest values by the data refresh.
      await wipe(COLLECTIONS.estimates);
      reloaded = await runIngest({ rebuildSql: false });
    }
    await audit(
      admin,
      "demo",
      "reset",
      `Demo reset: ${[input.clearChat && "chat", input.clearComments && "comments", input.reloadEstimates && "estimates reloaded from BigQuery"].filter(Boolean).join(", ")}`,
    );
    return { cleared, restoredEstimates: reloaded?.restoredEstimates ?? 0 };
  });
}
