// Interpretation facade — chooses Template vs LLM per tenant feature flag,
// and falls back to Template on any LLM error (FR-5.2).

import type { PrismaClient, Tenant, User } from "@prisma/client";
import type { ScoreResult } from "../scoring/types";
import type { LLMProvider } from "../../providers/llm/types";
import { interpretTemplate } from "./template-mode";
import { interpretWithLlm, LlmInterpretationError } from "./llm-mode";
import type { InterpretationOutput } from "./template-mode";

export interface InterpretArgs {
  tenant: Tenant;
  user: User;
  score: ScoreResult;
  instrumentName: string;
  llm?: LLMProvider;
}

export interface InterpretResult extends InterpretationOutput {
  mode: "template" | "llm";
  fellBack: boolean;
}

export async function interpret(
  prisma: PrismaClient,
  args: InterpretArgs,
): Promise<InterpretResult> {
  const llmFlag = await prisma.featureFlag.findUnique({
    where: { tenantId_key: { tenantId: args.tenant.id, key: "llm_interpretation" } },
  });
  const llmEnabled = llmFlag?.value === "true";

  if (!llmEnabled || !args.llm) {
    const out = await interpretTemplate(prisma, args);
    return { ...out, mode: "template", fellBack: false };
  }

  try {
    const out = await interpretWithLlm(prisma, args.llm, {
      tenant: args.tenant,
      user: args.user,
      score: args.score,
      instrumentName: args.instrumentName,
    });
    return { ...out, mode: "llm", fellBack: false };
  } catch (err) {
    if (err instanceof LlmInterpretationError || isTransient(err)) {
      // Log fallback for observability (FR-5.2).
      await prisma.event.create({
        data: {
          tenantId: args.tenant.id,
          userId: args.user.id,
          eventType: "llm_interpretation_fallback",
          properties: {
            reason: err instanceof Error ? err.message : String(err),
          },
        },
      });
      const out = await interpretTemplate(prisma, args);
      return { ...out, mode: "template", fellBack: true };
    }
    throw err;
  }
}

function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /timeout|aborted|ECONN|5\d\d/i.test(err.message);
}
