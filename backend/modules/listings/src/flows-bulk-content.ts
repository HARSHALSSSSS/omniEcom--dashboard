import { and, eq, inArray, schema, withVendor } from '@oms/database';
import { AppError, newId } from '@oms/shared';
import { requestContentSync } from './content';
import { channelOverrides } from './content-domain';
import { getListingRow } from './context';
import { fx, type Ctx } from './ctx';
import { joined } from './service';
import { editListing, type ChannelContentPatch } from './workspace-edit';

const L = schema.marketplaceListings;
const PMD = schema.productMarketplaceData;
const P = schema.products;

export const TITLE_MAX = 500;
export const DESCRIPTION_MAX = 20_000;
export const BULLETS_MAX = 10;
export const BULLET_MAX = 500;
export const TERMS_MAX = 50;
export const TERM_MAX = 100;

export type TextEdit =
  | { op: 'prefix' | 'suffix' | 'set'; value: string }
  | { op: 'replace'; find: string; value: string; caseSensitive?: boolean };
export type DescriptionEdit =
  | { op: 'append' | 'prepend' | 'set'; value: string }
  | { op: 'replace'; find: string; value: string; caseSensitive?: boolean };
export type ListEdit = { op: 'set' | 'add' | 'remove'; values: string[] } | { op: 'clear' };
export type BrandEdit = { op: 'set'; value: string } | { op: 'clear' };

export interface BulkContentEdits { title?: TextEdit; description?: DescriptionEdit; bulletPoints?: ListEdit; searchTerms?: ListEdit; brand?: BrandEdit }

/** what a channel currently shows of its content: the channel's own value, else the master product's */
export interface EffectiveContent { title: string; description: string | null; bulletPoints: string[]; searchTerms: string[]; brand: string | null }

// ------------------------------------------------------------------------------------------------
// pure rules (unit-testable)
// ------------------------------------------------------------------------------------------------
const replaceAll = (text: string, find: string, withText: string, caseSensitive: boolean): string => {
  if (!find) return text;
  if (caseSensitive) return text.split(find).join(withText);
  const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return text.replace(re, () => withText);
};

export function applyTextEdit(current: string, e: TextEdit): string {
  if (e.op === 'replace') return replaceAll(current, e.find, e.value, e.caseSensitive ?? false).trim();
  if (e.op === 'set') return e.value.trim();
  if (e.op === 'prefix') return `${e.value}${current}`.trim();
  return `${current}${e.value}`.trim();
}

