// OpenAI Whisper STT provider. V1 uses the /v1/audio/transcriptions endpoint.
// Env: OPENAI_API_KEY.
//
// Not using the official SDK — one endpoint, multipart body, Node's built-in
// fetch is enough. Keeps the dep graph lean (principle #2: no abstraction
// bloat beyond what's needed).

import type { STTProvider } from "./types";

const OPENAI_BASE = "https://api.openai.com/v1";

export class WhisperProvider implements STTProvider {
  readonly name = "whisper";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = "whisper-1") {
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(audio: Buffer, mime: string): Promise<{ text: string; latencyMs: number }> {
    const start = Date.now();
    const form = new FormData();
    // Filename is required by the OpenAI API for content-type inference.
    const ext = mimeToExt(mime);
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `audio.${ext}`);
    form.append("model", this.model);
    form.append("response_format", "json");

    const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`whisper transcribe failed ${res.status}: ${txt}`);
    }
    const body = (await res.json()) as { text?: string };
    const text = (body.text ?? "").trim();
    return { text, latencyMs: Date.now() - start };
  }
}

function mimeToExt(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("webm")) return "webm";
  return "ogg"; // WhatsApp voice notes default to audio/ogg
}
