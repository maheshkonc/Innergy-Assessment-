// Browser session identity for the web assessment UI.
//
// The FSM and data model are shared with WhatsApp; that means every
// `User` row needs a `whatsappPhoneHash`. For web users we fabricate a
// stable anonymous id, salt-hash it the same way phones are hashed, and
// store it in that column. Cookie name `innergy_web_id` — HTTP-only,
// SameSite=lax. Rotation: the cookie is idempotent; losing it spawns a
// new anonymous user on the next visit (expected for anonymous V1).

import { createHash, randomUUID } from "node:crypto";

const COOKIE_NAME = "innergy_web_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface WebIdentity {
  webId: string;          // raw random uuid (only the server sees this)
  userHash: string;       // salted sha-256 that goes into User.whatsappPhoneHash
  setCookie?: string;     // when present, the caller should attach this Set-Cookie header
}

export function readOrMintWebId(req: Request): WebIdentity {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const existing = parseCookie(cookieHeader, COOKIE_NAME);
  if (existing) {
    return { webId: existing, userHash: hashWebId(existing) };
  }
  const fresh = randomUUID();
  return {
    webId: fresh,
    userHash: hashWebId(fresh),
    setCookie: `${COOKIE_NAME}=${fresh}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`,
  };
}

export function hashWebId(webId: string): string {
  const salt = process.env.PHONE_HASH_SALT ?? "rotate-me-and-keep-secret";
  return "web:" + createHash("sha256").update(salt + ":" + webId).digest("hex");
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}