export function applyDescriptionEdit(current: string | null, e: DescriptionEdit): string {
  const text = current ?? '';
  if (e.op === 'replace') return replaceAll(text, e.find, e.value, e.caseSensitive ?? false);
  if (e.op === 'set') return e.value;
  // appended / prepended text starts on its own line
  if (e.op === 'append') return text.trim() ? `${text.replace(/\s+$/, '')}\n\n${e.value}` : e.value;
  return text.trim() ? `${e.value}\n\n${text.replace(/^\s+/, '')}` : e.value;
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applyListEdit(current: string[], e: ListEdit): string[] {
  if (e.op === 'clear') return [];
  const values = e.values.map((v) => v.trim()).filter(Boolean);
  if (e.op === 'set') return values.filter((v, i) => values.findIndex((x) => same(x, v)) === i);
  if (e.op === 'add') return [...current, ...values.filter((v) => !current.some((c) => same(c, v)))];
  return current.filter((c) => !values.some((v) => same(c, v)));
}

const listEqual = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** the patch (and a before/after preview) that the edits make to the content a channel shows now; fields that end up unchanged are left out */
export function planContentEdit(current: EffectiveContent, edits: BulkContentEdits): { patch: ChannelContentPatch; changes: Record<string, { before: unknown; after: unknown }>; problem: string | null } {
  const patch: ChannelContentPatch = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const note = <K extends keyof ChannelContentPatch>(k: K, before: unknown, after: unknown, value: ChannelContentPatch[K]) => { patch[k] = value; changes[k] = { before, after }; };
  if (edits.title) {
    const next = applyTextEdit(current.title, edits.title);
    if (next.length > TITLE_MAX) return { patch: {}, changes: {}, problem: `The title would be ${next.length} characters; the limit is ${TITLE_MAX}` };
    if (next.length < 3) return { patch: {}, changes: {}, problem: 'The title would be shorter than 3 characters' };
    if (next !== current.title) note('title', current.title, next, next);
  }
  if (edits.description) {
    const next = applyDescriptionEdit(current.description, edits.description);
    if (next.length > DESCRIPTION_MAX) return { patch: {}, changes: {}, problem: `The description would be ${next.length} characters; the limit is ${DESCRIPTION_MAX}` };
    if (next.trim() !== (current.description ?? '').trim()) note('description', current.description, next, next);
  }
  if (edits.bulletPoints) {
    const next = applyListEdit(current.bulletPoints, edits.bulletPoints);
    if (next.length > BULLETS_MAX) return { patch: {}, changes: {}, problem: `There would be ${next.length} bullet points; the limit is ${BULLETS_MAX}` };
    if (next.some((b) => b.length > BULLET_MAX)) return { patch: {}, changes: {}, problem: `A bullet point is longer than ${BULLET_MAX} characters` };
    if (!listEqual(next, current.bulletPoints)) note('bulletPoints', current.bulletPoints, next, next.length ? next : null);
  }
  if (edits.searchTerms) {
    const next = applyListEdit(current.searchTerms, edits.searchTerms);
    if (next.length > TERMS_MAX) return { patch: {}, changes: {}, problem: `There would be ${next.length} search terms; the limit is ${TERMS_MAX}` };
    if (next.some((t) => t.length > TERM_MAX)) return { patch: {}, changes: {}, problem: `A search term is longer than ${TERM_MAX} characters` };
    if (!listEqual(next, current.searchTerms)) note('searchTerms', current.searchTerms, next, next.length ? next : null);
  }
  if (edits.brand) {
    const next = edits.brand.op === 'clear' ? null : edits.brand.value.trim() || null;
    if ((next ?? '') !== (current.brand ?? '')) note('brand', current.brand, next, next);
  }
  return { patch, changes, problem: null };
}

// ------------------------------------------------------------------------------------------------
// the service
// ------------------------------------------------------------------------------------------------
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : typeof v === 'string' && v.trim() ? v.split('\n').map((x) => x.trim()).filter(Boolean) : []);
const pick = (data: Record<string, unknown>, ...keys: string[]): unknown => keys.map((k) => data[k]).find((v) => v !== undefined && v !== null);

async function effectiveContent(ctx: Ctx, productId: string, marketplace: string): Promise<EffectiveContent> {
  return withVendor(ctx.c.database.db, ctx.vendorId, async (tx) => {
    const [p] = await tx.select().from(P).where(and(eq(P.id, productId), eq(P.vendorId, ctx.vendorId)));
    const [md] = await tx.select({ data: PMD.data }).from(PMD).where(and(eq(PMD.vendorId, ctx.vendorId), eq(PMD.productId, productId), eq(PMD.marketplace, marketplace)));
    const data = md?.data ?? {};
    const eff = channelOverrides(data);
    const terms = arr(pick(data, 'search_terms', 'searchTerms', 'keywords', 'tags'));
    return {
      title: eff.title ?? p?.title ?? '', description: eff.description ?? p?.description ?? null, bulletPoints: arr(pick(data, 'bullets', 'bullet_points', 'bulletPoints')),
      searchTerms: terms.length ? terms : p?.tags ?? [], brand: eff.brand ?? p?.brand ?? null,
    };
  });
}

export interface BulkContentItem {
  index: number; id: string; sku: string | null; ok: boolean; status: 'done' | 'skipped' | 'failed'; outcome: 'updated' | 'preview' | 'unchanged' | null; message: string;
  changedFields: string[]; changes: Record<string, { before: unknown; after: unknown }> | null; error: { code: string; message: string } | null;
}

export interface BulkContentInput { ids: string[]; edits: BulkContentEdits; dryRun?: boolean; versions?: Record<string, number> }

/**
 * Edits the channel content of many listings at once (title prefix / suffix / replace, description append / replace, bullet points, search
 * terms, brand), the same fields and rules as PATCH /listings/{id}. Partial success: every listing has its own result and one failure never
 * stops the rest. Version-safe: the listing is read again just before it is saved and `versions` (the versions the screen showed) are checked.
 * Content is stored per product and marketplace, so listings of the same product on the same marketplace share one edit (applied once).
 * `dryRun` answers what would change without saving anything.
 */
