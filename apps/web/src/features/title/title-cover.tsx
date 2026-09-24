"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";
import { useAppSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Cover address for an ISBN from the admin-set template ("{isbn}" is replaced), or null when covers are off. */
export function coverUrl(template: string, isbn: string): string | null {
  const t = template.trim();
  return t && t.includes("{isbn}") ? t.replaceAll("{isbn}", encodeURIComponent(isbn)) : null;
}

/**
 * The title's cover image. Falls back to a "No cover available" panel when there is no
 * address, the image fails to load, or the server answers with an empty placeholder image.
 */
export function TitleCover({ isbn, title, className }: { isbn: string; title: string; className?: string }) {
  const { covers } = useAppSettings();
  const src = covers.enabled ? coverUrl(covers.urlTemplate, isbn) : null;
  const [state, setState] = useState<{ src: string | null; status: "loading" | "ok" | "broken" }>({ src, status: "loading" });
  // A different title (or template) starts loading again.
  if (state.src !== src) setState({ src, status: "loading" });
  const status = src ? state.status : "broken";

  return (
    <div
      className={cn("relative flex h-[188px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2", className)}
      data-testid="title-cover"
      data-status={status}
    >
      {src && status !== "broken" ? (
        <a href={src} target="_blank" rel="noopener noreferrer" title="Open the cover in a new tab" className={cn("block size-full", status === "loading" && "invisible")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- external cover host; next/image would proxy it through the server */}
          <img
            key={src}
            src={src}
            alt={`Cover of ${title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-contain"
            onLoad={(e) => {
              // Some hosts answer a missing cover with a 1×1 or empty image instead of an error.
              const img = e.currentTarget;
              setState({ src, status: img.naturalWidth > 10 && img.naturalHeight > 10 ? "ok" : "broken" });
            }}
            onError={() => setState({ src, status: "broken" })}
          />
        </a>
      ) : null}
      {status === "loading" ? <div className="absolute inset-0 animate-pulse bg-surface-3/70" aria-hidden /> : null}
      {status === "broken" ? <NoCover title={title} /> : null}
    </div>
  );
}

function NoCover({ title }: { title: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-surface-2 to-surface-3/60 px-3 text-center" role="img" aria-label={`No cover available for ${title}`}>
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
        <BookOpen className="size-5" />
      </span>
      <span className="line-clamp-3 text-[11px] font-medium leading-snug text-ink-2">{title}</span>
      <span className="text-[10.5px] uppercase tracking-wide text-subtle">No cover available</span>
    </div>
  );
}
