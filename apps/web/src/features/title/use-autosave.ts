"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { EstimateDoc } from "@seg/data";
import {
  EMPTY_ESTIMATE,
  estimateId,
  refForLevel,
  type AccountRef,
  type EstimateField,
  type EstimateRecord,
  type Level,
  type TitleTotals,
} from "@seg/domain";
import { api } from "@/lib/api";
import { queryKeys, type TitleDetail, type TitleSummaryRow } from "@/lib/queries";

export interface CellEdit {
  id: string;
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  value: number | string | null;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 600;
const RETRY_MS = 4000;
const cellKey = (e: { id: string; field: string }) => `${e.id}|${e.field}`;

/**
 * Autosave for one title's estimates.
 * - Edits apply locally at once (the grid recomputes totals immediately).
 * - Edits are batched and sent after a short pause; only changed cells are sent.
 * - On failure the edits stay local and are retried; nothing typed is lost.
 *
 * `pending` / `inflight` refs drive the save loop; `unsaved` state mirrors them for rendering.
 */
export function useAutosave(isbn: string, canEdit: boolean) {
  const qc = useQueryClient();
  const pending = useRef(new Map<string, CellEdit>());
  const inflight = useRef(new Map<string, CellEdit>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const [unsaved, setUnsaved] = useState<Map<string, CellEdit>>(new Map());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());

  const publish = () => setUnsaved(new Map([...inflight.current, ...pending.current]));
  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), ms);
  };

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current.size || !pending.current.size) return;
    const batch = new Map(pending.current);
    pending.current.clear();
    batch.forEach((e, k) => inflight.current.set(k, e));
    setStatus("saving");
    try {
      const res = await api<{ estimates: EstimateDoc[]; totals: TitleTotals }>(
        `/api/titles/${encodeURIComponent(isbn)}/estimates`,
        {
          method: "PATCH",
          json: { changes: [...batch.values()].map(({ level, ref, field, value }) => ({ level, ref, field, value })) },
          keepalive: true,
        },
      );
      // The server copy now holds these values.
      qc.setQueryData<TitleDetail>(queryKeys.title(isbn), (old) => {
        if (!old) return old;
        const byId = new Map(old.estimates.map((e) => [e._id, e]));
        for (const e of res.estimates) byId.set(e._id, e);
        return { ...old, estimates: [...byId.values()], title: { ...old.title, totals: res.totals } };
      });
      qc.setQueryData<{ titles: TitleSummaryRow[]; generatedAt: string }>(queryKeys.summary, (old) =>
        old
          ? { ...old, titles: old.titles.map((t) => (t.isbn === isbn ? { ...t, totals: res.totals, updatedAt: new Date().toISOString() } : t)) }
          : old,
      );
      batch.forEach((_, k) => inflight.current.delete(k));
      const saved = new Set(batch.keys());
      setSavedCells(saved);
      setTimeout(() => setSavedCells((r) => (r === saved ? new Set() : r)), 1400);
      setLastSavedAt(Date.now());
      setStatus(pending.current.size ? "pending" : "saved");
      publish();
      if (pending.current.size) schedule(DEBOUNCE_MS);
    } catch (err) {
      // Put the batch back unless the user has typed something newer for the same cell.
      batch.forEach((e, k) => {
        inflight.current.delete(k);
        if (!pending.current.has(k)) pending.current.set(k, e);
      });
      setStatus("error");
      publish();
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(`Couldn't save changes — retrying. ${message}`, { id: "autosave-error" });
      schedule(RETRY_MS);
    }
  }, [isbn, qc]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const edit = useCallback(
    (level: Level, ref: AccountRef, field: EstimateField, value: number | string | null) => {
      if (!canEdit) return;
      const r = refForLevel(level, ref);
      const e: CellEdit = { id: estimateId(isbn, level, r), level, ref: r, field, value };
      pending.current.set(cellKey(e), e);
      setStatus("pending");
      publish();
      schedule(DEBOUNCE_MS);
    },
    [isbn, canEdit],
  );

  // Save before leaving the page; warn if something is still unsent.
  useEffect(() => {
    const pendingMap = pending.current;
    const inflightMap = inflight.current;
    const onUnload = (ev: BeforeUnloadEvent) => {
      if (pendingMap.size || inflightMap.size) {
        void flushRef.current();
        ev.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      if (pendingMap.size) void flushRef.current();
    };
  }, []);

  /** Server estimates with unsaved local edits applied. */
  const applyEdits = useCallback(
    (estimates: EstimateRecord[]): EstimateRecord[] => {
      if (!unsaved.size) return estimates;
      const byId = new Map(estimates.map((e) => [estimateId(e.isbn, e.level, e), { ...e }]));
      for (const ed of unsaved.values()) {
        let rec = byId.get(ed.id);
        if (!rec) {
          rec = { isbn, level: ed.level, ...ed.ref, ...EMPTY_ESTIMATE };
          byId.set(ed.id, rec);
        }
        (rec as unknown as Record<string, unknown>)[ed.field] = ed.value;
      }
      return [...byId.values()];
    },
    [isbn, unsaved],
  );

  const dirtyCells = useMemo(() => new Set(unsaved.keys()), [unsaved]);

  return { edit, flush, applyEdits, status, lastSavedAt, dirtyCells, savedCells };
}
