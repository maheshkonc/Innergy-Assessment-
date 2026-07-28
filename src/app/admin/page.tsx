import { prisma } from "@/db/client";
import { DbStatusBanner } from "./DbStatusBanner";

export const dynamic = "force-dynamic";

async function getOverview() {
  const [tenants, sessions, completed, pendingNotifs] = await Promise.all([
    prisma.tenant.count({ where: { status: "active" } }),
    prisma.session.count(),
    prisma.session.count({ where: { status: "completed" } }),
    prisma.notification.count({ where: { status: "pending" } }),
  ]);

  // Per-assessment breakdown — the headline totals pool both diagnostics.
  const instruments = await prisma.instrument.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const byInstrument = await Promise.all(
    instruments.map(async (inst) => {
      const scope = { instrumentVersion: { instrumentId: inst.id } };
      const [total, done, inProgress, results] = await Promise.all([
        prisma.session.count({ where: scope }),
        prisma.session.count({ where: { ...scope, status: "completed" } }),
        prisma.session.count({ where: { ...scope, status: "in_progress" } }),
        prisma.result.count({ where: scope }),
      ]);
      return { id: inst.id, name: inst.name, total, done, inProgress, results };
    }),
  );

  return { tenants, sessions, completed, pendingNotifs, byInstrument };
}

export default async function AdminOverview() {
  const data = await getOverview().catch(() => null);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      {!data ? (
        <DbStatusBanner />
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Active tenants" value={data.tenants} />
            <Stat label="Sessions" value={data.sessions} />
            <Stat label="Completed" value={data.completed} />
            <Stat label="Pending notifications" value={data.pendingNotifs} />
          </dl>

          {data.byInstrument.length > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                By assessment
              </h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {data.byInstrument.map((i) => (
                  <div
                    key={i.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">{i.name}</div>
                      <a
                        href={`/admin/results?instrument=${i.id}`}
                        className="text-xs font-medium text-slate-500 underline hover:text-slate-900"
                      >
                        View results →
                      </a>
                    </div>
                    <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <MiniStat label="Sessions" value={i.total} />
                      <MiniStat label="Completed" value={i.done} />
                      <MiniStat label="In progress" value={i.inProgress} />
                      <MiniStat label="Results" value={i.results} />
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
