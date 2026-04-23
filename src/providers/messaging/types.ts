// MessagingProvider — abstracts WhatsApp (Cloud API / Twilio / Gupshup).
// The state machine calls only these methods; swap provider without touching
// core logic (PRD §10).

export interface OutboundTextMessage {
  toPhone: string; // E.164
  body: string;
}

export interface OutboundImageMessage {
  toPhone: string;
  // Either a public URL to fetch, or an already-uploaded media ID.
  imageUrl?: string;
  mediaId?: string;
  caption?: string;
}

export interface OutboundVoiceMessage {
  toPhone: string;
  // Pre-uploaded audio media id, or a URL we've staged for the provider.
  audioUrl?: string;
  mediaId?: string;
}

export interface InboundMessage {
  // Provider-specific message id (used for dedupe + reply threading).
  providerMessageId: string;
  // E.164 of the end user.
  fromPhone: string;
  // Which of our numbers it landed on (used for dedicated-mode tenant routing).
  toPhone: string;
  timestamp: Date;
  kind: "text" | "voice" | "interactive";
  // For text messages: the body. For interactive list/button replies: the selected id.
  text?: string;
  // For voice: a URL or media id we can fetch from the provider.
  voiceMediaId?: string;
  // For ctwa deep links: the captured context (e.g. click-to-WhatsApp ad payload).
  referralPayload?: string;
}

export interface MessagingProvider {
  sendText(msg: OutboundTextMessage): Promise<{ providerMessageId: string }>;
  sendImage(msg: OutboundImageMessage): Promise<{ providerMessageId: string }>;
  sendVoice(msg: OutboundVoiceMessage): Promise<{ providerMessageId: string }>;

  // Upload bytes to the provider, returning a media id suitable for
  // sendVoice / sendImage.
  uploadMedia(bytes: Buffer, mime: string): Promise<string>;

  // Fetch the binary for an inbound voice note so we can hand it to STT.
  downloadMedia(mediaId: string): Promise<Buffer>;
}
