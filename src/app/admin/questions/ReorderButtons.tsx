"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReorderButtons({
  kind,
  id,
  canMoveUp,
  canMoveDown,
}: {
  kind: "section" | "question";
  id: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function move(direction: "up" | "down") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/questions/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, direction }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={`Move ${kind} up`}
        className={btn}
        disabled={busy || !canMoveUp}
        onClick={() => move("up")}
      >
        ↑
      </button>
      <button
        type="button"
        title={`Move ${kind} down`}
        className={btn}
        disabled={busy || !canMoveDown}
        onClick={() => move("down")}
      >
        ↓
      </button>
    </div>
  );
}
