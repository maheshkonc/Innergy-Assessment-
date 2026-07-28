import { prisma } from "@/db/client";
import { DbStatusBanner } from "../../DbStatusBanner";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SessionDetail({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await prisma.session.findUnique({
        where: { id },
        include: {
            user: true,
            tenant: true,
            result: true,
            instrumentVersion: { include: { instrument: { select: { name: true } } } },
            answers: {
                orderBy: { answeredAt: "asc" },
                include: {
                    question: { include: { section: { include: { dimension: true } } } },
                    option: true,
                },
            },
        },
    });

    if (!session) {
        notFound();
    }

    // Scores are meaningless without the scale they were measured on, and the
    // two assessments have different maxima (123 vs 75).
    const [dimensionBands, overallBands, totalQuestions] = await Promise.all([
        prisma.dimensionBand.findMany({
            where: { instrumentVersionId: session.instrumentVersionId },
            include: { dimension: true },
        }),
        prisma.overallBand.findMany({
            where: { instrumentVersionId: session.instrumentVersionId },
        }),
        prisma.question.count({
            where: { section: { instrumentVersionId: session.instrumentVersionId } },
        }),
    ]);

    // Keyed on internalTag; display names are editable content.
    const maxForTag = (tag: string) =>
        dimensionBands
            .filter((b) => b.dimension.internalTag === tag)
            .reduce((m, b) => Math.max(m, b.maxScore), 0);
    const nameForTag = (tag: string, fallback: string) =>
        dimensionBands.find((b) => b.dimension.internalTag === tag)?.dimension.name ?? fallback;
    const overallMax = overallBands.reduce((m, b) => Math.max(m, b.maxScore), 0);

    return (
        <div className="max-w-5xl">
            <div className="flex items-center justify-between gap-4">
                <Link href="/admin/results" className="text-sm font-medium text-slate-500 hover:text-slate-900">
                    ← Back to Results
                </Link>
                <a
                    href={`/api/admin/sessions/${id}/answers/export`}
                    className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                    Export Answers (CSV)
                </a>
            </div>

            <header className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                        {session.user.firstName ?? "Anonymous Session"}
                    </h1>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span>{session.user.email ?? "No email captured"}</span>
                        <span>{session.user.organisation ?? "Unknown Org"}</span>
                        <span>Tenant: {session.tenant.name}</span>
                        <span className="font-medium text-slate-700">
                            {session.instrumentVersion.instrument.name}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${session.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                            session.status === "abandoned" ? "bg-slate-100 text-slate-500" :
                                "bg-amber-100 text-amber-800"
                        }`}>
                        {session.status}
                    </span>
                    {session.result && (
                        <div className="rounded-lg bg-slate-900 px-4 py-1 text-white">
                            <span className="text-xs uppercase tracking-widest opacity-60">Score:</span>
                            <span className="ml-2 text-lg font-bold">
                                {session.result.overallScore}
                                {overallMax ? <span className="text-sm font-normal opacity-60"> / {overallMax}</span> : null}
                            </span>
                        </div>
                    )}
                </div>
            </header>

            {session.result && (
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <ScoreCard
                        label={nameForTag("cognitive", "Cognitive")}
                        score={session.result.cognitiveScore}
                        max={maxForTag("cognitive")}
                        band={session.result.cognitiveBand}
                    />
                    <ScoreCard
                        label={nameForTag("relational", "Relational")}
                        score={session.result.relationalScore}
                        max={maxForTag("relational")}
                        band={session.result.relationalBand}
                    />
                    <ScoreCard
                        label={nameForTag("inner", "Inner")}
                        score={session.result.innerScore}
                        max={maxForTag("inner")}
                        band={session.result.innerBand}
                    />
                </div>
            )}

            <section className="mt-10">
                <h2 className="text-lg font-semibold text-slate-900">
                    Raw Responses
                    <span className="ml-2 text-sm font-normal text-slate-500">
                        {session.answers.length} of {totalQuestions} answered
                    </span>
                </h2>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <th className="px-4 py-3 font-semibold">Q#</th>
                                <th className="px-4 py-3 font-semibold">Section</th>
                                <th className="px-4 py-3 font-semibold">Question Stem</th>
                                <th className="px-4 py-3 font-semibold text-center">User Choice</th>
                                <th className="px-4 py-3 font-semibold text-right">Points</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {session.answers.map((a, idx) => (
                                <tr key={a.id} className="hover:bg-slate-50/30">
                                    <td className="px-4 py-4 align-top font-bold text-slate-400">
                                        {a.question.displayOrder}
                                    </td>
                                    <td className="px-4 py-4 align-top text-xs text-slate-500">
                                        {a.question.section.dimension.name}
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                        <p className="font-medium text-slate-800">{a.question.stem}</p>
                                        <div className="mt-2 text-xs text-slate-500 italic">
                                            Raw input: "{a.rawInput}"
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-900">
                                                {a.option.label}
                                            </span>
                                            <span className="text-[10px] text-center text-slate-500 leading-tight">
                                                {a.option.text}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 align-top text-right font-mono font-bold text-slate-900">
                                        +{a.option.score}
                                    </td>
                                </tr>
                            ))}
                            {session.answers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500 italic">
                                        No answers recorded for this session yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <footer className="mt-10 border-t pt-6 text-xs text-slate-400">
                Session ID: {session.id} · Started: {session.startedAt.toISOString()}
            </footer>
        </div>
    );
}

function ScoreCard({ label, score, max, band }: { label: string; score: number; max: number; band: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {label}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                    {score}
                    {max ? <span className="text-sm font-normal text-slate-400"> / {max}</span> : null}
                </span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">{band}</span>
            </div>
        </div>
    );
}
