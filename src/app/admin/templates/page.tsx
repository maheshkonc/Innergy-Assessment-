import { prisma } from "@/db/client";
import { TemplateEditor } from "./TemplateEditor";
import { DbStatusBanner } from "../DbStatusBanner";
import { InstrumentSelect } from "../InstrumentSelect";

export const dynamic = "force-dynamic";

// Copy variants are template-key prefixes (see core/templates/variant.ts).
// "shared" = the unprefixed keys every assessment falls back to.
const VARIANTS = [
  { id: "all", name: "All", prefix: null },
  { id: "shared", name: "Shared / Individual", prefix: null },
  { id: "team", name: "Team", prefix: "team_" },
] as const;

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string }>;
}) {
  const { instrument } = await searchParams;
  const active = VARIANTS.find((v) => v.id === instrument) ?? VARIANTS[0];

  const result = await prisma.messageTemplate
    .findMany({ orderBy: [{ key: "asc" }, { tenantId: "asc" }] })
    .then((rows) => ({ ok: true as const, rows }))
    .catch((err: unknown) => ({ ok: false as const, err }));

  const prefixes = VARIANTS.map((v) => v.prefix).filter(Boolean) as string[];
  const rows = result.ok
    ? result.rows.filter((t) => {
      if (active.id === "all") return true;
      if (active.id === "shared") return !prefixes.some((p) => t.key.startsWith(p));
      return t.key.startsWith(active.prefix!);
    })
    : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Message templates</h1>
      <InstrumentSelect
        options={VARIANTS.map((v) => ({
          id: v.id,
          name: v.name,
          audience: "",
          currentVersionId: null,
          questionCount: result.ok
            ? result.rows.filter((t) => {
              if (v.id === "all") return true;
              if (v.id === "shared") return !prefixes.some((p) => t.key.startsWith(p));
              return t.key.startsWith(v.prefix!);
            }).length
            : 0,
        }))}
        selectedId={active.id}
        basePath="/admin/templates"
        label="Copy set"
        countNoun="templates"
      />
      <p className="mt-2 text-sm text-slate-600">
        NULL tenant = global default. Non-null tenant = override for that tenant.
        Edits are audit-logged (PRD §11.12).
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Team keys are prefixed <code className="font-mono">team_</code>. The team
        assessment uses a <code className="font-mono">team_</code> key when one
        exists and falls back to the shared key otherwise — so you only need to
        override the wording that actually differs.
      </p>
      {!result.ok ? (
        <DbStatusBanner />
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Used by</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Locale</th>
              <th className="px-3 py-2">Body</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const isTeam = t.key.startsWith("team_");
              return (
                <tr key={t.id} className="border-b align-top">
                  <td className="px-3 py-2 font-mono">{t.key}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                        (isTeam ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700")
                      }
                    >
                      {isTeam ? "Team" : "Shared"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{t.tenantId ?? <em className="text-slate-400">global</em>}</td>
                  <td className="px-3 py-2">{t.locale}</td>
                  <td className="max-w-2xl px-3 py-2">
                    <TemplateEditor
                      row={{ id: t.id, key: t.key, tenantId: t.tenantId, locale: t.locale, body: t.body }}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">
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
