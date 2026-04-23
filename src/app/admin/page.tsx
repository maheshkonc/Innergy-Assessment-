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
  return { tenants, sessions, completed, pendingNotifs };
}

export default async function AdminOverview() {
  const data = await getOverview().catch(() => null);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      {!data ? (
        <DbStatusBanner />
      ) : (
        <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Active tenants" value={data.tenants} />
          <Stat label="Sessions" value={data.sessions} />
          <Stat label="Completed" value={data.completed} />
          <Stat label="Pending notifications" value={data.pendingNotifs} />
        </dl>
      )}
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
