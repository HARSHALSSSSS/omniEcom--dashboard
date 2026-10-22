import { and, desc, eq, inArray, isNull, schema, withVendor, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { channelOverrides } from './content-domain';
import type { Ctx } from './ctx';
import { joined } from './service';
import { searchMarketplaceCategories } from './mappings';
import { marketplaceNameOf } from './workspace-data';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const C = schema.categories;
const CM = schema.categoryMappings;
const DOC = schema.productDocuments;
const PMD = schema.productMarketplaceData;

export type CompletenessStatus = 'pass' | 'warn' | 'fail';
export interface CompletenessRow { key: 'title' | 'images' | 'sku' | 'category' | 'weight'; label: string; status: CompletenessStatus; detail: string; field: string | null }

const SEP = ' > ';

/** "Fashion > Apparel" + "Apparel" -> "Fashion > Apparel"; "Fashion" + "Apparel" -> "Fashion > Apparel" */
export function joinCategoryPath(path: string | null | undefined, name: string | null | undefined): string | null {
  const p = path?.trim() || null;
  const n = name?.trim() || null;
  if (p && n) return p.toLowerCase().endsWith(n.toLowerCase()) ? p : `${p}${SEP}${n}`;
  return p ?? n;
}

/** the seller's own category with the names of its parents: "Apparel > Tops > Shirts" */
export async function masterCategoryPath(tx: Tx, vendorId: string, categoryId: string | null): Promise<{ name: string | null; path: string | null }> {
  const names: string[] = [];
  let id: string | null = categoryId;
  for (let depth = 0; id && depth < 12; depth++) {
    const [row] = await tx.select({ name: C.name, parentId: C.parentId }).from(C).where(and(eq(C.vendorId, vendorId), eq(C.id, id)));
    if (!row) break;
    names.unshift(row.name);
    id = row.parentId;
  }
  return { name: names.at(-1) ?? null, path: names.length ? names.join(SEP) : null };
}

/**
 * What the blocker screen and the quick view add to the studio: the full category paths (marketplace and master), the variant count and the
 * fixed completeness list (Title, Images, SKU, Category, Weight), each computed from the real data of the listing.
 */
export async function listingFlowDetails(ctx: Ctx, listingId: string) {
  const { vendorId, c } = ctx;
  const base = await withVendor(c.database.db, vendorId, async (tx) => {
    const [row] = await joined(tx, vendorId, eq(L.id, listingId));
    if (!row) throw Errors.notFound('Listing', listingId);
    const [v] = await tx.select().from(V).where(and(eq(V.id, row.l.variantId), eq(V.vendorId, vendorId)));
    const [p] = await tx.select().from(P).where(and(eq(P.id, row.productId), eq(P.vendorId, vendorId)));
    const [a] = await tx.select().from(A).where(and(eq(A.id, row.l.marketplaceAccountId), eq(A.vendorId, vendorId)));
    if (!v || !p || !a) throw Errors.notFound('Listing', listingId);
    const siblings = await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), eq(V.productId, p.id), isNull(V.deletedAt)));
    const [md] = await tx.select({ data: PMD.data }).from(PMD).where(and(eq(PMD.vendorId, vendorId), eq(PMD.productId, p.id), eq(PMD.marketplace, a.marketplace)));
    const images = await tx.select({ id: DOC.id }).from(DOC)
      .where(and(eq(DOC.vendorId, vendorId), eq(DOC.productId, p.id), eq(DOC.kind, 'image'), isNull(DOC.deletedAt), inArray(DOC.status, ['uploaded', 'processed']))).orderBy(desc(DOC.isPrimary)).limit(50);
    const master = await masterCategoryPath(tx, vendorId, p.categoryId);
    const categoryId = row.l.marketplaceCategoryId;
    const [mapping] = categoryId
      ? await tx.select({ name: CM.marketplaceCategoryName, path: CM.marketplaceCategoryPath }).from(CM)
        .where(and(eq(CM.vendorId, vendorId), eq(CM.marketplace, a.marketplace), eq(CM.marketplaceCategoryId, categoryId))).limit(1)
      : [];
    return { row, v, p, a, variantsCount: siblings.length, data: md?.data ?? {}, imageCount: images.length, master, mapping: mapping ?? null };
  });

  const { row, v, p, a } = base;
  const categoryId = row.l.marketplaceCategoryId;
  let mpName = base.mapping?.name ?? null;
  let mpPath = base.mapping?.path ?? null;
  // the marketplace's own tree (a network read, never a failure of the page) when no mapping carries the path
  if (categoryId && !mpPath && a.status === 'active') {
    try {
      const hit = (await searchMarketplaceCategories(c, vendorId, a.id)).find((x) => x.id === categoryId)
        ?? (await searchMarketplaceCategories(c, vendorId, a.id, categoryId)).find((x) => x.id === categoryId);
      if (hit) { mpName = mpName ?? hit.name; mpPath = hit.path ?? null; }
    } catch (e) { if (!(e instanceof AppError)) throw e; }
  }
  const marketplacePath = categoryId ? joinCategoryPath(mpPath, mpName) : null;
  const marketplaceName = marketplaceNameOf(c.connectors, a.marketplace);
  const categoryName = mpName ?? base.master.name;

  const title = (channelOverrides(base.data).title ?? p.title).trim();
  const grams = v.weightGrams ?? p.weightGrams;
  const requiresCategory = c.connectors.get(a.marketplace).capabilities.listings.requiresCategoryMapping;
  const completeness: CompletenessRow[] = [
    title.length >= 3 ? { key: 'title', label: 'Title', status: 'pass', detail: title, field: 'title' } : { key: 'title', label: 'Title', status: 'fail', detail: 'The listing needs a title of at least 3 characters', field: 'title' },
    base.imageCount > 0
      ? { key: 'images', label: 'Images', status: 'pass', detail: `${base.imageCount} image${base.imageCount === 1 ? '' : 's'}`, field: 'images' }
      : { key: 'images', label: 'Images', status: 'warn', detail: 'No product images: the marketplace may reject or suppress the listing', field: 'images' },
    v.sku.trim() ? { key: 'sku', label: 'SKU', status: 'pass', detail: v.sku, field: 'sku' } : { key: 'sku', label: 'SKU', status: 'fail', detail: 'The variant has no SKU', field: 'sku' },
    categoryId
      ? { key: 'category', label: 'Category', status: 'pass', detail: marketplacePath ?? categoryName ?? categoryId, field: 'category' }
      : { key: 'category', label: 'Category', status: requiresCategory ? 'fail' : 'warn', detail: requiresCategory ? 'Map this product to a marketplace category first' : 'No marketplace category chosen', field: 'category' },
    grams !== null && grams !== undefined
      ? { key: 'weight', label: 'Weight', status: 'pass', detail: grams >= 1000 ? `${Number((grams / 1000).toFixed(3))} kg` : `${grams} g`, field: 'weight' }
      : { key: 'weight', label: 'Weight', status: 'warn', detail: 'No weight on the variant or the product: marketplaces use it for shipping fees', field: 'weight' },
  ];

  return {
    listingId, productId: p.id, variantId: v.id, sku: v.sku, variantsCount: base.variantsCount, marketplace: a.marketplace, marketplaceName,
    category: {
      marketplaceCategoryId: categoryId,
      marketplaceName: categoryId ? categoryName : null,
      marketplacePath,
      masterName: base.master.name,
      masterPath: base.master.path,
      /** the one to show: the marketplace path, else the seller's own category path */
      fullPath: marketplacePath ?? base.master.path,
      /** "Amazon Apparel": the marketplace and the name of its category */
      channelCategory: categoryName ? `${marketplaceName} ${categoryName}` : null,
    },
    completeness,
  };
}
