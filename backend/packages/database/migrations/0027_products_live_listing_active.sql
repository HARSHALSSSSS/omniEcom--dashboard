-- A product whose listing is live is not a draft: promote the draft products that already have a live (active) listing on a live variant.
-- Idempotent (only draft -> active; archived and active products are never touched; rerunning changes nothing).
-- (tables use FORCE ROW LEVEL SECURITY: the data fix runs in system scope, then the scope is cleared)
SELECT set_config('app.scope', 'system', false);--> statement-breakpoint
UPDATE "products" p SET "status" = 'active', "version" = p."version" + 1
WHERE p."status" = 'draft' AND p."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "product_variants" v
    JOIN "marketplace_listings" l ON l."variant_id" = v."id" AND l."vendor_id" = v."vendor_id"
    WHERE v."product_id" = p."id" AND v."vendor_id" = p."vendor_id" AND v."deleted_at" IS NULL AND l."status" = 'active'
  );--> statement-breakpoint
SELECT set_config('app.scope', '', false);
