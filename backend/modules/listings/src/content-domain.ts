import { stableHash } from './domain';

/**
 * Pure rules of "master content -> listings" (no I/O, unit-tested through the API tests of the content sync).
 *
 * A listing INHERITS the master product's content except for the fields its channel overrides in
 * `product_marketplace_data(productId, marketplace).data`. The per-listing content hash covers exactly the inherited fields,
 * so a change to a field the channel overrides never moves the hash (and never touches the listing).
 */
export const CONTENT_FIELDS = ['title', 'description', 'brand', 'category', 'productType', 'material', 'dimensions', 'weight', 'countryOfOrigin', 'hsnCode', 'gstRate', 'customAttributes', 'tags'] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

export interface ProductChange { fields: ContentField[]; category?: { fromId: string | null; toId: string | null } }

export interface ListingImpact {
  listingId: string; variantId: string; sku: string; accountId: string; accountName: string; marketplace: string; marketplaceName: string;
  listingStatus: string; live: boolean; supportsUpdate: boolean;
  /** channel overrides (never overwritten) */
  independentFields: ContentField[];
  /** changed fields this listing inherits */
  inheritedFields: ContentField[];
  effect: 'inherited' | 'independent' | 'may_need_remapping' | 'not_live' | 'unaffected';
  /** only for category changes */
  mappingState?: 'mapped' | 'needs_review';
  suggestedMarketplaceCategoryId?: string | null;
  suggestedMarketplaceCategoryName?: string | null;
}

export type PlanState = 'sync_pending' | 'needs_review' | 'needs_republish' | 'independent' | 'unchanged' | 'not_live';

/** listings that exist on the marketplace and are shown to buyers (or being reviewed there) */
export const LIVE_STATUSES = ['active', 'pending'] as const;
export const isLive = (status: string): boolean => (LIVE_STATUSES as readonly string[]).includes(status);

/** hard bound on the work of one call: a product with more listings than this is refused (413) instead of being half processed */
export const MAX_LISTINGS_PER_PRODUCT = 500;

export const CHANNEL_NAMES: Record<string, string> = { amazon_in: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', snapdeal: 'Snapdeal', mock: 'Sandbox marketplace' };

// ------------------------------------------------------------------------------------------------
// master content (what a listing may inherit)
// ------------------------------------------------------------------------------------------------
export interface MasterContent {
  title: string; description: string | null; brand: string | null; manufacturer: string | null; categoryId: string | null; productType: string | null; material: string | null;
  lengthMm: number | null; widthMm: number | null; heightMm: number | null; weightGrams: number | null; countryOfOrigin: string | null; hsnCode: string | null; gstRateBps: number | null;
  customAttributes: Array<{ name: string; value: string; confirmed: boolean }>; tags: string[];
}

export interface ProductContentSource {
  title: string; description: string | null; brand: string | null; manufacturer: string | null; categoryId: string | null; attributes: Record<string, unknown> | null; material: string | null;
  lengthMm: number | null; widthMm: number | null; heightMm: number | null; weightGrams: number | null; countryOfOrigin: string | null; hsnCode: string | null; gstRateBps: number | null;
  customAttributes: Array<{ name: string; value: string; confirmed: boolean }> | null; tags: string[] | null;
}

export function masterContentOf(p: ProductContentSource): MasterContent {
  const pt = p.attributes && typeof p.attributes.productType === 'string' ? p.attributes.productType : null;
  return {
    title: p.title, description: p.description, brand: p.brand, manufacturer: p.manufacturer, categoryId: p.categoryId, productType: pt, material: p.material,
    lengthMm: p.lengthMm, widthMm: p.widthMm, heightMm: p.heightMm, weightGrams: p.weightGrams, countryOfOrigin: p.countryOfOrigin, hsnCode: p.hsnCode, gstRateBps: p.gstRateBps,
    customAttributes: p.customAttributes ?? [], tags: p.tags ?? [],
  };
}

/** value of one content field as it is hashed. Unsupplied facts are null; unconfirmed custom attributes are never inherited (E8). */
export function fieldValue(m: MasterContent, f: ContentField): unknown {
  switch (f) {
    case 'title': return m.title;
    case 'description': return m.description ?? null;
    case 'brand': return { brand: m.brand ?? null, manufacturer: m.manufacturer ?? null };
    case 'category': return m.categoryId;
    case 'productType': return m.productType;
    case 'material': return m.material ?? null;
    case 'dimensions': return m.lengthMm === null && m.widthMm === null && m.heightMm === null ? null : { l: m.lengthMm, w: m.widthMm, h: m.heightMm };
    case 'weight': return m.weightGrams;
    case 'countryOfOrigin': return m.countryOfOrigin ?? null;
    case 'hsnCode': return m.hsnCode ?? null;
    case 'gstRate': return m.gstRateBps;
    case 'customAttributes': return m.customAttributes.filter((a) => a.confirmed).map((a) => ({ name: a.name.trim().toLowerCase(), value: a.value })).sort((a, b) => a.name.localeCompare(b.name));
    case 'tags': return [...m.tags].sort();
  }
}

/** Stable hash of the master content a listing inherits (every field except the ones the channel overrides). */
export function inheritedContentHash(m: MasterContent, independent: Iterable<ContentField>): string {
  const skip = new Set(independent);
  const out: Record<string, unknown> = {};
  for (const f of CONTENT_FIELDS) if (!skip.has(f)) out[f] = fieldValue(m, f);
  return stableHash(out);
}

// ------------------------------------------------------------------------------------------------
// channel overrides (product_marketplace_data)
// ------------------------------------------------------------------------------------------------
const norm = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** key (normalised: lower-case, letters and digits only) -> the master field it overrides */
const ALIASES: Record<string, ContentField> = {
  title: 'title',
  description: 'description', bullets: 'description', bulletpoints: 'description',
  brand: 'brand',
  material: 'material', producttype: 'productType',
  dimensions: 'dimensions', dimension: 'dimensions', length: 'dimensions', width: 'dimensions', height: 'dimensions',
  weight: 'weight', weightgrams: 'weight',
  countryoforigin: 'countryOfOrigin', country: 'countryOfOrigin', origin: 'countryOfOrigin',
  hsncode: 'hsnCode', hsn: 'hsnCode',
  gstrate: 'gstRate', gst: 'gstRate', tax: 'gstRate', taxinformation: 'gstRate',
  tags: 'tags', searchterms: 'tags', keywords: 'tags',
};

export const hasValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(hasValue);
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
};

