-- Backend readiness: tenant isolation, updated_at triggers, grants (see 0018).
SELECT enable_tenant_rls('vendor_gstins');
--> statement-breakpoint
SELECT enable_tenant_rls('suppliers');
--> statement-breakpoint
SELECT enable_tenant_rls('supplier_products');
--> statement-breakpoint
SELECT enable_tenant_rls('purchase_orders');
--> statement-breakpoint
SELECT enable_tenant_rls('purchase_order_lines');
--> statement-breakpoint
SELECT enable_tenant_rls('purchase_order_receipts');
--> statement-breakpoint
SELECT enable_tenant_rls('pricing_policies');
--> statement-breakpoint
SELECT enable_tenant_rls('competitor_prices');
--> statement-breakpoint
SELECT enable_tenant_rls('price_proposals');
--> statement-breakpoint
SELECT enable_tenant_rls('promotion_campaigns');
--> statement-breakpoint
SELECT enable_tenant_rls('promotion_items');
--> statement-breakpoint
SELECT enable_tenant_rls('report_schedules');
--> statement-breakpoint
SELECT enable_tenant_rls('report_runs');
--> statement-breakpoint
SELECT enable_tenant_rls('import_sessions');
--> statement-breakpoint
SELECT enable_tenant_rls('import_rows');
--> statement-breakpoint
SELECT enable_tenant_rls('import_issues');
--> statement-breakpoint
SELECT enable_tenant_rls('ai_conversations');
--> statement-breakpoint
SELECT enable_tenant_rls('ai_messages');
--> statement-breakpoint
SELECT enable_tenant_rls('marketing_spend');
--> statement-breakpoint
SELECT attach_updated_at('vendor_gstins');
--> statement-breakpoint
SELECT attach_updated_at('suppliers');
--> statement-breakpoint
SELECT attach_updated_at('supplier_products');
--> statement-breakpoint
SELECT attach_updated_at('purchase_orders');
--> statement-breakpoint
SELECT attach_updated_at('purchase_order_lines');
--> statement-breakpoint
SELECT attach_updated_at('purchase_order_receipts');
--> statement-breakpoint
SELECT attach_updated_at('pricing_policies');
--> statement-breakpoint
SELECT attach_updated_at('competitor_prices');
--> statement-breakpoint
SELECT attach_updated_at('price_proposals');
--> statement-breakpoint
SELECT attach_updated_at('promotion_campaigns');
--> statement-breakpoint
SELECT attach_updated_at('promotion_items');
--> statement-breakpoint
SELECT attach_updated_at('report_schedules');
--> statement-breakpoint
SELECT attach_updated_at('report_runs');
--> statement-breakpoint
SELECT attach_updated_at('import_sessions');
--> statement-breakpoint
SELECT attach_updated_at('import_rows');
--> statement-breakpoint
SELECT attach_updated_at('import_issues');
--> statement-breakpoint
SELECT attach_updated_at('ai_conversations');
--> statement-breakpoint
SELECT attach_updated_at('ai_messages');
--> statement-breakpoint
SELECT attach_updated_at('marketing_spend');
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
