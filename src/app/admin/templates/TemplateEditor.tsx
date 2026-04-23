"use client";

import { useState } from "react";

export interface TemplateRow {
  id: string;
  key: string;
  tenantId: string | null;
  locale: string;
  body: string;
}

export function TemplateEditor({ row }: { row: TemplateRow }) {
  const [body, setBody] = useState(row.body);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch(`/api/admin/templates/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          // V1 auth stub — NextAuth session replaces this later.
          "X-Admin-Email": window.prompt("Your admin email") ?? "",
        },
        body: JSON.stringify({ body }),
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
    <div>
      {!open ? (
        <div className="flex items-start gap-3">
          <pre className="flex-1 whitespace-pre-wrap font-sans text-slate-700">{body}</pre>
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200"
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
          />
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={save}
              disabled={status === "saving"}
              className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setBody(row.body); setOpen(false); setStatus("idle"); }}
              className="rounded bg-slate-100 px-3 py-1"
            >
              Cancel
            </button>
            {status === "saved" && <span className="text-green-700">Saved ✓</span>}
            {status === "error" && <span className="text-red-700">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
