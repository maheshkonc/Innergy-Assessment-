// MSG91 WhatsApp adapter.
// Env: MSG91_AUTH_KEY, MSG91_INTEGRATED_NUMBER.
//
// Scope: V1 testing supports free-form text + URL-linked image within the
// 24h service window. Voice I/O + media upload/download are not yet wired —
// ElevenLabs is disabled for Innergy V1 so sendVoice is not exercised, and
// inbound voice notes degrade to a typed-reply prompt via the caller.

import type {
  MessagingProvider,
  OutboundImageMessage,
  OutboundTextMessage,
  OutboundVoiceMessage,
} from "./types";

const MSG91_BASE = "https://api.msg91.com/api/v5/whatsapp";

export class MSG91Provider implements MessagingProvider {
  constructor(
    private readonly authKey = process.env.MSG91_AUTH_KEY!,
    private readonly integratedNumber = process.env.MSG91_INTEGRATED_NUMBER!,
  ) {}

  async sendText(msg: OutboundTextMessage) {
    const res = await this.post({
      integrated_number: this.integratedNumber,
      recipient_number: msg.toPhone,
      content_type: "text",
      type: "text",
      text: msg.body,
    });
    return { providerMessageId: res.data?.message_uuid ?? "" };
  }

  async sendImage(msg: OutboundImageMessage) {
    if (!msg.imageUrl) {
      throw new Error("MSG91 sendImage requires imageUrl (mediaId upload not implemented)");
    }
    const res = await this.post({
      integrated_number: this.integratedNumber,
      recipient_number: msg.toPhone,
      content_type: "media",
      type: "image",
      media: {
        url: msg.imageUrl,
        ...(msg.caption ? { caption: msg.caption } : {}),
      },
    });
    return { providerMessageId: res.data?.message_uuid ?? "" };
  }

  async sendVoice(_msg: OutboundVoiceMessage): Promise<{ providerMessageId: string }> {
    throw new Error("MSG91 sendVoice not yet implemented");
  }

  async uploadMedia(_bytes: Buffer, _mime: string): Promise<string> {
    throw new Error("MSG91 uploadMedia not yet implemented");
  }

  async downloadMedia(_mediaId: string): Promise<Buffer> {
    throw new Error("MSG91 downloadMedia not yet implemented");
  }

  private async post(body: unknown): Promise<MSG91Response> {
    const res = await fetch(`${MSG91_BASE}/whatsapp-outbound-message/`, {
      method: "POST",
      headers: {
        authkey: this.authKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: MSG91Response;
    try {
      parsed = JSON.parse(text) as MSG91Response;
    } catch {
      throw new Error(`MSG91 send: non-JSON response ${res.status}: ${text}`);
    }
    if (!res.ok || parsed.hasError) {
      throw new Error(`MSG91 send failed ${res.status}: ${text}`);
    }
    return parsed;
  }
}

interface MSG91Response {
  status?: string;
  hasError?: boolean;
  data?: { message_uuid?: string; message?: string } | null;
  errors?: string | null;
}
