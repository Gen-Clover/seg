import { z } from "zod";
import type { Session } from "@/server/auth/session";
import { HttpError, readJson, route } from "@/server/http";
import { activity, activityCsv, activityFacets, adminAuditLog, signInLog, uploadLog, type ActivityFilter } from "@/server/services/admin/audit";
import { bulkSchema, runBulk } from "@/server/services/admin/bulk";
import {
  assistantStats,
  deleteAnnouncement,
  dismissReport,
  moderateMessage,
  moderationOverview,
  postAsAdmin,
  saveAnnouncement,
  setRoomState,
} from "@/server/services/admin/communication";
import { createUser, listSessions, listUsers, newUserSchema, revokeSession, setDemo, updateUser, updateUserSchema } from "@/server/services/admin/people";
import { accountCatalog, demoReset, health, isDemoEnvironment, lock, overview, ruleImpact, ruleOptions, syncHealth, unlock } from "@/server/services/admin/system";
import { jobOverview, purgeJobHistory, runJobNow } from "@/server/services/jobs";
import { getSettingsWithMeta, settingsSchema, updateSettings, type SettingsSection } from "@/server/services/settings";

export const maxDuration = 300;

type Ctx = { request: Request; session: Session; parts: string[]; search: URLSearchParams };

/** Sections that are saved as a whole from their admin page. Locks, announcements and demo have their own actions. */
const EDITABLE: SettingsSection[] = ["rules", "desk", "sessions", "notifications", "assistant", "features", "maintenance", "branding", "covers", "retention", "workGroups"];

const activityFilter = (s: URLSearchParams): ActivityFilter => ({
  person: s.get("person") || undefined,
  from: s.get("from") || undefined,
  to: s.get("to") || undefined,
  season: s.get("season") || undefined,
  field: s.get("field") || undefined,
  source: s.get("source") || undefined,
  isbn: s.get("isbn") || undefined,
  before: s.get("before") || undefined,
  limit: s.get("limit") ? Number(s.get("limit")) : undefined,
});

async function get({ parts, search }: Ctx) {
  const [a, b] = parts;
  switch (a) {
    case "overview":
      return overview();
    case "health":
      return health();
    case "sync":
      return syncHealth();
    case "settings": {
      const { value, meta } = await getSettingsWithMeta();
      return { settings: value, meta, demoEnvironment: isDemoEnvironment() };
    }
    case "rules":
      if (b === "options") return ruleOptions();
      break;
    case "users":
      return { users: await listUsers() };
    case "sessions":
      return listSessions();
    case "activity": {
      if (b === "facets") return activityFacets();
      if (b === "csv") {
        const csv = await activityCsv(activityFilter(search));
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="seg-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
          },
        });
      }
      return activity(activityFilter(search));
    }
    case "uploads":
      return { items: await uploadLog() };
    case "sign-ins":
      return signInLog({ email: search.get("email") || undefined, ok: search.get("ok") || undefined });
    case "audit":
      return { items: await adminAuditLog() };
    case "jobs":
      return jobOverview({ job: search.get("job") || undefined, limit: search.get("limit") ? Number(search.get("limit")) : undefined });
    case "accounts":
      return accountCatalog(search.get("q") ?? "", search.get("channel") || null, Math.max(0, Number(search.get("page") ?? 0) || 0));
    case "moderation":
      return moderationOverview(search.get("q") || undefined);
    case "assistant":
      return assistantStats(Number(search.get("days") ?? 30) || 30);
  }
  throw new HttpError(404, "Unknown admin page.");
}

const lockSchema = z.object({ kind: z.enum(["season", "title"]), value: z.string().trim().min(1), note: z.string().trim().max(300).default("") });
const reasonSchema = z.object({ reason: z.string().trim().max(300).default("") });
const announcementInput = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(1).max(500),
  tone: z.enum(["info", "warn", "success"]).default("info"),
  active: z.boolean().default(true),
  from: z.string().nullable().default(null),
  until: z.string().nullable().default(null),
});
const demoSchema = z.object({ allowDemoLogins: z.boolean(), showOnLogin: z.boolean() });
const resetSchema = z.object({ clearChat: z.boolean().default(true), clearComments: z.boolean().default(true), reloadEstimates: z.boolean().default(false) });
const jobSchema = z.enum(["ingest", "writeback", "trends", "apply-rules"]);

