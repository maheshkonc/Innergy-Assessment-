import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const result = await Promise.all([
    prisma.session.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.result.groupBy({ by: ["overallBand"], _count: { _all: true } }),
  ])
    .then(([byStatus, bandCounts]) => ({ ok: true as const, byStatus, bandCounts }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Analytics</h1>
      {!result.ok ? (
        <DbStatusBanner />
      ) : (
        <>
          <section className="mt-6">
            <h2 className="font-medium">Sessions by status</h2>
            {result.byStatus.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No sessions yet.</p>
            ) : (
              <ul className="mt-2 text-sm">
                {result.byStatus.map((g) => (
                  <li key={g.status}>
                    {g.status}: {g._count._all}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mt-6">
            <h2 className="font-medium">Overall band distribution</h2>
            {result.bandCounts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No results yet.</p>
            ) : (
              <ul className="mt-2 text-sm">
                {result.bandCounts.map((b) => (
                  <li key={b.overallBand}>
                    {b.overallBand}: {b._count._all}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
