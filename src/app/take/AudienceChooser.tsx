// Step one of /take: pick which diagnostic to run.
//
// Editorial two-column layout — the pitch on the left, the two choices as
// cards on the right. Each card links to `?type=…`, so a choice is
// deep-linkable and survives a reload.

import Link from "next/link";
import type { Route } from "next";
import type { Audience } from "./AssessmentChat";

export interface AudienceCard {
  audience: Audience;
  eyebrow: string;
  title: string;
  blurb: string;
  /** e.g. "25 Q · 10 MIN" — derived from instrument metadata, not hardcoded. */
  meta: string;
}

export function AudienceChooser({
  cards,
  dimensionNames,
}: {
  cards: AudienceCard[];
  dimensionNames: string[];
}) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      {/* ── Left: the pitch ───────────────────────────────────────────── */}
      <div>
        <span className="inline-flex items-center rounded-full bg-[var(--foreground)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-yellow)]">
          Full Spectrum Leadership
        </span>

        <h1 className="mt-8 font-serif-heading text-5xl leading-[1.08] tracking-tight text-[var(--foreground)] sm:text-6xl">
          Assess <em className="italic text-[var(--accent-pink)]">yourself</em>,
          <br />
          or your team.
        </h1>

        {dimensionNames.length > 0 && (
          <>
            <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--foreground)] opacity-45">
              Three dimensions, either way
            </p>
            <ol className="mt-4 border-t border-[var(--container-light)]">
              {dimensionNames.map((name, i) => (
                <li
                  key={name}
                  className="flex items-baseline gap-5 border-b border-[var(--container-light)] py-4"
                >
                  <span className="font-mono text-xs font-semibold text-[var(--accent-pink)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-lg text-[var(--foreground)]">{name}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="mt-8 text-sm text-[var(--foreground)] opacity-45">
          Anonymous until you share a name.
        </p>
      </div>

      {/* ── Right: the two choices ────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {cards.map((card) => (
          <Link
            key={card.audience}
            href={`/take?type=${card.audience}` as Route}
            aria-label={`Start the ${card.title} assessment — ${card.meta}`}
            className="group rounded-[28px] bg-white p-8 shadow-[0_1px_2px_rgba(54,33,27,0.04)] outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(54,33,27,0.10)] focus-visible:ring-2 focus-visible:ring-[var(--accent-pink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] sm:p-10"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex items-center rounded-full bg-[var(--accent-yellow)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--foreground)]">
                {card.eyebrow}
              </span>
              <span className="whitespace-nowrap pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--foreground)] opacity-40">
                {card.meta}
              </span>
            </div>

            <h2 className="mt-6 font-serif-heading text-4xl leading-tight text-[var(--foreground)] sm:text-5xl">
              {card.title}
            </h2>

            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--foreground)] opacity-70">
              {card.blurb}
            </p>

            <span className="mt-7 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--accent-pink)]">
              Start
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
