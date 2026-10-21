-- Dashboard workspace: tenant isolation, updated_at triggers, append-only history, grants, ledger drift (quarantined), SLA backfill (see 0012).
SELECT enable_tenant_rls('issues');
--> statement-breakpoint
SELECT enable_tenant_rls('issue_events');
--> statement-breakpoint
SELECT enable_tenant_rls('saved_views');
--> statement-breakpoint
SELECT enable_tenant_rls('inventory_groups');
--> statement-breakpoint
SELECT enable_tenant_rls('inventory_group_items');
--> statement-breakpoint
SELECT enable_tenant_rls('marketplace_sla');
--> statement-breakpoint
SELECT enable_tenant_rls('return_inspections');
--> statement-breakpoint
SELECT enable_tenant_rls('shipping_snapshots');
--> statement-breakpoint
SELECT attach_updated_at('issues');
--> statement-breakpoint
SELECT attach_updated_at('saved_views');
--> statement-breakpoint
SELECT attach_updated_at('inventory_groups');
--> statement-breakpoint
SELECT attach_updated_at('marketplace_sla');
--> statement-breakpoint
CREATE TRIGGER issue_events_append_only BEFORE UPDATE OR DELETE ON issue_events FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
--> statement-breakpoint
CREATE TRIGGER return_inspections_append_only BEFORE UPDATE OR DELETE ON return_inspections FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
--> statement-breakpoint
DROP FUNCTION IF EXISTS inventory_ledger_drift(uuid);
--> statement-breakpoint
CREATE FUNCTION inventory_ledger_drift(p_vendor uuid)
RETURNS TABLE (variant_id uuid, warehouse_id uuid, on_hand int, ledger_on_hand bigint, reserved int, ledger_reserved bigint, incoming int, ledger_incoming bigint, damaged int, ledger_damaged bigint, returned int, ledger_returned bigint, quarantined int, ledger_quarantined bigint)
LANGUAGE sql STABLE AS $$
  WITH m AS (
    SELECT im.variant_id, im.warehouse_id, sum(delta_on_hand) oh, sum(delta_reserved) rs, sum(delta_incoming) inc, sum(delta_damaged) dm, sum(delta_returned) rt, sum(delta_quarantined) qt
    FROM inventory_movements im WHERE im.vendor_id = p_vendor GROUP BY im.variant_id, im.warehouse_id
  ), i AS (SELECT * FROM inventory WHERE vendor_id = p_vendor)
  SELECT coalesce(i.variant_id, m.variant_id), coalesce(i.warehouse_id, m.warehouse_id),
         coalesce(i.quantity_on_hand, 0), coalesce(m.oh, 0)::bigint,
         coalesce(i.quantity_reserved, 0), coalesce(m.rs, 0)::bigint,
         coalesce(i.quantity_incoming, 0), coalesce(m.inc, 0)::bigint,
         coalesce(i.quantity_damaged, 0), coalesce(m.dm, 0)::bigint,
         coalesce(i.quantity_returned, 0), coalesce(m.rt, 0)::bigint,
         coalesce(i.quantity_quarantined, 0), coalesce(m.qt, 0)::bigint
  FROM i FULL JOIN m ON m.variant_id = i.variant_id AND m.warehouse_id = i.warehouse_id
  WHERE coalesce(i.quantity_on_hand, 0) <> coalesce(m.oh, 0) OR coalesce(i.quantity_reserved, 0) <> coalesce(m.rs, 0)
     OR coalesce(i.quantity_incoming, 0) <> coalesce(m.inc, 0) OR coalesce(i.quantity_damaged, 0) <> coalesce(m.dm, 0)
     OR coalesce(i.quantity_returned, 0) <> coalesce(m.rt, 0) OR coalesce(i.quantity_quarantined, 0) <> coalesce(m.qt, 0)
$$;
--> statement-breakpoint
UPDATE orders SET dispatch_due_at = placed_at + interval '24 hours' WHERE dispatch_due_at IS NULL AND status NOT IN ('dispatched', 'in_transit', 'delivered', 'cancelled', 'returned');
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
