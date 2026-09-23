import { cn } from "@/lib/utils";

/** Product mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm", className)}>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M21 19H3" />
      </svg>
    </div>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <div className={cn("leading-tight", className)}>
      <div className="text-[14px] font-semibold tracking-tight text-ink">SEG</div>
      <div className="text-[11px] text-muted">Sales Estimates</div>
    </div>
  );
}
