export interface STTProvider {
  name: string;
  transcribe(audio: Buffer, mime: string): Promise<{ text: string; latencyMs: number }>;
}
