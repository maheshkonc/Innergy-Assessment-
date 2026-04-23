import { prisma } from "@/db/client";
import { TenantEditor, FlagToggle } from "./TenantEditor";
import { DbStatusBanner } from "../DbStatusBanner";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const result = await prisma.tenant
    .findMany({
      orderBy: { createdAt: "desc" },
      include: { coaches: { include: { coach: true } }, featureFlags: true },
    })
    .then((tenants) => ({ ok: true as const, tenants }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <DbStatusBanner />
      </div>
    );
  }
  const tenants = result.tenants;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Tenants</h1>
      <p className="mt-2 text-sm text-slate-600">
        Edit tenant basics + feature flags. Changes are audit-logged.
      </p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Slug</th>
            <th className="px-3 py-2">Routing</th>
            <th className="px-3 py-2">Trigger</th>
            <th className="px-3 py-2">Coach</th>
            <th className="px-3 py-2">Flags</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => {
            const primary = t.coaches.find((c) => c.isPrimary)?.coach;
            return (
              <tr key={t.id} className="border-b align-top">
                <td className="px-3 py-2 font-medium">
                  <div>{t.name}</div>
                  <div className="mt-1">
                    <TenantEditor
                      tenant={{
                        id: t.id,
                        name: t.name,
                        primaryColor: t.primaryColor,
                        linkedinUrl: t.linkedinUrl,
                        closingMessage: t.closingMessage,
                      }}
                    />
                  </div>
                </td>
                <td className="px-3 py-2 font-mono">{t.slug}</td>
                <td className="px-3 py-2">{t.whatsappMode}</td>
                <td className="px-3 py-2 font-mono">{t.triggerPayload ?? "—"}</td>
                <td className="px-3 py-2">{primary?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {t.featureFlags.map((f) => (
                      <FlagToggle key={f.id} tenantId={t.id} flag={f.key} value={f.value} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            );
          })}
          {tenants.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                No tenants yet. Run <code>pnpm db:seed</code>.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
