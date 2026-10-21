import { and, eq, inArray, isNull, schema, sql, type Tx } from '@oms/database';
import { brandStates } from './brands';
import { checkCode, nameKey, type ProductType } from './fields';
import type { ProductRow } from './service';

/**
 * Creation readiness: the checklist of the "Create product" right-hand panel (docs/figma/41-creation-build-brief.md section 3).
 * `evaluateCreationReadiness` is ONE pure function; the saved (GET) and the stateless (POST, unsaved form values) endpoints, the draft list and
 * the step validation all feed it the same input shape, so they can never disagree.
 */
export type ReadinessState = 'done' | 'pending' | 'verify' | 'confirm' | 'duplicate' | 'uploading' | 'placeholder';
export type ImageState = 'none' | 'uploading' | 'placeholder' | 'ready';
export type FixTarget = 'primary_image' | 'master_sku' | 'category' | 'product_name';
export const REQUIRED_KEYS = ['product_name', 'category', 'product_type', 'primary_image', 'master_sku'] as const;
export const RECOMMENDED_KEYS = ['description', 'brand', 'attributes'] as const;
export const READINESS_ITEMS = REQUIRED_KEYS.length + RECOMMENDED_KEYS.length;
export const CHAIN = ['Product', 'Variants', 'Inventory', 'Listings', 'Channels'] as const;
/** a pending_upload image counts as "uploading" for this long */
export const UPLOADING_WINDOW_MS = 30 * 60_000;

export interface ReadinessInput {
  title: string | null;
  categoryId: string | null;
  productType: ProductType | null;
  /** the candidate master code (saved or unsaved) */
  code: string | null;
  /** the code is the generated DRAFT-xxxx stand-in */
  codeIsPlaceholder: boolean;
  /** the code last checked for uniqueness (sku-check / validate-step / continue) */
  verifiedCode: string | null;
  /** another live product already has this code (ignoring case) */
  codeConflict: boolean;
  brand: string | null;
  brandConfirmed: boolean;
  descriptionText: string | null;
  customAttributeCount: number;
  /** product-level attributes the category requires, and how many of them have a value */
  categoryAttributes: { required: number; filled: number };
  image: ImageState;
  channels: Array<{ code: string; name: string }>;
}

export interface ReadinessItem { key: string; label: string; state: ReadinessState; tag?: string }
export interface Blocker { key: string; state: ReadinessState; message: string; fixTarget: FixTarget }
export interface CreationReadiness {
  percent: number;
  required: ReadinessItem[];
  recommended: ReadinessItem[];
  blockers: Blocker[];
  hints: string[];
  channels: Array<{ code: string; name: string }>;
  chain: string[];
}

const LABELS: Record<string, string> = {
  product_name: 'Product name', category: 'Category', product_type: 'Product type', primary_image: 'Primary image', master_sku: 'Master SKU',
  description: 'Description', brand: 'Brand', attributes: 'Attributes',
};
const TAGS: Partial<Record<ReadinessState, string>> = { verify: 'Verify', confirm: 'Confirm', duplicate: 'Duplicate', uploading: 'Uploading', placeholder: 'Placeholder' };
export const HINT_PENDING_TAGS = 'SKU and brand are entered; circles indicate pending verification or confirmation, not missing values.';

const MESSAGES: Record<string, Partial<Record<ReadinessState, string>>> = {
  product_name: { pending: 'Enter a product name of at least 3 characters.' },
  category: { pending: 'Select a category before publishing this product.' },
  primary_image: {
    pending: 'Add a primary image before publishing this product to marketplaces.',
    uploading: 'Primary image is uploading. Publication stays blocked until the upload completes.',
    placeholder: 'Replace the placeholder image before publishing.',
  },
  master_sku: { pending: 'Enter a Master SKU to replace the temporary draft code.', duplicate: 'Resolve the duplicate SKU to continue.' },
};
const FIX_TARGET: Record<string, FixTarget> = { product_name: 'product_name', category: 'category', primary_image: 'primary_image', master_sku: 'master_sku' };

const isReal = (code: string | null, placeholder: boolean) => !!code && !placeholder && checkCode(code).reason === null;

