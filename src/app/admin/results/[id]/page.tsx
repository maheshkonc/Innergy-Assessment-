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
            answers: {
                orderBy: { answeredAt: "asc" },
                include: {
                    question: true,
                    option: true,
                },
            },
        },
    });

    if (!session) {
        notFound();
    }

    return (
        <div className="max-w-5xl">
            <div className="flex items-center gap-4">
                <Link href="/admin/results" className="text-sm font-medium text-slate-500 hover:text-slate-900">
                    ← Back to Results
                </Link>
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
                            <span className="ml-2 text-lg font-bold">{session.result.overallScore}</span>
                        </div>
                    )}
                </div>
            </header>

            {session.result && (
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <ScoreCard label="Cognitive" score={session.result.cognitiveScore} band={session.result.cognitiveBand} />
                    <ScoreCard label="Relational" score={session.result.relationalScore} band={session.result.relationalBand} />
                    <ScoreCard label="Inner" score={session.result.innerScore} band={session.result.innerBand} />
                </div>
            )}

            <section className="mt-10">
                <h2 className="text-lg font-semibold text-slate-900">Raw Responses</h2>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <th className="px-4 py-3 font-semibold">Q#</th>
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
                                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500 italic">
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

function ScoreCard({ label, score, band }: { label: string; score: number; band: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {label}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{score}</span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">{band}</span>
            </div>
        </div>
    );
}
