"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DeleteButton } from "../DeleteButton";

type Row = {
  id: string;
  status: string;
  lastMessageAt: string;
  answeredCount: number;
  user: { firstName: string | null; email: string | null; organisation: string | null };
  result: { overallScore: number; overallBand: string } | null;
};

export function ResultsTable({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportAllHref = "/api/admin/sessions/export";
  const exportSelectedHref = useMemo(() => {
    if (selected.size === 0) return null;
    const ids = Array.from(selected).join(",");
    return `/api/admin/sessions/export?ids=${encodeURIComponent(ids)}`;
  }, [selected]);

  return (
    <>
      <div className="mt-6 flex items-center justify-end gap-2">
        <a
          href={exportSelectedHref ?? "#"}
          aria-disabled={!exportSelectedHref}
          onClick={(e) => {
            if (!exportSelectedHref) e.preventDefault();
          }}
          className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
            exportSelectedHref
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          Export Selected ({selected.size})
        </a>
        <a
          href={exportAllHref}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Export All
        </a>
      </div>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
            </th>
            <th className="px-3 py-2">Participant</th>
            <th className="px-3 py-2">Organisation</th>
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Answers</th>
            <th className="px-3 py-2">Last Message</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b hover:bg-slate-50/50">
              <td className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label={`Select session ${s.id}`}
                  checked={selected.has(s.id)}
                  onChange={() => toggleOne(s.id)}
                />
              </td>
              <td className="px-3 py-3">
                <div className="font-medium text-slate-900">{s.user.firstName ?? "Anonymous"}</div>
                <div className="text-xs text-slate-500">{s.user.email ?? "No email"}</div>
              </td>
              <td className="px-3 py-3 text-slate-600">{s.user.organisation ?? "—"}</td>
              <td className="px-3 py-3">
                {s.result ? (
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900">{s.result.overallScore}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">{s.result.overallBand}</span>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-3 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    s.status === "completed"
                      ? "bg-emerald-100 text-emerald-800"
                      : s.status === "abandoned"
                        ? "bg-slate-100 text-slate-500"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {s.status}
                </span>
              </td>
              <td className="px-3 py-3 text-slate-500">{s.answeredCount} / 25</td>
              <td className="px-3 py-3 text-xs text-slate-500">
                {s.lastMessageAt.slice(0, 16).replace("T", " ")}
              </td>
              <td className="px-3 py-3 text-right flex justify-end gap-3">
                <Link
                  href={`/admin/results/${s.id}`}
                  className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  View Answers
                </Link>
                <DeleteButton
                  endpoint="/api/admin/sessions"
                  id={s.id}
                  confirmMessage="Delete this assessment session and its results? This cannot be undone."
                />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                No assessment sessions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
