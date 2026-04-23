-- Row-level security (PRD §9.1). Applied in addition to the app-layer tenant
-- filters. Intended to be layered on after `prisma migrate dev` creates the
-- base tables — run with `psql $DATABASE_URL -f prisma/migrations/20260420_rls_stubs.sql`.
--
-- Requires the application to SET LOCAL app.current_tenant_id = '<cuid>' at
-- the start of each request transaction (wrap Prisma in a $transaction hook).

-- Guard role — super admin bypasses RLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'innergy_app') THEN
    CREATE ROLE innergy_app NOLOGIN;
  END IF;
END $$;

ALTER TABLE "Tenant"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Answer"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Result"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageTemplate"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantCoach"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantInstrument" ENABLE ROW LEVEL SECURITY;

-- Generic tenant-match policy. Applied to every table that carries tenant_id.
-- Super admin bypass: set app.is_super_admin = 'true' in the session.

CREATE POLICY tenant_isolation_user ON "User"
  FOR ALL
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );

CREATE POLICY tenant_isolation_session ON "Session"
  FOR ALL
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );

CREATE POLICY tenant_isolation_result ON "Result"
  FOR ALL
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );

CREATE POLICY tenant_isolation_notif ON "Notification"
  FOR ALL
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );

CREATE POLICY tenant_isolation_event ON "Event"
  FOR ALL
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- NOTE: MessageTemplate has tenantId nullable (global defaults). Allow
-- global rows to be read by everyone; only tenant-specific overrides are scoped.
CREATE POLICY tenant_isolation_msg_template ON "MessageTemplate"
  FOR ALL
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );
