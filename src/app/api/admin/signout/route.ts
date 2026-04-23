// POST /api/admin/signout — clears the admin session cookie.

import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/core/auth/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
