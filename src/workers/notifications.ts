// Coach-notification worker (FR-9.1/9.2). Delivers coaching-interest and
// escalation notifications via email or WhatsApp with 3-attempt retry.
//
// Channel routing:
//   - whatsapp: via WhatsAppCloudProvider.sendText to the coach's
//     notificationAddress (E.164).
//   - email: SMTP send (if configured) — when not configured the worker
//     logs the composed message and marks the row sent. This keeps the
//     end-to-end flow testable without live SMTP creds.

import type { Notification } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "../db/client";
import { log } from "../core/logger";
import { WhatsAppCloudProvider } from "../providers/messaging/whatsapp";

const MAX_ATTEMPTS = 3;

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

interface InterpretationJson {
  perDimension?: Array<{ dimensionId: string; dimensionName: string; narrative: string }>;
  overallNarrative?: string;
  lowestDimensionId?: string;
}

interface EnrichedPayload {
  userName: string | null;
  organisation: string | null;
  cognitive: { score: number; band: string } | null;
  relational: { score: number; band: string } | null;
  inner: { score: number; band: string } | null;
  overall: { score: number; band: string } | null;
  generatedAt: string | null;
  interpretation: InterpretationJson | null;
  lowestDimensionName: string | null;
  coach: { name: string; bookingUrl: string | null } | null;
  tenant: { name: string; logoUrl: string | null } | null;
}

async function tick() {
  const pending = await prisma.notification.findMany({
    where: { status: "pending", attempts: { lt: MAX_ATTEMPTS } },
    take: 25,
    orderBy: { createdAt: "asc" },
  });

  const provider = new WhatsAppCloudProvider();

  for (const n of pending) {
    try {
      const enriched = await enrich(n);
      await deliver(provider, n, enriched);
      const mergedPayload = {
        ...(n.payload as object),
        enriched: enriched as unknown as Prisma.JsonObject,
      } as Prisma.InputJsonObject;
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          payload: mergedPayload,
        },
      });
      log.info({ notificationId: n.id, type: n.type, channel: n.channel }, "notification sent");
    } catch (err) {
      const attempts = n.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          attempts,
          status,
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      log.error({ err, notificationId: n.id, attempts }, "notification delivery failed");
    }
    // Respect rate limits (e.g. Resend 2 req/sec)
    await new Promise((r) => setTimeout(r, 600));
  }
}

async function enrich(n: Notification): Promise<EnrichedPayload | null> {
  if (!n.userId || !n.sessionId) return null;
  const [user, result, coachJoin, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: n.userId } }),
    prisma.result.findUnique({ where: { sessionId: n.sessionId } }),
    prisma.tenantCoach.findFirst({
      where: { tenantId: n.tenantId, isPrimary: true },
      include: { coach: true },
    }),
    prisma.tenant.findUnique({
      where: { id: n.tenantId },
      select: { name: true, logoUrl: true },
    }),
  ]);

  const interpretation = (result?.interpretationJson as InterpretationJson | null) ?? null;
  let lowestDimensionName: string | null = null;
  if (result?.lowestDimensionId) {
    const dim = await prisma.dimension.findUnique({
      where: { id: result.lowestDimensionId },
      select: { name: true },
    });
    lowestDimensionName = dim?.name ?? null;
  }

  return {
    userName: user?.firstName ?? null,
    organisation: user?.organisation ?? null,
    cognitive: result && { score: result.cognitiveScore, band: result.cognitiveBand },
    relational: result && { score: result.relationalScore, band: result.relationalBand },
    inner: result && { score: result.innerScore, band: result.innerBand },
    overall: result && { score: result.overallScore, band: result.overallBand },
    generatedAt: result?.generatedAt.toISOString() ?? null,
    interpretation,
    lowestDimensionName,
    coach: coachJoin ? { name: coachJoin.coach.name, bookingUrl: coachJoin.coach.bookingUrl } : null,
    tenant: tenant ? { name: tenant.name, logoUrl: tenant.logoUrl } : null,
  };
}

