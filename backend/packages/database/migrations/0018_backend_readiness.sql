CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_conversations_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "ai_conversations_status_chk" CHECK (status IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"intent" text,
	"confidence" text,
	"generated_by" text,
	"data" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_messages_role_chk" CHECK (role IN ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "competitor_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"account_id" uuid,
	"price_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"seller_name" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_prices_source_chk" CHECK (source IN ('manual', 'import', 'api')),
	CONSTRAINT "competitor_prices_price_chk" CHECK (price_minor > 0)
);
--> statement-breakpoint
CREATE TABLE "import_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"code" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"field" text,
	"message" text NOT NULL,
	"value" text,
	"suggestion" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" jsonb,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_issues_severity_chk" CHECK (severity IN ('error', 'warning')),
	CONSTRAINT "import_issues_status_chk" CHECK (status IN ('open', 'resolved', 'ignored'))
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"product_code" text,
	"sku" text,
	"product_id" uuid,
	"variant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_rows_status_chk" CHECK (status IN ('pending', 'valid', 'warning', 'error', 'ignored', 'committed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "import_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"source" text DEFAULT 'csv' NOT NULL,
	"file_name" text,
	"file_size_bytes" bigint,
	"input_key" text,
	"status" text DEFAULT 'created' NOT NULL,
	"headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"warning_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"ignored_rows" integer DEFAULT 0 NOT NULL,
	"committed_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_message" text,
	"requested_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_sessions_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "import_sessions_source_chk" CHECK (source IN ('csv', 'xlsx', 'tsv', 'shopify', 'amazon', 'flipkart', 'marketplace', 'erp')),
	CONSTRAINT "import_sessions_status_chk" CHECK (status IN ('created', 'uploaded', 'analyzed', 'validating', 'validated', 'committing', 'committed', 'partially_committed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "marketing_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"account_id" uuid,
	"spend_date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"campaign" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_spend_amount_chk" CHECK (amount_minor >= 0),
	CONSTRAINT "marketing_spend_source_chk" CHECK (source IN ('manual', 'import', 'api'))
);
--> statement-breakpoint
CREATE TABLE "pricing_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid,
	"strategy" text NOT NULL,
	"target_margin_min_bps" integer DEFAULT 0 NOT NULL,
	"max_discount_bps" integer DEFAULT 0 NOT NULL,
	"auto_approve_under_bps" integer DEFAULT 0 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_policies_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "pricing_policies_strategy_chk" CHECK (strategy IN ('automated_match', 'margin_floor', 'velocity_boost', 'custom')),
	CONSTRAINT "pricing_policies_status_chk" CHECK (status IN ('active', 'paused')),
	CONSTRAINT "pricing_policies_bps_chk" CHECK (target_margin_min_bps BETWEEN 0 AND 10000 AND max_discount_bps BETWEEN 0 AND 10000 AND auto_approve_under_bps BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "price_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"policy_id" uuid,
	"strategy" text NOT NULL,
	"current_price_minor" bigint NOT NULL,
	"proposed_price_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"competitor_price_minor" bigint,
	"est_margin_delta_bps" integer,
	"projected_sales_delta_bps" integer,
	"reasoning" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"expires_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"applied_at" timestamp with time zone,
	"failure_message" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_proposals_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "price_proposals_status_chk" CHECK (status IN ('pending_review', 'approved', 'rejected', 'auto_applied', 'expired', 'superseded', 'failed')),
	CONSTRAINT "price_proposals_strategy_chk" CHECK (strategy IN ('automated_match', 'margin_floor', 'velocity_boost', 'custom')),
	CONSTRAINT "price_proposals_price_chk" CHECK (current_price_minor > 0 AND proposed_price_minor > 0)
);
--> statement-breakpoint
CREATE TABLE "promotion_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"value_bps" integer,
	"value_minor" bigint,
	"buy_quantity" integer,
	"get_quantity" integer,
	"min_order_minor" bigint DEFAULT 0 NOT NULL,
	"budget_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spend_minor" bigint DEFAULT 0 NOT NULL,
	"revenue_minor" bigint DEFAULT 0 NOT NULL,
	"units_moved" integer DEFAULT 0 NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"stats_updated_at" timestamp with time zone,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "promotion_campaigns_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "promotion_campaigns_type_chk" CHECK (type IN ('percentage_discount', 'flat_discount', 'bogo', 'bundle')),
	CONSTRAINT "promotion_campaigns_status_chk" CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'cancelled')),
	CONSTRAINT "promotion_campaigns_window_chk" CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
	CONSTRAINT "promotion_campaigns_amounts_chk" CHECK (min_order_minor >= 0 AND budget_minor >= 0 AND spend_minor >= 0 AND revenue_minor >= 0 AND units_moved >= 0 AND orders_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "promotion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"original_price_minor" bigint NOT NULL,
	"promo_price_minor" bigint NOT NULL,
	"status" text DEFAULT 'eligible' NOT NULL,
	"reason" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_items_status_chk" CHECK (status IN ('eligible', 'pending_sync', 'live', 'ineligible', 'ended')),
	CONSTRAINT "promotion_items_price_chk" CHECK (original_price_minor > 0 AND promo_price_minor > 0 AND promo_price_minor <= original_price_minor)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"quantity_damaged" integer DEFAULT 0 NOT NULL,
	"unit_cost_minor" bigint NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_lines_qty_chk" CHECK (quantity_ordered > 0 AND quantity_received >= 0 AND quantity_damaged >= 0 AND quantity_damaged <= quantity_received AND unit_cost_minor >= 0 AND total_minor >= 0 AND tax_rate_bps >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"received_by" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"po_number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order_date" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"shipping_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"payment_terms" text,
	"reference" text,
	"notes" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"inbound_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "purchase_orders_status_chk" CHECK (status IN ('draft', 'submitted', 'acknowledged', 'partially_received', 'received', 'cancelled')),
	CONSTRAINT "purchase_orders_amounts_chk" CHECK (subtotal_minor >= 0 AND tax_minor >= 0 AND shipping_minor >= 0 AND total_minor >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"schedule_id" uuid,
	"report_type" text NOT NULL,
	"format" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"file_key" text,
	"file_name" text,
	"size_bytes" bigint,
	"row_count" integer,
	"error" text,
	"requested_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_runs_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "report_runs_status_chk" CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "report_runs_format_chk" CHECK (format IN ('csv', 'xlsx', 'pdf')),
	CONSTRAINT "report_runs_trigger_chk" CHECK (trigger IN ('manual', 'schedule'))
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"report_type" text NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"frequency" text NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"time_of_day" text DEFAULT '06:00' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"next_run_at" timestamp with time zone,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_schedules_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "report_schedules_format_chk" CHECK (format IN ('csv', 'xlsx', 'pdf')),
	CONSTRAINT "report_schedules_frequency_chk" CHECK (frequency IN ('daily', 'weekly', 'monthly')),
	CONSTRAINT "report_schedules_status_chk" CHECK (status IN ('active', 'paused'))
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"supplier_sku" text,
	"cost_minor" bigint NOT NULL,
	"lead_time_days" integer,
	"min_order_quantity" integer DEFAULT 1 NOT NULL,
	"is_preferred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_products_cost_chk" CHECK (cost_minor >= 0 AND min_order_quantity >= 1)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"gstin" text,
	"city" text,
	"state" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payment_terms" text,
	"lead_time_days" integer DEFAULT 7 NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "suppliers_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "suppliers_status_chk" CHECK (status IN ('active', 'inactive', 'blocked')),
	CONSTRAINT "suppliers_lead_time_chk" CHECK (lead_time_days >= 0 AND lead_time_days <= 365)
);
--> statement-breakpoint
CREATE TABLE "vendor_gstins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"gstin" text NOT NULL,
	"state_code" char(2) NOT NULL,
	"state_name" text NOT NULL,
	"legal_name" text,
	"trade_name" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"verified_at" timestamp with time zone,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_gstins_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "vendor_gstins_status_chk" CHECK (status IN ('active', 'inactive', 'cancelled')),
	CONSTRAINT "vendor_gstins_format_chk" CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);
--> statement-breakpoint
ALTER TABLE "marketplace_accounts" DROP CONSTRAINT "marketplace_accounts_marketplace_chk";--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "cin" text;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_fk" FOREIGN KEY ("vendor_id","conversation_id") REFERENCES "public"."ai_conversations"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_prices" ADD CONSTRAINT "competitor_prices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_prices" ADD CONSTRAINT "competitor_prices_variant_fk" FOREIGN KEY ("vendor_id","variant_id") REFERENCES "public"."product_variants"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_prices" ADD CONSTRAINT "competitor_prices_account_fk" FOREIGN KEY ("vendor_id","account_id") REFERENCES "public"."marketplace_accounts"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_session_fk" FOREIGN KEY ("vendor_id","session_id") REFERENCES "public"."import_sessions"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_session_fk" FOREIGN KEY ("vendor_id","session_id") REFERENCES "public"."import_sessions"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_spend" ADD CONSTRAINT "marketing_spend_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_spend" ADD CONSTRAINT "marketing_spend_account_fk" FOREIGN KEY ("vendor_id","account_id") REFERENCES "public"."marketplace_accounts"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_policies" ADD CONSTRAINT "pricing_policies_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_policies" ADD CONSTRAINT "pricing_policies_account_fk" FOREIGN KEY ("vendor_id","account_id") REFERENCES "public"."marketplace_accounts"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_proposals" ADD CONSTRAINT "price_proposals_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_proposals" ADD CONSTRAINT "price_proposals_variant_fk" FOREIGN KEY ("vendor_id","variant_id") REFERENCES "public"."product_variants"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_proposals" ADD CONSTRAINT "price_proposals_account_fk" FOREIGN KEY ("vendor_id","account_id") REFERENCES "public"."marketplace_accounts"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_campaign_fk" FOREIGN KEY ("vendor_id","campaign_id") REFERENCES "public"."promotion_campaigns"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_variant_fk" FOREIGN KEY ("vendor_id","variant_id") REFERENCES "public"."product_variants"("vendor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_fk" FOREIGN KEY ("vendor_id","purchase_order_id") REFERENCES "public"."purchase_orders"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_variant_fk" FOREIGN KEY ("vendor_id","variant_id") REFERENCES "public"."product_variants"("vendor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_po_fk" FOREIGN KEY ("vendor_id","purchase_order_id") REFERENCES "public"."purchase_orders"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("vendor_id","supplier_id") REFERENCES "public"."suppliers"("vendor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_fk" FOREIGN KEY ("vendor_id","warehouse_id") REFERENCES "public"."warehouses"("vendor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_schedule_fk" FOREIGN KEY ("vendor_id","schedule_id") REFERENCES "public"."report_schedules"("vendor_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_fk" FOREIGN KEY ("vendor_id","supplier_id") REFERENCES "public"."suppliers"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_variant_fk" FOREIGN KEY ("vendor_id","variant_id") REFERENCES "public"."product_variants"("vendor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_gstins" ADD CONSTRAINT "vendor_gstins_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_user_idx" ON "ai_conversations" USING btree ("vendor_id","user_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("vendor_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "competitor_prices_variant_idx" ON "competitor_prices" USING btree ("vendor_id","variant_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "import_issues_session_idx" ON "import_issues" USING btree ("vendor_id","session_id","status","row_number");--> statement-breakpoint
CREATE INDEX "import_issues_code_idx" ON "import_issues" USING btree ("vendor_id","session_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_uq" ON "import_rows" USING btree ("session_id","row_number");--> statement-breakpoint
CREATE INDEX "import_rows_status_idx" ON "import_rows" USING btree ("vendor_id","session_id","status");--> statement-breakpoint
CREATE INDEX "import_sessions_vendor_idx" ON "import_sessions" USING btree ("vendor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "marketing_spend_vendor_date_idx" ON "marketing_spend" USING btree ("vendor_id","spend_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pricing_policies_vendor_idx" ON "pricing_policies" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "price_proposals_vendor_status_idx" ON "price_proposals" USING btree ("vendor_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "price_proposals_variant_idx" ON "price_proposals" USING btree ("vendor_id","variant_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_proposals_open_uq" ON "price_proposals" USING btree ("vendor_id","variant_id","account_id") WHERE "price_proposals"."status" = 'pending_review';--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_campaigns_code_uq" ON "promotion_campaigns" USING btree ("vendor_id",lower("code")) WHERE "promotion_campaigns"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "promotion_campaigns_vendor_status_idx" ON "promotion_campaigns" USING btree ("vendor_id","status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_items_uq" ON "promotion_items" USING btree ("campaign_id","variant_id");--> statement-breakpoint
CREATE INDEX "promotion_items_variant_idx" ON "promotion_items" USING btree ("vendor_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_lines_uq" ON "purchase_order_lines" USING btree ("purchase_order_id","variant_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_vendor_idx" ON "purchase_order_lines" USING btree ("vendor_id","purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_variant_idx" ON "purchase_order_lines" USING btree ("vendor_id","variant_id");--> statement-breakpoint
CREATE INDEX "purchase_order_receipts_po_idx" ON "purchase_order_receipts" USING btree ("vendor_id","purchase_order_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_uq" ON "purchase_orders" USING btree ("vendor_id","po_number");--> statement-breakpoint
CREATE INDEX "purchase_orders_vendor_status_idx" ON "purchase_orders" USING btree ("vendor_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("vendor_id","supplier_id");--> statement-breakpoint
CREATE INDEX "report_runs_vendor_idx" ON "report_runs" USING btree ("vendor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "report_runs_schedule_idx" ON "report_runs" USING btree ("vendor_id","schedule_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "report_schedules_vendor_idx" ON "report_schedules" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "report_schedules_due_idx" ON "report_schedules" USING btree ("next_run_at") WHERE "report_schedules"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_products_uq" ON "supplier_products" USING btree ("supplier_id","variant_id");--> statement-breakpoint
CREATE INDEX "supplier_products_variant_idx" ON "supplier_products" USING btree ("vendor_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_uq" ON "suppliers" USING btree ("vendor_id",lower("code")) WHERE "suppliers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "suppliers_vendor_status_idx" ON "suppliers" USING btree ("vendor_id","status","name");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_gstins_gstin_uq" ON "vendor_gstins" USING btree ("vendor_id","gstin");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_gstins_primary_uq" ON "vendor_gstins" USING btree ("vendor_id") WHERE "vendor_gstins"."is_primary";--> statement-breakpoint
CREATE INDEX "vendor_gstins_vendor_idx" ON "vendor_gstins" USING btree ("vendor_id","state_code");--> statement-breakpoint
ALTER TABLE "marketplace_accounts" ADD CONSTRAINT "marketplace_accounts_marketplace_chk" CHECK (marketplace IN ('amazon_in', 'flipkart', 'myntra', 'snapdeal', 'shopify', 'meesho', 'mock'));