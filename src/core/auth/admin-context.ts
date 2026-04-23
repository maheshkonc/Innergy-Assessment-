// Admin actor resolution for API routes.
//
// Auth sources, in order:
//   1. `innergy_admin` cookie (set by /api/admin/signin) — the real path
//   2. `X-Admin-Email` header — legacy dev stub, still accepted
//
// Returns null when unauthenticated; callers should 401.

import type { AdminUser, PrismaClient } from "@prisma/client";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "./admin-session";
import type { NextRequest } from "next/server";

export async function resolveAdminActor(
  prisma: PrismaClient,
  source: Headers | NextRequest,
): Promise<AdminUser | null> {
  const email = readEmail(source);
  if (!email) return null;
  const admin = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  return admin;
}

function readEmail(source: Headers | NextRequest): string | null {
  // NextRequest path: prefer cookie, fall back to header on the same object.
  if (isNextRequest(source)) {
    const raw = source.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const fromCookie = verifyAdminCookie(raw);
    if (fromCookie) return fromCookie;
    return source.headers.get("x-admin-email");
  }
  // Plain Headers path: only the header stub is available.
  return source.get("x-admin-email");
}

function isNextRequest(source: Headers | NextRequest): source is NextRequest {
  return typeof (source as NextRequest).cookies?.get === "function";
}

export function canEditGlobalTemplates(admin: AdminUser): boolean {
  return admin.role === "super_admin";
}

export function canEditTenantTemplates(admin: AdminUser, tenantId: string | null): boolean {
  if (admin.role === "super_admin") return true;
  if (admin.role === "tenant_admin" && admin.tenantId && admin.tenantId === tenantId) return true;
  return false;
}
