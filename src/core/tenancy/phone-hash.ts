// Salted SHA-256 hash of E.164 phone numbers (PRD §9.1). Raw numbers are
// used only for active session routing and are never persisted past a
// session's lifetime.

import { createHash } from "node:crypto";

export function hashPhone(phone: string, salt = process.env.PHONE_HASH_SALT): string {
  if (!salt) throw new Error("PHONE_HASH_SALT missing");
  const normalised = phone.replace(/[^\d+]/g, "");
  return createHash("sha256").update(`${salt}:${normalised}`).digest("hex");
}
