// Template resolver — implements the tenant-override → global-default
// precedence rule from PRD §6.2. Wraps the raw Prisma lookup so call sites
// don't need to know about the NULL-tenant convention.

import type { PrismaClient } from "@prisma/client";

export interface ResolveArgs {
  key: string;
  tenantId: string;
  locale?: string;
}

export async function resolveMessageTemplate(
  prisma: PrismaClient,
  { key, tenantId, locale = "en" }: ResolveArgs,
): Promise<{ body: string; source: "tenant" | "global" } | null> {
  const tenantSpecific = await prisma.messageTemplate.findUnique({
    where: { key_tenantId_locale: { key, tenantId, locale } },
  });
  if (tenantSpecific) return { body: tenantSpecific.body, source: "tenant" };

  const global = await prisma.messageTemplate.findFirst({
    where: { key, tenantId: null, locale },
  });
  if (global) return { body: global.body, source: "global" };

  return null;
}
