import { prisma } from "@/db/client";
import { DbStatusBanner } from "../DbStatusBanner";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const result = await prisma.auditLog
    .findMany({ orderBy: { at: "desc" }, take: 200 })
    .then((rows) => ({ ok: true as const, rows }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      {!result.ok ? (
        <DbStatusBanner />
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2 text-xs">{r.at.toISOString()}</td>
                <td className="px-3 py-2">{r.actorUserId}</td>
                <td className="px-3 py-2 font-mono">{r.entity}#{r.entityId}</td>
                <td className="px-3 py-2">{r.action}</td>
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-sm text-slate-500">
                  No audit entries yet. Edits to tenants, templates, feature flags, and
                  instrument versions from the admin UI will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