export async function bulkContentEdit(ctx: Ctx, input: BulkContentInput) {
  const ids = [...new Set(input.ids)];
  const dryRun = input.dryRun === true;
  const rows = await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => joined(tx, ctx.vendorId, inArray(L.id, ids)));
  const byId = new Map(rows.map((r) => [r.l.id, r]));
  const items: BulkContentItem[] = [];
  const outcomeByGroup = new Map<string, { sku: string; item: BulkContentItem }>();
  const accounts = new Set<string>();

  const record = (id: string, status: BulkContentItem['status'], message: string, extra: Partial<Pick<BulkContentItem, 'outcome' | 'changedFields' | 'changes'>> & { code?: string } = {}): BulkContentItem => {
    const item: BulkContentItem = {
      index: items.length, id, sku: byId.get(id)?.sku ?? null, ok: status === 'done', status, outcome: extra.outcome ?? null, message,
      changedFields: extra.changedFields ?? [], changes: extra.changes ?? null, error: status === 'failed' ? { code: extra.code ?? 'ERROR', message } : null,
    };
    items.push(item);
    return item;
  };

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { record(id, 'failed', 'Listing not found', { code: 'NOT_FOUND' }); continue; }
    const group = `${row.productId}|${row.marketplace}`;
    const leader = outcomeByGroup.get(group);
    if (leader) {
      // the content of a product on a marketplace is stored once: this listing shows what its sibling just got
      record(id, leader.item.status === 'failed' ? 'failed' : leader.item.status, leader.item.status === 'failed' ? leader.item.message : `Shares its ${row.marketplace} content with ${leader.sku}: the same change, applied once`,
        { code: leader.item.error?.code, outcome: leader.item.outcome, changedFields: leader.item.changedFields, changes: leader.item.changes });
      continue;
    }
    try {
      const current = await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => getListingRow(tx, ctx.vendorId, id));
      const expected = input.versions?.[id];
      if (expected !== undefined && expected !== current.version) throw new AppError('VERSION_CONFLICT', 'This listing was changed by someone else since you selected it', { details: { currentVersion: current.version } });
      const plan = planContentEdit(await effectiveContent(ctx, row.productId, row.marketplace), input.edits);
      let item: BulkContentItem;
      if (plan.problem) item = record(id, 'failed', plan.problem, { code: 'VALIDATION_FAILED' });
      else if (Object.keys(plan.patch).length === 0) item = record(id, 'skipped', 'Nothing to change: the content already looks like this', { outcome: 'unchanged' });
      else if (dryRun) item = record(id, 'done', `Would change ${Object.keys(plan.patch).join(', ')}`, { outcome: 'preview', changedFields: Object.keys(plan.patch), changes: plan.changes });
      else {
        const res = await editListing(ctx, id, { ...plan.patch, version: current.version });
        for (const a of res.contentSyncAccounts) accounts.add(a);
        item = record(id, 'done', res.contentChanged.length ? `Updated ${res.contentChanged.join(', ')}${res.contentSyncAccounts.length ? ' (a live listing is queued for a content sync)' : ''}` : 'Nothing to change', { outcome: res.contentChanged.length ? 'updated' : 'unchanged', changedFields: res.contentChanged, changes: plan.changes });
      }
      outcomeByGroup.set(group, { sku: row.sku, item });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      outcomeByGroup.set(group, { sku: row.sku, item: record(id, 'failed', e.message, { code: e.code }) });
    }
  }

  // live listings whose channel content changed: one content-sync job per account
  if (!dryRun) for (const accountId of accounts) await requestContentSync(ctx.c, ctx.vendorId, accountId, 'manual');

  const updated = items.filter((i) => i.status === 'done');
  if (!dryRun && updated.length) {
    await withVendor(ctx.c.database.db, ctx.vendorId, async (tx) => {
      const f = fx(tx, ctx);
      const batchId = `bulk_${ids.length}_${newId()}`;
      for (const i of updated) await f.audit({ action: 'listing.bulk_action', resourceType: 'listing', resourceId: i.id, metadata: { action: 'edit_content', fields: i.changedFields, total: items.length, batchId } });
    });
  }
  return {
    action: 'edit_content' as const, dryRun,
    summary: { total: items.length, succeeded: updated.length, failed: items.filter((i) => i.status === 'failed').length, skipped: items.filter((i) => i.status === 'skipped').length },
    results: items,
  };
}
