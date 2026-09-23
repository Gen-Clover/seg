"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useLocalPref } from "@/lib/use-local-pref";
import { Tooltip } from "../ui/overlay";

export function ThemeToggle({ compact }: { compact?: boolean }) {
  // "system" until the user chooses; the inline script in the root layout applies it before paint.
  const [theme, setTheme] = useLocalPref("seg-theme", "system");
  const dark =
    theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const Icon = dark ? Sun : Moon;
  return (
    <Tooltip content={compact ? (dark ? "Light mode" : "Dark mode") : null} side="right">
      <button
        type="button"
        onClick={() => setTheme(dark ? "light" : "dark")}
        className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        suppressHydrationWarning
      >
        <Icon className="size-4 shrink-0" />
        {compact ? null : <span suppressHydrationWarning>{dark ? "Light mode" : "Dark mode"}</span>}
      </button>
    </Tooltip>
  );
}
