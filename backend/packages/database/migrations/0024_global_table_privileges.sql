-- Global reference tables are shared by every tenant and have no vendor_id / RLS, so privileges are their only protection.
--   permissions, role_permissions : the catalogue and the system roles' grants are seed data (owner role: `db:migrate` + `db:seed`).
--                                   The runtime role may read them, never change them (a SQL-injection or app bug must not be able to grant itself permissions).
--   plans, feature_flags          : platform staff edit them through the API (PUT /billing/plans/{code}, /platform/feature-flags), so INSERT/UPDATE stay
--                                   with the runtime role; nothing deletes them, so DELETE/TRUNCATE are revoked.
-- Runs as the owner. The runtime role is created outside the migrations (infrastructure/postgres/init.sql or IaC), hence the guard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oms_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON permissions, role_permissions FROM oms_app;
    REVOKE DELETE, TRUNCATE ON plans, feature_flags FROM oms_app;
  END IF;
END $$;
