// Public QR-code entry page.
//
// Shows a wa.me QR code for a tenant's WhatsApp number. Scanning it on a
// phone opens WhatsApp with a pre-filled message pointing at the tenant's
// dedicated number — the user taps send and the welcome sequence arrives.
//
// Tenant is selected via `?tenant=<slug>` or defaults to the first active
// tenant. The page is server-rendered; the QR SVG is generated at request
// time by the `qrcode` lib.

import QRCode from "qrcode";
import { prisma } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function WhatsAppEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: slug } = await searchParams;

  const tenant = slug
    ? await prisma.tenant.findUnique({
        where: { slug },
        include: { coaches: { include: { coach: true } } },
      })
    : await prisma.tenant.findFirst({
        where: { status: "active" },
        orderBy: { createdAt: "asc" },
        include: { coaches: { include: { coach: true } } },
      });

  if (!tenant) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Tenant not configured</h1>
        <p className="mt-2 text-sm text-slate-600">
          No active tenant found. Seed the database first.
        </p>
      </div>
    );
  }

  if (!tenant.whatsappNumber) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">{tenant.name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          This tenant has no WhatsApp number configured. An admin needs to
          set <code>whatsappNumber</code> on the tenant.
        </p>
      </div>
    );
  }

  const prefill = tenant.triggerPayload ?? "Hi";
  const waUrl = `https://wa.me/${tenant.whatsappNumber}?text=${encodeURIComponent(prefill)}`;
  const qrSvg = await QRCode.toString(waUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  const displayNumber = formatPhoneForDisplay(tenant.whatsappNumber);
  const coach = tenant.coaches.find((c) => c.isPrimary)?.coach;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
        <header className="space-y-1 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {tenant.name} · Leadership diagnostic
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Take the assessment on WhatsApp
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Scan the QR below with your phone camera. WhatsApp will open with
            a message pre-filled — just tap send to begin.
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div
            className="mx-auto aspect-square w-full max-w-[320px]"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="mt-6 space-y-2 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Send &quot;{prefill}&quot; to
            </div>
            <div className="font-mono text-lg font-semibold text-slate-900">
              {displayNumber}
            </div>
          </div>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 block w-full rounded-xl bg-slate-900 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Or tap here to open WhatsApp →
          </a>
        </div>

        <ol className="mt-6 space-y-2 text-sm text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">1.</span> Scan the
            QR on your phone (or tap the button if you&rsquo;re already on
            mobile).
          </li>
          <li>
            <span className="font-semibold text-slate-900">2.</span> Send the
            pre-filled message.
          </li>
          <li>
            <span className="font-semibold text-slate-900">3.</span> Answer 25
            short questions across three dimensions. ~10 minutes.
          </li>
          <li>
            <span className="font-semibold text-slate-900">4.</span> Get your
            personalised readout
            {coach ? ` and an optional conversation with ${coach.name}` : ""}.
          </li>
        </ol>

        <footer className="mt-8 text-center text-xs text-slate-500">
          Your answers are anonymous until you share a name.
        </footer>
      </div>
    </div>
  );
}

function formatPhoneForDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.startsWith("91") && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}
