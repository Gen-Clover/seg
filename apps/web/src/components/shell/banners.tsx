"use client";

import { CheckCircle2, Info, Megaphone, TriangleAlert, Wrench, X } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { useLocalPref } from "@/lib/use-local-pref";
import { useAppSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const TONES = {
  info: { box: "border-info/25 bg-info-soft", icon: Info, iconClass: "text-info" },
  warn: { box: "border-warn/30 bg-warn-soft", icon: TriangleAlert, iconClass: "text-warn" },
  success: { box: "border-ok/25 bg-ok-soft", icon: CheckCircle2, iconClass: "text-ok" },
} as const;

/** Maintenance notice and admin announcements, above every page. Announcements can be dismissed. */
export function Banners({ isAdmin }: { isAdmin: boolean }) {
  const settings = useAppSettings();
  const hydrated = useHydrated();
  const [dismissedRaw, setDismissed] = useLocalPref("seg-dismissed-announcements", "[]");
  let dismissed: string[] = [];
  try {
    dismissed = JSON.parse(dismissedRaw) as string[];
  } catch {
    dismissed = [];
  }
  const announcements = hydrated ? settings.announcements.filter((a) => !dismissed.includes(a.id)) : [];
  if (!settings.maintenance.on && !announcements.length) return null;

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-line bg-canvas px-5 py-2 lg:px-6">
      {settings.maintenance.on ? (
        <div role="status" data-testid="maintenance-banner" className="flex items-center gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]">
          <Wrench className="size-4 shrink-0 text-warn" />
          <span className="flex-1">
            <span className="font-semibold">Maintenance mode.</span> {settings.maintenance.message}
            {isAdmin ? <span className="text-muted"> (Admins can still make changes.)</span> : null}
          </span>
        </div>
      ) : null}
      {announcements.map((a) => {
        const tone = TONES[a.tone];
        const Icon = a.tone === "info" ? Megaphone : tone.icon;
        return (
          <div key={a.id} role="status" data-testid="announcement" className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]", tone.box)}>
            <Icon className={cn("size-4 shrink-0", tone.iconClass)} />
            <span className="flex-1 whitespace-pre-line">{a.text}</span>
            <button
              type="button"
              onClick={() => setDismissed(JSON.stringify([...dismissed, a.id].slice(-50)))}
              className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Dismiss announcement"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
