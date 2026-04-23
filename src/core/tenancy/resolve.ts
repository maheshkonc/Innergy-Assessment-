// Tenant resolution (FR-1.4). Two modes:
//   dedicated — tenant owns a WhatsApp number; resolve by inbound `toPhone`.
//   shared    — one number; resolve by the deep-link trigger payload
//               (e.g. "START_innergy") either in the first message body or
//               via the referral_payload on ctwa-ad flows.

import type { PrismaClient, Tenant } from "@prisma/client";

export interface ResolveInput {
  toPhone: string;           // inbound number
  messageText?: string;
  referralPayload?: string;
  // If we already have a session for this user, we trust its tenant.
  knownTenantId?: string | null;
}

export async function resolveTenant(
  prisma: PrismaClient,
  input: ResolveInput,
): Promise<Tenant | null> {
  if (input.knownTenantId) {
    return prisma.tenant.findUnique({ where: { id: input.knownTenantId } });
  }

  // Dedicated-number mode: match the inbound number.
  const byNumber = await prisma.tenant.findUnique({
    where: { whatsappNumber: input.toPhone },
  });
  if (byNumber && byNumber.whatsappMode === "dedicated") return byNumber;

  // Shared-number mode: find a trigger payload inside the message or referral.
  const candidates = [input.referralPayload, input.messageText]
    .filter((s): s is string => !!s)
    .map((s) => s.trim());

  for (const text of candidates) {
    const payload = extractPayload(text);
    if (!payload) continue;
    const byPayload = await prisma.tenant.findUnique({
      where: { triggerPayload: payload },
    });
    if (byPayload) return byPayload;
  }

  // Fallback: if the number is dedicated but `whatsappMode=shared` was set on
  // the tenant (misconfigured), we still return the number match.
  return byNumber;
}

const PAYLOAD_RE = /\b(START_[a-z0-9_]+)\b/i;

function extractPayload(text: string): string | null {
  const m = text.match(PAYLOAD_RE);
  return m?.[1] ? m[1].toUpperCase() : null;
}
