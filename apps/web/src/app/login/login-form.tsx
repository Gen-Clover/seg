"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Spinner } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";

// DEMO ONLY — remove with the switch to Microsoft Entra ID (see docs/PRODUCTION_CUTOVER.md).
const DEMO_USERS = [
  { email: "admin@seg-demo.com", role: "Admin", note: "Full access" },
  { email: "editor@seg-demo.com", role: "Editor", note: "Edit estimates" },
  { email: "viewer@seg-demo.com", role: "Viewer", note: "Read only" },
];

export function LoginForm({ demoPassword }: { demoPassword: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-7 space-y-3.5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-2">Work email</span>
          <Input
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="h-10"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-2">Password</span>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-lg border border-brand-line bg-brand-soft px-3 py-2 text-[13px] text-brand">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>
          {busy ? <Spinner /> : null}
          Sign in
          {!busy ? <ArrowRight /> : null}
        </Button>
      </form>

      {demoPassword ? (
        <div className="mt-8 rounded-xl border border-dashed border-line-strong p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle">Demo accounts</p>
          <div className="grid gap-1.5">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => {
                  setEmail(u.email);
                  setPassword(demoPassword);
                }}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
              >
                <span>
                  <span className="font-medium text-ink">{u.role}</span>
                  <span className="ml-2 text-muted">{u.email}</span>
                </span>
                <span className="text-xs text-subtle">{u.note}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
