import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_DOMAIN_CONFIG,
  GROUP_DATE_FIELDS,
  GROUP_FLAG_FIELDS,
  GROUP_NUMBER_FIELDS,
  GROUP_TEXT_FIELDS,
  type DomainConfig,
} from "@seg/domain";
import type { Session } from "../auth/session";
import { collections } from "../db";
import { env } from "../env";
import { HttpError } from "../http";
import { scheduleWriteback } from "./writeback";

/**
 * Admin-controlled settings. Every default is the behaviour the app had before the admin
 * console existed, so nothing changes until an admin changes it.
 */
const list = (fallback: string[]) => z.array(z.string().trim().min(1)).default(fallback);

const lockSchema = z.object({
  id: z.string(),
  kind: z.enum(["season", "title"]),
  /** Season name ("Fall 2026") or ISBN. */
  value: z.string(),
  label: z.string(),
  note: z.string().default(""),
  lockedBy: z.string(),
  lockedByName: z.string(),
  lockedAt: z.string(),
});

const text = z.string().trim().min(1).max(120);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const num = z.number().finite().nullable();
/** One work-group rule (see packages/domain/src/workgroups.ts). */
const groupRuleSchema = z.union([
  z.object({ field: z.enum(GROUP_TEXT_FIELDS), op: z.enum(["in", "notIn"]), values: z.array(text).max(200) }),
  z.object({ field: z.enum(GROUP_DATE_FIELDS), op: z.enum(["before", "after", "between"]), from: isoDay, to: isoDay }),
  z.object({ field: z.enum(GROUP_DATE_FIELDS), op: z.enum(["nextDays", "pastDays"]), days: z.number().int().min(0).max(3650) }),
  z.object({ field: z.enum([...GROUP_DATE_FIELDS, ...GROUP_NUMBER_FIELDS]), op: z.enum(["isSet", "isNotSet"]) }),
  z.object({ field: z.enum(GROUP_NUMBER_FIELDS), op: z.enum(["atLeast", "atMost", "between"]), min: num, max: num }),
  z.object({ field: z.enum(GROUP_FLAG_FIELDS), op: z.literal("is"), value: z.boolean() }),
]);
const workGroupSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(40),
  /** Shown to every user (members is then ignored). */
  everyone: z.boolean().default(false),
  members: z.array(z.string().trim().toLowerCase()).max(500).default([]),
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(groupRuleSchema).max(20).default([]),
  createdBy: z.string().default(""),
  updatedAt: z.string().nullable().default(null),
});

const announcementSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(500),
  tone: z.enum(["info", "warn", "success"]).default("info"),
  active: z.boolean().default(true),
  /** Optional ISO dates; outside the window the banner is hidden. */
  from: z.string().nullable().default(null),
  until: z.string().nullable().default(null),
  createdBy: z.string(),
  createdAt: z.string(),
});

export const DEFAULT_ASSISTANT_SUGGESTIONS = ["What's due this week?", "Titles below goal", "No comparable title", "What changed?", "My mentions"];

function envRules() {
  const e = env();
  return {
    accountLevelChannels: e.ACCOUNT_LEVEL_CHANNELS
      ? e.ACCOUNT_LEVEL_CHANNELS.split(",").map((s) => s.trim()).filter(Boolean)
      : [...DEFAULT_DOMAIN_CONFIG.accountLevelChannels],
    minSeasonYear: e.MIN_SEASON_YEAR ?? DEFAULT_DOMAIN_CONFIG.minSeasonYear,
  };
}

