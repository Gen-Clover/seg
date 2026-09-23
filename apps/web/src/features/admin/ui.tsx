"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, RotateCcw, Save } from "lucide-react";
import { Switch as S } from "radix-ui";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { settingsKey } from "@/lib/settings";
import { cn, timeAgo } from "@/lib/utils";
import type { AppSettings } from "@/server/services/settings";

export type { AppSettings };

/* ---------------- Data ---------------- */

export const adminKey = (...parts: (string | number | undefined | null)[]) => ["admin", ...parts.filter((p) => p !== undefined && p !== null && p !== "")] as const;

export function useAdmin<T>(path: string, options: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adminKey(...path.split(/[/?&]/)),
    queryFn: () => api<T>(`/api/admin/${path}`),
    staleTime: 10_000,
    ...options,
  });
}

/** An admin action with a toast and a refresh of the admin data (and the app settings) afterwards. */
export function useAdminAction<I, O = unknown>(fn: (input: I) => Promise<O>, success?: string | ((out: O) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (out) => {
      if (success) toast.success(typeof success === "function" ? success(out) : success);
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: settingsKey });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "That didn't work."),
  });
}

export interface SettingsResponse {
  settings: AppSettings;
  meta: { updatedAt: string | null; updatedBy: string | null };
  demoEnvironment: boolean;
}

export function useSettingsData() {
  return useAdmin<SettingsResponse>("settings");
}

/**
 * Edit one settings section as a draft: nothing changes until Save.
 * Returns the draft, a setter, dirty state and save/discard.
 */
export function useSectionDraft<K extends keyof AppSettings>(section: K) {
  const data = useSettingsData();
  const saved = data.data?.settings[section];
  const [draft, setDraft] = useState<AppSettings[K] | undefined>(undefined);
  const [base, setBase] = useState<string | undefined>(undefined);
  // Adopt the saved value when it first arrives or changes on the server — unless there are unsaved edits.
  const savedJson = saved === undefined ? undefined : JSON.stringify(saved);
  if (savedJson !== undefined && savedJson !== base) {
    setBase(savedJson);
    if (draft === undefined || JSON.stringify(draft) === base) setDraft(structuredClone(saved));
  }
  const dirty = useMemo(() => draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const save = useAdminAction((value: AppSettings[K]) => api(`/api/admin/settings/${section}`, { method: "PUT", json: value }), "Saved — applies across SEG within a minute.");
  return {
    loading: data.isPending,
    data: data.data,
    draft,
    set: (patch: Partial<AppSettings[K]>) => setDraft((d) => ({ ...(d as object), ...patch }) as AppSettings[K]),
    replace: (value: AppSettings[K]) => setDraft(value),
    dirty,
    saving: save.isPending,
    save: () => draft !== undefined && save.mutateAsync(draft),
    discard: () => saved !== undefined && setDraft(structuredClone(saved)),
  };
}

/* ---------------- Layout ---------------- */

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon className="size-[18px]" />
          </span>
        ) : null}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 max-w-2xl text-[13px] text-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  children,
  actions,
  className,
  ...rest
}: {
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)} {...rest}>
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </Card>
  );
}

/** One setting: label and help on the left, the control on the right. */
export function SettingRow({
  label,
  help,
  children,
  changed,
  stacked,
}: {
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
  /** Differs from the saved value (highlighted until saved). */
  changed?: boolean;
  /** Control under the label (for wide controls like checkbox groups). */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative border-b border-line px-5 py-4 last:border-b-0",
        stacked ? "flex flex-col gap-3" : "flex flex-wrap items-center justify-between gap-x-6 gap-y-2",
      )}
    >
      {changed ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-info" aria-hidden /> : null}
      <div className={cn("min-w-0", stacked ? "" : "max-w-xl flex-1")}>
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
          {label}
          {changed ? <span className="rounded bg-info-soft px-1.5 text-[10.5px] font-semibold text-info">Changed</span> : null}
        </div>
        {help ? <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{help}</div> : null}
      </div>
      <div className={cn(stacked ? "" : "shrink-0")}>{children}</div>
    </div>
  );
}

/** Save / discard bar for a draft; sticks to the bottom of the page while there are changes. */
export function SaveBar({ dirty, saving, onSave, onDiscard, note }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; note?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky bottom-3 z-10 mt-1 flex items-center gap-3 rounded-xl border px-4 py-2.5 backdrop-blur transition-colors",
        dirty ? "border-info/30 bg-info-soft/90 shadow-[var(--shadow-pop)]" : "border-transparent bg-transparent",
      )}
    >
      <span className="flex-1 text-[12.5px] text-muted">{dirty ? (note ?? "You have unsaved changes.") : "All changes saved."}</span>
      <Button variant="ghost" disabled={!dirty || saving} onClick={onDiscard}>
        <RotateCcw />
        Discard
      </Button>
      <Button variant="brand" disabled={!dirty || saving} onClick={onSave} data-testid="admin-save">
        {saving ? <Spinner className="size-3.5" /> : <Save />}
        Save changes
      </Button>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-[12.5px] font-medium", disabled && "cursor-not-allowed opacity-60")}>
      <span className={cn("w-7 text-right", checked ? "text-ok" : "text-muted")}>{checked ? "On" : "Off"}</span>
      <S.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          checked ? "border-ok bg-ok" : "border-line-strong bg-surface-3",
        )}
      >
        <S.Thumb className="block size-4 translate-x-[2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[20px]" />
      </S.Root>
    </label>
  );
}

