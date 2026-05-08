import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { ResultsTable } from "./ResultsTable";

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
                <ResultsTable
                    rows={result.sessions.map((s) => ({
                        id: s.id,
                        status: s.status,
                        lastMessageAt: s.lastMessageAt.toISOString(),
                        answeredCount: s._count.answers,
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
