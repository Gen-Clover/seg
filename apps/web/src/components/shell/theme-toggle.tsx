"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useLocalPref } from "@/lib/use-local-pref";
import { cn } from "@/lib/utils";
import { Tooltip } from "../ui/overlay";

type Theme = "light" | "dark" | "system";
const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Applies the chosen theme; "system" follows the computer's setting, including live changes. */
function useTheme(): [Theme, (t: Theme) => void] {
  // The inline script in the root layout applies the saved choice before first paint (no flash).
  const [pref, setPref] = useLocalPref("seg-theme", "system");
  const theme = (["light", "dark", "system"].includes(pref) ? pref : "system") as Theme;
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return [theme, (t) => (t === "system" ? setPref("system") : setPref(t))];
}

/**
 * Light / Dark / System switch. `compact` (collapsed sidebar) shows one button that cycles.
 * `floating` is the rounded version used on the sign-in page.
 */
export function ThemeToggle({ compact, floating }: { compact?: boolean; floating?: boolean }) {
  const [theme, setTheme] = useTheme();

  if (compact) {
    const current = OPTIONS.find((o) => o.value === theme)!;
    const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length]!;
    return (
      <Tooltip content={`Theme: ${current.label} (click for ${next.label})`} side="right">
        <button
          type="button"
          onClick={() => setTheme(next.value)}
          className="flex h-8 w-full items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
          aria-label={`Theme: ${current.label}`}
        >
          <current.icon className="size-4" />
        </button>
      </Tooltip>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-line bg-surface-2/70 p-0.5",
        floating && "rounded-full bg-surface/90 shadow-[var(--shadow-card)] backdrop-blur",
      )}
    >
      {OPTIONS.map((o) => (
        <Tooltip key={o.value} content={o.value === "system" ? "Follow my computer's setting" : `${o.label} mode`}>
          <button
            type="button"
            role="radio"
            aria-checked={theme === o.value}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              floating && "rounded-full",
              theme === o.value ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            <o.icon className="size-3.5" />
            {floating ? null : o.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
