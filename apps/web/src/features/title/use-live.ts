"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { queryKeys, type TitleDetail, type TitleSummaryRow } from "@/lib/queries";
import type { LiveTick, Viewer } from "@/server/services/live";
import type { RemoteChange } from "./estimates-grid";

const INTERVAL_MS = 5_000;
const FLASH_MS = 4_000;

/**
 * Live teamwork for an open title (polling — no extra services):
 * - tells the server who is here and which cell is being edited,
 * - brings in other people's saved changes within seconds and flashes those cells,
 * - refreshes comments when someone adds or removes one.
 * Pauses while the tab is hidden.
 */
export function useLive(isbn: string, editingCell: string | null) {
  const qc = useQueryClient();
  const cursor = useRef<string | null>(null);
  const commentsVersion = useRef<string | null>(null);
  const cellRef = useRef(editingCell);
  const busy = useRef(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [remoteCells, setRemoteCells] = useState<Map<string, RemoteChange>>(new Map());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (busy.current || stopped) return;
      busy.current = true;
      try {
        const res = await api<LiveTick>(`/api/titles/${encodeURIComponent(isbn)}/live`, {
          method: "POST",
          json: { cursor: cursor.current, cell: cellRef.current },
        });
        if (stopped) return;
        cursor.current = res.cursor;
        setViewers(res.viewers);

        if (commentsVersion.current !== null && commentsVersion.current !== res.commentsVersion) {
          void qc.invalidateQueries({ queryKey: queryKeys.comments(isbn) });
          void qc.invalidateQueries({ queryKey: queryKeys.unread });
        }
        commentsVersion.current = res.commentsVersion;

        if (res.changes.length) {
          qc.setQueryData<TitleDetail>(queryKeys.title(isbn), (old) => {
            if (!old) return old;
            const byId = new Map(old.estimates.map((e) => [e._id, e]));
            for (const e of res.estimates) byId.set(e._id, e);
            return {
              ...old,
              estimates: [...byId.values()],
              title: { ...old.title, ...(res.totals ? { totals: res.totals } : {}), ...(res.plan ? { plan: res.plan } : {}) },
            };
          });
          if (res.totals) {
            const totals = res.totals;
            qc.setQueryData<{ titles: TitleSummaryRow[]; generatedAt: string }>(queryKeys.summary, (old) =>
              old ? { ...old, titles: old.titles.map((t) => (t.isbn === isbn ? { ...t, totals } : t)) } : old,
            );
          }
          // A comparable-title change needs the comparable figures: reload the title.
          if (res.changes.some((c) => c.field === "compIsbn")) void qc.invalidateQueries({ queryKey: queryKeys.title(isbn) });
          void qc.invalidateQueries({ queryKey: queryKeys.history(isbn) });

          const flashed = new Map<string, RemoteChange>();
          for (const c of res.changes) if (c.level !== "title") flashed.set(`${c.estimateId}|${c.field}`, { by: c.changedBy, at: c.changedAt });
          if (flashed.size) {
            setRemoteCells((prev) => new Map([...prev, ...flashed]));
            setTimeout(() => {
              setRemoteCells((prev) => {
                const next = new Map(prev);
                for (const [k, v] of flashed) if (next.get(k) === v) next.delete(k);
                return next;
              });
            }, FLASH_MS);
          }
        }
      } catch {
        // Offline or signed out: try again on the next tick.
      } finally {
        busy.current = false;
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await tick();
        if (!stopped) schedule();
      }, INTERVAL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };

    void tick();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isbn, qc]);

  // Tell others promptly when editing starts or stops.
  useEffect(() => {
    if (cellRef.current === editingCell) return; // nothing new to announce (e.g. first render)
    cellRef.current = editingCell;
    const t = setTimeout(() => {
      if (busy.current) return;
      void api(`/api/titles/${encodeURIComponent(isbn)}/live`, {
        method: "POST",
        json: { cursor: null, cell: editingCell },
      }).catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [editingCell, isbn]);

  return { viewers, remoteCells };
}
