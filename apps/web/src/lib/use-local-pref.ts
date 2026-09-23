"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "seg-pref-change";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A small preference stored in localStorage (sidebar state, theme…).
 * Renders the fallback on the server and updates after hydration without an effect.
 */
export function useLocalPref(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => read(key) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Preference just won't persist.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
