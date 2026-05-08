import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const result = await prisma.user
    .findMany({
      where: { sessions: { some: {} } },
      select: {
        id: true,
        firstName: true,
        email: true,
        organisation: true,
        _count: { select: { sessions: true } },
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

  return <AnalyticsDashboard candidates={candidates} />;
}
