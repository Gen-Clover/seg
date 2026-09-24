"use client";

import { Layers, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  GROUP_DATE_FIELDS,
  GROUP_FIELD_LABELS,
  GROUP_FLAG_FIELDS,
  GROUP_NUMBER_FIELDS,
  GROUP_TEXT_FIELDS,
  describeRule,
  groupTitles,
  type GroupField,
  type GroupRule,
} from "@seg/domain";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { useSummary, type TitleSummaryRow } from "@/lib/queries";
import { cn, fmtDate, fmtInt } from "@/lib/utils";
import type { AdminUserView } from "@/server/services/admin/people";
import { Loading, PageHeader, Section, SelectField, Switch, useAdmin, useAdminAction, useSettingsData, type AppSettings } from "./ui";

type WorkGroup = AppSettings["workGroups"][number];
type Kind = "text" | "date" | "number" | "flag";

const kindOf = (f: GroupField): Kind =>
  (GROUP_TEXT_FIELDS as readonly string[]).includes(f)
    ? "text"
    : (GROUP_DATE_FIELDS as readonly string[]).includes(f)
      ? "date"
      : (GROUP_NUMBER_FIELDS as readonly string[]).includes(f)
        ? "number"
        : "flag";

const OPS: Record<Kind, { value: GroupRule["op"]; label: string }[]> = {
  text: [
    { value: "in", label: "is one of" },
    { value: "notIn", label: "is not one of" },
  ],
  date: [
    { value: "nextDays", label: "is in the next … days" },
    { value: "pastDays", label: "was in the last … days" },
    { value: "between", label: "is between" },
    { value: "before", label: "is before" },
    { value: "after", label: "is after" },
    { value: "isSet", label: "is set" },
    { value: "isNotSet", label: "is not set" },
  ],
  number: [
    { value: "atLeast", label: "is at least" },
    { value: "atMost", label: "is at most" },
    { value: "between", label: "is between" },
    { value: "isSet", label: "is set" },
    { value: "isNotSet", label: "is not set" },
  ],
  flag: [{ value: "is", label: "is" }],
};

const FIELD_GROUPS: { label: string; fields: readonly GroupField[] }[] = [
  { label: "Title", fields: GROUP_TEXT_FIELDS },
  { label: "Dates", fields: GROUP_DATE_FIELDS },
  { label: "Numbers", fields: GROUP_NUMBER_FIELDS },
  { label: "Planning status", fields: GROUP_FLAG_FIELDS },
];

/** A fresh rule for a field and operator, with empty values. */
function ruleFor(field: GroupField, op?: GroupRule["op"]): GroupRule {
  const kind = kindOf(field);
  const o = op ?? OPS[kind][0]!.value;
  if (kind === "text") return { field: field as (typeof GROUP_TEXT_FIELDS)[number], op: o as "in", values: [] };
  if (o === "isSet" || o === "isNotSet") return { field: field as (typeof GROUP_DATE_FIELDS)[number], op: o };
  if (kind === "date") {
    if (o === "nextDays" || o === "pastDays") return { field: field as (typeof GROUP_DATE_FIELDS)[number], op: o, days: 30 };
    return { field: field as (typeof GROUP_DATE_FIELDS)[number], op: o as "between", from: null, to: null };
  }
  if (kind === "number") return { field: field as (typeof GROUP_NUMBER_FIELDS)[number], op: o as "atLeast", min: null, max: null };
  return { field: field as (typeof GROUP_FLAG_FIELDS)[number], op: "is", value: true };
}

const todayLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const newGroup = (): WorkGroup => ({
  id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : String(Date.now()),
  name: "",
  everyone: false,
  members: [],
  match: "all",
  rules: [ruleFor("season")],
  createdBy: "",
  updatedAt: null,
});

