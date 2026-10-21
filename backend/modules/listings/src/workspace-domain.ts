import type { ListingIssue } from '@oms/marketplace-core';
import type { ValidationIssue } from './domain';

/**
 * Pure rules of the listings workspace (Listings screen + Listing Studio): the screen status vocabulary, the readiness
 * checklist, which actions a listing offers, and how the audit trail reads. No I/O, unit-tested.
 */

// ------------------------------------------------------------------------------------------------
// screen status: the six tabs of the Listings screen, derived from the lifecycle status + the content state + the validation
// ------------------------------------------------------------------------------------------------
export const SCREEN_STATUSES = ['live', 'ready', 'needs_review', 'syncing', 'failed', 'blocked'] as const;
export type ScreenStatus = (typeof SCREEN_STATUSES)[number];

/** the statuses that make a listing "need attention" (the tab badge and the overview counter) */
export const ATTENTION_STATUSES: readonly ScreenStatus[] = ['needs_review', 'failed', 'blocked'];

export interface ScreenStatusInput { status: string; contentState: string; validation: { validatedAt?: string; errors?: unknown[] } | null | undefined }

/**
 * live          active on the marketplace and showing current content
 * ready         validated (and maybe approved), waiting to be published
 * needs_review  a person must decide: not validated yet, a category review, a republish, a taken-down listing
 * syncing       the marketplace is reviewing it (pending) or a content update is on its way
 * failed        rejected / correction required by the marketplace, or the last content update failed
 * blocked       validated and has blocking errors: it cannot be published until they are fixed
 * (`not_listed` is not a listing: see the not-listed candidates endpoint)
 */
export function screenStatusOf(i: ScreenStatusInput): ScreenStatus {
  switch (i.status) {
    case 'active':
      if (i.contentState === 'needs_review' || i.contentState === 'needs_republish') return 'needs_review';
      if (i.contentState === 'sync_pending') return 'syncing';
      if (i.contentState === 'failed') return 'failed';
      return 'live';
    case 'pending': return 'syncing';
    case 'rejected':
    case 'correction_required': return 'failed';
    case 'ready':
    case 'approved': return 'ready';
    case 'draft': return i.validation?.validatedAt && (i.validation.errors?.length ?? 0) > 0 ? 'blocked' : 'needs_review';
    default: return 'needs_review';
  }
}

/** the same mapping as one SQL expression over the aliases the caller joined (`l` = marketplace_listings): keep both in step */
export const SCREEN_STATUS_SQL = `case
  when l.status = 'active' then case when l.content_state in ('needs_review', 'needs_republish') then 'needs_review' when l.content_state = 'sync_pending' then 'syncing' when l.content_state = 'failed' then 'failed' else 'live' end
  when l.status = 'pending' then 'syncing'
  when l.status in ('rejected', 'correction_required') then 'failed'
  when l.status in ('ready', 'approved') then 'ready'
  when l.status = 'draft' then case when (l.validation ? 'validatedAt') and coalesce(jsonb_array_length(case when jsonb_typeof(l.validation -> 'errors') = 'array' then l.validation -> 'errors' else '[]'::jsonb end), 0) > 0 then 'blocked' else 'needs_review' end
  else 'needs_review' end`;

// ------------------------------------------------------------------------------------------------
// the listing on the marketplace
// ------------------------------------------------------------------------------------------------
/** a public page of the listing, only where the marketplace has a stable URL pattern and the account is a live (not sandbox) account */
export function externalListingUrl(marketplace: string, externalListingId: string | null, mode: string): string | null {
  if (!externalListingId || mode !== 'live') return null;
  const id = encodeURIComponent(externalListingId);
  if (marketplace === 'amazon_in') return `https://www.amazon.in/dp/${id}`;
  if (marketplace === 'flipkart') return `https://www.flipkart.com/product/p/itme?pid=${id}`;
  return null;
}

// ------------------------------------------------------------------------------------------------
// readiness checklist
// ------------------------------------------------------------------------------------------------
export const READINESS_GROUPS = ['content', 'media', 'attributes', 'price', 'stock', 'category', 'marketplace'] as const;
export type ReadinessGroupKey = (typeof READINESS_GROUPS)[number];
export type CheckStatus = 'pass' | 'warn' | 'fail';

