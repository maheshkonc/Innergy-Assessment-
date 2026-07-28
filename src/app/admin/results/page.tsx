import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { ResultsTable } from "./ResultsTable";
import { resolveInstrumentScope, versionToInstrumentName } from "../instrument-scope";
import { InstrumentSelect } from "../InstrumentSelect";

export const dynamic = "force-dynamic";

export default async function ResultsListPage({
    searchParams,
}: {
    searchParams: Promise<{ instrument?: string }>;
}) {
    const { instrument } = await searchParams;

    // "all" is a first-class choice here — unlike Questions/Scoring, browsing
    // both assessments side by side is genuinely useful.
    const scope = await resolveInstrumentScope(undefined).catch(() => null);
    const filterId = instrument && instrument !== "all" ? instrument : null;

    const versionMap = await versionToInstrumentName().catch(() => new Map());
    const versionIdsForFilter = filterId
        ? [...versionMap.entries()]
            .filter(([, v]) => v.instrumentId === filterId)
            .map(([id]) => id)
        : null;

    const result = await prisma.session.findMany({
        where: versionIdsForFilter
            ? { instrumentVersionId: { in: versionIdsForFilter } }
            : undefined,
        orderBy: { lastMessageAt: "desc" },
        include: {
            user: true,
            tenant: true,
            result: true,
            _count: { select: { answers: true } },
        },
        take: 100,
    })
        .then((sessions) => ({ ok: true as const, sessions }))
        .catch((err: unknown) => ({ ok: false as const, err }));

    // Question count per version, so "12/15" means something on a team row.
    const totals = new Map<string, number>();
    if (result.ok) {
        for (const versionId of new Set(result.sessions.map((s) => s.instrumentVersionId))) {
            totals.set(
                versionId,
                await prisma.question.count({ where: { section: { instrumentVersionId: versionId } } }),
            );
        }
    }

    const filterOptions = [
        { id: "all", name: "All", audience: "", currentVersionId: null, questionCount: 0 },
        ...(scope?.options ?? []),
    ];

    return (
        <div>
            <h1 className="text-2xl font-semibold">Assessment Results</h1>
            <InstrumentSelect
                options={filterOptions}
                selectedId={filterId ?? "all"}
                basePath="/admin/results"
            />
            <p className="mt-2 text-sm text-slate-600">
                Browse all diagnostic sessions. View specific answers by clicking the session ID.
            </p>

            {!result.ok ? (
                <DbStatusBanner />
            ) : (
                <ResultsTable
                    instrumentFilterId={filterId}
                    rows={result.sessions.map((s) => ({
                        id: s.id,
                        status: s.status,
                        lastMessageAt: s.lastMessageAt.toISOString(),
                        answeredCount: s._count.answers,
                        totalQuestions: totals.get(s.instrumentVersionId) ?? 0,
                        assessment: versionMap.get(s.instrumentVersionId)?.name ?? "—",
                        user: {
                            firstName: s.user.firstName,
                            email: s.user.email,
                            organisation: s.user.organisation,
                        },
                        result: s.result
                            ? { overallScore: s.result.overallScore, overallBand: s.result.overallBand }
                            : null,
                    }))}
                />
            )}
        </div>
    );
}
