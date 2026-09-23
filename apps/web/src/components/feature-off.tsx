import { PowerOff } from "lucide-react";
import Link from "next/link";

/** Shown instead of a page whose module an admin has switched off. */
export function FeatureOff({ name }: { name: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-surface-2 text-muted">
          <PowerOff className="size-5" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">{name} is turned off</h1>
        <p className="mt-1 text-[13px] text-muted">An administrator has switched this module off for now. Everything else works as usual.</p>
        <Link href="/" className="mt-4 inline-block text-[13px] font-medium text-brand hover:underline">
          Back to My Desk
        </Link>
      </div>
    </div>
  );
}
