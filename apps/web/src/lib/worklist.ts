"use client";

import { useSyncExternalStore } from "react";

/**
 * The ordered list of titles the user is working through (the filtered, sorted summary list).
 * Drives previous / next navigation on the title page. Kept per browser tab.
 */
export interface Worklist {
  isbns: string[];
  label: string;
  /** Summary URL to return to (keeps filters). */
  href: string;
}

const KEY = "seg-worklist";
let current: Worklist | null = null;
const listeners = new Set<() => void>();

function read(): Worklist | null {
  if (current) return current;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    current = raw ? (JSON.parse(raw) as Worklist) : null;
  } catch {
    current = null;
  }
  return current;
}

export function setWorklist(list: Worklist) {
  const prev = read();
  if (prev && prev.href === list.href && prev.isbns.length === list.isbns.length && prev.isbns.every((v, i) => v === list.isbns[i])) return;
  current = list;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked — navigation still works for this page view.
  }
  listeners.forEach((l) => l());
}

export function useWorklist(): Worklist | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );
}
