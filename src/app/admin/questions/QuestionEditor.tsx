"use client";

import { useState } from "react";

type SaveTarget = { kind: "question"; id: string } | { kind: "option"; id: string };

export function EditableField({
  initialValue,
  disabled,
  target,
  multiline,
}: {
  initialValue: string;
  disabled: boolean;
  target: SaveTarget;
  multiline?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== initialValue;

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const path =
        target.kind === "question"
          ? `/api/admin/questions/${target.id}`
          : `/api/admin/options/${target.id}`;
      const body =
        target.kind === "question" ? { stem: value } : { text: value };
      const res = await fetch(path, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify(body),
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

  const Input = multiline ? "textarea" : "input";
  return (
    <div className="flex items-start gap-2">
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("idle");
        }}
        rows={multiline ? 3 : undefined}
        className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
      />
      <button
        onClick={save}
        disabled={disabled || !dirty || status === "saving"}
        className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {status === "saving" ? "…" : "Save"}
      </button>
      {status === "saved" && <span className="mt-2 text-xs text-green-700">✓</span>}
      {status === "error" && (
        <span className="mt-2 text-xs text-red-700" title={error ?? ""}>
          ⚠
        </span>
      )}
    </div>
  );
}
