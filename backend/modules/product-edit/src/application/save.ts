import { and, eq, isNull, schema, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import {
  buildEditorProduct, codeLockedError, duplicateCodeError, findCodeConflict, isCodeLocked, validationError, writeProductFields, versionConflict,
  type ChannelNameFn, type Effects, type FieldIssue, type ProductRow, type RawFields,
} from '@oms/mod-catalog';
import { computeChange, type ChangeSet } from '../domain/diff';
import { applyProductChange, type ListingOpts, type ListingPlan, type ListingPlanState } from '../infrastructure/listings-port';
import { buildEditor, buildReadiness } from './editor';
import { computeImpact, type ImpactDto } from './impact';
import { loadImages } from './images';
import { currentInsights } from './insights';

/**
 * `POST /products/{id}/edit/save`: ONE transaction = lock the product row, check the version, diff against the stored product, validate,
 * (confirmation), patch through the catalog write path, mark the listings through the listings module, audit + outbox. The content sync jobs are
 * requested by the caller AFTER the commit (`accountsToSync`).
 */
const P = schema.products;
const C = schema.categories;
const V = schema.productVariants;

export interface SaveInput { version: number; changes: RawFields; confirm?: boolean }

/** problems that need the database: the category must exist; a draft that changes its code must not take another product's code */
export async function contextIssues(tx: Tx, vendorId: string, before: ProductRow, change: ChangeSet): Promise<FieldIssue[]> {
  const issues: FieldIssue[] = [];
  const toId = change.fields.categoryId;
  if (toId) {
    const [row] = await tx.select({ id: C.id }).from(C).where(and(eq(C.vendorId, vendorId), eq(C.id, toId), isNull(C.deletedAt)));
    if (!row) issues.push({ field: 'categoryId', code: 'category_not_found', message: 'This category no longer exists' });
  }
  if (change.fields.productCode !== undefined && !isCodeLocked(before.status)) {
    const conflict = await findCodeConflict(tx, vendorId, change.fields.productCode, before.id);
    if (conflict) issues.push({ field: 'productCode', code: 'duplicate_product_code', message: 'Master SKU already exists. Use a unique SKU to continue.' });
  }
  return issues;
}

const STATE_RANK: ListingPlanState[] = ['needs_review', 'needs_republish', 'sync_pending', 'independent', 'not_live', 'unchanged'];

export function planChannels(plan: ListingPlan) {
  const byAccount = new Map<string, ListingPlan['listings']>();
  for (const l of plan.listings) byAccount.set(l.accountId, [...(byAccount.get(l.accountId) ?? []), l]);
  return [...byAccount.values()].map((group) => {
    const best = group.reduce((a, b) => (STATE_RANK.indexOf(b.state) < STATE_RANK.indexOf(a.state) ? b : a));
    return { code: best.marketplace, name: best.marketplaceName, accountId: best.accountId, listingId: best.listingId, listings: group.length, state: best.state };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.accountId.localeCompare(b.accountId));
}

const plural = (n: number) => `${n} ${n === 1 ? 'listing' : 'listings'}`;

export function planImpact(plan: ListingPlan, impact: ImpactDto) {
  const queued = plan.listings.filter((l) => l.state === 'sync_pending').length;
  return {
    listingsQueued: queued,
    channels: planChannels(plan),
    text: queued > 0 ? `${plural(queued)} will sync shortly.` : 'No listings need to sync.',
    notSyncedYet: queued > 0 ? 'Saved to the master product. Listings have not synced yet.' : null,
    independentNote: impact.independentNote,
  };
}

export type SaveOutcome =
  | { saved: false; noChanges: true; version: number }
  | { saved: true; noChanges: false; savedAt: string; version: number; product: Awaited<ReturnType<typeof buildEditorProduct>>; impact: ReturnType<typeof planImpact>; readiness: Awaited<ReturnType<typeof buildReadiness>>; insights: Awaited<ReturnType<typeof currentInsights>>['items'] };

export async function saveEdit(tx: Tx, vendorId: string, productId: string, input: SaveInput, fx: Effects, names: ChannelNameFn, opts: ListingOpts): Promise<{ outcome: SaveOutcome; accountsToSync: string[] }> {
  // the row lock serialises concurrent saves: the second one waits, then sees the new version and gets VERSION_CONFLICT
  const [before] = await tx.select().from(P).where(and(eq(P.id, productId), eq(P.vendorId, vendorId), isNull(P.deletedAt))).for('update');
  if (!before) throw Errors.notFound('Product', productId);
  if (input.version !== before.version) {
    const current = await buildEditor(tx, vendorId, before, names, opts);
    const err = versionConflict(before.version);
    throw new AppError('VERSION_CONFLICT', err.message, { details: { currentVersion: before.version, current, updatedAt: before.updatedAt.toISOString(), updatedBy: current.meta.updatedBy } });
  }

  const change = computeChange(before, input.changes);
  if (change.codeLocked) throw codeLockedError(before.productCode, input.changes.productCode ?? '');
  const issues = [...change.issues, ...(await contextIssues(tx, vendorId, before, change))];
  if (issues.length) {
    const dup = issues.find((i) => i.code === 'duplicate_product_code');
    if (dup && issues.length === 1 && change.codeChange) throw duplicateCodeError(change.codeChange.to, await findCodeConflict(tx, vendorId, change.codeChange.to, before.id));
    throw validationError(issues);
  }
  if (change.items.length === 0) return { outcome: { saved: false, noChanges: true, version: before.version }, accountsToSync: [] };

  if (before.status === 'active') {
    const [v] = await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), eq(V.productId, productId), isNull(V.deletedAt), eq(V.status, 'active'))).limit(1);
    if (!v) throw new AppError('CONFLICT', 'An active product needs at least one active variant', { details: { rule: 'needs_variant' } });
  }

  const { dto: impact } = await computeImpact(tx, vendorId, before, change, opts);
  if (impact.requiresConfirmation && input.confirm !== true) {
    throw new AppError('CONFLICT', 'This change may affect connected listings: confirm it to save', { details: { rule: 'confirmation_required', impact } });
  }

  const { after } = await writeProductFields(tx, vendorId, before, change.fields, { version: input.version }, fx, { strict: true, auditAction: null });

  const plan: ListingPlan = change.contentFields.length
    ? await applyProductChange(tx, vendorId, productId, { fields: change.contentFields, ...(change.category ? { category: change.category } : {}) }, opts)
    : { listings: [], accountsToSync: [] };

  const planned = planImpact(plan, impact);
  await fx.audit({
    action: 'product.edited', resourceType: 'product', resourceId: productId,
    before: Object.fromEntries(change.items.map((i) => [i.field, i.before])),
    after: Object.fromEntries(change.items.map((i) => [i.field, i.after])),
    metadata: {
      fields: change.items.map((i) => i.field), contentFields: change.contentFields, version: { from: before.version, to: after.version }, confirmed: input.confirm === true,
      listings: plan.listings.map((l) => ({ listingId: l.listingId, marketplace: l.marketplace, state: l.state })), accountsToSync: plan.accountsToSync,
    },
  });
  await fx.event({
    type: 'product.edited', aggregateType: 'product', aggregateId: productId,
    payload: { fields: change.items.map((i) => i.field), contentFields: change.contentFields, version: after.version, listingsQueued: planned.listingsQueued, accountsToSync: plan.accountsToSync },
  });

  const [product, readiness, insights] = await Promise.all([
    buildEditorProduct(tx, vendorId, after),
    buildReadiness(tx, vendorId, after, names),
    loadImages(tx, vendorId, productId).then((images) => currentInsights(tx, vendorId, after, { images })),
  ]);
  return {
    outcome: { saved: true, noChanges: false, savedAt: after.updatedAt.toISOString(), version: after.version, product, impact: planned, readiness, insights: insights.items },
    accountsToSync: plan.accountsToSync,
  };
}
