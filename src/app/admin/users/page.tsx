import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const result = await prisma.user
    .findMany({
      orderBy: { lastSeenAt: "desc" },
      include: {
        tenant: true,
        _count: { select: { sessions: true, results: true } },
      },
      take: 100,
    })
    .then((users) => ({ ok: true as const, users }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      {!result.ok ? (
        <DbStatusBanner />
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Org</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Sessions</th>
              <th className="px-3 py-2">Results</th>
              <th className="px-3 py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {result.users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="px-3 py-2">{u.firstName ?? "—"}</td>
                <td className="px-3 py-2">{u.organisation ?? "—"}</td>
                <td className="px-3 py-2">{u.tenant.name}</td>
                <td className="px-3 py-2">{u._count.sessions}</td>
                <td className="px-3 py-2">{u._count.results}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {u.lastSeenAt.toISOString()}
                </td>
              </tr>
            ))}
            {result.users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
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