const GROUP_LABELS: Record<ReadinessGroupKey, string> = {
  content: 'Content', media: 'Media', attributes: 'Category attributes', price: 'Price', stock: 'Stock', category: 'Category mapping', marketplace: 'Marketplace feedback',
};

export type FixAction = 'edit_content' | 'upload_images' | 'fill_attribute' | 'set_price' | 'set_mrp' | 'map_category' | 'add_barcode' | 'restock' | 'reconnect_account' | 'validate' | 'review_marketplace_feedback';

export interface ReadinessCheck { key: string; group: ReadinessGroupKey; status: CheckStatus; label: string; message: string; field: string | null; fix: { action: FixAction; field: string | null } | null }
export interface ReadinessGroup { key: ReadinessGroupKey; label: string; status: CheckStatus; passed: number; total: number; items: ReadinessCheck[] }
export interface Readiness {
  percent: number; ready: boolean; summary: { pass: number; warn: number; fail: number }; topBlocker: { key: string; message: string; field: string | null; fix: ReadinessCheck['fix'] } | null;
  /** attributes were checked against a validation that ran after the last edit (false = "not validated yet" is part of the checklist) */
  attributesChecked: boolean; groups: ReadinessGroup[];
}

export interface ReadinessFacts {
  title: string; description: string | null; brand: string | null; barcode: string | null;
  imageCount: number; primaryImage: { width: number | null; height: number | null } | null;
  priceMinor: number | null; mrpMinor: number | null;
  marketplaceCategoryId: string | null; categoryRequired: boolean;
  /** units the channel may sell now (null = not computed) and the central available units */
  available: number | null; sellable: number | null;
  /** the validation of the listing: `validated` = it ran after the last edit; `issues` are its errors and warnings; `requiredAttributes` = how many the category demands */
  validation: { validated: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[]; requiredAttributes: number | null };
  /** errors and warnings the marketplace itself reported for the last submission */
  marketplaceIssues: ListingIssue[];
}

const MIN_IMAGE_SIDE = 500;
const ATTRIBUTE_CODES = ['attribute_missing', 'attribute_invalid', 'attribute_not_allowed', 'attribute_too_long'];
const rupees = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

