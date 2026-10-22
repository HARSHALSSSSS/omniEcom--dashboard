/**
 * The product types a master product can have. Stored in `products.attributes.productType` (default `physical`); the database guards the
 * stored value with `products_type_chk` (migration 0022). `bundle` is the "Bundle / Kit" of the product editor: it is sold as one item, has
 * variants and stock like a physical product, and is never treated as shipped-as-separate-parts by the catalog.
 */
export const PRODUCT_TYPES = ['physical', 'digital', 'service', 'bundle'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const DEFAULT_PRODUCT_TYPE: ProductType = 'physical';

/** the type stored on a product row (unknown / missing values read as the default) */
export function productTypeOfAttributes(attributes: unknown): ProductType {
  const raw = attributes && typeof attributes === 'object' ? (attributes as Record<string, unknown>).productType : undefined;
  return (PRODUCT_TYPES as readonly unknown[]).includes(raw) ? (raw as ProductType) : DEFAULT_PRODUCT_TYPE;
}
