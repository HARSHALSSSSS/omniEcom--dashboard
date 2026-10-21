-- Product creation flow: tenant isolation, updated_at triggers, grants, brand backfill (see 0014).
SELECT enable_tenant_rls('product_creation');
--> statement-breakpoint
SELECT enable_tenant_rls('brands');
--> statement-breakpoint
SELECT enable_tenant_rls('product_ai_suggestions');
--> statement-breakpoint
SELECT attach_updated_at('product_creation');
--> statement-breakpoint
SELECT attach_updated_at('brands');
--> statement-breakpoint
SELECT attach_updated_at('product_ai_suggestions');
--> statement-breakpoint
INSERT INTO brands (vendor_id, name, name_key, confirmed_at)
SELECT DISTINCT ON (vendor_id, lower(regexp_replace(btrim(brand), '\s+', ' ', 'g'))) vendor_id, btrim(brand), lower(regexp_replace(btrim(brand), '\s+', ' ', 'g')), now()
FROM products WHERE brand IS NOT NULL AND btrim(brand) <> '' AND length(btrim(brand)) <= 80 AND deleted_at IS NULL
ORDER BY vendor_id, lower(regexp_replace(btrim(brand), '\s+', ' ', 'g')), created_at
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oms_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oms_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO oms_app;
    GRANT EXECUTE ON FUNCTION inventory_ledger_drift(uuid) TO oms_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM oms_app;
    REVOKE UPDATE, TRUNCATE ON inventory_movements, order_status_events, fulfillment_events, shipment_tracking_events, return_events, rule_executions, price_history, issue_events, return_inspections FROM oms_app;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON permissions, role_permissions FROM oms_app;
  END IF;
END $$;
--> statement-breakpoint
