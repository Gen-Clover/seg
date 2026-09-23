import { belowGoal, dueSoon, parseAssistantQuery, withoutComparable, type AssistantIntent, type FacetValues } from "@seg/domain";
import { randomUUID } from "node:crypto";
import type { Session } from "../auth/session";
import { HttpError } from "../http";
import { getSettings } from "./settings";
import { collections } from "../db";
import { listNotifications } from "./comments";
import { changedByOthers } from "./desk";
import { getSummary, searchTitles, type TitleSummaryRow } from "./titles";

/** One answer from the Ask Abrams assistant. Built from the app's own data — no AI service. */
export interface AssistantReply {
  text: string;
  stats?: { label: string; value: string; tone?: "ok" | "warn" | "brand" }[];
  items?: { isbn: string; title: string; sub: string; badge?: string; tone?: "ok" | "warn" | "brand" | "info" }[];
  link?: { href: string; label: string };
  suggestions: string[];
}

const LIMIT = 8;
const int = (n: number | null | undefined) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("en-US").format(n));
const signed = (n: number) => `${n > 0 ? "+" : ""}${int(n)}`;
const DEFAULT_SUGGESTIONS = ["What's due this week?", "Titles below goal", "No comparable title", "What changed?"];

const todayIso = () => new Date().toISOString().slice(0, 10);

function facetValues(rows: TitleSummaryRow[]): FacetValues {
  const uniq = (get: (t: TitleSummaryRow) => string | null) => [...new Set(rows.map(get).filter((v): v is string => !!v))];
  return { season: uniq((t) => t.season), division: uniq((t) => t.division), imprint: uniq((t) => t.imprint), format: uniq((t) => t.format) };
}

export async function askAssistant(input: string, session: Session): Promise<AssistantReply & { intent: AssistantIntent["kind"] }> {
  const settings = await getSettings();
  if (!settings.assistant.enabled) throw new HttpError(404, "The assistant is turned off by an administrator.");
  const rows = await getSummary();
  const intent = parseAssistantQuery(input, facetValues(rows));
  const byIsbn = new Map(rows.map((t) => [t.isbn, t]));
  let reply = await answer(intent, session, rows, byIsbn);
  if (intent.kind === "help") {
    reply = { ...reply, text: settings.assistant.greeting.replace("{name}", session.name.split(" ")[0] ?? ""), suggestions: settings.assistant.suggestions };
  }
  // Keep typed questions (not the automatic greeting) for the admin "couldn't answer" report.
  if (input.trim()) {
    const answered = !(intent.kind === "search" && !(reply.items?.length));
    const now = new Date();
    await (await collections.assistantLog()).insertOne({
      _id: randomUUID(),
      email: session.email,
      text: input.trim().slice(0, 300),
      intent: intent.kind,
      answered,
      at: now.toISOString(),
      expiresAt: new Date(now.getTime() + settings.retention.assistantLogDays * 86_400_000),
    });
  }
  return { ...reply, intent: intent.kind };
}

