-- Shipping: pickup slots (date + time window + parcel count for a shipping method / warehouse), scheduled with the provider or recorded as a manual booking.
CREATE TABLE "shipping_pickup_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"method_id" uuid NOT NULL,
	"provider_code" text NOT NULL,
	"slot_date" text NOT NULL,
	"window_start" text NOT NULL,
	"window_end" text NOT NULL,
	"parcel_count" integer NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"reference" text,
	"note" text,
	"created_by" text,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_pickup_slots_status_chk" CHECK (status IN ('requested', 'confirmed', 'manual', 'cancelled', 'failed')),
	CONSTRAINT "shipping_pickup_slots_mode_chk" CHECK (mode IN ('provider', 'manual')),
	CONSTRAINT "shipping_pickup_slots_parcels_chk" CHECK (parcel_count BETWEEN 1 AND 10000)
);
--> statement-breakpoint
ALTER TABLE "shipping_pickup_slots" ADD CONSTRAINT "shipping_pickup_slots_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_pickup_slots" ADD CONSTRAINT "shipping_pickup_slots_warehouse_fk" FOREIGN KEY ("vendor_id","warehouse_id") REFERENCES "public"."warehouses"("vendor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_pickup_slots" ADD CONSTRAINT "shipping_pickup_slots_method_fk" FOREIGN KEY ("vendor_id","method_id") REFERENCES "public"."vendor_shipping_providers"("vendor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_pickup_slots_vendor_idx" ON "shipping_pickup_slots" USING btree ("vendor_id","slot_date","window_start");--> statement-breakpoint
SELECT enable_tenant_rls('shipping_pickup_slots');
--> statement-breakpoint
SELECT attach_updated_at('shipping_pickup_slots');
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oms_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON shipping_pickup_slots TO oms_app;
  END IF;
END $$;