export function buildReadiness(f: ReadinessFacts): Readiness {
  const checks: ReadinessCheck[] = [];
  const add = (key: string, group: ReadinessGroupKey, status: CheckStatus, label: string, message: string, field: string | null = null, fix: FixAction | null = null) =>
    checks.push({ key, group, status, label, message, field, fix: fix ? { action: fix, field } : null });

  // content
  if (f.title.trim().length >= 3) add('title', 'content', 'pass', 'Title', 'The listing has a title', 'title');
  else add('title', 'content', 'fail', 'Title', 'The product needs a title of at least 3 characters', 'title', 'edit_content');
  if ((f.description ?? '').trim().length >= 20) add('description', 'content', 'pass', 'Description', 'The listing has a description', 'description');
  else add('description', 'content', 'warn', 'Description', 'Add a description of at least 20 characters: it is what buyers read before they buy', 'description', 'edit_content');
  if (f.brand && f.brand.trim()) add('brand', 'content', 'pass', 'Brand', `Brand: ${f.brand.trim()}`, 'brand');
  else add('brand', 'content', 'warn', 'Brand', 'No brand: most marketplaces ask for one', 'brand', 'edit_content');

  // media
  if (f.imageCount === 0) add('images', 'media', 'warn', 'Images', 'No product images: the marketplace is likely to reject or suppress the listing', 'images', 'upload_images');
  else add('images', 'media', 'pass', 'Images', `${f.imageCount} image${f.imageCount === 1 ? '' : 's'}`, 'images');
  const side = f.primaryImage && f.primaryImage.width !== null && f.primaryImage.height !== null ? Math.min(f.primaryImage.width, f.primaryImage.height) : null;
  if (side !== null) {
    if (side < MIN_IMAGE_SIDE) add('image_resolution', 'media', 'warn', 'Primary image size', `The primary image is ${f.primaryImage!.width}x${f.primaryImage!.height} px; marketplaces want at least ${MIN_IMAGE_SIDE} px on the shorter side`, 'images', 'upload_images');
    else add('image_resolution', 'media', 'pass', 'Primary image size', `The primary image is ${f.primaryImage!.width}x${f.primaryImage!.height} px`, 'images');
  }

  // category attributes (only what the last validation proved: the table never calls a marketplace)
  const attrErrors = f.validation.errors.filter((e) => ATTRIBUTE_CODES.includes(e.code));
  if (!f.validation.validated) add('attributes_unchecked', 'attributes', 'warn', 'Required attributes', 'Not validated since the last change: run the validation to check the category attributes', null, 'validate');
  else if (attrErrors.length) for (const e of attrErrors) add(`${e.code}:${e.attribute ?? ''}`, 'attributes', 'fail', e.attribute ?? 'Attribute', e.message, e.attribute ?? null, 'fill_attribute');
  else if (f.marketplaceCategoryId) {
    const n = f.validation.requiredAttributes;
    add('attributes', 'attributes', 'pass', 'Required attributes', n ? `All ${n} required attribute${n === 1 ? ' is' : 's are'} filled` : 'The category has no required attributes');
  }

  // price
  if (f.priceMinor === null || f.priceMinor <= 0) add('price', 'price', 'fail', 'Selling price', 'A selling price greater than zero is required (set it on the variant or on the listing)', 'price', 'set_price');
  else if (f.mrpMinor !== null && f.priceMinor > f.mrpMinor) add('price', 'price', 'fail', 'Selling price', `The selling price (${rupees(f.priceMinor)}) cannot be higher than the MRP (${rupees(f.mrpMinor)})`, 'price', 'set_price');
  else add('price', 'price', 'pass', 'Selling price', `Selling price ${rupees(f.priceMinor)}`, 'price');
  if (f.mrpMinor === null) add('mrp', 'price', 'warn', 'MRP', 'No MRP: most marketplaces require it for apparel and electronics', 'mrp', 'set_mrp');
  else add('mrp', 'price', 'pass', 'MRP', `MRP ${rupees(f.mrpMinor)}`, 'mrp');
  if (!f.barcode) add('barcode', 'price', 'warn', 'Barcode', 'No barcode (EAN/GTIN): some categories require one', 'barcode', 'add_barcode');
  else add('barcode', 'price', 'pass', 'Barcode', `Barcode ${f.barcode}`, 'barcode');

  // stock
  if (f.available === null) { /* not computed: no stock check */ }
  else if (f.available <= 0) add('stock', 'stock', 'warn', 'Stock', 'No stock is available for this channel: the listing would show 0 units', 'quantity', 'restock');
  else if ((f.sellable ?? 0) <= 0) add('stock', 'stock', 'warn', 'Stock', `${f.available} unit${f.available === 1 ? ' is' : 's are'} available but the channel rules (safety buffer, allocation) leave nothing to sell`, 'quantity', 'restock');
  else add('stock', 'stock', 'pass', 'Stock', `${f.sellable} unit${f.sellable === 1 ? '' : 's'} can be sold on this channel`, 'quantity');

  // category mapping + channel
  if (f.marketplaceCategoryId) add('category', 'category', 'pass', 'Marketplace category', `Mapped to ${f.marketplaceCategoryId}`, 'category');
  else if (f.categoryRequired) add('category', 'category', 'fail', 'Marketplace category', 'Map this product to a marketplace category first', 'category', 'map_category');
  else add('category', 'category', 'pass', 'Marketplace category', 'This marketplace does not need a category mapping', 'category');
  for (const e of f.validation.errors) {
    if (e.code === 'requirements_unavailable') add('requirements_unavailable', 'category', 'fail', 'Category requirements', e.message, 'category', 'map_category');
    else if (e.code === 'account_not_connected') add('account_not_connected', 'category', 'fail', 'Marketplace connection', e.message, null, 'reconnect_account');
    else if (e.code === 'capability_unsupported') add('capability_unsupported', 'category', 'fail', 'Marketplace connection', e.message);
  }

  // what the marketplace itself said
  for (const i of f.marketplaceIssues) add(`marketplace:${i.code}:${i.attribute ?? ''}`, 'marketplace', i.severity === 'error' ? 'fail' : 'warn', i.attribute ?? i.code, i.message, i.attribute ?? null, 'review_marketplace_feedback');

  const groups: ReadinessGroup[] = [];
  for (const key of READINESS_GROUPS) {
    const items = checks.filter((c) => c.group === key);
    if (!items.length) continue;
    groups.push({ key, label: GROUP_LABELS[key], status: items.some((i) => i.status === 'fail') ? 'fail' : items.some((i) => i.status === 'warn') ? 'warn' : 'pass', passed: items.filter((i) => i.status === 'pass').length, total: items.length, items });
  }
  const summary = { pass: checks.filter((c) => c.status === 'pass').length, warn: checks.filter((c) => c.status === 'warn').length, fail: checks.filter((c) => c.status === 'fail').length };
  const percent = checks.length ? Math.round((100 * (summary.pass + summary.warn / 2)) / checks.length) : 0;
  const blocker = checks.find((c) => c.status === 'fail');
  return {
    percent, ready: summary.fail === 0, summary, attributesChecked: f.validation.validated,
    topBlocker: blocker ? { key: blocker.key, message: blocker.message, field: blocker.field, fix: blocker.fix } : null, groups,
  };
}

