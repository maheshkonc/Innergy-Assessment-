import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "@/core/auth/admin-session";
import { SignOutButton } from "./SignOutButton";

const NAV: Array<{ href: Route; label: string }> = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/instruments", label: "Instruments" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/scoring", label: "Scoring" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/audit", label: "Audit" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const email = verifyAdminCookie(store.get(ADMIN_COOKIE_NAME)?.value);
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col justify-between border-r border-slate-200 bg-white px-4 py-6">
        <div>
          <div className="text-lg font-semibold">Innergy Admin</div>
          <nav className="mt-6 space-y-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="block rounded px-3 py-2 hover:bg-slate-100"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        {email && (
          <div className="border-t border-slate-200 pt-4 text-xs text-slate-600">
            <div className="truncate" title={email}>{email}</div>
            <SignOutButton />
          </div>
        )}
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
