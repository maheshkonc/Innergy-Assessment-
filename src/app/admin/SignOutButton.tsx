"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/admin/signout", { method: "POST" });
      router.push("/admin/signin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="mt-2 inline-flex items-center rounded px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