// ------------------------------------------------------------------------------------------------
// actions of a listing (the buttons of the studio): enabled, or why not
// ------------------------------------------------------------------------------------------------
export const LISTING_ACTIONS = ['edit', 'validate', 'approve', 'publish', 'publish_flow', 'unpublish', 'refresh_status', 'sync_content', 'resolve_review', 'sync_inventory', 'delete'] as const;
export type ListingAction = (typeof LISTING_ACTIONS)[number];
export interface ActionState { action: ListingAction; label: string; enabled: boolean; disabledReason: string | null }

export interface ActionFacts {
  status: string; contentState: string; externalListingId: string | null; accountStatus: string;
  canCreate: boolean; canUpdate: boolean; canDeactivate: boolean; canPushInventory: boolean;
  /** the stored validation says it has blocking errors (null = never validated) */
  validationReady: boolean | null;
  /** the approval still matches the current content (null = not evaluated) */
  approvalCurrent: boolean | null;
  inventoryPaused: boolean;
}

const LIVE = ['active', 'pending'];
const EDITABLE_STATUSES = ['draft', 'ready', 'approved', 'rejected', 'correction_required', 'unpublished'];

export function listingActions(f: ActionFacts): ActionState[] {
  const live = LIVE.includes(f.status);
  const connected = f.accountStatus === 'active';
  const out: ActionState[] = [];
  const add = (action: ListingAction, label: string, reason: string | null) => out.push({ action, label, enabled: reason === null, disabledReason: reason });

  add('edit', 'Edit', null);
  add('validate', 'Validate', connected ? null : 'The marketplace account is not connected');
  add('approve', 'Approve', !EDITABLE_STATUSES.includes(f.status) ? `A ${f.status} listing cannot be approved` : f.validationReady === false ? 'Fix the validation errors before approving' : connected ? null : 'The marketplace account is not connected');
  add('publish', 'Publish', live ? `The listing is already ${f.status === 'active' ? 'live' : 'under review'}` : f.status !== 'approved' ? 'Approve the listing first' : f.approvalCurrent === false ? 'The listing changed after it was approved: approve it again' : !connected ? 'The marketplace account is not connected' : null);
  add('publish_flow', f.status === 'rejected' || f.status === 'correction_required' ? 'Fix and retry publish' : 'Publish to channel',
    live ? `The listing is already ${f.status === 'active' ? 'live' : 'under review'}` : !connected ? 'The marketplace account is not connected' : !f.canCreate ? 'This marketplace does not accept listings through the API' : null);
  add('unpublish', 'Unpublish', !live ? 'Only an active or pending listing can be unpublished' : !f.canDeactivate ? 'This marketplace cannot take listings down through the API' : null);
  add('refresh_status', 'Refresh status', !f.externalListingId && f.status !== 'pending' ? 'The listing has not been submitted to the marketplace yet' : !connected ? 'The marketplace account is not connected' : null);
  add('sync_content', 'Send latest content',
    !live ? 'The listing is not live' : f.contentState === 'needs_review' ? 'Resolve the category review first' : f.contentState === 'synced' ? 'The marketplace already shows the current content'
      : !f.canUpdate ? 'This marketplace cannot update a live listing: unpublish and republish it' : null);
  add('resolve_review', 'Resolve category review', f.contentState !== 'needs_review' ? 'No category review is waiting' : !live ? 'The listing is not live' : null);
  add('sync_inventory', 'Sync stock', f.status !== 'active' ? 'Only an active listing carries stock on the marketplace' : !f.canPushInventory ? 'This marketplace does not accept stock pushes' : f.inventoryPaused ? 'Stock sync is paused for this account' : null);
  add('delete', 'Delete', live || f.externalListingId ? 'Only a listing that never reached the marketplace can be deleted: unpublish it instead' : null);
  return out;
}

