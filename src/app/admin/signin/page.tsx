"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminSignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/admin/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const { error: err } = await res.json().catch(() => ({ error: "sign-in failed" }));
        setError(err ?? "sign-in failed");
        setStatus("error");
        return;
      }
      // typedRoutes is strict; the redirect target is a dynamic string.
      router.push(next as never);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Admin sign in</h1>
          <p className="mt-1 text-sm text-slate-600">
            Innergy admin console
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
          </label>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {status === "submitting" ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
