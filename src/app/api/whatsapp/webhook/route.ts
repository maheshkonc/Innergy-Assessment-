// WhatsApp Cloud API (Meta) webhook.
// GET  — webhook verification (Meta challenge).
// POST — inbound messages + statuses. Ack within 5s (§9.4); processing is
// handed to the shared processInboundMessage helper.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/client";
import { processInboundMessage } from "@/core/messaging/process-inbound";
import { WhatsAppCloudProvider } from "@/providers/messaging/whatsapp";
import type { InboundMessage } from "@/providers/messaging/types";
import { log } from "@/core/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as MetaWebhookPayload;
  try {
    await processPayload(payload);
  } catch (err) {
    log.error({ err }, "whatsapp webhook processing failed");
  }
  return NextResponse.json({ ok: true });
}

async function processPayload(payload: MetaWebhookPayload) {
  const provider = new WhatsAppCloudProvider();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      for (const m of value.messages) {
        const inbound: InboundMessage = {
          providerMessageId: m.id,
          fromPhone: m.from,
          toPhone: value.metadata?.display_phone_number ?? "",
          timestamp: new Date(Number(m.timestamp) * 1000),
          kind: m.type === "audio" ? "voice" : "text",
          text: m.text?.body,
          voiceMediaId: m.audio?.id,
          referralPayload: m.referral?.source_id ?? m.referral?.ctwa_clid,
        };
        await processInboundMessage(prisma, provider, inbound);
      }
    }
  }
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { display_phone_number?: string };
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: "text" | "audio" | "interactive" | "image" | "sticker" | "document";
          text?: { body: string };
          audio?: { id: string };
          referral?: { source_id?: string; ctwa_clid?: string };
        }>;
      };
    }>;
  }>;
}
