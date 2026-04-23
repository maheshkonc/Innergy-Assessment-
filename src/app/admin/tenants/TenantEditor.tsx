"use client";

import { useState } from "react";

export interface TenantBasics {
  id: string;
  name: string;
  primaryColor: string | null;
  linkedinUrl: string | null;
  closingMessage: string | null;
}

export function TenantEditor({ tenant }: { tenant: TenantBasics }) {
  const [form, setForm] = useState(tenant);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus("saving");
    setError(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",

      },
      body: JSON.stringify({
        name: form.name,
        primaryColor: form.primaryColor || null,
        linkedinUrl: form.linkedinUrl || null,
        closingMessage: form.closingMessage || null,
      }),
    });
    if (!res.ok) {
      const { error: err } = await res.json().catch(() => ({ error: "save failed" }));
      setError(err);
      setStatus("error");
      return;
    }
    setStatus("saved");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-2">
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Name"
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
      />
      <input
        value={form.primaryColor ?? ""}
        onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
        placeholder="#hex color"
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
      />
      <input
        value={form.linkedinUrl ?? ""}
        onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
        placeholder="LinkedIn URL"
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
      />
      <textarea
        value={form.closingMessage ?? ""}
        onChange={(e) => setForm({ ...form, closingMessage: e.target.value })}
        placeholder="Closing message"
        rows={3}
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
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
          onClick={() => { setForm(tenant); setOpen(false); setStatus("idle"); }}
          className="rounded bg-slate-100 px-3 py-1"
        >
          Cancel
        </button>
        {status === "saved" && <span className="text-green-700">Saved ✓</span>}
        {status === "error" && <span className="text-red-700">{error}</span>}
      </div>
    </div>
  );
}

export function FlagToggle({
  tenantId,
  flag,
  value,
}: {
  tenantId: string;
  flag: string;
  value: string;
}) {
  const [v, setV] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function toggle() {
    const next = v === "true" ? "false" : "true";
    setStatus("saving");
    const res = await fetch("/api/admin/feature-flags", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",

      },
      body: JSON.stringify({ tenantId, key: flag, value: next }),
    });
    if (res.ok) {
      setV(next);
      setStatus("saved");
    } else {
      setStatus("error");
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={status === "saving"}
      className={`rounded px-2 py-0.5 text-xs font-mono ${v === "true" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}
    >
      {flag}={v}
    </button>
  );
}
