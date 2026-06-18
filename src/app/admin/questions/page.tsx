import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { EditableField } from "./QuestionEditor";
import { ReorderButtons } from "./ReorderButtons";
import { FlowSettings } from "./FlowSettings";
import { DEFAULT_CONTACT_POSITION } from "@/core/state-machine/engine";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  const result = await loadData()
    .then((data) => ({ ok: true as const, ...data }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Questions</h1>
        <DbStatusBanner />
      </div>
    );
  }

  const { sections, inProgressCount, tenant, contactPosition } = result;
  const locked = false; // Restriction removed per user request

  return (
    <div>
      <h1 className="text-2xl font-semibold">Questions</h1>
      <p className="mt-2 text-sm text-slate-600">
        Edit question text and option labels, and reorder sections and questions
        with the ↑ ↓ controls. Scores are edited under{" "}
        <a href="/admin/scoring" className="underline">
          Scoring
        </a>
        . Past results are unaffected — Answer rows reference questions by id.
      </p>

      {tenant && (
        <div className="mt-6">
          <FlowSettings tenantId={tenant.id} initialValue={contactPosition} />
        </div>
      )}

      {inProgressCount > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">
            {inProgressCount} session{inProgressCount === 1 ? "" : "s"} in progress.
          </div>
          <div className="mt-1 text-amber-800">
            Note: Editing now will affect people currently mid-assessment.
          </div>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {sections.map((s, si) => (
          <section key={s.id} className="rounded-lg border border-slate-200 bg-white">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{s.dimensionName}</h2>
                <div className="text-xs text-slate-500">
                  Section {si + 1} · {s.questions.length} questions
                </div>
              </div>
              <ReorderButtons
                kind="section"
                id={s.id}
                canMoveUp={si > 0}
                canMoveDown={si < sections.length - 1}
              />
            </header>
            <div className="divide-y divide-slate-100">
              {s.questions.map((q, qi) => (
                <div key={q.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Q{qi + 1}
                    </div>
                    <ReorderButtons
                      kind="question"
                      id={q.id}
                      canMoveUp={qi > 0}
                      canMoveDown={qi < s.questions.length - 1}
                    />
                  </div>
                  <EditableField
                    initialValue={q.stem}
                    disabled={locked}
                    target={{ kind: "question", id: q.id }}
                    multiline
                  />
                  <div className="space-y-2 pl-4">
                    {q.options.map((o) => (
                      <div key={o.id} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                          {o.label}
                        </span>
                        <div className="flex-1">
                          <EditableField
                            initialValue={o.text}
                            disabled={locked}
                            target={{ kind: "option", id: o.id }}
                          />
                        </div>
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

  const tenant = await prisma.tenant.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let contactPosition: string = DEFAULT_CONTACT_POSITION;
  if (tenant) {
    const flag = await prisma.featureFlag.findUnique({
      where: { tenantId_key: { tenantId: tenant.id, key: "contact_capture_position" } },
    });
    if (flag?.value) contactPosition = flag.value;
  }

  if (!current?.currentVersion) {
    return { sections: [], inProgressCount: 0, tenant, contactPosition };
  }

  const inProgressCount = await prisma.session.count({
    where: {
      instrumentVersionId: current.currentVersion.id,
      status: "in_progress",
      lastMessageAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
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
      })),
    })),
  }));

  return { sections, inProgressCount, tenant, contactPosition };
}
