"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  {
    value: "before_questions",
    label: "Before the questions",
    hint: "Asked right after the welcome, before Q1.",
  },
  {
    value: "after_questions",
    label: "After the questions, before results",
    hint: "Asked once all questions are answered — the results are the reward for finishing. (Recommended)",
  },
  {
    value: "after_results",
    label: "After the results",
    hint: "Asked at the very end, once results and the coaching CTA have been shown.",
  },
];

export function FlowSettings({
  tenantId,
  initialValue,
}: {
  tenantId: string;
  initialValue: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: string) {
    setValue(next);
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, key: "contact_capture_position", value: next }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  const active = OPTIONS.find((o) => o.value === value);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">
        When to ask for name, company &amp; email
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Controls where the contact step appears in the assessment flow.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <select
          value={value}
          onChange={(e) => save(e.target.value)}
          disabled={status === "saving"}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {status === "saving" && <span className="text-xs text-slate-500">saving…</span>}
        {status === "saved" && <span className="text-xs text-green-700">✓ saved</span>}
        {status === "error" && <span className="text-xs text-red-700">⚠ failed</span>}
      </div>
      {active && <p className="mt-2 text-xs text-slate-500">{active.hint}</p>}
    </div>
  );
}
