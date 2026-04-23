// Structured logs (PRD §9.5). Every message handler should tag logs with
// tenant_id, session_id, and user_id_hash.

import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "innergy-fls" },
  redact: {
    paths: ["toPhone", "fromPhone", "phone", "*.phone"],
    censor: "[redacted]",
  },
});
