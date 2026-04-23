"use client";

import { useState } from "react";

export function PublishButton({
  instrumentId,
  versionId,
  isCurrent,
}: {
  instrumentId: string;
  versionId: string;
  isCurrent: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function publish() {
    if (!window.confirm("Publish this version? In-flight sessions keep their pinned version.")) return;
    setStatus("saving");
    const res = await fetch(`/api/admin/instruments/${instrumentId}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",

      },
      body: JSON.stringify({ versionId }),
    });
    setStatus(res.ok ? "saved" : "error");
    if (res.ok) window.location.reload();
  }

  if (isCurrent) {
    return <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">current</span>;
  }
  return (
    <button
      onClick={publish}
      disabled={status === "saving"}
      className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white disabled:opacity-50"
    >
      {status === "saving" ? "Publishing…" : "Publish"}
    </button>
  );
}