// ------------------------------------------------------------------------------------------------
// activity timeline (audit trail -> human lines)
// ------------------------------------------------------------------------------------------------
export interface AuditLine { action: string; before: unknown; after: unknown; metadata: Record<string, unknown> }
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const word = (s: string) => s.replace(/_/g, ' ');

/** { title, details } of one audit record; unknown actions are humanised, never hidden */
export function describeActivity(a: AuditLine): { title: string; details: string } {
  const before = obj(a.before);
  const after = obj(a.after);
  const meta = obj(a.metadata);
  switch (a.action) {
    case 'listing.create': return { title: 'Listing created', details: `SKU ${str(after.sku) ?? '-'}` };
    case 'listing.update': return { title: 'Listing edited', details: Object.keys(after).length ? `Changed: ${Object.keys(after).map(word).join(', ')}` : 'No fields changed' };
    case 'listing.channel_content_update': return { title: 'Channel content edited', details: `Changed: ${(Array.isArray(after.fields) ? after.fields : Object.keys(after)).map((x) => word(String(x))).join(', ')}` };
    case 'listing.validate': return { title: 'Validated', details: `${after.ready ? 'Ready' : 'Not ready'}: ${Number(after.errors ?? 0)} error(s), ${Number(after.warnings ?? 0)} warning(s)` };
    case 'listing.approve': return { title: 'Approved by the merchant', details: 'The content was approved for publishing' };
    case 'listing.publish_requested': return { title: 'Publish requested', details: 'The listing was sent to the marketplace queue' };
    case 'listing.unpublish_requested': return { title: 'Unpublish requested', details: 'A take-down was sent to the marketplace queue' };
    case 'listing.status_changed': return { title: `Status changed to ${word(str(after.status) ?? 'unknown')}`, details: `${word(str(before.status) ?? 'unknown')} to ${word(str(after.status) ?? 'unknown')}${str(after.externalStatus) ? ` (marketplace: ${str(after.externalStatus)})` : ''}${str(meta.source) ? `, from ${str(meta.source)}` : ''}` };
    case 'listing.content_needs_review': return { title: 'Category review needed', details: 'The product category changed: choose the marketplace category' };
    case 'listing.content_needs_republish': return { title: 'Republish needed', details: str(after.error) ?? 'The marketplace cannot update a live listing' };
    case 'listing.content_sync_requested': return { title: 'Content sync requested', details: 'The latest product content is queued for the marketplace' };
    case 'listing.content_sync_failed': return { title: 'Content sync failed', details: str(after.error) ?? 'The marketplace did not accept the update' };
    case 'listing.content_review_resolved': return { title: 'Category review resolved', details: `Decision: ${word(str(meta.action) ?? 'resolved')}` };
    case 'listing.delete': return { title: 'Listing deleted', details: `SKU ${str(before.sku) ?? '-'}` };
    case 'listing.bulk_action': return { title: `Bulk ${word(str(meta.action) ?? 'action')}`, details: `Part of a bulk action on ${Number(meta.total ?? 0)} listing(s)` };
    default: return { title: word(a.action.replace(/^listing\./, '')).replace(/^./, (c) => c.toUpperCase()), details: '' };
  }
}
