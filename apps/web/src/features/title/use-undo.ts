"use client";

import { useCallback, useRef, useState } from "react";
import type { AccountRef, EstimateField, Level } from "@seg/domain";

type CellValue = number | string | null;

export interface UndoCell {
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  before: CellValue;
  after: CellValue;
}

const LIMIT = 200;

/**
 * Undo / redo for grid edits on one title.
 * Edits made in the same moment (e.g. one paste of many cells) form a single step.
 * Undoing re-applies the earlier values as ordinary edits, so they autosave, appear in history
 * and are checked for conflicts like any other change.
 */
export function useUndo(apply: (cell: UndoCell, value: CellValue) => void) {
  const undoStack = useRef<UndoCell[][]>([]);
  const redoStack = useRef<UndoCell[][]>([]);
  const open = useRef<UndoCell[] | null>(null);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const bump = () => setCounts({ undo: undoStack.current.length, redo: redoStack.current.length });

  const record = useCallback((cell: UndoCell) => {
    if (cell.before === cell.after) return;
    if (!open.current) {
      open.current = [];
      undoStack.current.push(open.current);
      if (undoStack.current.length > LIMIT) undoStack.current.shift();
      redoStack.current = [];
      // Everything recorded in this tick belongs to the same step.
      setTimeout(() => {
        open.current = null;
        bump();
      }, 0);
    }
    open.current.push(cell);
  }, []);

  const undo = useCallback(() => {
    const step = undoStack.current.pop();
    if (!step) return 0;
    for (const cell of [...step].reverse()) apply(cell, cell.before);
    redoStack.current.push(step);
    bump();
    return step.length;
  }, [apply]);

  const redo = useCallback(() => {
    const step = redoStack.current.pop();
    if (!step) return 0;
    for (const cell of step) apply(cell, cell.after);
    undoStack.current.push(step);
    bump();
    return step.length;
  }, [apply]);

  return {
    record,
    undo,
    redo,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  };
}
