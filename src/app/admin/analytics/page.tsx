import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { resolveInstrumentScope } from "../instrument-scope";
import { InstrumentSelect } from "../InstrumentSelect";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string }>;
}) {
  const { instrument } = await searchParams;
  const scope = await resolveInstrumentScope(instrument).catch(() => null);
  const selectedId = scope?.selected?.id ?? null;

  // Only candidates who actually took the scoped assessment — otherwise the
  // picker lists people with no data in the current view.
  const result = await prisma.user
    .findMany({
      where: selectedId
        ? { sessions: { some: { instrumentVersion: { instrumentId: selectedId } } } }
        : { sessions: { some: {} } },
      select: {
        id: true,
        firstName: true,
        email: true,
        organisation: true,
        _count: {
          select: {
            sessions: selectedId
              ? { where: { instrumentVersion: { instrumentId: selectedId } } }
              : true,
          },
        },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 500,
    })
    .then((users) => ({ ok: true as const, users }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <DbStatusBanner />
      </div>
    );
  }

  const candidates = result.users.map((u) => ({
    userId: u.id,
    firstName: u.firstName,
    email: u.email,
    organisation: u.organisation,
    sessionCount: u._count.sessions,
  }));

  return (
    <>
      <InstrumentSelect
        options={scope?.options ?? []}
        selectedId={selectedId}
        basePath="/admin/analytics"
      />
      <AnalyticsDashboard
        candidates={candidates}
        instrumentId={selectedId}
        instrumentName={scope?.selected?.name ?? null}
      />
    </>
  );
}
