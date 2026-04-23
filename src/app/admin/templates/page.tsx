import { prisma } from "@/db/client";
import { TemplateEditor } from "./TemplateEditor";
import { DbStatusBanner } from "../DbStatusBanner";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const result = await prisma.messageTemplate
    .findMany({ orderBy: [{ key: "asc" }, { tenantId: "asc" }] })
    .then((rows) => ({ ok: true as const, rows }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Message templates</h1>
      <p className="mt-2 text-sm text-slate-600">
        NULL tenant = global default. Non-null tenant = override for that tenant.
        Edits are audit-logged (PRD §11.12).
      </p>
      {!result.ok ? (
        <DbStatusBanner />
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Locale</th>
              <th className="px-3 py-2">Body</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((t) => (
              <tr key={t.id} className="border-b align-top">
                <td className="px-3 py-2 font-mono">{t.key}</td>
                <td className="px-3 py-2">{t.tenantId ?? <em className="text-slate-400">global</em>}</td>
                <td className="px-3 py-2">{t.locale}</td>
                <td className="max-w-2xl px-3 py-2">
                  <TemplateEditor
                    row={{ id: t.id, key: t.key, tenantId: t.tenantId, locale: t.locale, body: t.body }}
                  />
                </td>
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-sm text-slate-500">
                  No templates yet. Run <code>npx tsx src/db/seed/index.ts</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
