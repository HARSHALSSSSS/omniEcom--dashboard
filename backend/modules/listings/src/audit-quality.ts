import { and, asc, eq, inArray, isNull, schema, type Tx } from '@oms/database';

/**
 * The two catalogue-quality health groups of the readiness audit that the per-listing readiness checklist does not cover:
 *  - Variants: how complete the variants of the listing's product are
 *  - Compliance: the legal / marketplace compliance fields (HSN, GST, origin, manufacturer, weight, MRP)
 * Computed from the master catalogue and the listing, never invented. Pure rules at the top, the loader at the bottom.
 */

const P = schema.products;
const V = schema.productVariants;
const DOC = schema.productDocuments;
const L = schema.marketplaceListings;

export interface VariantFacts {
  id: string; sku: string; barcode: string | null; optionValues: Record<string, string>; sellingPriceMinor: number | null; imageCount: number;
  /** accounts that have a listing for this variant */
  listedOn: string[];
}
export interface ProductFacts {
  hsnCode: string | null; gstRateBps: number | null; countryOfOrigin: string | null; manufacturer: string | null; brand: string | null; weightGrams: number | null;
  /** product-level images (shared by the variants that have none of their own) */
  imageCount: number;
  variants: Array<VariantFacts & { taxRateBps: number | null; weightGrams: number | null }>;
}
/** what the compliance rules need from the listing itself */
export interface ListingQualityInput { accountId: string; variantId: string; priceMinor: number | null; mrpMinor: number | null; attributesChecked: boolean; missingAttributes: string[] }

/** a check scores a share (0..1) so "3 of 4 variants have a barcode" counts for 0.75, not for fail */
export interface QualityCheck { key: string; label: string; ratio: number }
export interface QualityGroup { key: 'variants' | 'compliance'; checks: QualityCheck[]; unchecked: boolean }

const filled = (s: string | null | undefined): boolean => Boolean(s && s.trim());
const share = (n: number, of: number): number => (of === 0 ? 1 : n / of);

/** the variants of the product: options set, SKU, barcode, price, an image per variant, every variant listed on the listing's account */
export function variantChecks(p: ProductFacts, accountId: string): QualityCheck[] {
  const vs = p.variants;
  if (vs.length === 0) return [];
  const multi = vs.length > 1;
  const checks: QualityCheck[] = [];
  // options only tell variants apart when there is more than one
  if (multi) checks.push({ key: 'options', label: 'Options set', ratio: share(vs.filter((v) => Object.values(v.optionValues).some((x) => filled(x))).length, vs.length) });
  checks.push({ key: 'sku', label: 'SKU', ratio: share(vs.filter((v) => filled(v.sku)).length, vs.length) });
  checks.push({ key: 'barcode', label: 'Barcode', ratio: share(vs.filter((v) => filled(v.barcode)).length, vs.length) });
  checks.push({ key: 'price', label: 'Price', ratio: share(vs.filter((v) => (v.sellingPriceMinor ?? 0) > 0).length, vs.length) });
  // one variant: the product images are its images; several: each variant needs its own (or the product has shared images and the variant none)
  checks.push({ key: 'image', label: multi ? 'Image per variant' : 'Image', ratio: share(vs.filter((v) => v.imageCount > 0 || (!multi && p.imageCount > 0)).length, vs.length) });
  if (multi) checks.push({ key: 'listed', label: 'All variants listed', ratio: share(vs.filter((v) => v.listedOn.includes(accountId)).length, vs.length) });
  return checks;
}

/** legal / marketplace compliance of one listing */
export function complianceChecks(p: ProductFacts, l: ListingQualityInput): QualityCheck[] {
  const v = p.variants.find((x) => x.id === l.variantId);
  const yes = (ok: boolean): number => (ok ? 1 : 0);
  const checks: QualityCheck[] = [
    { key: 'hsn', label: 'HSN code', ratio: yes(filled(p.hsnCode)) },
    { key: 'gst', label: 'GST rate', ratio: yes(p.gstRateBps !== null || (v?.taxRateBps ?? null) !== null) },
    { key: 'origin', label: 'Country of origin', ratio: yes(filled(p.countryOfOrigin)) },
    { key: 'manufacturer', label: 'Manufacturer or brand', ratio: yes(filled(p.manufacturer) || filled(p.brand)) },
    { key: 'weight', label: 'Weight', ratio: yes((v?.weightGrams ?? p.weightGrams ?? 0) > 0) },
    { key: 'mrp', label: 'MRP', ratio: yes((l.mrpMinor ?? 0) > 0) },
  ];
  if ((l.mrpMinor ?? 0) > 0 && (l.priceMinor ?? 0) > 0) checks.push({ key: 'price_within_mrp', label: 'Price within MRP', ratio: yes((l.priceMinor ?? 0) <= (l.mrpMinor ?? 0)) });
  // the category's required attributes: only what the last validation proved
  if (l.attributesChecked) checks.push({ key: 'category_attributes', label: 'Category compliance attributes', ratio: yes(l.missingAttributes.length === 0) });
  return checks;
}

