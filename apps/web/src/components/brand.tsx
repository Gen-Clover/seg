import { cn } from "@/lib/utils";

/** Abrams "A" mark (the same image as abramsbooks.com's tab icon). */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static asset; next/image adds nothing here
    <img src="/brand/abrams-a.png" alt="Abrams" width={32} height={32} className={cn("size-8 shrink-0 rounded-full", className)} />
  );
}

/** SEG = Seasonal Estimate Grid. */
export function BrandName({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("leading-tight", className)}>
      <div className={cn("font-display text-[15px] font-bold tracking-[0.12em]", inverted ? "text-white" : "text-ink")}>SEG</div>
      <div className={cn("text-[11px]", inverted ? "text-white/65" : "text-muted")}>Seasonal Estimate Grid</div>
    </div>
  );
}
