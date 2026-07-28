// Per-instrument copy variants.
//
// The individual and team diagnostics share one state machine but need
// different wording ("how you lead" vs "how your leaders lead"), a different
// question count, and a different answer scale. Rather than branching in the
// FSM, each instrument version declares a `templateVariant` in its metadata;
// lookups then try `<variant>_<key>` before falling back to the shared `<key>`.
//
// Precedence, widest to narrowest:
//   tenant override of variant key → global variant key
//   → tenant override of base key  → global base key
//
// An instrument with no variant (the original individual diagnostic) resolves
// exactly as it did before, so existing content is untouched.

import type { PrismaClient } from "@prisma/client";
import { resolveMessageTemplate } from "./resolve";

export interface InstrumentCopy {
  /** Template key prefix, e.g. "team". Empty string = shared/base copy only. */
  variant: string;
  /** Substituted into welcome/intro copy — read from instrument metadata. */
  questionCount: number;
  durationEstimate: string;
}

const DEFAULT_COPY: InstrumentCopy = {
  variant: "",
  questionCount: 25,
  durationEstimate: "10–12 minutes",
};

/**
 * Reads the copy settings an instrument version declares in its metadata.
 * Falls back to the original individual-diagnostic values so callers that
 * predate this field keep working.
 */
export async function getInstrumentCopy(
  prisma: PrismaClient,
  instrumentVersionId: string,
): Promise<InstrumentCopy> {
  const version = await prisma.instrumentVersion.findUnique({
    where: { id: instrumentVersionId },
    select: { metadata: true },
  });
  const meta = (version?.metadata ?? {}) as Record<string, unknown>;

  return {
    variant: typeof meta.templateVariant === "string" ? meta.templateVariant : DEFAULT_COPY.variant,
    questionCount:
      typeof meta.questionCount === "number" ? meta.questionCount : DEFAULT_COPY.questionCount,
    durationEstimate:
      typeof meta.durationEstimate === "string"
        ? meta.durationEstimate
        : DEFAULT_COPY.durationEstimate,
  };
}

/**
 * Resolves a template, preferring the instrument's variant copy.
 * `variant` empty → identical behaviour to resolveMessageTemplate().
 */
export async function resolveVariantTemplate(
  prisma: PrismaClient,
  args: { key: string; tenantId: string; variant: string; locale?: string },
): Promise<{ body: string; source: "tenant" | "global" } | null> {
  const { key, tenantId, variant, locale } = args;
  if (variant) {
    const variantHit = await resolveMessageTemplate(prisma, {
      key: `${variant}_${key}`,
      tenantId,
      locale,
    });
    if (variantHit) return variantHit;
  }
  return resolveMessageTemplate(prisma, { key, tenantId, locale });
}
