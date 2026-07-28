"use client";

// Assessment picker shown at the top of instrument-scoped admin pages.
// Selecting an option navigates with `?instrument=<id>`, so the choice lives in
// the URL and survives reloads, back/forward and bookmarking.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Route } from "next";
import type { InstrumentOption } from "./instrument-scope";

export function InstrumentSelect({
  options,
  selectedId,
  basePath,
  label = "Assessment",
  countNoun = "questions",
  extraParams,
}: {
  options: InstrumentOption[];
  selectedId: string | null;
  /** e.g. "/admin/questions" */
  basePath: string;
  label?: string;
  /** Noun for the per-option count, e.g. "questions" | "templates". */
  countNoun?: string;
  /** Query params to preserve alongside `instrument`. */
  extraParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Nothing to choose between.
  if (options.length < 2) return null;

  const onChange = (id: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    params.set("instrument", id);
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}` as Route);
    });
  };

  return (
    <div className="mt-4 flex items-center gap-3">
      <label
        htmlFor="instrument-select"
        className="text-xs font-semibold uppercase tracking-wider text-slate-500"
      >
        {label}
      </label>
      <select
        id="instrument-select"
        value={selectedId ?? ""}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {/* Parenthesised: instrument names already contain an em dash. */}
            {o.name}
            {o.questionCount ? ` (${o.questionCount} ${countNoun})` : ""}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-slate-400">Loading…</span>}
    </div>
  );
}