export function evaluateCreationReadiness(i: ReadinessInput): CreationReadiness {
  const state: Record<string, ReadinessState> = {};
  state.product_name = [...(i.title ?? '').trim()].length >= 3 ? 'done' : 'pending';
  state.category = i.categoryId ? 'done' : 'pending';
  state.product_type = 'done'; // always set (defaults to physical)
  state.primary_image = i.image === 'ready' ? 'done' : i.image === 'placeholder' ? 'placeholder' : i.image === 'uploading' ? 'uploading' : 'pending';
  state.master_sku = !isReal(i.code, i.codeIsPlaceholder) ? 'pending' : i.codeConflict ? 'duplicate' : i.verifiedCode !== null && i.verifiedCode === i.code ? 'done' : 'verify';
  state.description = [...(i.descriptionText ?? '').trim()].length >= 1 ? 'done' : 'pending';
  state.brand = !i.brand || i.brand.trim() === '' ? 'pending' : i.brandConfirmed ? 'done' : 'confirm';
  const attrs = i.customAttributeCount >= 1 || (i.categoryAttributes.required > 0 && i.categoryAttributes.filled >= i.categoryAttributes.required);
  state.attributes = attrs ? 'done' : 'pending';

  const item = (key: string): ReadinessItem => ({ key, label: LABELS[key]!, state: state[key]!, ...(TAGS[state[key]!] ? { tag: TAGS[state[key]!] } : {}) });
  const required = REQUIRED_KEYS.map(item);
  const recommended = RECOMMENDED_KEYS.map(item);
  const all = [...required, ...recommended];
  const counted = all.filter((x) => x.state === 'done' || x.state === 'placeholder').length;

  const blockers: Blocker[] = required
    .filter((x) => x.key !== 'product_type' && (x.state === 'pending' || x.state === 'duplicate' || x.state === 'uploading' || x.state === 'placeholder'))
    .map((x) => ({ key: x.key, state: x.state, message: MESSAGES[x.key]?.[x.state] ?? `${x.label} needs attention.`, fixTarget: FIX_TARGET[x.key]! }));

  const hints = all.some((x) => x.state === 'verify' || x.state === 'confirm') ? [HINT_PENDING_TAGS] : [];
  return { percent: Math.round((100 * counted) / READINESS_ITEMS), required, recommended, blockers, hints, channels: i.channels, chain: [...CHAIN] };
}

// ------------------------------------------------------------------------------------------------
// primary image state (same definition as GET /products/{id}/primary-image)
// ------------------------------------------------------------------------------------------------
export interface ImageDocLite { id: string; status: string; isPrimary: boolean; isPlaceholder: boolean; createdAt: Date }
const READY_STATUSES = ['uploaded', 'processed'];

/** uploaded non-placeholder primary = ready; placeholder primary = placeholder; a recent pending_upload with no ready primary = uploading */
export function resolveImageState(docs: ImageDocLite[], now: Date = new Date()): { state: ImageState; primary: ImageDocLite | null } {
  const primary = docs.find((d) => d.isPrimary && READY_STATUSES.includes(d.status)) ?? null;
  if (primary && !primary.isPlaceholder) return { state: 'ready', primary };
  if (primary && primary.isPlaceholder) return { state: 'placeholder', primary };
  const uploading = docs.some((d) => d.status === 'pending_upload' && now.getTime() - d.createdAt.getTime() < UPLOADING_WINDOW_MS);
  return { state: uploading ? 'uploading' : 'none', primary: null };
}

// ------------------------------------------------------------------------------------------------
// loaders (batch: one query per kind for any number of products)
// ------------------------------------------------------------------------------------------------
export type CreationRow = typeof schema.productCreation.$inferSelect;
const D = schema.productDocuments;

export interface SavedStates {
  creation: Map<string, CreationRow>;
  brandConfirmed: Map<string, boolean>;
  images: Map<string, { state: ImageState; primary: ImageDocLite | null }>;
  attrs: Map<string, { required: number; filled: number }>;
}

export async function loadImageDocs(tx: Tx, vendorId: string, productIds: string[]): Promise<Map<string, ImageDocLite[]>> {
  const out = new Map<string, ImageDocLite[]>();
  if (!productIds.length) return out;
  const rows = await tx
    .select({ id: D.id, productId: D.productId, status: D.status, isPrimary: D.isPrimary, isPlaceholder: D.isPlaceholder, createdAt: D.createdAt })
    .from(D)
    .where(and(eq(D.vendorId, vendorId), inArray(D.productId, productIds), eq(D.kind, 'image'), eq(D.purpose, 'product_image'), isNull(D.deletedAt)));
  for (const r of rows) out.set(r.productId, [...(out.get(r.productId) ?? []), r]);
  return out;
}

