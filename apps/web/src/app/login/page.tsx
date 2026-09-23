import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand";
import { env } from "@/server/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Rendered per request: reads server configuration, which is not available at build time.
  await connection();
  const e = env();
  const demoPassword = e.AUTH_PROVIDER === "credentials" ? e.DEMO_PASSWORD ?? null : null;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0f1116] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(800px 420px at 12% 8%, rgba(212,32,42,0.35), transparent 60%), radial-gradient(600px 400px at 90% 90%, rgba(46,107,230,0.18), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <BrandMark />
          <div>
            <div className="text-[15px] font-semibold">SEG</div>
            <div className="text-xs text-white/60">Sales Estimates</div>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight">
            Plan every launch with the numbers in one place.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Initial orders, comparable titles and laydown estimates for every channel, organization and account —
            updated live as your team works.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[
              ["Instant", "search & filters"],
              ["Live", "roll-up totals"],
              ["Autosave", "with full history"],
            ].map(([a, b]) => (
              <div key={a}>
                <dt className="text-[15px] font-semibold">{a}</dt>
                <dd className="text-xs text-white/55">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} ABRAMS</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <div className="text-[15px] font-semibold">SEG · Sales Estimates</div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-[13px] text-muted">Sign in to continue to your workspace.</p>
          <Suspense>
            <LoginForm demoPassword={demoPassword} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
