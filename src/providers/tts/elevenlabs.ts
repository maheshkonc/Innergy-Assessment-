// ElevenLabs TTS provider. Synthesises to MP3 and returns the raw bytes.
// Env: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID.

import type { TTSProvider } from "./types";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsProvider implements TTSProvider {
  readonly name = "elevenlabs";
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly model: string;

  constructor(
    apiKey = process.env.ELEVENLABS_API_KEY,
    voiceId = process.env.ELEVENLABS_VOICE_ID,
    model = "eleven_turbo_v2_5",
  ) {
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");
    if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID missing");
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.model = model;
  }

  async synthesise(text: string): Promise<{ audio: Buffer; mime: string; latencyMs: number }> {
    const start = Date.now();
    const res = await fetch(`${ELEVEN_BASE}/text-to-speech/${this.voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: this.model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`elevenlabs synthesise failed ${res.status}: ${txt}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return { audio, mime: "audio/mpeg", latencyMs: Date.now() - start };
  }
}