/**
 * The master fields this channel manages itself. Keys of `data` that name a content field (title, description, bullets/bullet_points = description,
 * brand, material, ...) and every non-empty entry of `data.attributes` count; an attribute whose name is not one of the known facts
 * is a custom attribute. Marketplace identifiers (fsn, vertical, category ids ...) are not content and are ignored.
 */
export function overriddenFields(data: Record<string, unknown> | null | undefined): ContentField[] {
  const out = new Set<ContentField>();
  if (!data || typeof data !== 'object') return [];
  for (const [k, v] of Object.entries(data)) {
    if (k === 'attributes') continue;
    const f = ALIASES[norm(k)];
    if (f && hasValue(v)) out.add(f);
  }
  const attrs = data.attributes;
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (!hasValue(v)) continue;
      out.add(ALIASES[norm(k)] ?? 'customAttributes');
    }
  }
  return CONTENT_FIELDS.filter((f) => out.has(f));
}

const scalar = (v: unknown): string | number | boolean | null => {
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) { const parts = v.filter((x) => typeof x === 'string' || typeof x === 'number').map((x) => String(x).trim()).filter(Boolean); return parts.length ? parts.join('\n') : null; }
  return null;
};

export interface ChannelOverrides { title?: string; description?: string; brand?: string; attributes: Record<string, string | number | boolean> }

/** the values a channel overrides, in the shape of the listing input (the builder applies them on top of the master content) */
export function channelOverrides(data: Record<string, unknown> | null | undefined): ChannelOverrides {
  const out: ChannelOverrides = { attributes: {} };
  if (!data || typeof data !== 'object') return out;
  const title = scalar(data.title);
  if (typeof title === 'string') out.title = title;
  const description = scalar(data.description);
  const bullets = scalar(data.bullets ?? data.bullet_points ?? data.bulletPoints);
  if (typeof description === 'string') out.description = description;
  else if (typeof bullets === 'string') out.description = bullets;
  const brand = scalar(data.brand);
  if (typeof brand === 'string') out.brand = brand;
  for (const [k, v] of Object.entries(data)) {
    const f = ALIASES[norm(k)];
    if (!f || ['title', 'description', 'brand'].includes(f) || k === 'attributes') continue;
    const s = scalar(v);
    if (s !== null) out.attributes[k] = s;
  }
  const attrs = data.attributes;
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) { const s = scalar(v); if (s !== null) out.attributes[k] = s; }
  return out;
}

// ------------------------------------------------------------------------------------------------
// product.updated payload -> content fields
// ------------------------------------------------------------------------------------------------
const EVENT_FIELD: Record<string, ContentField> = {
  title: 'title', description: 'description', descriptionHtml: 'description', brand: 'brand', manufacturer: 'brand', categoryId: 'category', category: 'category',
  productType: 'productType', attributes: 'productType', material: 'material', lengthMm: 'dimensions', widthMm: 'dimensions', heightMm: 'dimensions', dimensions: 'dimensions',
  weightGrams: 'weight', weight: 'weight', countryOfOrigin: 'countryOfOrigin', hsnCode: 'hsnCode', gstRateBps: 'gstRate', gstRate: 'gstRate',
  customAttributes: 'customAttributes', attributeValues: 'customAttributes', tags: 'tags',
};

/** `payload.fields` of product.updated (column names of the product patch, or ContentField names) -> content fields; unknown names (status, productCode ...) are not content */
export function mapEventFields(keys: unknown): ContentField[] {
  if (!Array.isArray(keys)) return [];
  const out = new Set<ContentField>();
  for (const k of keys) if (typeof k === 'string' && EVENT_FIELD[k]) out.add(EVENT_FIELD[k]!);
  return CONTENT_FIELDS.filter((f) => out.has(f));
}

/** fields of a change including the category when it carries a category move */
export function changeFields(change: ProductChange): ContentField[] {
  const set = new Set<ContentField>(change.fields.filter((f) => (CONTENT_FIELDS as readonly string[]).includes(f)));
  if (change.category) set.add('category');
  return CONTENT_FIELDS.filter((f) => set.has(f));
}

export const unionFields = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];
