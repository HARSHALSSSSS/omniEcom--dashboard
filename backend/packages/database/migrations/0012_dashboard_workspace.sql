CREATE TABLE "inventory_group_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_groups_vendor_id_id_uq" UNIQUE("vendor_id","id")
);
--> statement-breakpoint
CREATE TABLE "issue_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_type" text DEFAULT 'system' NOT NULL,
	"actor_id" text,
	"note" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_events_type_chk" CHECK (type IN ('detected', 'updated', 'started', 'snoozed', 'unsnoozed', 'resolved', 'reopened', 'assigned', 'auto_resolved', 'resolution_failed'))
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"key" text NOT NULL,
	"scope_hash" text DEFAULT '' NOT NULL,
	"area" text NOT NULL,
	"priority" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"impact" text,
	"count" integer DEFAULT 0 NOT NULL,
	"affected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"recommended_action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snoozed_until" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" text,
	"assigned_to" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "issues_priority_chk" CHECK (priority IN ('critical', 'high', 'medium', 'low')),
	CONSTRAINT "issues_status_chk" CHECK (status IN ('open', 'in_progress', 'snoozed', 'resolved')),
	CONSTRAINT "issues_area_chk" CHECK (area IN ('orders', 'inventory', 'listings', 'channels', 'returns', 'shipping', 'products')),
	CONSTRAINT "issues_count_chk" CHECK (count >= 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace_sla" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"marketplace" text NOT NULL,
	"warehouse_id" uuid,
	"handling_hours" integer DEFAULT 24 NOT NULL,
	"cutoff_time" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_sla_hours_chk" CHECK (handling_hours BETWEEN 1 AND 720),
	CONSTRAINT "marketplace_sla_cutoff_chk" CHECK (cutoff_time IS NULL OR cutoff_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "return_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"return_order_id" uuid NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" text NOT NULL,
	"system_condition" text DEFAULT 'receipt_matched' NOT NULL,
	"note" text,
	"inspector_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_inspections_result_chk" CHECK (result IN ('pass', 'fail', 'needs_review'))
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"screen" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" text,
	"shared" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "saved_views_screen_chk" CHECK (screen IN ('products', 'inventory', 'orders', 'returns'))
);
--> statement-breakpoint
CREATE TABLE "shipping_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_type_chk";--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_nonzero_chk";--> statement-breakpoint
ALTER TABLE "return_items" DROP CONSTRAINT "return_items_disposition_chk";--> statement-breakpoint
ALTER TABLE "return_orders" DROP CONSTRAINT "return_orders_refund_chk";--> statement-breakpoint
ALTER TABLE "business_rules" DROP CONSTRAINT "business_rules_type_chk";--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "lead_time_days" integer;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "quantity_quarantined" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dispatch_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "delta_quarantined" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "ship_method_kind" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "ship_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "ship_selected_by" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "ship_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "ship_recommendation" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_shipping_providers" ADD COLUMN "kind" text DEFAULT 'third_party' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_shipping_providers" ADD COLUMN "channel_code" text;--> statement-breakpoint
ALTER TABLE "vendor_shipping_providers" ADD COLUMN "verification" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_shipping_providers" ADD COLUMN "supported_order_types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "refund_currency" char(3);--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "refund_source" text;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "refund_error" text;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "inspection_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "inspector_id" uuid;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "inspection_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_group_items" ADD CONSTRAINT "inventory_group_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_group_items" ADD CONSTRAINT "inventory_group_items_group_fk" FOREIGN KEY ("vendor_id","group_id") REFERENCES "public"."inventory_groups"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_group_items" ADD CONSTRAINT "inventory_group_items_variant_fk" FOREIGN KEY ("vendor_id","variant_id") REFERENCES "public"."product_variants"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_groups" ADD CONSTRAINT "inventory_groups_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_issue_fk" FOREIGN KEY ("vendor_id","issue_id") REFERENCES "public"."issues"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_sla" ADD CONSTRAINT "marketplace_sla_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_sla" ADD CONSTRAINT "marketplace_sla_warehouse_fk" FOREIGN KEY ("vendor_id","warehouse_id") REFERENCES "public"."warehouses"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_return_fk" FOREIGN KEY ("vendor_id","return_order_id") REFERENCES "public"."return_orders"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_snapshots" ADD CONSTRAINT "shipping_snapshots_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_group_items_vendor_group_idx" ON "inventory_group_items" USING btree ("vendor_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_group_items_uq" ON "inventory_group_items" USING btree ("group_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_groups_name_uq" ON "inventory_groups" USING btree ("vendor_id","name");--> statement-breakpoint
CREATE INDEX "issue_events_issue_idx" ON "issue_events" USING btree ("vendor_id","issue_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "issues_detector_uq" ON "issues" USING btree ("vendor_id","key","scope_hash");--> statement-breakpoint
CREATE INDEX "issues_vendor_status_idx" ON "issues" USING btree ("vendor_id","status","priority","due_at");--> statement-breakpoint
CREATE INDEX "issues_vendor_area_idx" ON "issues" USING btree ("vendor_id","area","status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_sla_uq" ON "marketplace_sla" USING btree ("vendor_id","marketplace",coalesce("warehouse_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "return_inspections_return_idx" ON "return_inspections" USING btree ("vendor_id","return_order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_name_uq" ON "saved_views" USING btree ("vendor_id","screen","created_by","name");--> statement-breakpoint
CREATE INDEX "saved_views_vendor_screen_idx" ON "saved_views" USING btree ("vendor_id","screen");--> statement-breakpoint
CREATE INDEX "shipping_snapshots_vendor_idx" ON "shipping_snapshots" USING btree ("vendor_id","taken_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_vendor_dispatch_due_idx" ON "orders" USING btree ("vendor_id","dispatch_due_at");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_lead_time_chk" CHECK (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 365);--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_quarantined_chk" CHECK (quantity_quarantined >= 0);--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_type_chk" CHECK (type IN ('receive', 'adjust', 'reserve', 'release', 'commit', 'return_in', 'return_restock', 'damage', 'undamage', 'incoming_add', 'incoming_receive', 'transfer_out', 'transfer_in', 'count', 'quarantine', 'quarantine_release'));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_nonzero_chk" CHECK (delta_on_hand <> 0 OR delta_reserved <> 0 OR delta_incoming <> 0 OR delta_damaged <> 0 OR delta_returned <> 0 OR delta_quarantined <> 0);--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_ship_kind_chk" CHECK (ship_method_kind IS NULL OR ship_method_kind IN ('marketplace', 'seller', 'third_party'));--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_ship_by_chk" CHECK (ship_selected_by IS NULL OR ship_selected_by IN ('rule', 'preference', 'manual'));--> statement-breakpoint
ALTER TABLE "vendor_shipping_providers" ADD CONSTRAINT "vendor_shipping_providers_kind_chk" CHECK (kind IN ('marketplace', 'seller', 'third_party'));--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_disposition_chk" CHECK (disposition IS NULL OR disposition IN ('restock', 'damaged', 'dispose', 'return_to_vendor', 'quarantine', 'rejected', 'repair'));--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_inspection_chk" CHECK (inspection_status IN ('not_started', 'in_progress', 'passed', 'failed', 'requires_review'));--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_refund_source_chk" CHECK (refund_source IS NULL OR refund_source IN ('connector', 'manual'));--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_refund_chk" CHECK (refund_status IN ('not_applicable', 'pending', 'ready', 'processing', 'processed', 'failed'));--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_type_chk" CHECK (type IN ('pricing', 'stock', 'marketplace', 'fulfillment', 'notification', 'shipping'));