/** required product-level attributes of each (product, category) pair and how many have a value; one query for all pairs */
export async function categoryAttributeStates(tx: Tx, vendorId: string, pairs: Array<{ key: string; productId: string | null; categoryId: string }>): Promise<Map<string, { required: number; filled: number }>> {
  const out = new Map<string, { required: number; filled: number }>();
  if (!pairs.length) return out;
  const values = sql.join(pairs.map((p, idx) => sql`(${idx}::int, ${p.productId}::uuid, ${p.categoryId}::uuid)`), sql`, `);
  const res = await tx.execute(sql`
    select v.idx as idx, count(distinct ca.attribute_id)::int as required, count(distinct pav.attribute_id)::int as filled
    from (values ${values}) as v(idx, pid, cid)
    join category_attributes ca on ca.vendor_id = ${vendorId} and ca.category_id = v.cid and ca.is_required
    join attribute_definitions d on d.id = ca.attribute_id and d.vendor_id = ${vendorId} and d.deleted_at is null and d.applies_to = 'product'
    left join product_attribute_values pav on pav.vendor_id = ${vendorId} and pav.product_id = v.pid and pav.attribute_id = ca.attribute_id and pav.variant_id is null
      and (pav.value_text is not null or pav.value_number is not null or pav.value_bool is not null or pav.value_date is not null or pav.attribute_value_id is not null)
    group by v.idx`);
  for (const r of res.rows as Array<{ idx: number; required: number; filled: number }>) out.set(pairs[Number(r.idx)]!.key, { required: Number(r.required), filled: Number(r.filled) });
  return out;
}

export async function loadSavedStates(tx: Tx, vendorId: string, products: ProductRow[], now: Date = new Date()): Promise<SavedStates> {
  const ids = products.map((p) => p.id);
  const creationRows = ids.length ? await tx.select().from(schema.productCreation).where(and(eq(schema.productCreation.vendorId, vendorId), inArray(schema.productCreation.productId, ids))) : [];
  const docs = await loadImageDocs(tx, vendorId, ids);
  const brandConfirmed = await brandStates(tx, vendorId, products.map((p) => p.brand ?? ''));
  const attrs = await categoryAttributeStates(tx, vendorId, products.filter((p) => p.categoryId).map((p) => ({ key: p.id, productId: p.id, categoryId: p.categoryId! })));
  return {
    creation: new Map(creationRows.map((r) => [r.productId, r])),
    brandConfirmed,
    images: new Map(ids.map((id) => [id, resolveImageState(docs.get(id) ?? [], now)])),
    attrs,
  };
}

export async function loadChannels(tx: Tx, vendorId: string, names: (code: string) => string): Promise<Array<{ code: string; name: string }>> {
  const rows = await tx
    .selectDistinct({ code: schema.marketplaceAccounts.marketplace })
    .from(schema.marketplaceAccounts)
    .where(and(eq(schema.marketplaceAccounts.vendorId, vendorId), eq(schema.marketplaceAccounts.status, 'active')));
  return rows.map((r) => ({ code: r.code, name: names(r.code) })).sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

/** readiness input of a SAVED product (no code-conflict query: the unique index guarantees there is none) */
export function inputFromSaved(p: ProductRow, st: SavedStates, channels: Array<{ code: string; name: string }>): ReadinessInput {
  const creation = st.creation.get(p.id);
  const attrs = (p.customAttributes ?? []) as Array<{ name: string; value: string }>;
  return {
    title: p.title,
    categoryId: p.categoryId,
    productType: (((p.attributes ?? {}) as Record<string, unknown>).productType ?? 'physical') as ProductType,
    code: p.productCode,
    codeIsPlaceholder: creation?.codeIsPlaceholder ?? false,
    verifiedCode: creation?.skuVerifiedCode ?? null,
    codeConflict: false,
    brand: p.brand,
    brandConfirmed: p.brand ? st.brandConfirmed.get(nameKey(p.brand)) === true : false,
    descriptionText: p.description,
    customAttributeCount: attrs.filter((a) => a.name && a.value).length,
    categoryAttributes: st.attrs.get(p.id) ?? { required: 0, filled: 0 },
    image: st.images.get(p.id)?.state ?? 'none',
    channels,
  };
}
