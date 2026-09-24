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
import { queryKeys, usePersonName, type TitleDetail, type TitleSummaryRow } from "@/lib/queries";

type CellValue = number | string | null;

export interface CellEdit {
  id: string;
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  value: CellValue;
  /** The saved value this edit was made over (sent so the server can detect conflicting edits). */
  expected: CellValue;
  source?: "grid" | "restore";
}

/** An edit the server refused because someone else changed the cell first. */
export interface CellConflict {
  estimateId: string;
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  yours: CellValue;
  current: CellValue;
  changedBy: string | null;
  changedAt: string | null;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 600;
const RETRY_MS = 4000;
export const cellKey = (e: { id: string; field: string }) => `${e.id}|${e.field}`;
const blank = (field: EstimateField): CellValue => (field === "salesNotes" ? "" : null);

/**
 * Autosave for one title's estimates.
 * - Edits apply locally at once (the grid recomputes totals immediately).
 * - Edits are batched and sent after a short pause; only changed cells are sent.
 * - Each edit carries the saved value it replaced; if someone else changed that cell in the
 *   meantime, the server keeps their value and the cell becomes a conflict for the user to resolve.
 * - On failure the edits stay local and are retried; nothing typed is lost.
 *
 * `pending` / `inflight` refs drive the save loop; `unsaved` state mirrors them for rendering.
 */
export function useAutosave(isbn: string, canEdit: boolean) {
  const qc = useQueryClient();
  const who = usePersonName();
  const pending = useRef(new Map<string, CellEdit>());
  const inflight = useRef(new Map<string, CellEdit>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const [unsaved, setUnsaved] = useState<Map<string, CellEdit>>(new Map());
  const [conflicts, setConflicts] = useState<Map<string, CellConflict>>(new Map());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());

  const publish = () => setUnsaved(new Map([...inflight.current, ...pending.current]));
  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), ms);
  };

  /** The value the server has for a cell, as far as this browser knows. */
  const savedValue = useCallback(
    (id: string, field: EstimateField): CellValue => {
      const doc = qc.getQueryData<TitleDetail>(queryKeys.title(isbn))?.estimates.find((e) => e._id === id);
      return doc ? (doc[field] ?? blank(field)) : blank(field);
    },
    [qc, isbn],
  );

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
      const res = await api<{ estimates: EstimateDoc[]; totals: TitleTotals; conflicts: CellConflict[] }>(
        `/api/titles/${encodeURIComponent(isbn)}/estimates`,
        {
          method: "PATCH",
          json: {
            changes: [...batch.values()].map(({ level, ref, field, value, expected, source }) => ({ level, ref, field, value, expected, source })),
          },
          keepalive: true,
        },
      );
      // The server copy now holds these values (or someone else's, for conflicts).
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
      const conflictKeys = new Set(res.conflicts.map((c) => cellKey({ id: c.estimateId, field: c.field })));
      if (res.conflicts.length) {
        setConflicts((prev) => {
          const next = new Map(prev);
          for (const c of res.conflicts) {
            const k = cellKey({ id: c.estimateId, field: c.field });
            // A newer local edit for the same cell supersedes this conflict.
            if (!pending.current.has(k)) next.set(k, c);
          }
          return next;
        });
        const first = res.conflicts[0]!;
        toast.warning(
          res.conflicts.length === 1
            ? `${who(first.changedBy)} changed this cell before you — your value wasn't saved. Choose which to keep.`
            : `${res.conflicts.length} cells were changed by someone else first — your values weren't saved. Choose which to keep (amber cells).`,
          { id: "autosave-conflict", duration: 8000 },
        );
      }
      const saved = new Set([...batch.keys()].filter((k) => !conflictKeys.has(k)));
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
  }, [isbn, qc, who]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const edit = useCallback(
    (level: Level, ref: AccountRef, field: EstimateField, value: CellValue, source: "grid" | "restore" = "grid") => {
      if (!canEdit) return;
      const r = refForLevel(level, ref);
      const id = estimateId(isbn, level, r);
      const k = cellKey({ id, field });
      // What this edit replaces on the server: an earlier queued edit's base, the value being
      // saved right now, or the saved value (which, after a conflict, is the other person's).
      // (Explicit has() checks: a blank cell's expected value is null, which `??` would skip.)
      const expected = pending.current.has(k)
        ? pending.current.get(k)!.expected
        : inflight.current.has(k)
          ? inflight.current.get(k)!.value
          : savedValue(id, field);
      pending.current.set(k, { id, level, ref: r, field, value, expected, source });
      setConflicts((prev) => {
        if (!prev.has(k)) return prev;
        const next = new Map(prev);
        next.delete(k);
        return next;
      });
      setStatus("pending");
      publish();
      schedule(DEBOUNCE_MS);
    },
    [isbn, canEdit, savedValue],
  );

  /** Resolves a conflict: keep my value (saved over theirs) or accept theirs. */
  const resolve = useCallback(
    (key: string, choice: "mine" | "theirs") => {
      const c = conflicts.get(key);
      if (!c) return;
      if (choice === "mine") edit(c.level, c.ref, c.field, c.yours);
      else
        setConflicts((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
    },
    [conflicts, edit],
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

  return { edit, flush, applyEdits, status, lastSavedAt, dirtyCells, savedCells, conflicts, resolve };
}

