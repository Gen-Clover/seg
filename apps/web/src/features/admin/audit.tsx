"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Download, FileUp, History, LayoutList, LogIn } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Input, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn, fmtInt } from "@/lib/utils";
import type { activity, activityFacets, signInLog } from "@/server/services/admin/audit";
import type { AdminAuditDoc, UploadLogDoc } from "@seg/data";
import { Loading, PageHeader, Section, SelectField, Stat, Table, When, useAdmin } from "./ui";

type ActivityPage = Awaited<ReturnType<typeof activity>>;
type Facets = Awaited<ReturnType<typeof activityFacets>>;

const SOURCE: Record<string, string> = { grid: "Grid", upload: "Upload", restore: "Restore", admin: "Admin bulk", migration: "Imported" };
const show = (v: unknown) => (v === null || v === undefined || v === "" ? <span className="text-subtle">blank</span> : typeof v === "number" ? fmtInt(v) : String(v));

/* ---------------- Activity log ---------------- */

export function ActivityLogPage() {
  const facets = useAdmin<Facets>("activity/facets");
  const [f, setF] = useState({ person: "", from: "", to: "", season: "", field: "", source: "", isbn: "" });
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const log = useInfiniteQuery({
    queryKey: ["admin", "activity", params.toString()],
    queryFn: ({ pageParam }) => api<ActivityPage>(`/api/admin/activity?${params}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: 10_000,
  });
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));
  const fc = facets.data;

  return (
    <>
      <PageHeader
        icon={History}
        title="Activity log"
        description="Every saved change across all titles, newest first — from the grid, uploads, restores and admin bulk actions."
        actions={
          <Button asChild variant="primary">
            <a href={`/api/admin/activity/csv?${params}`} download>
              <Download />
              Export CSV
            </a>
          </Button>
        }
      />
      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <SelectField label="Person" value={f.person} onChange={(person) => set({ person })} options={[{ value: "", label: "Everyone" }, ...(fc?.people ?? [])]} />
          <SelectField label="Season" value={f.season} onChange={(season) => set({ season })} options={[{ value: "", label: "All seasons" }, ...(fc?.seasons ?? []).map((s) => ({ value: s, label: s }))]} />
          <SelectField label="Field" value={f.field} onChange={(field) => set({ field })} options={[{ value: "", label: "All fields" }, ...(fc?.fields ?? [])]} />
          <SelectField label="Source" value={f.source} onChange={(source) => set({ source })} options={[{ value: "", label: "All sources" }, ...(fc?.sources ?? []).map((s) => ({ value: s, label: SOURCE[s] ?? s }))]} />
          <label className="flex items-center gap-1 text-xs text-muted">
            From
            <Input type="date" className="w-36" value={f.from} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted">
            to
            <Input type="date" className="w-36" value={f.to} onChange={(e) => set({ to: e.target.value })} />
          </label>
          <Input className="w-40" value={f.isbn} onChange={(e) => set({ isbn: e.target.value.trim() })} placeholder="ISBN" />
          {Object.values(f).some(Boolean) ? (
            <Button size="sm" variant="ghost" onClick={() => setF({ person: "", from: "", to: "", season: "", field: "", source: "", isbn: "" })}>
              Clear filters
            </Button>
          ) : null}
        </div>
        {log.isPending ? (
          <Loading rows={8} />
        ) : (
          <Table head={["When", "Person", "Title", "Row", "Field", "Change", "Source"]} empty={!items.length} className="max-h-[600px]">
            {items.map((e) => (
              <tr key={e.id}>
                <td className="text-xs">
                  <When iso={e.at} />
                </td>
                <td className="whitespace-nowrap">{e.personName}</td>
                <td className="max-w-[240px]">
                  <Link href={`/titles/${e.isbn}`} className="block truncate font-medium hover:text-brand hover:underline">
                    {e.title}
                  </Link>
                  <div className="num text-xs text-subtle">
                    {e.isbn}
                    {e.season ? ` · ${e.season}` : ""}
                  </div>
                </td>
                <td className="max-w-[200px] truncate text-xs">{e.row}</td>
                <td className="whitespace-nowrap text-xs">{e.fieldLabel}</td>
                <td className="text-xs">
                  <span className="text-muted line-through decoration-subtle/60">{show(e.oldValue)}</span> → <span className="font-medium">{show(e.newValue)}</span>
                </td>
                <td>
                  <Badge tone={e.source === "upload" ? "info" : e.source === "admin" ? "brand" : e.source === "restore" ? "warn" : "neutral"}>{SOURCE[e.source] ?? e.source}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
        {log.hasNextPage ? (
          <div className="border-t border-line p-2 text-center">
            <Button size="sm" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
              {log.isFetchingNextPage ? <Spinner className="size-3.5" /> : null}
              Load more
            </Button>
          </div>
        ) : null}
      </Section>
      <div className="h-6" />
    </>
  );
}

/* ---------------- Upload log ---------------- */

export function UploadLogPage() {
  const log = useAdmin<{ items: UploadLogDoc[] }>("uploads", { refetchInterval: 30_000 });
  const items = log.data?.items ?? [];
  return (
    <>
      <PageHeader icon={FileUp} title="Upload log" description="Every spreadsheet uploaded from Summary → Upload, with what it changed." />
      <Section>
        {log.isPending ? (
          <Loading />
        ) : (
          <Table head={["When", "Who", "File", "Rows", "Titles", "Values changed", "Problems", "Mode"]} empty={!items.length}>
            {items.map((u) => (
              <tr key={u._id}>
                <td className="text-xs">
                  <When iso={u.startedAt} />
                </td>
                <td>{u.name}</td>
                <td className="max-w-[240px] truncate font-medium" title={u.fileName}>
                  {u.fileName}
                </td>
                <td className="num">{fmtInt(u.rowsRead)}</td>
                <td className="num">{fmtInt(u.titles)}</td>
                <td className="num font-medium">{fmtInt(u.valuesChanged)}</td>
                <td className="text-xs">
                  {u.errorRows || u.conflicts || u.failedTitles ? (
                    <span className="text-warn">
                      {[u.errorRows && `${u.errorRows} bad rows`, u.conflicts && `${u.conflicts} conflicts`, u.failedTitles && `${u.failedTitles} titles refused`].filter(Boolean).join(" · ")}
                    </span>
                  ) : (
                    <span className="text-ok">None</span>
                  )}
                </td>
                <td className="text-xs">{u.overwrite ? "Overwrite" : "Fill"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}

/* ---------------- Sign-in log ---------------- */

type SignIns = Awaited<ReturnType<typeof signInLog>>;

export function SignInLogPage() {
  const [ok, setOk] = useState("");
  const [email, setEmail] = useState("");
  const log = useAdmin<SignIns>(`sign-ins?${new URLSearchParams({ ...(ok ? { ok } : {}), ...(email ? { email } : {}) })}`, { refetchInterval: 30_000 });
  const items = log.data?.items ?? [];
  return (
    <>
      <PageHeader icon={LogIn} title="Sign-in log" description="Successful and failed sign-ins, with the browser and address they came from." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Failed in the last 24 hours" value={fmtInt(log.data?.failed24h ?? 0)} tone={(log.data?.failed24h ?? 0) > 10 ? "warn" : undefined} />
      </div>
      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Input className="w-64" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="Filter by e-mail" />
          <SelectField
            label="Result"
            value={ok}
            onChange={setOk}
            options={[
              { value: "", label: "All results" },
              { value: "yes", label: "Successful" },
              { value: "no", label: "Failed" },
            ]}
          />
        </div>
        {log.isPending ? (
          <Loading />
        ) : (
          <Table head={["When", "E-mail", "Result", "Browser", "Address"]} empty={!items.length} className="max-h-[600px]">
            {items.map((s) => (
              <tr key={s._id}>
                <td className="text-xs">
                  <When iso={s.at} />
                </td>
                <td>{s.email}</td>
                <td>{s.ok ? <Badge tone="ok">Signed in</Badge> : <Badge tone="warn">{s.reason ? s.reason[0]!.toUpperCase() + s.reason.slice(1) : "Failed"}</Badge>}</td>
                <td className="max-w-[280px] truncate text-xs text-muted" title={s.userAgent ?? undefined}>
                  {s.userAgent ?? "—"}
                </td>
                <td className="num text-xs">{s.ip ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}

/* ---------------- Admin changes ---------------- */

export function AdminLogPage() {
  const log = useAdmin<{ items: AdminAuditDoc[] }>("audit", { refetchInterval: 30_000 });
  const [area, setArea] = useState("");
  const items = (log.data?.items ?? []).filter((a) => !area || a.area === area);
  const areas = [...new Set((log.data?.items ?? []).map((a) => a.area))].sort();
  return (
    <>
      <PageHeader icon={LayoutList} title="Admin changes" description="Every change made in this console: who, when and exactly what changed." />
      <Section
        actions={<SelectField label="Area" value={area} onChange={setArea} options={[{ value: "", label: "All areas" }, ...areas.map((a) => ({ value: a, label: a }))]} />}
        title={`Recent changes · ${items.length}`}
      >
        {log.isPending ? (
          <Loading />
        ) : (
          <Table head={["When", "Who", "Area", "What changed"]} empty={!items.length} className="max-h-[640px]">
            {items.map((a) => (
              <tr key={a._id}>
                <td className="text-xs">
                  <When iso={a.at} />
                </td>
                <td className="whitespace-nowrap">{a.byName}</td>
                <td>
                  <Badge className="capitalize">{a.area}</Badge>
                </td>
                <td className={cn("text-[12.5px]")}>{a.detail}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