async function answer(intent: AssistantIntent, session: Session, rows: TitleSummaryRow[], byIsbn: Map<string, TitleSummaryRow>): Promise<AssistantReply> {
  switch (intent.kind) {
    case "help":
      return {
        text: `Hi ${session.name.split(" ")[0]}! I answer questions from the Seasonal Estimate Grid's own data. Try one of these, type an ISBN or a title, or name a season, division, imprint or format.`,
        suggestions: [...DEFAULT_SUGGESTIONS, "My mentions", "Spring 2026 summary"],
      };

    case "due": {
      const items = dueSoon(rows, todayIso(), intent.days);
      const overdue = items.filter((i) => i.daysLeft < 0).length;
      return {
        text: items.length
          ? `${items.length} title${items.length === 1 ? "" : "s"} have a paper cut-off or LDC ${intent.days === 0 ? "today" : `within ${intent.days} days`} and still miss estimates${overdue ? ` (${overdue} overdue)` : ""}.`
          : `Nothing is due ${intent.days === 0 ? "today" : `in the next ${intent.days} days`} without estimates. 🎉`,
        items: items.slice(0, LIMIT).map((i) => ({
          isbn: i.isbn,
          title: byIsbn.get(i.isbn)?.title ?? i.isbn,
          sub: `Missing ${i.missing.map((m) => m.replace("Laydown ", "").toLowerCase()).join(", ")}`,
          badge: `${i.milestone} ${i.daysLeft < 0 ? `${-i.daysLeft}d overdue` : i.daysLeft === 0 ? "today" : `in ${i.daysLeft}d`}`,
          tone: i.daysLeft < 0 ? "brand" : i.daysLeft <= 7 ? "warn" : "info",
        })),
        link: items.length > LIMIT ? { href: "/", label: `See all ${items.length} on My Desk` } : undefined,
        suggestions: ["Due in the next 30 days", "Titles below goal", "What changed?"],
      };
    }

    case "belowGoal": {
      const items = belowGoal(rows);
      const gap = items.reduce((s, i) => s + i.gap, 0);
      return {
        text: items.length ? `${items.length} titles have a laydown estimate below goal — ${int(gap)} units short in total. The biggest gaps:` : "Every title with a goal and an estimate is on or above goal.",
        items: items.slice(0, LIMIT).map((i) => ({
          isbn: i.isbn,
          title: byIsbn.get(i.isbn)?.title ?? i.isbn,
          sub: `${Math.round(i.ratio * 100)}% of goal`,
          badge: `−${int(i.gap)}`,
          tone: "warn",
        })),
        link: { href: "/", label: "Open My Desk" },
        suggestions: ["What's due this week?", "No comparable title"],
      };
    }

    case "noComp": {
      const items = withoutComparable(rows, todayIso()).filter((c) => c.daysToPub === null || c.daysToPub >= 0);
      return {
        text: items.length ? `${items.length} upcoming titles have no comparable title yet. Soonest first:` : "Every upcoming title has a comparable title.",
        items: items.slice(0, LIMIT).map((c) => ({
          isbn: c.isbn,
          title: byIsbn.get(c.isbn)?.title ?? c.isbn,
          sub: byIsbn.get(c.isbn)?.imprint ?? "",
          badge: c.daysToPub === null ? "No pub date" : `Pub in ${c.daysToPub}d`,
          tone: "info",
        })),
        suggestions: ["Titles below goal", "What's due this week?"],
      };
    }

    case "changed": {
      const changed = await changedByOthers(session);
      return {
        text: changed.length ? `${changed.length} titles were changed by others since you last looked. Most recent:` : "Nobody else has changed your titles since you last looked.",
        items: changed.slice(0, LIMIT).map((c) => ({
          isbn: c.isbn,
          title: byIsbn.get(c.isbn)?.title ?? c.isbn,
          sub: `${c.people.map((p) => p.name.split(" ")[0]).join(", ")} · ${c.changes} change${c.changes === 1 ? "" : "s"}`,
          badge: c.lastBy.split(" ")[0],
          tone: "info",
        })),
        suggestions: ["My mentions", "What's due this week?"],
      };
    }

    case "mentions": {
      const { items, unread } = await listNotifications(session.email, 20);
      const pending = items.filter((n) => !n.readAt).slice(0, LIMIT);
      return {
        text: unread ? `You have ${unread} unread mention${unread === 1 ? "" : "s"} and replies.` : "You're all caught up — no unread mentions.",
        items: pending
          .filter((n) => n.isbn)
          .map((n) => ({ isbn: n.isbn, title: n.titleName, sub: `${n.fromName}: ${n.excerpt}`, badge: n.type === "reply" ? "Reply" : "Mention", tone: "info" as const })),
        suggestions: ["What changed?", "What's due this week?"],
      };
    }

    case "title": {
      const t = byIsbn.get(intent.isbn) ?? (await (await collections.titles()).findOne({ _id: intent.isbn }, { projection: { search: 0 } }).then((d) => (d ? { ...d, compIsbn: d.plan.compIsbn, updatedAt: d.plan.updatedAt } : null)));
      if (!t) return { text: `I couldn't find ISBN ${intent.isbn} in the catalog.`, suggestions: DEFAULT_SUGGESTIONS };
      const comp = t.compIsbn ? await (await collections.titles()).findOne({ _id: t.compIsbn }, { projection: { title: 1 } }) : null;
      const gap = t.totals.estimateVsGoal;
      return {
        text: `${t.title} — ${t.author ?? "unknown author"} · ${t.season ?? "no season"} · ${t.format ?? ""}. Published ${t.pubDate ?? "—"}${comp ? `; comparable: ${comp.title}` : "; no comparable title yet"}.`,
        stats: [
          { label: "Initial orders", value: int(t.totals.initialOrder) },
          { label: "Laydown goal", value: int(t.totals.laydownGoal) },
          { label: "Laydown estimate", value: int(t.totals.laydownEstimate) },
          { label: "Estimate vs goal", value: gap === null ? "Not set" : signed(-gap), tone: gap === null ? undefined : gap > 0 ? "warn" : "ok" },
        ],
        link: { href: `/titles/${t.isbn}`, label: "Open the title" },
        suggestions: [`Who changed ${t.isbn}?`, "Titles below goal"],
      };
    }

    case "history": {
      const events = await (await collections.events()).find({ isbn: intent.isbn }).sort({ changedAt: -1 }).limit(LIMIT).toArray();
      const names = new Map((await (await collections.users()).find({}, { projection: { name: 1 } }).toArray()).map((u) => [u._id, u.name]));
      const label: Record<string, string> = { laydownGoal: "goal", laydownEstimate: "estimate", sixMonthEstimate: "6-month", salesNotes: "notes", compIsbn: "comparable", titleNotes: "title notes" };
      return {
        text: events.length ? `Latest changes on ${byIsbn.get(intent.isbn)?.title ?? intent.isbn}:` : "No changes recorded for that title yet.",
        items: events.map((e) => ({
          isbn: intent.isbn,
          title: `${names.get(e.changedBy) ?? e.changedBy.split("@")[0]} changed ${label[e.field] ?? e.field}`,
          sub: `${e.accountName ?? e.orgName ?? e.channelName ?? "Title"} · ${e.oldValue ?? "empty"} → ${e.newValue ?? "empty"}`,
          badge: e.changedAt.slice(0, 10),
          tone: "info",
        })),
        link: { href: `/titles/${intent.isbn}`, label: "Open the title" },
        suggestions: [`Show ${intent.isbn}`, "What changed?"],
      };
    }

    case "group": {
      const get: Record<typeof intent.facet, (t: TitleSummaryRow) => string | null> = {
        season: (t) => t.season,
        division: (t) => t.division,
        imprint: (t) => t.imprint,
        format: (t) => t.format,
      };
      const set = rows.filter((t) => get[intent.facet](t) === intent.value);
      const goal = set.reduce((s, t) => s + (t.totals.laydownGoal ?? 0), 0);
      const est = set.reduce((s, t) => s + (t.totals.laydownEstimate ?? 0), 0);
      const estimated = set.filter((t) => t.totals.laydownEstimate !== null).length;
      const gaps = belowGoal(set);
      return {
        text: `${intent.value}: ${set.length} titles, ${estimated} with a laydown estimate.${gaps.length ? ` ${gaps.length} are below goal; the largest gaps:` : ""}`,
        stats: [
          { label: "Initial orders", value: int(set.reduce((s, t) => s + t.totals.initialOrder, 0)) },
          { label: "Laydown goal", value: int(goal) },
          { label: "Laydown estimate", value: int(est) },
          { label: "Estimate to goal", value: goal ? `${Math.round((est / goal) * 100)}%` : "—", tone: goal && est / goal < 0.95 ? "warn" : "ok" },
        ],
        items: gaps.slice(0, 5).map((g) => ({ isbn: g.isbn, title: byIsbn.get(g.isbn)?.title ?? g.isbn, sub: `${Math.round(g.ratio * 100)}% of goal`, badge: `−${int(g.gap)}`, tone: "warn" })),
        link: { href: `/summary?${new URLSearchParams({ [intent.facet]: intent.value }).toString()}`, label: `Open ${intent.value} in Summary` },
        suggestions: ["Titles below goal", "What's due this week?"],
      };
    }

    case "search": {
      const hits = await searchTitles(intent.text, LIMIT);
      return {
        text: hits.length ? `Titles matching "${intent.text}":` : `I couldn't match "${intent.text}". I can answer questions like these:`,
        items: hits.map((h) => ({ isbn: h.isbn, title: h.title, sub: [h.author, h.season, h.format].filter(Boolean).join(" · ") })),
        suggestions: hits.length ? [`Show ${hits[0]!.isbn}`] : DEFAULT_SUGGESTIONS,
      };
    }
  }
}
