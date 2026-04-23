// Edge middleware — gates /admin/* behind a signed session cookie.
// The cookie verifier runs in the edge runtime, so everything it touches
// must be Web-crypto based (no Node `crypto` import).

import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

const COOKIE_NAME = "innergy_admin";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let the sign-in page + its asset calls through.
  if (pathname === "/admin/signin") return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const email = await verify(cookie);
  if (!email) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/signin";
    url.searchParams.set("next", pathname + (req.nextUrl.search ?? ""));
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Edge-safe HMAC-SHA256 verification — mirrors src/core/auth/admin-session.ts
// but uses Web Crypto so it can run on the edge.
async function verify(raw: string | undefined): Promise<string | null> {
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length !== 3) return null;
  const [email, expStr, sig] = parts as [string, string, string];
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 8) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${email}|${expStr}`),
  );
  const expected = toHex(new Uint8Array(mac));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0 ? email : null;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}