async function deliver(
  provider: WhatsAppCloudProvider,
  n: Notification,
  enriched: EnrichedPayload | null,
): Promise<void> {
  const address = await resolveRecipient(n);
  if (!address) {
    throw new Error(`no recipient address resolved for notification ${n.id}`);
  }

  if (n.channel === "whatsapp") {
    const body = renderBody(n, enriched);
    await provider.sendText({ toPhone: address, body });
    return;
  }

  // Email channel — Resend is the supported provider in V1. When no
  // RESEND_API_KEY is set we log-only so the end-to-end flow is testable
  // without live credentials.
  const email = renderEmail(n, enriched);
  const resend = getResend();
  if (!resend) {
    log.info(
      { notificationId: n.id, to: address, subject: email.subject },
      "email notification (RESEND_API_KEY not set; logging only)",
    );
    return;
  }

  const from = process.env.EMAIL_FROM ?? "Innergy <onboarding@resend.dev>";
  const { data, error } = await resend.emails.send({
    from,
    to: address,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (error) {
    throw new Error(`resend send failed: ${error.message ?? JSON.stringify(error)}`);
  }
  log.info({ notificationId: n.id, to: address, resendId: data?.id }, "email sent via resend");
}

async function resolveRecipient(n: Notification): Promise<string | null> {
  // Coach-addressed: use the coach's notificationAddress (email or E.164
  // depending on the coach's configured channel).
  if (n.coachId) {
    const coach = await prisma.coach.findUnique({ where: { id: n.coachId } });
    return coach?.notificationAddress ?? null;
  }
  // Super admin or other payload-addressed: read from payload.recipient.
  const payload = n.payload as { recipient?: { email?: string; phone?: string } } | null;
  const r = payload?.recipient;
  if (!r) return null;
  return r.email ?? r.phone ?? null;
}

function renderBody(n: Notification, enriched: EnrichedPayload | null): string {
  if (n.type === "escalation") {
    const payload = n.payload as { matchedPhrase?: string; rawInputSnippet?: string } | null;
    const who = enriched?.userName ? `${enriched.userName}${enriched.organisation ? ` (${enriched.organisation})` : ""}` : "a user";
    return [
      `Safety escalation — ${who}`,
      payload?.matchedPhrase ? `Matched phrase: "${payload.matchedPhrase}"` : null,
      payload?.rawInputSnippet ? `Message: "${payload.rawInputSnippet}"` : null,
      `Session: ${n.sessionId ?? "(none)"}`,
      "Please review and reach out per the safe-handoff protocol.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // coaching_interest (and fallback for digest): include scores if available.
  const who = enriched?.userName ? `${enriched.userName}${enriched.organisation ? ` (${enriched.organisation})` : ""}` : "A leader";
  const scoreLine = enriched?.overall
    ? `Overall: ${enriched.overall.score} · ${enriched.overall.band}`
    : null;
  const dimLine = enriched?.cognitive && enriched.relational && enriched.inner
    ? `CC ${enriched.cognitive.score}·${enriched.cognitive.band} / RI ${enriched.relational.score}·${enriched.relational.band} / IM ${enriched.inner.score}·${enriched.inner.band}`
    : null;
  return [
    `${who} has requested a coaching conversation.`,
    scoreLine,
    dimLine,
    "The booking link has been sent to them; you'll see them on the calendar or hear from them directly.",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderEmail(
  n: Notification,
  enriched: EnrichedPayload | null,
): { subject: string; html: string; text: string } {
  if (n.type === "user_report") {
    return renderUserReportEmail(enriched);
  }
  // Coach-facing types (coaching_interest, escalation, digest): wrap the
  // existing plain-text body in a minimal HTML envelope so deliveries to
  // email recipients still render cleanly.
  const text = renderBody(n, enriched);
  const subject =
    n.type === "escalation"
      ? "Innergy — Safety escalation"
      : n.type === "coaching_interest"
      ? "Innergy — New coaching request"
      : "Innergy — Notification";
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#1a1a1a"><pre style="white-space:pre-wrap;font-family:inherit;font-size:14px">${escapeHtml(text)}</pre></body></html>`;
  return { subject, html, text };
}

function renderUserReportEmail(
  enriched: EnrichedPayload | null,
): { subject: string; html: string; text: string } {
  const name = enriched?.userName ?? "there";
  const overall = enriched?.overall;
  const dims = [
    { label: "Cognitive Clarity", score: enriched?.cognitive, narrativeFor: "Section 1" },
    { label: "Relational Influence", score: enriched?.relational, narrativeFor: "Section 2" },
    { label: "Inner Mastery", score: enriched?.inner, narrativeFor: "Section 3" },
  ];
  const perDim = enriched?.interpretation?.perDimension ?? [];
  const overallNarrative = enriched?.interpretation?.overallNarrative ?? "";
  const coachName = enriched?.coach?.name ?? "your coach";
  const bookingUrl = enriched?.coach?.bookingUrl ?? "";
  const lowest = enriched?.lowestDimensionName ?? "";

  const tenantName = enriched?.tenant?.name ?? "Innergy";
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const tenantLogoUrl = enriched?.tenant?.logoUrl
    ? enriched.tenant.logoUrl
    : `${baseUrl}/logo.png`;

  const subject = overall
    ? `Your ${tenantName} Leadership Readiness Report — ${overall.band}`
    : `Your ${tenantName} Leadership Readiness Report`;

  // Innergy brand palette — mirrors src/app/globals.css :root vars so the
  // email matches what users see on /take. Composition rules also mirror the
  // assessment page: dark-brown pill with yellow uppercase text as the
  // signature eyebrow, pink reserved for a single italic accent in the
  // headline, yellow used as a left-stripe on dimension blocks (echoing the
  // typing-indicator), and brown CTA buttons with cream text.
  const ink = "#36211B";            // --foreground
  const cream = "#FFFAEF";          // --background
  const containerLight = "#F5ECDF"; // --container-light
  const accentPink = "#FF3F64";     // --accent-pink
  const accentYellow = "#FFDE59";   // --accent-yellow
  const muted = "#8A7868";
  const serifFont = "'Fraunces','Playfair Display',Georgia,serif";
  const sansFont = "'Montserrat',system-ui,-apple-system,Segoe UI,sans-serif";

  const dimBlocks = dims
    .map((d) => {
      if (!d.score) return "";
      const narrative = perDim.find((p) => p.dimensionName === d.narrativeFor)?.narrative ?? "";
      return `
        <tr><td style="padding:0 24px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${containerLight};border-left:4px solid ${accentYellow};border-radius:14px">
            <tr><td style="padding:18px 20px">
              <div class="innergy-eyebrow" style="font-size:10px;color:${muted}">${escapeHtml(d.label)}</div>
              <div class="innergy-num" style="margin-top:4px;font-size:32px;color:${ink};line-height:1.1;letter-spacing:-0.015em">${d.score.score}</div>
              <div class="innergy-eyebrow" style="margin-top:4px;font-size:10px;color:${ink}">${escapeHtml(d.score.band)}</div>
              ${narrative ? `<div class="innergy-body" style="margin-top:12px;font-size:14px;color:${ink}">${escapeHtml(narrative)}</div>` : ""}
            </td></tr>
          </table>
        </td></tr>`;
    })
    .join("");

  const ctaBlock = bookingUrl
    ? `<tr><td style="padding:8px 24px 28px">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${containerLight};border-radius:14px">
           <tr><td style="padding:24px;text-align:center">
             <div class="innergy-eyebrow" style="font-size:10px;color:${ink}">Next step</div>
             <div class="innergy-h1" style="margin-top:10px;font-size:22px;color:${ink};line-height:1.3">Want to go deeper${lowest ? ` on <em style="color:${accentPink};font-style:italic;font-weight:600">${escapeHtml(lowest)}</em>` : ""}?</div>
             <div class="innergy-body" style="margin-top:6px;font-size:14px;color:${muted}">Book a free debrief with ${escapeHtml(coachName)}.</div>
             <a href="${escapeAttr(bookingUrl)}" class="innergy-eyebrow" style="display:inline-block;margin-top:18px;background:${ink};color:${cream};text-decoration:none;padding:13px 28px;border-radius:999px;font-size:11px">Book a debrief</a>
           </td></tr>
         </table>
       </td></tr>`
    : "";

  // Google Fonts via @import works in Gmail web, Apple Mail, iOS Mail, and
  // most modern webmail. Outlook desktop strips it and falls back to the
  // serif/sans-serif stack — that's acceptable degradation.
  const fontsImport = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Montserrat:wght@300;400;500;600&display=swap');`;

  const html = `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(subject)}</title>
    <style>
      ${fontsImport}
      body { margin: 0; padding: 0; background: ${cream}; color: ${ink}; font-family: ${sansFont}; -webkit-font-smoothing: antialiased; }
      a { color: inherit; }
      .innergy-h1 { font-family: ${serifFont}; font-weight: 600; line-height: 1.15; letter-spacing: -0.01em; }
      .innergy-num { font-family: ${serifFont}; font-weight: 600; }
      .innergy-eyebrow { font-family: ${sansFont}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; }
      .innergy-body { font-family: ${sansFont}; line-height: 1.625; }
      .innergy-muted { color: ${ink}; opacity: 0.7; }
    </style>
  </head>
  <body>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cream};padding:32px 16px">
      <tr><td align="center">
        <!-- header strip with logo, sits on cream like the take/page header -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
          <tr><td style="padding:0 4px 16px;text-align:left">
            <img src="${escapeAttr(tenantLogoUrl)}" alt="${escapeAttr(tenantName)}" width="110" style="display:block;max-width:110px;height:auto" />
          </td></tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid ${containerLight};box-shadow:0 2px 6px rgba(54,33,27,0.06)">
          <tr><td style="padding:32px 24px 16px;text-align:left">
            <!-- signature eyebrow: dark-brown pill + yellow uppercase, mirrors /take -->
            <div class="innergy-eyebrow" style="display:inline-block;background:${ink};color:${accentYellow};font-size:10px;padding:6px 14px;border-radius:999px">Leadership Diagnostic</div>
            <h1 class="innergy-h1" style="margin:18px 0 0;font-size:34px;color:${ink}">Your <em style="color:${accentPink};font-style:italic;font-weight:600">AI Leadership</em> readiness report</h1>
            <p class="innergy-body innergy-muted" style="margin:14px 0 0;font-size:14px">Hi ${escapeHtml(name)} — here's your detailed readout across the three dimensions.</p>
          </td></tr>

          ${overall ? `
          <tr><td style="padding:8px 24px 16px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cream};border:1px solid ${containerLight};border-radius:18px">
              <tr><td style="padding:24px;text-align:center">
                <div class="innergy-eyebrow" style="font-size:10px;color:${ink};letter-spacing:0.18em">Overall score</div>
                <div class="innergy-num" style="margin-top:10px;font-size:60px;color:${ink};line-height:1;letter-spacing:-0.02em">${overall.score}</div>
                <div class="innergy-eyebrow" style="margin-top:8px;display:inline-block;background:${ink};color:${accentYellow};font-size:10px;padding:5px 12px;border-radius:999px">${escapeHtml(overall.band)}</div>
                ${overallNarrative ? `<div class="innergy-body" style="margin-top:18px;font-size:14px;color:${ink};text-align:left">${escapeHtml(overallNarrative)}</div>` : ""}
              </td></tr>
            </table>
          </td></tr>` : ""}

          <tr><td style="padding:0 24px 8px">
            <div class="innergy-eyebrow" style="font-size:10px;color:${muted};margin-bottom:10px">By dimension</div>
          </td></tr>
          ${dimBlocks}
          ${ctaBlock}

          <tr><td style="padding:20px 24px;border-top:1px solid ${containerLight};text-align:center" class="innergy-body">
            <div class="innergy-eyebrow" style="font-size:10px;color:${ink}">${escapeHtml(tenantName)} · Leadership diagnostic</div>
            <div style="margin-top:6px;font-size:12px;color:${muted}">This report is generated from your assessment responses. Your answers are private to you and your coach.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const textLines = [
    `Hi ${name},`,
    "",
    "Here's your AI Leadership Readiness Report.",
    "",
    overall ? `Overall: ${overall.score} · ${overall.band}` : "",
    overallNarrative,
    "",
    ...dims.flatMap((d) => {
      if (!d.score) return [];
      const narrative = perDim.find((p) => p.dimensionName === d.narrativeFor)?.narrative ?? "";
      return [`${d.label}: ${d.score.score} · ${d.score.band}`, narrative, ""];
    }),
    bookingUrl ? `Book a debrief with ${coachName}: ${bookingUrl}` : "",
  ];
  const text = textLines.filter((l) => l !== undefined).join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// Exports for tests — not called by the worker loop itself.
export const __internal = { tick, enrich, deliver, resolveRecipient, renderBody, renderEmail };

async function main() {
  log.info("notifications worker started");
  while (true) {
    try {
      await tick();
    } catch (err) {
      log.error({ err }, "notifications tick failed");
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

// Only run the loop when invoked directly via `tsx src/workers/notifications.ts`.
// Keeps the module importable from tests without starting the loop.
const isEntry = Boolean(
  process.argv[1] && /notifications\.ts$/.test(process.argv[1]),
);
if (isEntry) {
  main().catch((err) => {
    log.error({ err }, "notifications worker crashed");
    process.exit(1);
  });
}

