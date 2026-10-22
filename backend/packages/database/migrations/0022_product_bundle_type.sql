-- Product type "bundle" (Bundle / Kit). The type lives in products.attributes->>'productType' (absent = physical); this constraint is the
-- database guard for the four values of the Edit product dropdown: physical, digital, service ("Service / Warranty") and bundle.
ALTER TABLE "products" ADD CONSTRAINT "products_type_chk" CHECK (("attributes" ->> 'productType') IS NULL OR ("attributes" ->> 'productType') IN ('physical', 'digital', 'service', 'bundle'));
