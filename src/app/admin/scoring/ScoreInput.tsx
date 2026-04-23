"use client";

import { useState } from "react";

export function ScoreInput({
  optionId,
  initialScore,
  disabled,
}: {
  optionId: string;
  initialScore: number;
  disabled: boolean;
}) {
  const [score, setScore] = useState(initialScore);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = score !== initialScore;

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch(`/api/admin/options/${optionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Email": window.prompt("Your admin email") ?? "",
        },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        const { error: err } = await res.json().catch(() => ({ error: "save failed" }));
        setError(err);
        setStatus("error");
        return;
      }
      setStatus("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        value={score}
        disabled={disabled}
        onChange={(e) => {
          setScore(Number(e.target.value));
          setStatus("idle");
        }}
        className="w-16 rounded border border-slate-300 px-2 py-1 text-sm font-mono disabled:bg-slate-100"
      />
      <button
        onClick={save}
        disabled={disabled || !dirty || status === "saving"}
        className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
      >
        {status === "saving" ? "…" : "Save"}
      </button>
      {status === "saved" && <span className="text-xs text-green-700">✓</span>}
      {status === "error" && <span className="text-xs text-red-700" title={error ?? ""}>⚠</span>}
    </div>
  );
}
