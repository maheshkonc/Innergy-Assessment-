import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";
import { DeleteButton } from "../DeleteButton";
import { resolveInstrumentScope, versionToInstrumentName } from "../instrument-scope";
import { InstrumentSelect } from "../InstrumentSelect";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string }>;
}) {
  const { instrument } = await searchParams;
  const scope = await resolveInstrumentScope(undefined).catch(() => null);
  const filterId = instrument && instrument !== "all" ? instrument : null;

  const versionMap = await versionToInstrumentName().catch(() => new Map());
  const versionIdsForFilter = filterId
    ? [...versionMap.entries()]
      .filter(([, v]) => v.instrumentId === filterId)
      .map(([id]) => id)
    : null;

  const result = await prisma.user
    .findMany({
      where: versionIdsForFilter
        ? { sessions: { some: { instrumentVersionId: { in: versionIdsForFilter } } } }
        : undefined,
      orderBy: { lastSeenAt: "desc" },
      include: {
        tenant: true,
        sessions: { select: { instrumentVersionId: true, status: true } },
        _count: { select: { sessions: true, results: true } },
      },
      take: 100,
    })
    .then((users) => ({ ok: true as const, users }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  const filterOptions = [
    { id: "all", name: "All", audience: "", currentVersionId: null, questionCount: 0 },
    ...(scope?.options ?? []),
  ];

  // Which assessments each person has actually taken.
  const assessmentsFor = (sessions: { instrumentVersionId: string }[]) => {
    const names = new Set<string>();
    for (const s of sessions) {
      const name = versionMap.get(s.instrumentVersionId)?.name;
      if (name) names.add(name);
    }
    return [...names];
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <InstrumentSelect
        options={filterOptions}
        selectedId={filterId ?? "all"}
        basePath="/admin/users"
      />
      {!result.ok ? (
        <DbStatusBanner />
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Org</th>
              <th className="px-3 py-2">Assessments taken</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Sessions</th>
              <th className="px-3 py-2">Results</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="px-3 py-2">{u.firstName ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-mono">{u.email ?? "—"}</td>
                <td className="px-3 py-2">{u.organisation ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {assessmentsFor(u.sessions).map((n) => (
                      <span
                        key={n}
                        className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700"
                      >
                        {n}
                      </span>
                    ))}
                    {assessmentsFor(u.sessions).length === 0 && (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">{u.tenant.name}</td>
                <td className="px-3 py-2">{u._count.sessions}</td>
                <td className="px-3 py-2">{u._count.results}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {u.lastSeenAt.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-3 py-2 text-right">
                  <DeleteButton
                    endpoint="/api/admin/users"
                    id={u.id}
                    confirmMessage={`Delete user ${u.firstName ?? "Anonymous"}? This will remove all their sessions and results.`}
                  />
                </td>
              </tr>
            ))}
            {result.users.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                  No users yet. Users are created the first time someone scans a tenant's
                  QR code and sends a WhatsApp message.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
