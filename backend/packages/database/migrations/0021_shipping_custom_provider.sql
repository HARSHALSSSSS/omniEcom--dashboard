-- Shipping: a seller-configured ("custom") logistics provider is its own provider kind (name, tracking link, optional tracking API, manual AWB entry).
ALTER TABLE "vendor_shipping_providers" DROP CONSTRAINT IF EXISTS "vendor_shipping_providers_kind_chk";--> statement-breakpoint
ALTER TABLE "vendor_shipping_providers" ADD CONSTRAINT "vendor_shipping_providers_kind_chk" CHECK (kind IN ('marketplace', 'seller', 'third_party', 'custom'));
