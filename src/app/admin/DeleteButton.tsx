"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeleteButtonProps {
  endpoint: string;
  id: string;
  label?: string;
  confirmMessage?: string;
}

export function DeleteButton({
  endpoint,
  id,
  label = "Delete",
  confirmMessage = "Are you sure you want to delete this? This action cannot be undone.",
}: DeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to delete");
      }

      router.refresh();
    } catch (err) {
      console.error("Delete error:", err);
      alert(err instanceof Error ? err.message : "An error occurred during deletion");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50"
    >
      {isDeleting ? "Deleting..." : label}
    </button>
  );
}
