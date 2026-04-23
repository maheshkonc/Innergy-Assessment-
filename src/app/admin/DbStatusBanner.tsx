// Shown on admin pages when a Prisma query throws — means the DB is
// unreachable (Docker down, DATABASE_URL wrong, schema not migrated).

export function DbStatusBanner() {
  return (
    <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="font-semibold">Database not reachable</div>
      <p className="mt-1">
        Bring Postgres up and initialise the schema + seed content:
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-amber-100 px-3 py-2 text-xs">{`docker-compose up -d            # starts postgres + redis
npx prisma migrate dev --name init
psql "$DATABASE_URL" -f prisma/migrations/20260420_rls_stubs.sql
npx tsx src/db/seed/index.ts    # seeds Innergy tenant + content`}</pre>
      <p className="mt-2 text-xs">
        On macOS, Docker Desktop must be running first. Then refresh this page.
      </p>
    </div>
  );
}
