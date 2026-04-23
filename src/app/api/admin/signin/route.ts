// POST /api/admin/signin  — body: { email, password }
// Validates against AdminUser.passwordHash (bcrypt) and sets the session cookie.

import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/db/client";
import { ADMIN_COOKIE_NAME, buildAdminCookie } from "@/core/auth/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.passwordHash) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const ok = await bcrypt.compare(parsed.data.password, admin.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const cookie = buildAdminCookie(email);
  const res = NextResponse.json({ ok: true, email });
  res.cookies.set(ADMIN_COOKIE_NAME, cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: cookie.maxAgeSec,
  });
  return res;
}
