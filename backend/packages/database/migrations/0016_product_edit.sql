CREATE TABLE "product_insight_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"key" text NOT NULL,
	"dismissed_by" uuid,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "content_state" text DEFAULT 'synced' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "content_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "content_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "content_error" text;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "content_changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "content_review" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_insight_dismissals" ADD CONSTRAINT "product_insight_dismissals_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_insight_dismissals" ADD CONSTRAINT "product_insight_dismissals_product_fk" FOREIGN KEY ("vendor_id","product_id") REFERENCES "public"."products"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_insight_dismissals_uq" ON "product_insight_dismissals" USING btree ("vendor_id","product_id","key");--> statement-breakpoint
CREATE INDEX "product_insight_dismissals_product_idx" ON "product_insight_dismissals" USING btree ("vendor_id","product_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_content_state_idx" ON "marketplace_listings" USING btree ("vendor_id","content_state") WHERE "marketplace_listings"."content_state" <> 'synced';--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_content_state_chk" CHECK (content_state IN ('synced', 'sync_pending', 'needs_review', 'needs_republish', 'failed'));