/** Checkbox chips: tick the values that apply (for short lists of real values). */
export function CheckboxGroup({
  options,
  value,
  onChange,
  columns,
}: {
  options: { value: string; label?: string; hint?: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  columns?: number;
}) {
  const set = new Set(value.map((v) => v.toUpperCase()));
  const toggle = (v: string) => onChange(set.has(v.toUpperCase()) ? value.filter((x) => x.toUpperCase() !== v.toUpperCase()) : [...value, v]);
  return (
    <div className={cn("flex flex-wrap gap-2", columns && "grid")} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => {
        const on = set.has(o.value.toUpperCase());
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(o.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition-colors",
              on ? "border-brand/40 bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
            )}
          >
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface")}>
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{o.label ?? o.value}</span>
              {o.hint ? <span className="block truncate text-[11px] text-subtle">{o.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Free list of words (add with Enter, remove with ×) for values that are not in the data yet. */
export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-1.5 py-1 shadow-sm focus-within:border-line-strong">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[12.5px] ring-1 ring-inset ring-line">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-muted hover:text-brand" aria-label={`Remove ${v}`}>
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-subtle"
      />
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  width = "w-24",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  width?: string;
}) {
  const [text, setText] = useState(String(value));
  // Follow outside changes (e.g. Discard) without an effect.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.min(max ?? n, Math.max(min ?? n, n)));
        }}
        onBlur={() => setText(String(value))}
        className={cn("num h-8 rounded-lg border border-line bg-surface px-2.5 text-right text-[13px] shadow-sm outline-none focus:border-line-strong focus:ring-2 focus:ring-ring/20", width)}
      />
      {suffix ? <span className="text-[12.5px] text-muted">{suffix}</span> : null}
    </span>
  );
}

export function SelectField<T extends string | number>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
      className={cn("h-8 rounded-lg border border-line bg-surface px-2 text-[13px] shadow-sm outline-none focus:border-line-strong", className)}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A rule that is part of how SEG works and can't be changed here (shown for completeness). */
export function FixedRule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line px-5 py-3 last:border-b-0">
      <Lock className="mt-0.5 size-3.5 shrink-0 text-subtle" />
      <div>
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[12.5px] leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "warn" | "brand" | "info" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div
        className={cn(
          "num mt-1 text-[22px] font-semibold tracking-tight",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "brand" && "text-brand",
          tone === "info" && "text-info",
        )}
      >
        {value}
      </div>
      {sub ? <div className="truncate text-xs text-subtle">{sub}</div> : null}
    </div>
  );
}

export function StatusDot({ ok, warn }: { ok: boolean | null; warn?: boolean }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", ok === null ? "bg-subtle" : warn ? "bg-warn" : ok ? "bg-ok" : "bg-brand")} aria-hidden />;
}

export function Table({ head, children, empty, className }: { head: React.ReactNode[]; children: React.ReactNode; empty?: boolean; className?: string }) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto", className)}>
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-[1] bg-surface-2/95 text-[11px] font-semibold uppercase tracking-wide text-muted backdrop-blur">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap border-b border-line px-4 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-line [&_td]:px-4 [&_td]:py-2.5 [&_tr:last-child_td]:border-b-0 [&_tr:hover]:bg-surface-2/40">{children}</tbody>
      </table>
      {empty ? <div className="px-4 py-10 text-center text-[13px] text-muted">Nothing here yet.</div> : null}
    </div>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function When({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-subtle">—</span>;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className="whitespace-nowrap" suppressHydrationWarning>
      {timeAgo(iso)}
    </time>
  );
}

export function LastSaved({ meta }: { meta?: { updatedAt: string | null; updatedBy: string | null } }) {
  if (!meta?.updatedAt) return <span className="text-xs text-subtle">Using the original SEG defaults</span>;
  return (
    <span className="text-xs text-subtle" suppressHydrationWarning>
      Settings last changed {timeAgo(meta.updatedAt)} by {meta.updatedBy}
    </span>
  );
}

export const fmtMs = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

export function duration(start: string, end: string | null) {
  return end ? fmtMs(Date.parse(end) - Date.parse(start)) : "running…";
}
