-- Product edit flow: tenant isolation, updated_at triggers, grants (see 0016).
SELECT enable_tenant_rls('product_insight_dismissals');
--> statement-breakpoint
SELECT attach_updated_at('product_insight_dismissals');
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