export function settingsSchema() {
  const r = envRules();
  return z.object({
    rules: z
      .object({
        accountLevelChannels: list(r.accountLevelChannels),
        minSeasonYear: z.number().int().min(2000).max(2100).default(r.minSeasonYear),
        seasonNames: list([...DEFAULT_DOMAIN_CONFIG.seasonNames]),
        includedIpmFormats: list([...DEFAULT_DOMAIN_CONFIG.includedIpmFormats]),
        excludedFormats: list([...DEFAULT_DOMAIN_CONFIG.excludedFormats]),
        excludedFormatWords: list([...DEFAULT_DOMAIN_CONFIG.excludedFormatWords]),
        requireDivision: z.boolean().default(true),
        requireImprint: z.boolean().default(true),
        /** Comparable-title search leaves these out (legacy: eBooks, catalogs, displays). */
        compExcludedIpmFormats: list(["EB"]),
        compExcludedFormatWords: list(["catalog", "display"]),
        salesNoteMaxLength: z.number().int().min(50).max(10000).default(2000),
        titleNoteMaxLength: z.number().int().min(50).max(20000).default(4000),
      })
      .prefault({}),
    desk: z
      .object({
        dueWindowDays: z.number().int().min(1).max(90).default(14),
        overdueDays: z.number().int().min(0).max(365).default(14),
        belowGoalThresholdPct: z.number().min(0).max(100).default(0),
      })
      .prefault({}),
    sessions: z.object({ hours: z.number().min(1).max(24 * 30).default(env().SESSION_HOURS) }).prefault({}),
    demo: z
      .object({
        /** Demo users can sign in. */
        allowDemoLogins: z.boolean().default(true),
        /** The demo account list and password hint are shown on the sign-in page. */
        showOnLogin: z.boolean().default(true),
      })
      .prefault({}),
    locks: z.array(lockSchema).default([]),
    notifications: z
      .object({
        desktopAlertsOffered: z.boolean().default(true),
        mentions: z.boolean().default(true),
        replies: z.boolean().default(true),
        directMessages: z.boolean().default(false),
      })
      .prefault({}),
    assistant: z
      .object({
        enabled: z.boolean().default(true),
        greeting: z
          .string()
          .max(500)
          .default("Hi {name}! I answer questions from the Seasonal Estimate Grid's own data. Try one of these, type an ISBN or a title, or name a season, division, imprint or format."),
        suggestions: z.array(z.string().trim().min(1).max(80)).max(8).default(DEFAULT_ASSISTANT_SUGGESTIONS),
      })
      .prefault({}),
    features: z
      .object({
        dashboard: z.boolean().default(true),
        askAbrams: z.boolean().default(true),
        comments: z.boolean().default(true),
        liveTeamwork: z.boolean().default(true),
        uploads: z.boolean().default(true),
        exports: z.boolean().default(true),
        meetingReport: z.boolean().default(true),
      })
      .prefault({}),
    maintenance: z
      .object({
        on: z.boolean().default(false),
        message: z.string().max(300).default("SEG is read-only for a short while for maintenance. Your data is safe."),
      })
      .prefault({}),
    branding: z
      .object({
        appName: z.string().trim().min(1).max(20).default("SEG"),
        subtitle: z.string().trim().max(60).default("Seasonal Estimate Grid"),
        loginHeadline: z.string().trim().max(80).default("Seasonal Estimate Grid"),
        loginText: z
          .string()
          .trim()
          .max(400)
          .default(
            "Plan every launch with the numbers in one place — initial orders, comparable titles and laydown estimates for every channel, organization and account, updated live as your team works.",
          ),
        mainMenuUrl: z.string().trim().max(300).default(env().MAIN_MENU_URL ?? ""),
      })
      .prefault({}),
    covers: z
      .object({
        /** Show the cover image on the title workspace. */
        enabled: z.boolean().default(true),
        /** Image address; {isbn} is replaced by the title's ISBN-13 (Firebrand/TMM covers, as in the Abrams Title app). */
        urlTemplate: z.string().trim().max(400).default("https://tme.firebrandtech.com/hna/hnafiles/covers/{isbn}.jpg"),
      })
      .prefault({}),
    announcements: z.array(announcementSchema).default([]),
    /** My Desk work groups (Admin console → Work groups). Not public: people only get their own. */
    workGroups: z.array(workGroupSchema).max(200).default([]),
    retention: z
      .object({
        jobHistoryDays: z.number().int().min(7).max(3650).default(90),
        signInLogDays: z.number().int().min(7).max(3650).default(180),
        assistantLogDays: z.number().int().min(7).max(3650).default(90),
      })
      .prefault({}),
  });
}

export type AppSettings = z.infer<ReturnType<typeof settingsSchema>>;
export type SettingsSection = keyof AppSettings;
export type Lock = z.infer<typeof lockSchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type WorkGroup = z.infer<typeof workGroupSchema>;

/** The work groups a person sees as My Desk tabs. */
export async function workGroupsFor(email: string): Promise<Pick<WorkGroup, "id" | "name" | "match" | "rules">[]> {
  const me = email.toLowerCase();
  return (await getSettings()).workGroups
    .filter((g) => g.everyone || g.members.includes(me))
    .map(({ id, name, match, rules }) => ({ id, name, match, rules }));
}

interface Stored {
  _id: "app";
  settings: Partial<AppSettings>;
  updatedAt: string | null;
  updatedBy: string | null;
  syncedAt: string | null;
}

const CACHE_MS = 5_000;
const cache = globalThis as unknown as { __segSettings?: { at: number; value: AppSettings; meta: { updatedAt: string | null; updatedBy: string | null } } };

async function settingsCol() {
  return (await collections.settings()) as unknown as import("mongodb").Collection<Stored>;
}

/** Current settings (defaults filled in). Cached for a few seconds per server instance. */
export async function getSettings(): Promise<AppSettings> {
  return (await getSettingsWithMeta()).value;
}

export async function getSettingsWithMeta() {
  if (cache.__segSettings && Date.now() - cache.__segSettings.at < CACHE_MS) return cache.__segSettings;
  const doc = await (await settingsCol()).findOne({ _id: "app" });
  const value = settingsSchema().parse(doc?.settings ?? {});
  const entry = { at: Date.now(), value, meta: { updatedAt: doc?.updatedAt ?? null, updatedBy: doc?.updatedBy ?? null } };
  cache.__segSettings = entry;
  return entry;
}