export function WorkGroupsPage() {
  const settings = useSettingsData();
  const users = useAdmin<{ users: AdminUserView[] }>("users");
  const summary = useSummary();
  const titles = useMemo(() => summary.data?.titles ?? [], [summary.data]);
  const groups = settings.data?.settings.workGroups ?? [];
  const [editing, setEditing] = useState<WorkGroup | null>(null);
  const save = useAdminAction((list: WorkGroup[]) => api("/api/admin/settings/workGroups", { method: "PUT", json: list }));
  const nameOf = useMemo(() => new Map((users.data?.users ?? []).map((u) => [u.email, u.name])), [users.data]);
  const today = todayLocal();

  const commit = (list: WorkGroup[], done: string, after?: () => void) =>
    save.mutate(list, {
      onSuccess: () => {
        after?.();
        toast.success(done);
      },
    });

  return (
    <>
      <PageHeader
        icon={Layers}
        title="Work groups"
        description="Collections of titles that appear as extra tabs on My Desk for the people you choose. Titles are picked by rules — for example “Season is Fall 2026 and Division is Adult Trade” — so the tab stays up to date by itself."
        actions={
          <Button variant="brand" onClick={() => setEditing(newGroup())} data-testid="wg-new">
            <Plus />
            New group
          </Button>
        }
      />
      {settings.isPending ? (
        <Loading />
      ) : !groups.length ? (
        <Section>
          <div className="px-6 py-12 text-center">
            <Layers className="mx-auto size-8 text-subtle" />
            <p className="mt-2 text-[13px] text-muted">No work groups yet. Create one to give people their own tab of titles on My Desk.</p>
          </div>
        </Section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const count = titles.length ? groupTitles(titles, g, today).length : null;
            return (
              <Card key={g.id} className="flex flex-col gap-3 p-4" data-testid={`wg-card-${g.name}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[15px] font-semibold">
                      <Layers className="size-4 text-info" />
                      <span className="truncate">{g.name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                      <Users className="size-3.5" />
                      {g.everyone ? "Everyone" : g.members.length ? g.members.map((m) => nameOf.get(m) ?? m).join(", ") : "Nobody yet"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[20px] font-semibold leading-none">{count === null ? "…" : fmtInt(count)}</div>
                    <div className="text-[11px] text-subtle">titles now</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  {g.rules.length ? (
                    g.rules.map((r, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        {i ? <span className="text-[10.5px] font-semibold uppercase text-subtle">{g.match === "all" ? "and" : "or"}</span> : null}
                        <Badge tone="info">{describeRule(r)}</Badge>
                      </span>
                    ))
                  ) : (
                    <Badge>All titles</Badge>
                  )}
                </div>
                <div className="mt-auto flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(g))}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-brand"
                    onClick={() => window.confirm(`Delete the work group "${g.name}"? It disappears from everyone's My Desk.`) && commit(groups.filter((x) => x.id !== g.id), "Work group deleted.")}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="pb-6 text-[12.5px] text-muted">
        People only see the titles their division / imprint access allows, and the division and imprint filters on My Desk apply to group tabs too. Each person can drag their tabs into their own order.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => (o ? null : setEditing(null))}>
        {editing ? (
          <GroupEditor
            group={editing}
            isNew={!groups.some((g) => g.id === editing.id)}
            titles={titles}
            users={(users.data?.users ?? []).filter((u) => u.active)}
            today={today}
            saving={save.isPending}
            nameTaken={groups.some((g) => g.id !== editing.id && g.name.trim().toLowerCase() === editing.name.trim().toLowerCase())}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={() => {
              const clean = { ...editing, name: editing.name.trim() };
              const exists = groups.some((g) => g.id === clean.id);
              commit(exists ? groups.map((g) => (g.id === clean.id ? clean : g)) : [...groups, clean], exists ? "Work group saved." : "Work group created.", () => setEditing(null));
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function GroupEditor({
  group,
  isNew,
  titles,
  users,
  today,
  saving,
  nameTaken,
  onChange,
  onCancel,
  onSave,
}: {
  group: WorkGroup;
  isNew: boolean;
  titles: TitleSummaryRow[];
  users: AdminUserView[];
  today: string;
  saving: boolean;
  nameTaken: boolean;
  onChange: (g: WorkGroup) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const matching = useMemo(() => groupTitles(titles, group, today), [titles, group, today]);
  const options = useMemo(() => {
    const out = {} as Record<(typeof GROUP_TEXT_FIELDS)[number], { value: string; label: string; count: number }[]>;
    for (const f of GROUP_TEXT_FIELDS) {
      const counts = new Map<string, number>();
      for (const t of titles) {
        const v = t[f];
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[f] = [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
    }
    return out;
  }, [titles]);
  const setRule = (i: number, r: GroupRule) => onChange({ ...group, rules: group.rules.map((x, j) => (j === i ? r : x)) });
  const incomplete = group.rules.some(
    (r) =>
      ((r.op === "in" || r.op === "notIn") && !r.values.length) ||
      (r.op === "before" && !r.to) ||
      (r.op === "after" && !r.from) ||
      (r.op === "between" && ("min" in r ? r.min === null && r.max === null : !r.from && !r.to)) ||
      (r.op === "atLeast" && r.min === null) ||
      (r.op === "atMost" && r.max === null),
  );
  const canSave = group.name.trim().length > 0 && !nameTaken && (group.everyone || group.members.length > 0) && !incomplete && !saving;

  return (
    <DialogContent title={isNew ? "New work group" : `Edit “${group.name}”`} description="The name is the tab people see on My Desk." className="top-[6vh] w-[min(820px,calc(100vw-32px))]">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <label className="block text-[13px] font-medium">
            Group name
            <Input className="mt-1" value={group.name} maxLength={40} onChange={(e) => onChange({ ...group, name: e.target.value })} placeholder="e.g. Fall 2026 – Adult Trade" autoFocus data-testid="wg-name" />
            {nameTaken ? <span className="mt-1 block text-xs text-warn">Another group already has this name.</span> : null}
          </label>
          <div className="text-[13px] font-medium">
            Who sees this tab
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Switch label="Everyone" checked={group.everyone} onChange={(everyone) => onChange({ ...group, everyone })} />
              <span className="text-xs font-normal text-muted">Everyone</span>
              {!group.everyone ? (
                <MultiSelect
                  label="People"
                  options={users.map((u) => ({ value: u.email, label: `${u.name} (${u.role})` }))}
                  selected={group.members}
                  onChange={(members) => onChange({ ...group, members })}
                  searchPlaceholder="Find a person…"
                />
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-medium">
            Titles that match
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
              {(
                [
                  ["all", "all rules"],
                  ["any", "any rule"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onChange({ ...group, match: k })}
                  className={cn("rounded-md px-2.5 py-1 font-medium", group.match === k ? "bg-ink text-surface" : "text-muted hover:text-ink")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2" data-testid="wg-rules">
            {group.rules.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/40 p-2.5">
                <span className="w-9 text-center text-[10.5px] font-semibold uppercase text-subtle">{i === 0 ? "where" : group.match === "all" ? "and" : "or"}</span>
                <select
                  aria-label="Field"
                  value={r.field}
                  onChange={(e) => setRule(i, ruleFor(e.target.value as GroupField))}
                  className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] shadow-sm"
                >
                  {FIELD_GROUPS.map((fg) => (
                    <optgroup key={fg.label} label={fg.label}>
                      {fg.fields.map((f) => (
                        <option key={f} value={f}>
                          {GROUP_FIELD_LABELS[f]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <SelectField label="Condition" value={r.op} onChange={(op) => setRule(i, ruleFor(r.field, op))} options={OPS[kindOf(r.field)]} />
                <RuleValue rule={r} options={options} onChange={(x) => setRule(i, x)} />
                <button
                  type="button"
                  onClick={() => onChange({ ...group, rules: group.rules.filter((_, j) => j !== i) })}
                  className="ml-auto rounded-md p-1 text-muted hover:bg-surface-2 hover:text-brand"
                  aria-label="Remove rule"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <Button size="sm" onClick={() => onChange({ ...group, rules: [...group.rules, ruleFor("division")] })} data-testid="wg-add-rule">
              <Plus />
              Add rule
            </Button>
            {!group.rules.length ? <p className="text-xs text-muted">No rules: the group contains every title the person can see.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px]">
            <span className="font-medium">Preview</span>
            <span data-testid="wg-preview-count">
              <span className="num font-semibold">{fmtInt(matching.length)}</span> titles match now
            </span>
          </div>
          <ul className="max-h-44 divide-y divide-line overflow-y-auto text-[12.5px]">
            {matching.slice(0, 50).map((t) => (
              <li key={t.isbn} className="flex items-center gap-3 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-xs text-muted">{[t.season, t.division, t.imprint].filter(Boolean).join(" · ")}</span>
                <span className="num w-24 text-right text-xs text-subtle">{fmtDate(t.pubDate)}</span>
              </li>
            ))}
            {matching.length > 50 ? <li className="px-3 py-1.5 text-xs text-muted">…and {fmtInt(matching.length - 50)} more</li> : null}
            {!matching.length ? <li className="px-3 py-4 text-center text-xs text-muted">No titles match these rules right now.</li> : null}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        {!canSave && !saving ? (
          <span className="mr-auto text-xs text-muted">
            {!group.name.trim() ? "Give the group a name." : nameTaken ? "Choose another name." : !group.everyone && !group.members.length ? "Choose who sees it (or Everyone)." : incomplete ? "Fill in every rule." : ""}
          </span>
        ) : null}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="brand" disabled={!canSave} onClick={onSave} data-testid="wg-save">
          {isNew ? "Create group" : "Save group"}
        </Button>
      </div>
    </DialogContent>
  );
}

function RuleValue({
  rule,
  options,
  onChange,
}: {
  rule: GroupRule;
  options: Record<(typeof GROUP_TEXT_FIELDS)[number], { value: string; label: string; count: number }[]>;
  onChange: (r: GroupRule) => void;
}) {
  const dateInput = (value: string | null, set: (v: string | null) => void, label: string) => (
    <Input type="date" aria-label={label} className="w-40" value={value ?? ""} onChange={(e) => set(e.target.value || null)} />
  );
  const numInput = (value: number | null, set: (v: number | null) => void, label: string) => (
    <Input
      type="number"
      aria-label={label}
      className="w-28 text-right"
      value={value ?? ""}
      onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
  switch (rule.op) {
    case "in":
    case "notIn":
      return (
        <MultiSelect
          label={GROUP_FIELD_LABELS[rule.field]}
          options={options[rule.field]}
          selected={rule.values}
          onChange={(values) => onChange({ ...rule, values })}
          className="max-w-[320px]"
        />
      );
    case "nextDays":
    case "pastDays":
      return (
        <span className="flex items-center gap-1.5 text-[13px]">
          {numInput(rule.days, (v) => onChange({ ...rule, days: Math.max(0, Math.round(v ?? 0)) }), "Days")}
          days
        </span>
      );
    case "before":
    case "after":
    case "between":
      if ("min" in rule) {
        return (
          <span className="flex items-center gap-1.5 text-[13px]">
            {numInput(rule.min, (min) => onChange({ ...rule, min }), "From")}
            and
            {numInput(rule.max, (max) => onChange({ ...rule, max }), "To")}
          </span>
        );
      }
      if (rule.op === "before") return dateInput(rule.to, (to) => onChange({ ...rule, to }), "Date");
      if (rule.op === "after") return dateInput(rule.from, (from) => onChange({ ...rule, from }), "Date");
      return (
        <span className="flex items-center gap-1.5 text-[13px]">
          {dateInput(rule.from, (from) => onChange({ ...rule, from }), "From")}
          and
          {dateInput(rule.to, (to) => onChange({ ...rule, to }), "To")}
        </span>
      );
    case "atLeast":
      return numInput(rule.min, (min) => onChange({ ...rule, min }), "At least");
    case "atMost":
      return numInput(rule.max, (max) => onChange({ ...rule, max }), "At most");
    case "is":
      return (
        <SelectField
          label="Value"
          value={rule.value ? "yes" : "no"}
          onChange={(v) => onChange({ ...rule, value: v === "yes" })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      );
    default:
      return null;
  }
}
