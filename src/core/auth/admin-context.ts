// Admin actor resolution for API routes.
//
// V1 (pre-NextAuth): read an `X-Admin-Email` header and look up the
// corresponding AdminUser row. Returns null when unauthenticated; callers
// should 401. When NextAuth lands this is the only place that needs to
// change.

import type { AdminUser, PrismaClient } from "@prisma/client";

export async function resolveAdminActor(
  prisma: PrismaClient,
  headers: Headers,
): Promise<AdminUser | null> {
  const email = headers.get("x-admin-email")?.trim().toLowerCase();
  if (!email) return null;
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  return admin;
}

export function canEditGlobalTemplates(admin: AdminUser): boolean {
  return admin.role === "super_admin";
}

export function canEditTenantTemplates(admin: AdminUser, tenantId: string | null): boolean {
  if (admin.role === "super_admin") return true;
  if (admin.role === "tenant_admin" && admin.tenantId && admin.tenantId === tenantId) return true;
  return false;
}
