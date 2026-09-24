"use client";

import { Archive, ArchiveRestore, BellRing, Bot, Flag, Megaphone, Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Input, Textarea } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn, fmtInt } from "@/lib/utils";
import type { assistantStats, moderationOverview } from "@/server/services/admin/communication";
import {
  Loading,
  PageHeader,
  SaveBar,
  Section,
  SelectField,
  SettingRow,
  Stat,
  Switch,
  Table,
  TagInput,
  When,
  useAdmin,
  useAdminAction,
  useSectionDraft,
  useSettingsData,
  type AppSettings,
} from "./ui";

/* ---------------- Chat moderation ---------------- */

type Moderation = Awaited<ReturnType<typeof moderationOverview>>;

export function ModerationPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"reports" | "messages" | "rooms">("reports");
  const data = useAdmin<Moderation>(`moderation${q ? `?q=${encodeURIComponent(q)}` : ""}`, { refetchInterval: 20_000 });
  const remove = useAdminAction(({ id, reason }: { id: string; reason: string }) => api(`/api/admin/moderation/messages/${id}`, { method: "POST", json: { reason } }), "Message removed.");
  const dismiss = useAdminAction((id: string) => api(`/api/admin/moderation/reports/${id}`, { method: "POST" }), "Report dismissed.");
  const room = useAdminAction(
    ({ id, action }: { id: string; action: "archive" | "restore" | "delete" }) => api(`/api/admin/moderation/rooms/${id}/${action}`, { method: "POST" }),
    "Done.",
  );
  const m = data.data;
  const open = (m?.reports ?? []).filter((r) => r.status === "open");
  const removeMsg = (id: string, author: string) => {
    const reason = window.prompt(`Remove this message by ${author}? Optional reason (kept in Admin changes):`, "");
    if (reason !== null) remove.mutate({ id, reason });
  };

  return (
    <>
      <PageHeader icon={Flag} title="Chat moderation" description="Reported messages, and every message and conversation in Ask Abrams — including private groups and direct messages." />
      <div className="flex gap-1 border-b border-line">
        {(
          [
            ["reports", `Reported · ${open.length}`],
            ["messages", "All messages"],
            ["rooms", "Conversations"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] font-medium", tab === k ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>
      {!m ? (
        <Loading />
      ) : tab === "reports" ? (
        <Section>
          <Table head={["Reported", "Message", "Reason", "By", "Status", ""]} empty={!m.reports.length}>
            {m.reports.map((r) => (
              <tr key={r._id} className={cn(r.status !== "open" && "opacity-60")}>
                <td className="text-xs">
                  <When iso={r.at} />
                  <div className="text-subtle">in {r.roomName}</div>
                </td>
                <td className="max-w-[300px] text-[12.5px]">
                  <div className="line-clamp-2">{r.excerpt}</div>
                  <div className="text-xs text-subtle">{r.authorEmail}</div>
                </td>
                <td className="max-w-[220px] text-[12.5px]">{r.reason}</td>
                <td className="text-xs">{r.reporterName}</td>
                <td>{r.status === "open" ? <Badge tone="warn">Open</Badge> : r.status === "removed" ? <Badge>Removed</Badge> : <Badge>Dismissed</Badge>}</td>
                <td className="whitespace-nowrap text-right">
                  {r.status === "open" ? (
                    <>
                      <Button size="sm" variant="danger" onClick={() => removeMsg(r.messageId, r.authorEmail)}>
                        <Trash2 />
                        Remove
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(r._id)}>
                        Dismiss
                      </Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : tab === "messages" ? (
        <Section>
          <div className="border-b border-line px-4 py-3">
            <Input className="w-80" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search message text" />
          </div>
          <Table head={["When", "Where", "From", "Message", ""]} empty={!m.messages.length} className="max-h-[600px]">
            {m.messages.map((x) => (
              <tr key={x._id} className={cn(x.deletedAt && "opacity-50")}>
                <td className="text-xs">
                  <When iso={x.createdAt} />
                </td>
                <td className="text-xs">{x.roomName}</td>
                <td className="whitespace-nowrap text-xs">{x.authorName}</td>
                <td className="max-w-[420px] text-[12.5px]">
                  <div className="line-clamp-2">{x.deletedAt ? <i className="text-muted">Removed</i> : x.body}</div>
                </td>
                <td className="text-right">
                  {!x.deletedAt ? (
                    <Button size="icon-sm" variant="ghost" aria-label="Remove message" onClick={() => removeMsg(x._id, x.authorName)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : (
        <Section>
          <Table head={["Conversation", "Type", "Members", "Messages", "Last message", "Status", ""]} empty={!m.rooms.length}>
            {m.rooms.map((r) => (
              <tr key={r._id} className={cn(r.archivedAt && "opacity-60")}>
                <td className="font-medium">{r.name}</td>
                <td className="text-xs capitalize">{r.type === "direct" ? "Direct message" : r.type}</td>
                <td className="num text-xs">{r.type === "everyone" ? "All" : fmtInt(r.members.length)}</td>
                <td className="num text-xs">{fmtInt(r.messages)}</td>
                <td className="text-xs">
                  <When iso={r.lastMessageAt} />
                </td>
                <td>{r.archivedAt ? <Badge>Archived</Badge> : <Badge tone="ok">Active</Badge>}</td>
                <td className="whitespace-nowrap text-right">
                  {r.type === "group" ? (
                    <>
                      {r.archivedAt ? (
                        <Button size="sm" variant="ghost" onClick={() => room.mutate({ id: r._id, action: "restore" })}>
                          <ArchiveRestore />
                          Restore
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => room.mutate({ id: r._id, action: "archive" })}>
                          <Archive />
                          Archive
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-brand"
                        onClick={() => window.confirm(`Delete "${r.name}" and all its messages?`) && room.mutate({ id: r._id, action: "delete" })}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
      <div className="h-6" />
    </>
  );
}

/* ---------------- Announcements ---------------- */

type Announcement = AppSettings["announcements"][number];
const EMPTY = { text: "", tone: "info" as Announcement["tone"], active: true, from: "", until: "" };
const toIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const toDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function AnnouncementsPage() {
  const settings = useSettingsData();
  const list = settings.data?.settings.announcements ?? [];
  const [form, setForm] = useState<typeof EMPTY & { id?: string }>(EMPTY);
  const [post, setPost] = useState("");
  const save = useAdminAction(
    () => api("/api/admin/announcements", { method: "POST", json: { ...form, from: toIso(form.from), until: form.until ? new Date(`${form.until}T23:59:59`).toISOString() : null } }),
    form.id ? "Announcement updated." : "Announcement published.",
  );
  const del = useAdminAction((id: string) => api(`/api/admin/announcements/${id}`, { method: "DELETE" }), "Announcement deleted.");
  const toggle = useAdminAction((a: Announcement) => api("/api/admin/announcements", { method: "POST", json: { ...a, active: !a.active } }), "Saved.");
  const sendPost = useAdminAction(() => api("/api/admin/announcements/post", { method: "POST", json: { text: post } }), "Posted to Everyone.");
  const TONES = { info: "bg-info-soft border-info/25", warn: "bg-warn-soft border-warn/30", success: "bg-ok-soft border-ok/25" };

  return (
    <>
      <PageHeader icon={Megaphone} title="Announcements" description="A banner at the top of every page, or a message to everyone in Ask Abrams from “SEG Admin”." />
      <Section title={form.id ? "Edit banner" : "New banner"} description="People can dismiss a banner; it disappears for them only.">
        <div className="space-y-3 px-5 py-4">
          <Textarea rows={2} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="e.g. Fall 2027 estimates are due Friday 5 pm." maxLength={500} data-testid="announcement-text" />
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              label="Style"
              value={form.tone}
              onChange={(tone) => setForm({ ...form, tone })}
              options={[
                { value: "info", label: "Information (teal)" },
                { value: "warn", label: "Important (amber)" },
                { value: "success", label: "Good news (green)" },
              ]}
            />
            <label className="flex items-center gap-1 text-xs text-muted">
              Show from
              <Input type="date" className="w-36" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted">
              until
              <Input type="date" className="w-36" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
            </label>
            <div className="ml-auto flex gap-2">
              {form.id ? (
                <Button variant="ghost" onClick={() => setForm(EMPTY)}>
                  Cancel
                </Button>
              ) : null}
              <Button variant="brand" disabled={!form.text.trim() || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setForm(EMPTY) })} data-testid="announcement-save">
                <Megaphone />
                {form.id ? "Save" : "Publish banner"}
              </Button>
            </div>
          </div>
          {form.text.trim() ? (
            <div className={cn("rounded-lg border px-3 py-2 text-[13px]", TONES[form.tone])}>
              <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Preview</span>
              {form.text}
            </div>
          ) : null}
        </div>
      </Section>
      <Section title={`Banners · ${list.length}`}>
        <Table head={["Text", "Style", "Window", "Showing", ""]} empty={!list.length}>
          {list.map((a) => (
            <tr key={a.id}>
              <td className="max-w-[420px] text-[12.5px]">{a.text}</td>
              <td className="text-xs capitalize">{a.tone}</td>
              <td className="text-xs">
                {a.from || a.until ? `${toDate(a.from) || "now"} → ${toDate(a.until) || "no end"}` : <span className="text-subtle">Always</span>}
              </td>
              <td>
                <Switch label="Showing" checked={a.active} onChange={() => toggle.mutate(a)} />
              </td>
              <td className="whitespace-nowrap text-right">
                <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setForm({ id: a.id, text: a.text, tone: a.tone, active: a.active, from: toDate(a.from), until: toDate(a.until) })}>
                  <Pencil />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => window.confirm("Delete this announcement?") && del.mutate(a.id)}>
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Post to Everyone" description="Appears in the Everyone conversation in Ask Abrams, from “SEG Admin”.">
        <div className="flex items-end gap-3 px-5 py-4">
          <Textarea rows={2} value={post} onChange={(e) => setPost(e.target.value)} placeholder="Write a message to the whole team…" maxLength={4000} />
          <Button variant="primary" disabled={!post.trim() || sendPost.isPending} onClick={() => sendPost.mutate(undefined, { onSuccess: () => setPost("") })}>
            <Send />
            Post
          </Button>
        </div>
      </Section>
      <div className="h-6" />
    </>
  );
}

/* ---------------- Assistant ---------------- */

type Stats = Awaited<ReturnType<typeof assistantStats>>;

export function AssistantPage() {
  const d = useSectionDraft("assistant");
  const [days, setDays] = useState(30);
  const stats = useAdmin<Stats>(`assistant?days=${days}`);
  const r = d.draft;
  const saved = d.data?.settings.assistant;
  const s = stats.data;
  return (
    <>
      <PageHeader icon={Bot} title="Assistant settings" description="The Ask Abrams assistant answers questions from SEG's own data — no outside AI service. Choose what it says and see what people ask." />
      {r && saved ? (
        <Section>
          <SettingRow label="Assistant on" help="When off, the assistant disappears from Ask Abrams; team chat keeps working." changed={r.enabled !== saved.enabled}>
            <Switch label="Assistant on" checked={r.enabled} onChange={(enabled) => d.set({ enabled })} />
          </SettingRow>
          <SettingRow label="Greeting" help="Shown when someone opens the assistant. {name} becomes their first name." changed={r.greeting !== saved.greeting} stacked>
            <Textarea rows={3} value={r.greeting} onChange={(e) => d.set({ greeting: e.target.value })} maxLength={500} />
          </SettingRow>
          <SettingRow label="Suggested questions" help="Up to 8 one-click questions under the greeting." changed={JSON.stringify(r.suggestions) !== JSON.stringify(saved.suggestions)} stacked>
            <TagInput value={r.suggestions} onChange={(suggestions) => d.set({ suggestions: suggestions.slice(0, 8) })} placeholder="Type a question and press Enter" />
          </SettingRow>
          <div className="px-5 pb-3">
            <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} />
          </div>
        </Section>
      ) : (
        <Loading />
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">What people ask</h2>
        <SelectField
          label="Period"
          value={days}
          onChange={setDays}
          options={[
            { value: 7, label: "Last 7 days" },
            { value: 30, label: "Last 30 days" },
            { value: 90, label: "Last 90 days" },
          ]}
        />
      </div>
      {s ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Questions typed" value={fmtInt(s.total)} />
            <Stat label="Answered" value={s.total ? `${Math.round((s.answered / s.total) * 100)}%` : "—"} tone="ok" sub={`${fmtInt(s.answered)} of ${fmtInt(s.total)}`} />
            <Stat label="Not understood" value={fmtInt(s.total - s.answered)} tone={s.total - s.answered ? "warn" : undefined} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Most common unanswered questions" description="Good candidates for new suggestions — or things to add to the assistant.">
              <Table head={["Question", "Times", "Last asked"]} empty={!s.unanswered.length}>
                {s.unanswered.map((u) => (
                  <tr key={u._id}>
                    <td className="text-[12.5px]">{u.example}</td>
                    <td className="num">{u.n}</td>
                    <td className="text-xs">
                      <When iso={u.last} />
                    </td>
                  </tr>
                ))}
              </Table>
            </Section>
            <Section title="By topic">
              <Table head={["Topic", "Questions"]} empty={!s.byIntent.length}>
                {s.byIntent.map((b) => (
                  <tr key={b._id}>
                    <td className="capitalize">{(b._id ?? "other").replace(/_/g, " ")}</td>
                    <td className="num">{fmtInt(b.n)}</td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>
        </>
      ) : (
        <Loading />
      )}
      <div className="h-6" />
    </>
  );
}

/* ---------------- Notification defaults ---------------- */

export function NotificationsPage() {
  const d = useSectionDraft("notifications");
  const r = d.draft;
  const saved = d.data?.settings.notifications;
  if (!r || !saved) return <Loading />;
  const row = (key: keyof typeof r, label: string, help: string) => (
    <SettingRow label={label} help={help} changed={r[key] !== saved[key]}>
      <Switch label={label} checked={r[key]} onChange={(v) => d.set({ [key]: v } as Partial<typeof r>)} />
    </SettingRow>
  );
  return (
    <>
      <PageHeader icon={BellRing} title="Notification defaults" description="What people are notified about in SEG (the bell and My Desk). Notifications stay inside SEG — nothing is e-mailed." />
      <Section>
        {row("mentions", "@mentions", "Notify people when someone @mentions them in a comment or in Ask Abrams.")}
        {row("replies", "Replies", "Notify people when someone replies to a comment thread they are part of.")}
        {row("directMessages", "Direct messages", "Notify people about every new direct message (not only @mentions).")}
        {row("desktopAlertsOffered", "Offer desktop alerts", "Show the bell button in Ask Abrams that lets people turn on the browser's own pop-up alerts.")}
      </Section>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} />
    </>
  );
}

