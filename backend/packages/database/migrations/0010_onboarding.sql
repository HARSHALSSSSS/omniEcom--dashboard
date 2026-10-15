CREATE TABLE "fulfillment_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"default_method" text DEFAULT 'marketplace' NOT NULL,
	"default_preference" text DEFAULT 'recommended' NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_preferences_method_chk" CHECK (default_method IN ('marketplace', 'seller', 'third_party')),
	CONSTRAINT "fulfillment_preferences_pref_chk" CHECK (default_preference IN ('recommended', 'fastest', 'lowest_cost', 'best_rated'))
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_step" text DEFAULT 'business' NOT NULL,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"drafts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"selected_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"catalog_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_status_chk" CHECK (status IN ('in_progress', 'completed')),
	CONSTRAINT "onboarding_progress_step_chk" CHECK (current_step IN ('business', 'channels', 'products', 'inventory', 'fulfillment', 'ready'))
);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "business_type" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "team_size" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "operating_location" text;--> statement-breakpoint
ALTER TABLE "fulfillment_preferences" ADD CONSTRAINT "fulfillment_preferences_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_preferences_vendor_uq" ON "fulfillment_preferences" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_progress_vendor_uq" ON "onboarding_progress" USING btree ("vendor_id");--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_business_type_chk" CHECK (business_type IS NULL OR business_type IN ('d2c_brand', 'marketplace_seller', 'retail', 'wholesaler', 'social_commerce', 'other'));--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_team_size_chk" CHECK (team_size IS NULL OR team_size IN ('just_me', '2_5', '6_20', '21_50', '50_plus'));