CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_vendor_id_id_uq" UNIQUE("vendor_id","id"),
	CONSTRAINT "brands_name_chk" CHECK (length(name) BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "product_ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"source_text" text DEFAULT '' NOT NULL,
	"suggestion_text" text NOT NULL,
	"basis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"needs_facts" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT 'rules' NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_ai_suggestions_mode_chk" CHECK (mode IN ('rewrite', 'concise', 'benefits')),
	CONSTRAINT "product_ai_suggestions_status_chk" CHECK (status IN ('suggested', 'applied', 'dismissed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "product_creation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"current_step" text DEFAULT 'basic' NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_is_placeholder" boolean DEFAULT false NOT NULL,
	"sku_verified_code" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_creation_step_chk" CHECK (current_step IN ('basic', 'variants', 'inventory', 'listings', 'channels'))
);
--> statement-breakpoint
ALTER TABLE "product_documents" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description_html" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "material" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "standard_category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "custom_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ai_suggestions" ADD CONSTRAINT "product_ai_suggestions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ai_suggestions" ADD CONSTRAINT "product_ai_suggestions_product_fk" FOREIGN KEY ("vendor_id","product_id") REFERENCES "public"."products"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_creation" ADD CONSTRAINT "product_creation_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_creation" ADD CONSTRAINT "product_creation_product_fk" FOREIGN KEY ("vendor_id","product_id") REFERENCES "public"."products"("vendor_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_uq" ON "brands" USING btree ("vendor_id","name_key");--> statement-breakpoint
CREATE INDEX "product_ai_suggestions_product_idx" ON "product_ai_suggestions" USING btree ("vendor_id","product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "product_creation_product_uq" ON "product_creation" USING btree ("vendor_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_vendor_code_ci_uq" ON "products" USING btree ("vendor_id",lower("product_code")) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_physical_chk" CHECK ((length_mm IS NULL OR length_mm BETWEEN 1 AND 100000) AND (width_mm IS NULL OR width_mm BETWEEN 1 AND 100000) AND (height_mm IS NULL OR height_mm BETWEEN 1 AND 100000) AND (weight_grams IS NULL OR weight_grams BETWEEN 1 AND 10000000));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_material_chk" CHECK (material IS NULL OR length(material) <= 80);