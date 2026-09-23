import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandMark, BrandName } from "@/components/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { env } from "@/server/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const FEATURES: [string, string][] = [
  ["My Desk", "what needs you today"],
  ["Live teamwork", "edits, comments and chat"],
  ["Autosave", "with full history"],
];

export default async function LoginPage() {
  // Rendered per request: reads server configuration, which is not available at build time.
  await connection();
  const e = env();
  const demoPassword = e.AUTH_PROVIDER === "credentials" ? e.DEMO_PASSWORD ?? null : null;
  return (
    <main className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle floating />
      </div>

      <section className="relative hidden overflow-hidden bg-[#1c1916] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(760px 420px at 8% 4%, rgba(233,26,35,0.32), transparent 62%), radial-gradient(640px 420px at 96% 96%, rgba(235,230,226,0.10), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-10" />
          <BrandName inverted />
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Abrams · Sales planning</p>
          <h1 className="font-display text-[40px] font-semibold leading-[1.08]">
            <span className="text-[#ff4b53]">S</span>easonal <span className="text-[#ff4b53]">E</span>stimate <span className="text-[#ff4b53]">G</span>rid
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/72">
            Plan every launch with the numbers in one place — initial orders, comparable titles and laydown estimates for every
            channel, organization and account, updated live as your team works.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/12 pt-6">
            {FEATURES.map(([a, b]) => (
              <div key={a}>
                <dt className="font-display text-[15px] font-semibold">{a}</dt>
                <dd className="mt-0.5 text-xs text-white/60">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-xs text-white/45">© {new Date().getFullYear()} Abrams</p>
      </section>

      <section className="flex items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <BrandName />
          </div>
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-[13px] text-muted">Sign in to continue to the Seasonal Estimate Grid.</p>
          <Suspense>
            <LoginForm demoPassword={demoPassword} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
