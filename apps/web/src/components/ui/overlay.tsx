"use client";

import { Dialog as D, Popover as P, Tooltip as T } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------------- Tooltip ---------------- */
export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs animate-fade-in rounded-md bg-ink px-2 py-1 text-xs text-surface shadow-[var(--shadow-pop)]"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/* ---------------- Popover ---------------- */
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof P.Content>,
  React.ComponentPropsWithoutRef<typeof P.Content>
>(({ className, align = "start", sideOffset = 6, ...props }, ref) => (
  <P.Portal>
    <P.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 animate-pop-in rounded-xl border border-line bg-surface p-1 text-ink shadow-[var(--shadow-pop)] outline-none",
        className,
      )}
      {...props}
    />
  </P.Portal>
));
PopoverContent.displayName = "PopoverContent";

/* ---------------- Dialog ---------------- */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/35 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[12vh] z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 animate-pop-in rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="text-[15px] font-semibold text-ink">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description> : null}
          </div>
          <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

/* ---------------- Sheet (side panel) ---------------- */
export function SheetContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/25" />
      <D.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(460px,100vw)] animate-slide-in-right flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)] outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="text-[15px] font-semibold text-ink">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description> : null}
          </div>
          <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
