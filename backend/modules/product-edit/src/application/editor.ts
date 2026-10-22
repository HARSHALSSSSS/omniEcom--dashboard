import { sql, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { buildEditorProduct, isCodeLocked, listingStatusOf, productContent, rollupStatus, type ChannelNameFn, type ProductRow } from '@oms/mod-catalog';
import type { CategoryAttributeField, CustomAttribute } from '@oms/mod-catalog';
import { ALL_CONTENT_FIELDS } from '../domain/diff';
import { productListingContentSummary, type ListingImpact, type ListingOpts } from '../infrastructure/listings-port';
import { imageHref, loadImages, type ImageDoc } from './images';
import { groupChannels, previewListings } from './impact';
import { currentInsights } from './insights';

/**
 * `GET /products/{id}/edit`: everything the editing page needs in ONE call (docs/figma/50-edit-product-flow-analysis.md): the product, the
 * baseline `version`, the master-code lock, header meta, nav counts, the attribute counter, media thumbnails, which channels inherit what, the
 * readiness panel and the suggested improvements. Reads only; a handful of batched queries (no per-listing or per-image loops).
 */
export const INHERITANCE_TEXT = 'Changes to core product information may be reflected across connected listings. Marketplace-specific content remains independently manageable.';
export const ATTRIBUTES_NOTE = 'Attribute values were not supplied in the existing product record. Confirm factual and tax details before distributing them.';
export const CODE_LOCK_REASON = 'Used as the primary internal product identifier.';

const NAV: Array<{ key: string; label: string }> = [
  { key: 'overview', label: 'Overview' }, { key: 'media', label: 'Media' }, { key: 'details', label: 'Details' }, { key: 'variants', label: 'Variants' },
  { key: 'inventory', label: 'Inventory' }, { key: 'listings', label: 'Listings' }, { key: 'content', label: 'Content' }, { key: 'activity', label: 'Activity' },
];

const SLOTS = [
  { key: 'material', label: 'Material' }, { key: 'dimensions', label: 'Dimensions' }, { key: 'weight', label: 'Weight' },
  { key: 'countryOfOrigin', label: 'Country of origin' }, { key: 'hsnCode', label: 'HSN code' }, { key: 'taxInformation', label: 'Tax information' },
] as const;

/** E9: supplied slots among the six core facts, plus the confirmed custom attributes */
export function attributesPanel(p: ProductRow, categoryFields: CategoryAttributeField[] = []) {
  const supplied: Record<(typeof SLOTS)[number]['key'], boolean> = {
    material: !!p.material, dimensions: p.lengthMm != null && p.widthMm != null && p.heightMm != null, weight: p.weightGrams != null,
    countryOfOrigin: !!p.countryOfOrigin, hsnCode: !!p.hsnCode, taxInformation: p.gstRateBps != null,
  };
  const slots = SLOTS.map((s) => ({ key: s.key, label: s.label, supplied: supplied[s.key] }));
  const custom = ((p.customAttributes ?? []) as CustomAttribute[]).filter((a) => a.confirmed).length;
  const categorySlots = categoryFields.map((f) => ({ attributeId: f.attributeId, label: f.name, supplied: f.value !== null && f.value !== '', isRequired: f.isRequired }));
  const configured = slots.filter((s) => s.supplied).length + categorySlots.filter((s) => s.supplied).length + custom;
  return { configured, customConfirmed: custom, slots, categorySlots, note: slots.some((s) => !s.supplied) || categorySlots.some((s) => !s.supplied) ? ATTRIBUTES_NOTE : null };
}

const HUMAN: Record<string, string> = { hsn_code: 'HSN code', gst_rate_bps: 'GST rate', country_of_origin: 'country of origin', brand: 'brand', category: 'category' };

export async function buildReadiness(tx: Tx, vendorId: string, p: ProductRow, names: ChannelNameFn) {
  const [content, summary] = await Promise.all([productContent(tx, vendorId, p.id, names), productListingContentSummary(tx, vendorId, p.id)]);
  const state = (key: string) => content.readiness.fields.find((f) => f.key === key)?.state;
  const base = `/products/${p.id}`;
  const missingAttributes = content.masterAttributes.filter((a) => a.state !== 'complete' && !['title', 'description'].includes(a.attribute)).map((a) => HUMAN[a.attribute] ?? a.attribute.replace(/_/g, ' '));
  const open = summary.needsReview + summary.needsRepublish + summary.failed + summary.rejected;
  const items = [
    {
      key: 'core_information' as const, label: 'Core information', state: state('title') === 'complete' && state('description') === 'complete' ? ('done' as const) : ('pending' as const),
      ...(state('title') === 'complete' && state('description') === 'complete' ? {} : { detail: 'Add a descriptive product name and description.', action: { label: 'Edit', href: `${base}?tab=overview` } }),
    },
    {
      key: 'product_media' as const, label: 'Product media', state: state('images') === 'complete' ? ('done' as const) : ('pending' as const),
      ...(state('images') === 'complete' ? {} : { detail: 'Add at least one product image.', action: { label: 'Manage media', href: `${base}?tab=media` } }),
    },
    {
      key: 'required_attributes' as const, label: 'Required attributes', state: state('attributes') === 'complete' ? ('done' as const) : ('pending' as const),
      ...(state('attributes') === 'complete' ? {} : { detail: missingAttributes.length ? `Missing: ${missingAttributes.join(', ')}.` : 'Some required attributes are missing.', action: { label: 'Add', href: `${base}?tab=details` } }),
    },
    {
      key: 'marketplace_content' as const, label: 'Marketplace content', state: open === 0 ? ('done' as const) : ('pending' as const),
      ...(open === 0 ? {} : { detail: `${open} marketplace ${open === 1 ? 'listing needs' : 'listings need'} content review.`, action: { label: 'Review', href: `${base}?tab=listings` } }),
    },
  ];
  return { percent: content.readiness.pct, items, listings: summary };
}
export type EditReadiness = Awaited<ReturnType<typeof buildReadiness>>;

async function updatedByOf(tx: Tx, vendorId: string, productId: string): Promise<{ id: string; name: string } | null> {
  const res = await tx.execute(sql`
    select u.id::text as id, u.full_name as name from audit_logs a
    join users u on u.id::text = a.actor_id
    where a.vendor_id = ${vendorId} and a.resource_type = 'product' and a.resource_id = ${productId} and a.actor_type = 'user'
    order by a.id desc limit 1`);
  const row = (res.rows as Array<{ id: string; name: string }>)[0];
  return row ? { id: row.id, name: row.name } : null;
}

export function mediaPanel(images: ImageDoc[]) {
  return {
    primaryImageUrl: images[0] ? imageHref(images[0].id) : null,
    thumbnails: images.slice(0, 3).map((i) => ({ id: i.id, url: imageHref(i.id), isPrimary: i.isPrimary, isPlaceholder: i.isPlaceholder })),
    total: images.length,
  };
}

export function inheritancePanel(impacts: ListingImpact[], limited = false) {
  const channels = groupChannels(impacts).map((c) => {
    const mine = impacts.filter((l) => l.accountId === c.accountId);
    return {
      code: c.code, name: c.name, accountId: c.accountId, listingId: c.listingId, listings: c.listings,
      listingStatus: rollupStatus(mine.map((l) => listingStatusOf({ status: l.listingStatus }))),
      independentFields: c.independentFields,
    };
  });
  return { channels, text: INHERITANCE_TEXT, limited };
}

export async function buildEditor(tx: Tx, vendorId: string, p: ProductRow, names: ChannelNameFn, opts: ListingOpts) {
  const images = await loadImages(tx, vendorId, p.id);
  const [product, updatedBy, preview, readiness, insights] = await Promise.all([
    buildEditorProduct(tx, vendorId, p),
    updatedByOf(tx, vendorId, p.id),
    // a product with more listings than one call may process shows no channel panel (the read must not fail): `inheritance.limited`
    previewListings(tx, vendorId, p.id, { fields: ALL_CONTENT_FIELDS }, opts).then((i) => ({ impacts: i, limited: false }), (e: unknown) => {
      if (e instanceof AppError && e.code === 'PAYLOAD_TOO_LARGE') return { impacts: [] as ListingImpact[], limited: true };
      throw e;
    }),
    buildReadiness(tx, vendorId, p, names),
    currentInsights(tx, vendorId, p, { images }),
  ]);
  const locked = isCodeLocked(p.status);
  const counts: Record<string, number> = { media: images.length, variants: product.variantCount, listings: readiness.listings.total };
  return {
    product,
    version: p.version,
    status: p.status as 'draft' | 'active' | 'archived',
    locks: { productCode: { locked, reason: locked ? CODE_LOCK_REASON : null } },
    meta: { productId: p.productCode, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), updatedBy },
    nav: NAV.map((n) => (counts[n.key] !== undefined ? { ...n, count: counts[n.key]! } : n)),
    attributes: attributesPanel(p, product.categoryAttributes),
    media: mediaPanel(images),
    inheritance: inheritancePanel(preview.impacts, preview.limited),
    readiness,
    insights: insights.items,
    dismissedInsights: insights.dismissed.map((d) => ({ key: d.key, dismissedAt: d.dismissedAt, until: d.until })),
  };
}
export type EditorDto = Awaited<ReturnType<typeof buildEditor>>;
