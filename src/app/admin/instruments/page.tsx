import { prisma } from "@/db/client";
import { PublishButton } from "./PublishButton";
import { DbStatusBanner } from "../DbStatusBanner";

export const dynamic = "force-dynamic";

export default async function InstrumentsPage() {
  const result = await prisma.instrument
    .findMany({
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          include: { _count: { select: { sessions: true, results: true } } },
        },
      },
    })
    .then((instruments) => ({ ok: true as const, instruments }))
    .catch((err: unknown) => ({ ok: false as const, err }));
  const instruments = result.ok ? result.instruments : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Instruments</h1>
      <p className="mt-2 text-sm text-slate-600">
        Each instrument is a versioned bundle of sections, questions, options, scores
        and bands. Publishing a new version leaves in-flight sessions untouched.
      </p>
      {!result.ok && <DbStatusBanner />}
      {result.ok && instruments.length === 0 && (
        <p className="mt-10 text-center text-sm text-slate-500">
          No instruments yet. Run <code>npx tsx src/db/seed/index.ts</code>.
        </p>
      )}
      <div className="mt-6 space-y-6">
        {instruments.map((inst) => (
          <section key={inst.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{inst.name}</h2>
              <span className="text-xs text-slate-500">{inst.id}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{inst.description}</p>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="px-2 py-1">Version</th>
                  <th className="px-2 py-1">Published</th>
                  <th className="px-2 py-1">Sessions</th>
                  <th className="px-2 py-1">Results</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {inst.versions.map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="px-2 py-1 font-mono">v{v.versionNumber}</td>
                    <td className="px-2 py-1">{v.publishedAt?.toISOString() ?? "draft"}</td>
                    <td className="px-2 py-1">{v._count.sessions}</td>
                    <td className="px-2 py-1">{v._count.results}</td>
                    <td className="px-2 py-1">
                      <PublishButton
                        instrumentId={inst.id}
                        versionId={v.id}
                        isCurrent={inst.currentVersionId === v.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
