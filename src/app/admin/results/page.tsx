import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import Link from "next/link";
import { DeleteButton } from "../DeleteButton";

export const dynamic = "force-dynamic";

export default async function ResultsListPage() {
    const result = await prisma.session.findMany({
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

    return (
        <div>
            <h1 className="text-2xl font-semibold">Assessment Results</h1>
            <p className="mt-2 text-sm text-slate-600">
                Browse all diagnostic sessions. View specific answers by clicking the session ID.
            </p>

            {!result.ok ? (
                <DbStatusBanner />
            ) : (
                <table className="mt-6 w-full text-sm">
                    <thead>
                        <tr className="border-b text-left text-xs uppercase text-slate-500">
                            <th className="px-3 py-2">Participant</th>
                            <th className="px-3 py-2">Organisation</th>
                            <th className="px-3 py-2">Score</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Answers</th>
                            <th className="px-3 py-2">Last Message</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.sessions.map((s) => (
                            <tr key={s.id} className="border-b hover:bg-slate-50/50">
                                <td className="px-3 py-3">
                                    <div className="font-medium text-slate-900">{s.user.firstName ?? "Anonymous"}</div>
                                    <div className="text-xs text-slate-500">{s.user.email ?? "No email"}</div>
                                </td>
                                <td className="px-3 py-3 text-slate-600">{s.user.organisation ?? "—"}</td>
                                <td className="px-3 py-3">
                                    {s.result ? (
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900">{s.result.overallScore}</span>
                                            <span className="text-[10px] uppercase tracking-wider text-slate-500">{s.result.overallBand}</span>
                                        </div>
                                    ) : (
                                        <span className="text-slate-400">—</span>
                                    )}
                                </td>
                                <td className="px-3 py-3">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                                            s.status === "abandoned" ? "bg-slate-100 text-slate-500" :
                                                "bg-amber-100 text-amber-800"
                                        }`}>
                                        {s.status}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-slate-500">{s._count.answers} / 25</td>
                                <td className="px-3 py-3 text-xs text-slate-500">
                                    {s.lastMessageAt.toISOString().slice(0, 16).replace("T", " ")}
                                </td>
                                <td className="px-3 py-3 text-right flex justify-end gap-3">
                                    <Link
                                        href={`/admin/results/${s.id}`}
                                        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                                    >
                                        View Answers
                                    </Link>
                                    <DeleteButton
                                        endpoint="/api/admin/sessions"
                                        id={s.id}
                                        confirmMessage="Delete this assessment session and its results? This cannot be undone."
                                    />
                                </td>
                            </tr>
                        ))}
                        {result.sessions.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                                    No assessment sessions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
}
