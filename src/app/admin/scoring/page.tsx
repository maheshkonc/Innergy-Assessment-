import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { ScoreInput } from "./ScoreInput";
import { resolveInstrumentScope } from "../instrument-scope";
import { InstrumentSelect } from "../InstrumentSelect";

export const dynamic = "force-dynamic";

export default async function ScoringPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string }>;
}) {
  const { instrument } = await searchParams;
  const scope = await resolveInstrumentScope(instrument).catch(() => null);
  const result = await loadData(scope?.selected?.currentVersionId ?? null)
    .then((data) => ({ ok: true as const, ...data }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Question scoring</h1>
        <DbStatusBanner />
      </div>
    );
  }

  const { sections, inProgressCount, bands } = result;
  const locked = false; // Restriction removed per user request

  return (
    <div>
      <h1 className="text-2xl font-semibold">Question scoring</h1>
      <InstrumentSelect
        options={scope?.options ?? []}
        selectedId={scope?.selected?.id ?? null}
        basePath="/admin/scoring"
      />
      <p className="mt-2 text-sm text-slate-600">
        Scores you set here apply to assessments that start from now on. Past
        results stay pinned to the scores used at the time.
      </p>

      {inProgressCount > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">
            {inProgressCount} session{inProgressCount === 1 ? "" : "s"} in progress.
          </div>
          <div className="mt-1 text-amber-800">
            Note: Changes will apply immediately to people who are mid-assessment.
          </div>
        </div>
      )}

      {bands.length > 0 && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white">
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Bands</h2>
            <div className="text-xs text-slate-500">
              Score ranges this assessment maps onto each band label.
            </div>
          </header>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {bands.map((group) => (
              <div key={group.label}>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </div>
                <ul className="mt-2 space-y-1">
                  {group.rows.map((b, i) => (
                    <li
                      key={`${group.label}-${i}`}
                      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs"
                    >
                      <span className="font-medium text-slate-800">{b.bandLabel}</span>
                      <span className="font-mono text-slate-600">
                        {b.minScore}–{b.maxScore}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 space-y-8">
        {sections.map((s) => (
          <section key={s.id} className="rounded-lg border border-slate-200 bg-white">
            <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {s.dimensionName}
              </h2>
              <div className="text-xs text-slate-500">
                Section {s.displayOrder} · {s.questions.length} questions
              </div>
            </header>
            <div className="divide-y divide-slate-100">
              {s.questions.map((q) => (
                <div key={q.id} className="px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Q{q.displayOrder}
                  </div>
                  <div className="mt-1 text-sm text-slate-800">{q.stem}</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {q.options.map((o) => (
                      <div
                        key={o.id}
                        className="flex items-start justify-between gap-3 rounded border border-slate-200 bg-slate-50/50 px-3 py-2"
                      >
                        <div className="flex-1">
                          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                            {o.label}
                          </span>
                          <span className="text-xs text-slate-700">{o.text}</span>
                        </div>
                        <ScoreInput
                          optionId={o.id}
                          initialScore={o.score}
                          disabled={locked}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

async function loadData(instrumentVersionId: string | null) {
  if (!instrumentVersionId) {
    return { sections: [], inProgressCount: 0, bands: [] };
  }

  const sectionRows = await prisma.section.findMany({
    where: { instrumentVersionId },
    orderBy: { displayOrder: "asc" },
    include: {
      dimension: true,
      questions: {
        orderBy: { displayOrder: "asc" },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      },
    },
  });

  const [dimensionBands, overallBands] = await Promise.all([
    prisma.dimensionBand.findMany({
      where: { instrumentVersionId },
      orderBy: { minScore: "desc" },
      include: { dimension: true },
    }),
    prisma.overallBand.findMany({
      where: { instrumentVersionId },
      orderBy: { minScore: "desc" },
    }),
  ]);

  const bands = [
    ...sectionRows.map((s) => ({
      label: s.dimension.name,
      rows: dimensionBands
        .filter((b) => b.dimensionId === s.dimensionId)
        .map((b) => ({ bandLabel: b.bandLabel, minScore: b.minScore, maxScore: b.maxScore })),
    })),
    {
      label: "Overall",
      rows: overallBands.map((b) => ({
        bandLabel: b.bandLabel,
        minScore: b.minScore,
        maxScore: b.maxScore,
      })),
    },
  ].filter((g) => g.rows.length > 0);

  const inProgressCount = await prisma.session.count({
    where: {
      instrumentVersionId,
      status: "in_progress",
      lastMessageAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
  });

  const sections = sectionRows.map((s) => ({
    id: s.id,
    displayOrder: s.displayOrder,
    dimensionName: s.dimension.name,
    questions: s.questions.map((q) => ({
      id: q.id,
      stem: q.stem,
      displayOrder: q.displayOrder,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        text: o.text,
        score: o.score,
      })),
    })),
  }));

  return { sections, inProgressCount, bands };
}
