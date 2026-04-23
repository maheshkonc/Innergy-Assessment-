// Meta WhatsApp Cloud API adapter (PRD §10).
// Env: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN.
// Keep this thin — only provider wire-format concerns live here.

import type {
  MessagingProvider,
  OutboundImageMessage,
  OutboundTextMessage,
  OutboundVoiceMessage,
} from "./types";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

function extFromMime(mime: string): string {
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "bin";
}

export class WhatsAppCloudProvider implements MessagingProvider {
  constructor(
    private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!,
    private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN!,
  ) {}

  async sendText(msg: OutboundTextMessage) {
    const res = await this.post({
      messaging_product: "whatsapp",
      to: msg.toPhone,
      type: "text",
      text: { preview_url: false, body: msg.body },
    });
    const id = res.messages[0]?.id;
    if (!id) throw new Error("WhatsApp send: no message id returned");
    return { providerMessageId: id };
  }

  async sendImage(msg: OutboundImageMessage) {
    const image: Record<string, string> = {};
    if (msg.mediaId) image.id = msg.mediaId;
    if (msg.imageUrl) image.link = msg.imageUrl;
    if (msg.caption) image.caption = msg.caption;
    const res = await this.post({
      messaging_product: "whatsapp",
      to: msg.toPhone,
      type: "image",
      image,
    });
    const id = res.messages[0]?.id;
    if (!id) throw new Error("WhatsApp send: no message id returned");
    return { providerMessageId: id };
  }

  async sendVoice(msg: OutboundVoiceMessage) {
    const audio: Record<string, string> = {};
    if (msg.mediaId) audio.id = msg.mediaId;
    if (msg.audioUrl) audio.link = msg.audioUrl;
    const res = await this.post({
      messaging_product: "whatsapp",
      to: msg.toPhone,
      type: "audio",
      audio,
    });
    const id = res.messages[0]?.id;
    if (!id) throw new Error("WhatsApp send: no message id returned");
    return { providerMessageId: id };
  }

  async uploadMedia(bytes: Buffer, mime: string): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: mime }),
      `upload.${extFromMime(mime)}`,
    );
    const res = await fetch(`${GRAPH_BASE}/${this.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WhatsApp media upload failed ${res.status}: ${text}`);
    }
    const { id } = (await res.json()) as { id: string };
    if (!id) throw new Error("WhatsApp media upload: no id returned");
    return id;
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!metaRes.ok) throw new Error(`media metadata fetch failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { url: string };

    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!binRes.ok) throw new Error(`media binary fetch failed: ${binRes.status}`);
    return Buffer.from(await binRes.arrayBuffer());
  }

  private async post(body: unknown): Promise<{ messages: Array<{ id: string }> }> {
    const url = `${GRAPH_BASE}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WhatsApp send failed ${res.status}: ${text}`);
    }
    return res.json() as Promise<{ messages: Array<{ id: string }> }>;
  }
}