async function mutate({ request, session, parts }: Ctx, method: string) {
  const [a, b, c] = parts;
  switch (a) {
    case "settings": {
      const section = b as SettingsSection;
      if (method !== "PUT" || !EDITABLE.includes(section)) break;
      const body = await request.json().catch(() => {
        throw new HttpError(400, "Request body must be JSON.");
      });
      const shape = settingsSchema().shape[section];
      const value = shape.parse(body);
      const settings = await updateSettings(section, value, session);
      return { settings };
    }
    case "rules":
      if (b === "impact") return ruleImpact(settingsSchema().shape.rules.parse(await request.json()));
      if (b === "apply") return runJobNow("apply-rules", session.email);
      break;
    case "users":
      if (method === "POST" && !b) return createUser(await readJson(request, newUserSchema), session);
      if (method === "PATCH" && b) return updateUser(decodeURIComponent(b), await readJson(request, updateUserSchema), session);
      break;
    case "sessions":
      if (method === "DELETE" && b) {
        await revokeSession(b, session);
        return { ok: true };
      }
      break;
    case "demo":
      if (b === "reset") return demoReset(await readJson(request, resetSchema), session);
      await setDemo(await readJson(request, demoSchema), session);
      return { ok: true };
    case "locks":
      if (method === "POST" && !b) {
        await lock(await readJson(request, lockSchema), session);
        return { ok: true };
      }
      if (b && c === "unlock") {
        await unlock(b, (await readJson(request, reasonSchema)).reason, session);
        return { ok: true };
      }
      break;
    case "bulk":
      return runBulk(await readJson(request, bulkSchema), session);
    case "jobs":
      if (b === "purge") return { deleted: await purgeJobHistory() };
      if (b && c === "run") return runJobNow(jobSchema.parse(b), session.email);
      break;
    case "sync":
      if (b === "retry") return runJobNow("writeback", session.email);
      break;
    case "moderation":
      if (b === "messages" && c) {
        await moderateMessage(c, session, (await readJson(request, reasonSchema)).reason);
        return { ok: true };
      }
      if (b === "reports" && c) {
        await dismissReport(c, session);
        return { ok: true };
      }
      if (b === "rooms" && c) {
        const action = z.enum(["archive", "restore", "delete"]).parse(parts[3]);
        await setRoomState(c, action, session);
        return { ok: true };
      }
      break;
    case "announcements":
      if (b === "post") {
        await postAsAdmin((await readJson(request, z.object({ text: z.string().trim().min(1).max(4000) }))).text, session);
        return { ok: true };
      }
      if (method === "DELETE" && b) {
        await deleteAnnouncement(b, session);
        return { ok: true };
      }
      if (method === "POST") return saveAnnouncement(await readJson(request, announcementInput), session);
      break;
  }
  throw new HttpError(404, "Unknown admin action.");
}

type Params = { path: string[] };
const ctx = (request: Request, session: Session, params: Params): Ctx => ({ request, session, parts: params.path ?? [], search: new URL(request.url).searchParams });

export const GET = route<Params>(async ({ request, session, params }) => get(ctx(request, session, params)), { roles: ["admin"] });
export const POST = route<Params>(async ({ request, session, params }) => mutate(ctx(request, session, params), "POST"), { roles: ["admin"] });
export const PUT = route<Params>(async ({ request, session, params }) => mutate(ctx(request, session, params), "PUT"), { roles: ["admin"] });
export const PATCH = route<Params>(async ({ request, session, params }) => mutate(ctx(request, session, params), "PATCH"), { roles: ["admin"] });
export const DELETE = route<Params>(async ({ request, session, params }) => mutate(ctx(request, session, params), "DELETE"), { roles: ["admin"] });
