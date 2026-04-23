// HMAC-signed cookie for the admin session.
// Format: `<email>.<expMs>.<sig>` where sig = HMAC-SHA256(email.expMs, secret).
// Signing + verification are constant-time. No DB round-trip needed to check
// a cookie's authenticity; DB is only consulted when looking up the actor.

import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "innergy_admin";
// 7-day session. Long enough that admins aren't logging in every minute,
// short enough that a leaked cookie stops working on its own.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 8) {
    throw new Error("NEXTAUTH_SECRET must be set (>=8 chars) for admin cookies");
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

// Use `|` as the separator so it doesn't collide with `.` in emails or
// with cookie URL-encoding of `@`.
export function buildAdminCookie(email: string): { value: string; maxAgeSec: number } {
  const exp = Date.now() + TTL_MS;
  const normalised = email.trim().toLowerCase();
  const payload = `${normalised}|${exp}`;
  return { value: `${payload}|${sign(payload)}`, maxAgeSec: Math.floor(TTL_MS / 1000) };
}

export function verifyAdminCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length !== 3) return null;
  const [email, expStr, sig] = parts as [string, string, string];
  const payload = `${email}|${expStr}`;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return email;
}
