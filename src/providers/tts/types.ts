export interface TTSProvider {
  name: string;
  synthesise(text: string): Promise<{ audio: Buffer; mime: string; latencyMs: number }>;
}
