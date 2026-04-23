import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { ScoreInput } from "./ScoreInput";

export const dynamic = "force-dynamic";

export default async function ScoringPage() {
  const result = await loadData()
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

  const { sections, inProgressCount } = result;
  const locked = inProgressCount > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Question scoring</h1>
      <p className="mt-2 text-sm text-slate-600">
        Scores you set here apply to assessments that start from now on. Past
        results stay pinned to the scores used at the time.
      </p>

      {locked ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">
            {inProgressCount} session{inProgressCount === 1 ? "" : "s"} in progress — editing is disabled.
          </div>
          <div className="mt-1 text-amber-800">
            Changing a score now would shift the final readout for people who
            are mid-assessment. Wait for them to finish (or abandon them from
            the session view) before editing.
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          No sessions in progress — safe to edit scores.
        </div>
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

async function loadData() {
  const current = await prisma.instrument.findFirst({
    include: {
      currentVersion: {
        include: {
          sections: {
            orderBy: { displayOrder: "asc" },
            include: {
              dimension: true,
              questions: {
                orderBy: { displayOrder: "asc" },
                include: { options: { orderBy: { displayOrder: "asc" } } },
              },
            },
          },
        },
      },
    },
  });

  if (!current?.currentVersion) {
    return { sections: [], inProgressCount: 0 };
  }

  const inProgressCount = await prisma.session.count({
    where: {
      instrumentVersionId: current.currentVersion.id,
      status: "in_progress",
    },
  });

  const sections = current.currentVersion.sections.map((s) => ({
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

  return { sections, inProgressCount };
}
