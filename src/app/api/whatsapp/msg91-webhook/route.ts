// MSG91 WhatsApp inbound webhook.
// MSG91 POSTs here when someone messages the integrated number.
// Payload shape varies across MSG91 account types; we log the raw body and
// defensively probe several known field layouts before constructing the
// normalised InboundMessage.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/client";
import { processInboundMessage } from "@/core/messaging/process-inbound";
import { MSG91Provider } from "@/providers/messaging/msg91";
import type { InboundMessage } from "@/providers/messaging/types";
import { log } from "@/core/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lets MSG91 health-check the URL from the dashboard.
export async function GET() {
  return NextResponse.json({ ok: true, provider: "msg91" });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const text = await req.text().catch(() => "");
    log.warn({ text }, "msg91 webhook: non-JSON body");
    return NextResponse.json({ ok: true });
  }
  log.info({ body }, "msg91 webhook inbound");

  try {
    const inbound = extractInbound(body);
    if (!inbound) {
      log.warn({ body }, "msg91 webhook: could not extract inbound message");
      return NextResponse.json({ ok: true });
    }
    const provider = new MSG91Provider();
    await processInboundMessage(prisma, provider, inbound);
  } catch (err) {
    log.error({ err }, "msg91 webhook processing failed");
  }
  return NextResponse.json({ ok: true });
}

// MSG91's inbound JSON shape (observed on Hello Wallet accounts): a flat
// camelCase object with customerNumber / integratedNumber / contentType /
// text / uuid / ts. `messages` holds the raw Meta-style array serialised as
// a JSON string. We accept both the flat shape and a couple of alternate
// layouts defensively.
function extractInbound(raw: unknown): InboundMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;

  const layer = firstObject(
    root.data,
    root.payload,
    Array.isArray(root.payload) ? root.payload[0] : undefined,
    root.message,
    root,
  );
  if (!layer) return null;

  const fromPhone = firstString(
    layer.customerNumber,
    layer.customer_number,
    layer.from,
    layer.mobile,
    layer.sender,
    layer.sender_mobile,
    layer.wa_id,
    root.customerNumber,
    root.mobile,
    root.sender,
  );
  const toPhone =
    firstString(
      root.integratedNumber,
      root.integrated_number,
      layer.integratedNumber,
      layer.integrated_number,
      layer.to,
      layer.recipient_number,
    ) ?? "";

  const typeRaw =
    firstString(layer.contentType, layer.messageType, layer.type, root.type, "text") ?? "text";
  const type = typeRaw.toLowerCase();

  let text: string | undefined;
  let voiceMediaId: string | undefined;

  if (type === "audio" || type === "voice") {
    const media = firstObject(layer.audio, layer.voice, layer.media);
    voiceMediaId = firstString(
      media?.id,
      media?.media_id,
      media?.url,
      layer.url,
      layer.media_id,
      layer.media_url,
    );
  } else {
    const textObj = firstObject(layer.text);
    text = firstString(
      textObj?.body,
      layer.text as unknown as string,
      layer.message,
      layer.body,
      root.text,
      root.message,
    );
  }

  const providerMessageId =
    firstString(
      layer.uuid,
      layer.message_id,
      layer.id,
      layer.rcs_message_id,
      root.uuid,
      root.message_id,
      root.rcs_message_id,
    ) ?? `msg91-${Date.now()}`;

  const tsRaw = firstString(layer.ts, layer.timestamp, root.ts, root.timestamp);
  const timestamp = tsRaw ? toDate(tsRaw) : new Date();

  if (!fromPhone) return null;

  return {
    providerMessageId,
    fromPhone: normalisePhone(fromPhone),
    toPhone: normalisePhone(toPhone),
    timestamp,
    kind: type === "audio" || type === "voice" ? "voice" : "text",
    text,
    voiceMediaId,
  };
}

function firstObject(
  ...vals: Array<unknown>
): Record<string, unknown> | undefined {
  for (const v of vals) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  return undefined;
}

function firstString(...vals: Array<unknown>): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function toDate(raw: string): Date {
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) {
    // Seconds vs ms heuristic.
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function normalisePhone(raw: string): string {
  return raw.replace(/^\+/, "").replace(/\D/g, "");
}