export interface QualityScore { key: 'variants' | 'compliance'; label: string; scorePct: number; listings: number; checks: number; unchecked: number }
const LABEL = { variants: 'Variants', compliance: 'Compliance' } as const;

/** average of the check ratios over every listing; `unchecked` = listings whose category attributes were not validated (compliance only) */
export function qualityScores(perListing: Array<{ variants: QualityCheck[]; compliance: QualityCheck[]; attributesChecked: boolean }>): QualityScore[] {
  const out: QualityScore[] = [];
  for (const key of ['variants', 'compliance'] as const) {
    let sum = 0; let checks = 0; let listings = 0; let unchecked = 0;
    for (const x of perListing) {
      const cs = x[key];
      if (key === 'compliance' && !x.attributesChecked) unchecked += 1;
      if (!cs.length) continue;
      listings += 1;
      for (const c of cs) { checks += 1; sum += c.ratio; }
    }
    if (checks === 0) continue;
    out.push({ key, label: LABEL[key], scorePct: Math.round((100 * sum) / checks), listings, checks, unchecked });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// loader: a fixed number of queries per chunk of products
// ------------------------------------------------------------------------------------------------
const CHUNK = 200;

export async function loadProductFacts(tx: Tx, vendorId: string, productIds: string[]): Promise<Map<string, ProductFacts>> {
  const out = new Map<string, ProductFacts>();
  const ids = [...new Set(productIds)];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const products = await tx.select({
      id: P.id, hsnCode: P.hsnCode, gstRateBps: P.gstRateBps, countryOfOrigin: P.countryOfOrigin, manufacturer: P.manufacturer, brand: P.brand, weightGrams: P.weightGrams,
    }).from(P).where(and(eq(P.vendorId, vendorId), inArray(P.id, chunk), isNull(P.deletedAt)));
    const variants = await tx.select({
      id: V.id, productId: V.productId, sku: V.sku, barcode: V.barcode, optionValues: V.optionValues, sellingPriceMinor: V.sellingPriceMinor, taxRateBps: V.taxRateBps, weightGrams: V.weightGrams,
    }).from(V).where(and(eq(V.vendorId, vendorId), inArray(V.productId, chunk), isNull(V.deletedAt), eq(V.status, 'active'))).orderBy(asc(V.createdAt), asc(V.id));
    const docs = await tx.select({ productId: DOC.productId, variantId: DOC.variantId }).from(DOC)
      .where(and(eq(DOC.vendorId, vendorId), inArray(DOC.productId, chunk), eq(DOC.kind, 'image'), isNull(DOC.deletedAt), inArray(DOC.status, ['uploaded', 'processed'])));
    const variantIds = variants.map((v) => v.id);
    const listings = variantIds.length
      ? await tx.select({ variantId: L.variantId, accountId: L.marketplaceAccountId }).from(L).where(and(eq(L.vendorId, vendorId), inArray(L.variantId, variantIds)))
      : [];
    const listedOn = new Map<string, string[]>();
    for (const l of listings) listedOn.set(l.variantId, [...(listedOn.get(l.variantId) ?? []), l.accountId]);
    const variantImages = new Map<string, number>();
    const productImages = new Map<string, number>();
    for (const d of docs) {
      if (d.variantId) variantImages.set(d.variantId, (variantImages.get(d.variantId) ?? 0) + 1);
      else productImages.set(d.productId, (productImages.get(d.productId) ?? 0) + 1);
    }
    for (const p of products) {
      out.set(p.id, {
        hsnCode: p.hsnCode, gstRateBps: p.gstRateBps, countryOfOrigin: p.countryOfOrigin, manufacturer: p.manufacturer, brand: p.brand, weightGrams: p.weightGrams,
        imageCount: productImages.get(p.id) ?? 0,
        variants: variants.filter((v) => v.productId === p.id).map((v) => ({
          id: v.id, sku: v.sku, barcode: v.barcode, optionValues: v.optionValues, sellingPriceMinor: v.sellingPriceMinor, taxRateBps: v.taxRateBps, weightGrams: v.weightGrams,
          imageCount: variantImages.get(v.id) ?? 0, listedOn: listedOn.get(v.id) ?? [],
        })),
      });
    }
  }
  return out;
}
