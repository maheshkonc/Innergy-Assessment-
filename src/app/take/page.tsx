// Public take-the-assessment page. Warm cream + dark brown palette with
// mustard + coral accents; the chat below carries the conversation.
//
// Step one is the audience chooser (Individual vs Team). Once a card is
// picked the URL carries ?type=… and the matching diagnostic loads.

import { prisma } from "@/db/client";
import { AssessmentChat, type Audience } from "./AssessmentChat";
import { AudienceChooser, type AudienceCard } from "./AudienceChooser";

export const dynamic = "force-dynamic";

const COPY: Record<Audience, { eyebrow: string; heading: React.ReactNode; sub: string }> = {
  individual: {
    eyebrow: "Leadership diagnostic",
    heading: (
      <>
        A candid read on how you lead in the{" "}
        <em className="text-[var(--accent-pink)]">AI age</em>.
      </>
    ),
    sub: "Three dimensions, honest answers only you will see.",
  },
  team: {
    eyebrow: "Team diagnostic",
    heading: (
      <>
        Where your leadership team is strong — and where they are{" "}
        <em className="text-[var(--accent-pink)]">at risk</em>.
      </>
    ),
    sub: "Take the assessment on behalf of your team.",
  },
};

const CARD_COPY: Record<Audience, Pick<AudienceCard, "eyebrow" | "title" | "blurb">> = {
  individual: {
    eyebrow: "For yourself",
    title: "Individual",
    blurb: "How you actually lead under pressure.",
  },
  team: {
    eyebrow: "For your team",
    title: "Team",
    blurb: "Where your top 10–20 leaders are strong — and where they are at risk.",
  },
};

/**
 * Card stats come from each instrument version's metadata, so editing an
 * instrument keeps the chooser honest instead of drifting from a literal.
 */
async function loadChooserData(): Promise<AudienceCard[]> {
  const instruments = await prisma.instrument.findMany({
    include: { currentVersion: { select: { id: true, metadata: true } } },
  });

  const cards: AudienceCard[] = [];
  for (const audience of ["individual", "team"] as const) {
    const inst = instruments.find((i) => {
      const meta = (i.currentVersion?.metadata ?? {}) as Record<string, unknown>;
      return meta.audience === audience;
    });
    if (!inst?.currentVersion) continue;

    const meta = (inst.currentVersion.metadata ?? {}) as Record<string, unknown>;
    const count =
      typeof meta.questionCount === "number"
        ? meta.questionCount
        : await prisma.question.count({
          where: { section: { instrumentVersionId: inst.currentVersion.id } },
        });
    // "10–12 minutes" → "10–12 MIN"; the card has no room for the long form.
    const duration =
      typeof meta.durationEstimate === "string"
        ? meta.durationEstimate.replace(/\s*minutes?$/i, " min")
        : "";

    cards.push({
      audience,
      ...CARD_COPY[audience],
      meta: [`${count} Q`, duration].filter(Boolean).join(" · "),
    });
  }

  return cards;
}

export default async function TakePage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; type?: string }>;
}) {
  const { tenant, type } = await searchParams;
  const audience: Audience | null =
    type === "team" ? "team" : type === "individual" ? "individual" : null;

  const chooser = audience === null
    ? await loadChooserData().catch((): AudienceCard[] => [])
    : null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Branding Header - Pinned to left corner */}
      <div className="px-6 py-4 lg:px-12">
        <div className="relative flex h-[40px] w-full items-center justify-start overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png?v=19"
            alt="innergy"
            className="h-[140px] w-[140px] max-w-none object-contain"
          />
        </div>
      </div>

      {audience === null ? (
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 lg:px-12 lg:pt-16">
          {chooser && chooser.length > 0 ? (
            <AudienceChooser cards={chooser} />
          ) : (
            <p className="py-20 text-center text-sm text-[var(--foreground)] opacity-60">
              No assessments are available right now. Please try again shortly.
            </p>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-3xl px-4 pb-10 sm:pb-14">
          <header className="mb-8">
            <div className="mb-6 inline-flex items-center rounded-full bg-[var(--foreground)] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-yellow)]">
              {COPY[audience].eyebrow}
            </div>
            <h1 className="font-serif-heading text-3xl leading-tight text-[var(--foreground)] sm:text-4xl">
              {COPY[audience].heading}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--foreground)] opacity-70">
              {COPY[audience].sub}
            </p>
            <a
              href="/take"
              /* min-h only on touch widths: the label is 16px tall, well under
                 the ~44px a finger needs. Desktop keeps the compact link. */
              className="mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-[var(--foreground)] underline underline-offset-4 opacity-60 transition hover:opacity-100 sm:mt-4 sm:min-h-0"
            >
              ← Choose a different assessment
            </a>
          </header>
          <AssessmentChat tenantSlug={tenant} audience={audience} />
          <footer className="mt-6 text-center text-xs text-[var(--foreground)] opacity-50">
            Your answers are anonymous until you share a name.
          </footer>
        </div>
      )}
    </div>
  );
}