/** Replaces one section (validated), records who changed what, and syncs to BigQuery. */
export async function updateSettings<S extends SettingsSection>(section: S, value: unknown, session: Session, detail?: string): Promise<AppSettings> {
  const current = await getSettings();
  const schema = settingsSchema().shape[section];
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, `Invalid ${section} settings: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const next = { ...current, [section]: parsed.data } as AppSettings;
  const now = new Date().toISOString();
  await (await settingsCol()).updateOne(
    { _id: "app" },
    { $set: { settings: next, updatedAt: now, updatedBy: session.email, syncedAt: null } },
    { upsert: true },
  );
  cache.__segSettings = undefined;
  await audit(session, section, "update", detail ?? describeChange(section, (current as Record<string, unknown>)[section], parsed.data));
  scheduleWriteback();
  return next;
}

function describeChange(section: string, before: unknown, after: unknown): string {
  if (typeof before !== "object" || typeof after !== "object" || !before || !after || Array.isArray(before)) return `Updated ${section}`;
  const changes: string[] = [];
  for (const [k, v] of Object.entries(after)) {
    const was = (before as Record<string, unknown>)[k];
    if (JSON.stringify(was) !== JSON.stringify(v)) changes.push(`${k}: ${fmt(was)} → ${fmt(v)}`);
  }
  return changes.length ? changes.join("; ") : `No changes to ${section}`;
}
const fmt = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(", ") : "none") : typeof v === "string" ? (v.length > 40 ? `${v.slice(0, 40)}…` : v || "empty") : String(v));

export async function audit(session: Pick<Session, "email" | "name">, area: string, action: string, detail: string): Promise<void> {
  await (await collections.adminAudit()).insertOne({
    _id: randomUUID(),
    at: new Date().toISOString(),
    by: session.email,
    byName: session.name,
    area,
    action,
    detail,
  });
}

/** Business rules as the domain package expects them. */
export async function domainConfig(): Promise<DomainConfig> {
  const r = (await getSettings()).rules;
  return {
    accountLevelChannels: r.accountLevelChannels,
    minSeasonYear: r.minSeasonYear,
    seasonNames: r.seasonNames,
    includedIpmFormats: r.includedIpmFormats,
    excludedFormats: r.excludedFormats,
    excludedFormatWords: r.excludedFormatWords,
    requireDivision: r.requireDivision,
    requireImprint: r.requireImprint,
  };
}

/** What every signed-in browser needs: rules for the grid, switches, banners, limits. */
export async function publicSettings() {
  const s = await getSettings();
  const now = new Date().toISOString();
  return {
    rules: s.rules,
    desk: s.desk,
    notifications: s.notifications,
    assistant: { enabled: s.assistant.enabled, suggestions: s.assistant.suggestions },
    features: s.features,
    maintenance: s.maintenance,
    branding: s.branding,
    covers: s.covers,
    locks: s.locks,
    announcements: s.announcements.filter((a) => a.active && (!a.from || a.from <= now) && (!a.until || a.until >= now)),
  };
}
export type PublicSettings = Awaited<ReturnType<typeof publicSettings>>;

/* ---------------- Locks ---------------- */

/** The lock that applies to a title, if any (a title lock, or its season's lock). */
export function lockFor(settings: AppSettings, title: { isbn: string; season: string | null }): Lock | null {
  return settings.locks.find((l) => (l.kind === "title" && l.value === title.isbn) || (l.kind === "season" && !!title.season && l.value === title.season)) ?? null;
}

/**
 * Throws if the person may not change this title: maintenance mode, a lock, or their
 * division/imprint limit. Admins bypass maintenance and access limits but not locks.
 */
export async function assertCanEditTitle(session: Session, title: { isbn: string; season: string | null; division: string | null; imprint: string | null }) {
  const s = await getSettings();
  if (s.maintenance.on && session.role !== "admin") throw new HttpError(503, s.maintenance.message);
  const lock = lockFor(s, title);
  if (lock) throw new HttpError(423, `This title is locked (${lock.label}) by ${lock.lockedByName} on ${lock.lockedAt.slice(0, 10)}${lock.note ? ` — ${lock.note}` : ""}.`);
  if (session.role !== "admin" && session.scope) {
    const { divisions, imprints } = session.scope;
    if (divisions.length && !divisions.includes(title.division ?? "")) throw new HttpError(403, `You can edit ${divisions.join(", ")} titles only.`);
    if (imprints.length && !imprints.includes(title.imprint ?? "")) throw new HttpError(403, `You can edit ${imprints.join(", ")} titles only.`);
  }
}

/** Throws when an admin has switched a module off. */
export async function assertFeature(feature: keyof AppSettings["features"]) {
  if (!(await getSettings()).features[feature]) throw new HttpError(404, "This feature is turned off by an administrator.");
}
