import { and, asc, eq, inArray, schema, sql, writeOutboxEvent, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { MovementResult } from './ledger';
import { adjustStock, availabilityFor, createTransfer, markDamaged, receiveReturn, writeOffShrinkage } from './service';
import {
  channelRef, ledgerAll, ledgerForVariants, marketplaceName, type LedgerFilters, type LedgerItem, type Thresholds, type VendorCtx,
} from './dashboard-query';

type Actor = { type: 'user' | 'api_key' | 'system' | 'webhook'; id?: string | null };
type Row = Record<string, unknown>;
const rows = async (tx: Tx, q: SQL): Promise<Row[]> => (await tx.execute<Row>(q)).rows;
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const uuidList = (ids: string[]): SQL => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

const I = schema.inventory;
const V = schema.productVariants;

// ================================================================================================
// adjustments (types: damage | return | correction | manual | shrinkage | other)
// ================================================================================================
export const ADJUSTMENT_TYPES = ['damage', 'return', 'correction', 'manual', 'shrinkage', 'other'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export interface AdjustmentInput {
  variantId: string; warehouseId: string; type: AdjustmentType;
  quantity?: number; direction?: 'increase' | 'decrease'; setOnHand?: number; disposition?: 'hold' | 'restock';
  reason: string; note?: string | null; idempotencyKey?: string | null;
}

/** request-shape rules shared by the write, the preview and the bulk action (these are the 400s) */
export function validateAdjustment(a: Pick<AdjustmentInput, 'type' | 'quantity' | 'direction' | 'setOnHand' | 'note'>): void {
  const bad = (message: string, rule: string) => { throw new AppError('BAD_REQUEST', message, { details: { rule } }); };
  if (a.type === 'other' && !(a.note && a.note.trim().length >= 2)) bad('An adjustment of type "other" needs a note explaining it', 'note_required');
  if (a.setOnHand !== undefined) {
    if (a.type !== 'correction') bad('A counted quantity (setOnHand) is only allowed for corrections', 'set_on_hand_only_for_correction');
    if (a.quantity !== undefined) bad('Provide either quantity or setOnHand, not both', 'quantity_xor_count');
    return;
  }
  if (a.quantity === undefined) bad('quantity is required', 'quantity_required');
  if (a.type === 'shrinkage' && a.direction === 'increase') bad('Shrinkage is a loss: it can only remove units', 'shrinkage_requires_decrease');
  if ((a.type === 'correction' || a.type === 'manual' || a.type === 'other') && !a.direction) bad('direction (increase or decrease) is required for this adjustment type', 'direction_required');
}

const reasonText = (a: Pick<AdjustmentInput, 'reason' | 'note'>): string => (a.note ? `${a.reason} - ${a.note}` : a.reason).slice(0, 300);

/** maps the UI adjustment type to the ledger operation (one movement) */
export async function applyAdjustment(tx: Tx, vendorId: string, actor: Actor, a: AdjustmentInput): Promise<MovementResult> {
  const result = await applyAdjustmentCore(tx, vendorId, actor, a);
  if (!result.duplicate && result.availableAfter !== result.availableBefore) {
    const [v] = await tx.select({ sku: schema.productVariants.sku }).from(schema.productVariants).where(and(eq(schema.productVariants.vendorId, vendorId), eq(schema.productVariants.id, a.variantId)));
    const [w] = await tx.select({ name: schema.warehouses.name }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), eq(schema.warehouses.id, a.warehouseId)));
    await writeOutboxEvent(tx, {
      type: 'inventory.stock_adjusted', vendorId, aggregateType: 'inventory', aggregateId: result.stock.id,
      payload: { adjustmentType: a.type, variantId: a.variantId, sku: v?.sku ?? null, warehouseId: a.warehouseId, warehouseName: w?.name ?? null, availableBefore: result.availableBefore, availableAfter: result.availableAfter, reason: a.reason },
    });
  }
  return result;
}

async function applyAdjustmentCore(tx: Tx, vendorId: string, actor: Actor, a: AdjustmentInput): Promise<MovementResult> {
  validateAdjustment(a);
  const base = { vendorId, variantId: a.variantId, warehouseId: a.warehouseId, reason: reasonText(a), idempotencyKey: a.idempotencyKey ?? null, actor };
  if (a.setOnHand !== undefined) return adjustStock(tx, { ...base, setOnHand: a.setOnHand });
  const q = a.quantity!;
  switch (a.type) {
    case 'damage': return markDamaged(tx, { ...base, quantity: q, restore: a.direction === 'increase' });
    case 'return': return receiveReturn(tx, { ...base, quantity: q, disposition: a.disposition ?? 'hold' });
    case 'shrinkage': return writeOffShrinkage(tx, { ...base, quantity: q });
    default: return adjustStock(tx, { ...base, delta: a.direction === 'decrease' ? -q : q });
  }
}

class PreviewRollback extends Error {
  constructor(readonly result: MovementResult) { super('preview rollback'); }
}

export interface AdjustmentPreview { currentAvailable: number; adjustment: number; newAvailable: number; warnings: Array<{ code: string; message: string }>; buckets: { onHand: number; reserved: number; incoming: number; returned: number; damaged: number; quarantined: number } }

/**
 * Dry run = the real write inside a savepoint that is rolled back, so the preview fails with EXACTLY the errors the write
 * would (never negative, never below reserved) and nothing (movement, outbox event, audit) is kept.
 */
export async function previewAdjustment(tx: Tx, vendorId: string, actor: Actor, a: AdjustmentInput): Promise<AdjustmentPreview> {
  validateAdjustment(a);
  let result: MovementResult | null = null;
  try {
    await tx.transaction(async (sp) => {
      throw new PreviewRollback(await applyAdjustment(sp as unknown as Tx, vendorId, actor, { ...a, idempotencyKey: null }));
    });
  } catch (e) {
    if (e instanceof PreviewRollback) result = e.result;
    else throw e;
  }
  const s = result!.stock;
  const warnings: AdjustmentPreview['warnings'] = [];
  if (result!.availableAfter <= 0) warnings.push({ code: 'stockout', message: 'No stock will be available to sell after this change.' });
  else if (s.reorderLevel !== null && result!.availableAfter <= s.reorderLevel) warnings.push({ code: 'low_stock', message: `Available stock will be at or below the reorder level (${s.reorderLevel}).` });
  if (a.type === 'return' && (a.disposition ?? 'hold') === 'hold') warnings.push({ code: 'held_for_inspection', message: 'Returned units are held for inspection and are not sellable yet.' });
  if (a.type === 'damage' && a.direction !== 'increase') warnings.push({ code: 'moves_to_damaged', message: 'Units move to Damaged stock and are no longer sellable.' });
  if (a.type === 'shrinkage') warnings.push({ code: 'recorded_as_loss', message: 'The units are written off as shrinkage (a loss) and leave the books.' });
  return {
    currentAvailable: result!.availableBefore, adjustment: result!.availableAfter - result!.availableBefore, newAvailable: result!.availableAfter, warnings,
    buckets: { onHand: s.quantityOnHand, reserved: s.quantityReserved, incoming: s.quantityIncoming, returned: s.quantityReturned, damaged: s.quantityDamaged, quarantined: s.quantityQuarantined },
  };
}

// ================================================================================================
// saved groups
// ================================================================================================
const G = schema.inventoryGroups;
const GI = schema.inventoryGroupItems;

export const toGroupDto = (g: typeof G.$inferSelect, itemCount: number) => ({ id: g.id, name: g.name, itemCount, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() });

export async function listGroups(tx: Tx, vendorId: string) {
  const gs = await tx.select().from(G).where(eq(G.vendorId, vendorId)).orderBy(asc(G.name));
  const counts = await rows(tx, sql`select group_id, count(*)::int c from inventory_group_items where vendor_id = ${vendorId}::uuid group by 1`);
  const cm = new Map(counts.map((c) => [String(c.group_id), n(c.c)]));
  return gs.map((g) => toGroupDto(g, cm.get(g.id) ?? 0));
}

async function loadGroup(tx: Tx, vendorId: string, id: string, lock = false) {
  const q = tx.select().from(G).where(and(eq(G.id, id), eq(G.vendorId, vendorId)));
  const [g] = await (lock ? q.for('update') : q);
  if (!g) throw Errors.notFound('Inventory group', id);
  return g;
}
const groupCount = async (tx: Tx, vendorId: string, groupId: string) => n((await rows(tx, sql`select count(*)::int c from inventory_group_items where vendor_id = ${vendorId}::uuid and group_id = ${groupId}::uuid`))[0]?.c);

export async function createGroup(tx: Tx, vendorId: string, createdBy: string, name: string) {
  const dup = await tx.select({ id: G.id }).from(G).where(and(eq(G.vendorId, vendorId), sql`lower(${G.name}) = lower(${name})`));
  if (dup.length) throw new AppError('CONFLICT', 'A saved group with this name already exists', { details: { rule: 'group_name_taken' } });
  const [g] = await tx.insert(G).values({ vendorId, name, createdBy }).returning();
  return toGroupDto(g!, 0);
}

export async function addToGroup(tx: Tx, vendorId: string, groupId: string, variantIds: string[]) {
  const g = await loadGroup(tx, vendorId, groupId, true);
  const ids = [...new Set(variantIds)];
  const found = await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), inArray(V.id, ids)));
  if (found.length !== ids.length) throw Errors.notFound('Variant');
  const ins = await tx.insert(GI).values(ids.map((variantId) => ({ vendorId, groupId, variantId }))).onConflictDoNothing().returning({ id: GI.id });
  await tx.update(G).set({ updatedAt: new Date() }).where(eq(G.id, groupId));
  return { group: toGroupDto(g, await groupCount(tx, vendorId, groupId)), added: ins.length, alreadyInGroup: ids.length - ins.length };
}

export async function deleteGroup(tx: Tx, vendorId: string, groupId: string) {
  await loadGroup(tx, vendorId, groupId);
  await tx.delete(G).where(and(eq(G.id, groupId), eq(G.vendorId, vendorId)));
}

export async function removeFromGroup(tx: Tx, vendorId: string, groupId: string, variantId: string) {
  const g = await loadGroup(tx, vendorId, groupId, true);
  const del = await tx.delete(GI).where(and(eq(GI.vendorId, vendorId), eq(GI.groupId, groupId), eq(GI.variantId, variantId))).returning({ id: GI.id });
  if (!del.length) throw Errors.notFound('Group item', variantId);
  return toGroupDto(g, await groupCount(tx, vendorId, groupId));
}

// ================================================================================================
// channel synchronisation (state of every connected marketplace account)
// ================================================================================================
const ACTIVE_JOB = ['queued', 'running', 'retrying'];
export type ChannelState = 'healthy' | 'syncing' | 'attention' | 'failed' | 'not_connected';

export async function channelSync(tx: Tx, vendorId: string, th: { master: { available: number; lastUpdateAt: string | null } }) {
  const accounts = await rows(tx, sql`select id, marketplace, display_name, status, connection_status, last_synced_at, last_failure_at, last_failure_message
    from marketplace_accounts where vendor_id = ${vendorId}::uuid order by created_at`);
  const lst = await rows(tx, sql`
    with x as (
      select l.marketplace_account_id acc, l.id listing_id, l.variant_id, l.external_sku, l.pushed_quantity, lu.status last_status, lu.error_message, lu.error_code, lu.completed_at,
        (coalesce(lu.status, '') = 'failed' or (not l.quantity_dirty and l.sellable_quantity is not null and l.pushed_quantity is distinct from l.sellable_quantity)) affected, v.product_id
      from marketplace_listings l join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id
      left join lateral (select u.status, u.error_message, u.error_code, u.completed_at from channel_stock_updates u where u.vendor_id = l.vendor_id and u.listing_id = l.id order by u.requested_at desc limit 1) lu on true
      where l.vendor_id = ${vendorId}::uuid and l.status = 'active')
    select acc, count(*)::int listings, coalesce(sum(pushed_quantity), 0)::int sent_units, count(*) filter (where affected)::int affected_skus,
      count(distinct variant_id) filter (where affected)::int affected_variants, count(distinct product_id) filter (where affected)::int affected_products,
      max(completed_at) filter (where last_status = 'failed') last_failed_at,
      (array_agg(error_message order by completed_at desc nulls last) filter (where last_status = 'failed' and error_message is not null))[1] last_error
    from x group by acc`);
  const jobs = await rows(tx, sql`
    select distinct on (marketplace_account_id) marketplace_account_id acc, status, finished_at, error, progress, stats, failure_details
    from sync_jobs where vendor_id = ${vendorId}::uuid and type = 'inventory' and marketplace_account_id is not null
      and status not in ('queued', 'running', 'retrying', 'cancelled')
    order by marketplace_account_id, created_at desc`);
  const active = await rows(tx, sql`select marketplace_account_id acc, count(*)::int jobs, coalesce(sum((progress->>'total')::int), 0)::int total, coalesce(sum((progress->>'done')::int), 0)::int done
    from sync_jobs where vendor_id = ${vendorId}::uuid and type = 'inventory' and status in (${sql.join(ACTIVE_JOB.map((s) => sql`${s}`), sql`, `)}) group by 1`);
  const lastOk = await rows(tx, sql`select max(finished_at) at from sync_jobs where vendor_id = ${vendorId}::uuid and type = 'inventory' and status = 'succeeded'`);

  const by = <T extends Row>(rs: T[], key = 'acc') => new Map(rs.map((r) => [String(r[key]), r]));
  const lm = by(lst), jm = by(jobs), am = by(active);

  const channels = accounts.map((a) => {
    const id = String(a.id), l = lm.get(id), j = jm.get(id), act = am.get(id);
    const connected = String(a.status) === 'active' && !['disconnected', 'unauthorized'].includes(String(a.connection_status));
    const affected = n(l?.affected_skus);
    const jobFailed = j && ['failed', 'dead_lettered'].includes(String(j.status));
    const state: ChannelState = !connected ? 'not_connected' : act ? 'syncing' : jobFailed ? 'failed' : affected > 0 ? 'attention' : 'healthy';
    const lastSyncAt = iso(a.last_synced_at);
    const jobMsg = j ? (j.error as { message?: string } | null)?.message : undefined;
    const reason = [l?.last_error, jobMsg, a.last_failure_message].find((x) => typeof x === 'string' && x.length > 0) as string | undefined ?? null;
    const failedAt = iso(l?.last_failed_at) ?? (jobFailed ? iso(j!.finished_at) : null);
    return {
      channel: channelRef(String(a.marketplace), id), accountName: String(a.display_name), state, lastSyncAt, lastSyncLabel: lastSyncAt ? ('reported' as const) : ('not_reported' as const),
      sentUnits: n(l?.sent_units), listings: n(l?.listings), affectedSkus: affected, affectedProducts: n(l?.affected_products), _variants: n(l?.affected_variants), _reason: reason, _failedAt: failedAt,
      _active: act ? { jobs: n(act.jobs), total: n(act.total), done: n(act.done) } : null,
    };
  });

  const incidents = channels.filter((c) => c.state === 'attention' || c.state === 'failed').map((c) => ({
    id: `inventory-sync:${c.channel.accountId}`, channel: c.channel, title: `${marketplaceName(c.channel.code)} inventory sync needs attention`,
    reason: c._reason ?? 'The marketplace rejected the inventory update',
    affected: { skus: c.affectedSkus, variants: c._variants, products: c.affectedProducts }, lastFailedAt: c._failedAt,
    actions: [
      { key: 'retry_sync', label: 'Retry sync', method: 'POST', href: '/api/v1/inventory/channel-sync', body: { accountId: c.channel.accountId }, enabled: true, disabledReason: null as string | null },
      { key: 'view_affected', label: 'View affected items', method: 'GET', href: `/api/v1/inventory/channel-sync/${c.channel.accountId}/affected`, body: null, enabled: true, disabledReason: null as string | null },
    ],
  }));

  const syncing = channels.filter((c) => c._active);
  return {
    master: { available: th.master.available, lastUpdateAt: th.master.lastUpdateAt },
    channels: channels.map(({ _variants, _reason, _failedAt, _active, ...c }) => c),
    incidents,
    operations: {
      syncing: { channels: syncing.length, skus: syncing.reduce((s, c) => s + (c._active?.total ?? 0), 0), progress: syncing.length ? { done: syncing.reduce((s, c) => s + (c._active?.done ?? 0), 0), total: syncing.reduce((s, c) => s + (c._active?.total ?? 0), 0) } : null },
      lastSuccessAt: iso(lastOk[0]?.at),
      requireReview: { skus: channels.reduce((s, c) => s + c.affectedSkus, 0), channels: channels.filter((c) => c.affectedSkus > 0).length },
      failed: { channels: channels.filter((c) => c.state === 'failed').length },
    },
  };
}

export async function masterSummary(tx: Tx, vendorId: string) {
  const [r] = await rows(tx, sql`select coalesce(sum(i.quantity_on_hand - i.quantity_reserved), 0)::int available, max(i.updated_at) last_at
    from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id where i.vendor_id = ${vendorId}::uuid and w.status = 'active' and w.deleted_at is null`);
  const [m] = await rows(tx, sql`select max(created_at) at from inventory_movements where vendor_id = ${vendorId}::uuid`);
  return { available: n(r?.available), lastUpdateAt: iso(m?.at) ?? iso(r?.last_at) };
}

export async function affectedListings(tx: Tx, vendorId: string, accountId: string, w: { limit: number; offset: number }) {
  const [a] = await tx.select({ id: schema.marketplaceAccounts.id }).from(schema.marketplaceAccounts).where(and(eq(schema.marketplaceAccounts.id, accountId), eq(schema.marketplaceAccounts.vendorId, vendorId)));
  if (!a) throw Errors.notFound('Marketplace account', accountId);
  const base = sql`
    with x as (
      select l.id listing_id, l.variant_id, l.external_sku, l.pushed_quantity, l.sellable_quantity, v.sku, p.title, lu.status last_status, lu.error_code, lu.error_message, lu.requested_at, lu.requested_quantity
      from marketplace_listings l join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
      left join lateral (select u.status, u.error_code, u.error_message, u.requested_at, u.requested_quantity from channel_stock_updates u where u.vendor_id = l.vendor_id and u.listing_id = l.id order by u.requested_at desc limit 1) lu on true
      where l.vendor_id = ${vendorId}::uuid and l.marketplace_account_id = ${accountId}::uuid and l.status = 'active'
        and (coalesce(lu.status, '') = 'failed' or (not l.quantity_dirty and l.sellable_quantity is not null and l.pushed_quantity is distinct from l.sellable_quantity)))`;
  const total = n((await rows(tx, sql`${base} select count(*)::int c from x`))[0]?.c);
  const rs = await rows(tx, sql`${base} select * from x order by requested_at desc nulls last, sku limit ${w.limit} offset ${w.offset}`);
  const av = await availabilityFor(tx, vendorId, rs.map((r) => String(r.variant_id)));
  return {
    total,
    items: rs.map((r) => ({
      variantId: String(r.variant_id), listingId: String(r.listing_id), sku: String(r.sku), title: String(r.title), masterAvailable: av.get(String(r.variant_id))?.available ?? 0,
      channelQuantity: r.pushed_quantity === null ? null : n(r.pushed_quantity), requestedQuantity: r.requested_quantity === null || r.requested_quantity === undefined ? null : n(r.requested_quantity),
      lastError: r.last_status === 'failed' ? { code: r.error_code ? String(r.error_code) : null, message: r.error_message ? String(r.error_message) : null } : null, lastTriedAt: iso(r.requested_at),
    })),
  };
}

export async function connectedAccountIds(tx: Tx, vendorId: string, accountId?: string): Promise<Array<{ id: string; marketplace: string }>> {
  const as = await tx.select({ id: schema.marketplaceAccounts.id, marketplace: schema.marketplaceAccounts.marketplace, status: schema.marketplaceAccounts.status })
    .from(schema.marketplaceAccounts).where(and(eq(schema.marketplaceAccounts.vendorId, vendorId), accountId ? eq(schema.marketplaceAccounts.id, accountId) : eq(schema.marketplaceAccounts.status, 'active')));
  if (accountId && !as.length) throw Errors.notFound('Marketplace account', accountId);
  return as;
}

export interface SyncOutcome { status: number; jobId: string | null; alreadyQueued: boolean; error: { code: string; message: string } | null }
export type SyncAccount = (accountId: string) => Promise<SyncOutcome>;

// ================================================================================================
// bulk operations
// ================================================================================================
export const BULK_IDS_MAX = 500;
export const BULK_ALL_MAX = 5_000;
export const EXPORT_MAX = 50_000;
/** runtime caps (the constants above are the documented defaults; tests lower them to exercise the 413 path cheaply) */
export const bulkLimits = { allMax: BULK_ALL_MAX, exportMax: EXPORT_MAX };

export type Selection = { mode: 'ids'; ids: string[] } | { mode: 'all_matching'; filters: LedgerFilters };
export type BulkAction = 'adjust' | 'transfer' | 'export' | 'sync' | 'group';
export interface BulkParams {
  type?: AdjustmentType; quantity?: number; direction?: 'increase' | 'decrease'; reason?: string; note?: string | null; setOnHand?: number; disposition?: 'hold' | 'restock'; warehouseId?: string;
  fromWarehouseId?: string; toWarehouseId?: string; notes?: string | null; groupId?: string; groupName?: string;
}
export interface BulkResultRow { variantId: string; sku: string | null; ok: boolean; error?: { code: string; message: string } }

export const CSV_HEADER = ['SKU', 'Product', 'Barcode', 'Warehouse', 'Available', 'Reserved', 'Incoming', 'Returned', 'Damaged', 'Quarantined', 'Units per day', 'Cover days', 'Lead time days', 'Health', 'Channel sync', 'Last movement'];
export const csvRow = (i: LedgerItem) => [i.sku, i.title, i.barcode, i.warehouse?.name ?? '', i.available, i.reserved, i.incoming, i.returned, i.damaged, i.quarantined, i.unitsPerDay, i.coverDays, i.leadTimeDays, i.health, i.channelSync, i.lastMovementAt];

const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
/** RFC 4180 CSV with spreadsheet-formula-safe cells (same rule as the catalog exports) */
export function toCsv(rs: Array<Array<string | number | boolean | null | undefined>>): string {
  return rs.map((r) => r.map((c) => { const s = c === null || c === undefined ? '' : safeCell(String(c)); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n') + '\r\n';
}

const errOf = (e: unknown): { code: string; message: string } => (e instanceof AppError ? { code: e.code, message: e.message } : { code: 'INTERNAL', message: e instanceof Error ? e.message : 'failed' });

/** resolves the selection to variant ids; `all_matching` is bounded (413 beyond BULK_ALL_MAX) */
export async function resolveSelection(tx: Tx, vendorId: string, vctx: VendorCtx, sel: Selection, th: Thresholds): Promise<{ ids: string[]; skus: Map<string, string> }> {
  if (sel.mode === 'ids') {
    const ids = [...new Set(sel.ids)];
    if (ids.length > BULK_IDS_MAX) throw new AppError('PAYLOAD_TOO_LARGE', `At most ${BULK_IDS_MAX} products can be selected by id`, { details: { max: BULK_IDS_MAX } });
    const vs = await tx.select({ id: V.id, sku: V.sku }).from(V).where(and(eq(V.vendorId, vendorId), inArray(V.id, ids)));
    return { ids: ids.filter((i) => vs.some((v) => v.id === i)), skus: new Map(vs.map((v) => [v.id, v.sku])) };
  }
  const all = await ledgerAll(tx, vendorId, vctx, sel.filters, bulkLimits.allMax, th);
  if (all.tooMany) throw new AppError('PAYLOAD_TOO_LARGE', `More than ${bulkLimits.allMax} products match. Narrow the filters and try again.`, { details: { max: bulkLimits.allMax } });
  return { ids: all.items.map((i) => i.variantId), skus: new Map(all.items.map((i) => [i.variantId, i.sku])) };
}

export async function runBulk(tx: Tx, o: {
  vendorId: string; vctx: VendorCtx; actor: Actor; createdBy: string; sel: Selection; action: BulkAction; params: BulkParams; th: Thresholds;
}) {
  const { vendorId, vctx, actor, params: p } = o;
  const { ids, skus } = await resolveSelection(tx, vendorId, vctx, o.sel, o.th);
  const unknown = o.sel.mode === 'ids' ? [...new Set(o.sel.ids)].filter((i) => !skus.has(i)) : [];
  const results: BulkResultRow[] = unknown.map((variantId) => ({ variantId, sku: null, ok: false, error: { code: 'NOT_FOUND', message: 'Variant not found' } }));
  const extra: Record<string, unknown> = {};
  const per = async (variantId: string, fn: (sp: Tx) => Promise<void>) => {
    try {
      await tx.transaction(async (sp) => { await fn(sp as unknown as Tx); });
      results.push({ variantId, sku: skus.get(variantId) ?? null, ok: true });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      results.push({ variantId, sku: skus.get(variantId) ?? null, ok: false, error: errOf(e) });
    }
  };

  if (o.action === 'adjust') {
    if (!p.type || !p.reason) throw new AppError('BAD_REQUEST', 'params.type and params.reason are required for a bulk adjustment', { details: { rule: 'params_required' } });
    validateAdjustment({ type: p.type, quantity: p.quantity, direction: p.direction, setOnHand: p.setOnHand, note: p.note });
    const where = p.warehouseId ? null : await topWarehouses(tx, vendorId, ids);
    for (const variantId of ids) {
      await per(variantId, async (sp) => {
        const warehouseId = p.warehouseId ?? where!.get(variantId);
        if (!warehouseId) throw new AppError('NOT_FOUND', 'This product has no stock location; pass params.warehouseId');
        await applyAdjustment(sp, vendorId, actor, { variantId, warehouseId, type: p.type!, quantity: p.quantity, direction: p.direction, setOnHand: p.setOnHand, disposition: p.disposition, reason: p.reason!, note: p.note ?? null });
      });
    }
  } else if (o.action === 'transfer') {
    if (!p.fromWarehouseId || !p.toWarehouseId || !p.quantity) throw new AppError('BAD_REQUEST', 'params.fromWarehouseId, params.toWarehouseId and params.quantity are required for a bulk transfer', { details: { rule: 'params_required' } });
    const whs = await tx.select({ id: schema.warehouses.id }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), inArray(schema.warehouses.id, [p.fromWarehouseId, p.toWarehouseId])));
    if (whs.length !== new Set([p.fromWarehouseId, p.toWarehouseId]).size) throw Errors.notFound('Warehouse');
    const ok: string[] = [];
    const av = await rows(tx, sql`select variant_id, (quantity_on_hand - quantity_reserved)::int a from inventory where vendor_id = ${vendorId}::uuid and warehouse_id = ${p.fromWarehouseId}::uuid and variant_id in (${ids.length ? uuidList(ids) : sql`null::uuid`})`);
    const am = new Map(av.map((r) => [String(r.variant_id), n(r.a)]));
    for (const variantId of ids) {
      const a = am.get(variantId) ?? 0;
      if (a < p.quantity) results.push({ variantId, sku: skus.get(variantId) ?? null, ok: false, error: { code: 'INSUFFICIENT_STOCK', message: `Only ${a} available in the source warehouse` } });
      else ok.push(variantId);
    }
    if (ok.length) {
      const t = await createTransfer(tx, vendorId, { fromWarehouseId: p.fromWarehouseId, toWarehouseId: p.toWarehouseId, items: ok.map((variantId) => ({ variantId, quantity: p.quantity! })), notes: p.notes ?? null });
      extra.transfer = { id: t.t.id, number: t.t.number, status: t.t.status, items: t.items.length };
      for (const variantId of ok) results.push({ variantId, sku: skus.get(variantId) ?? null, ok: true });
    }
  } else if (o.action === 'group') {
    let groupId = p.groupId;
    if (!groupId) {
      if (!p.groupName) throw new AppError('BAD_REQUEST', 'params.groupId or params.groupName is required', { details: { rule: 'params_required' } });
      const [existing] = await tx.select({ id: G.id }).from(G).where(and(eq(G.vendorId, vendorId), sql`lower(${G.name}) = lower(${p.groupName})`));
      groupId = existing?.id ?? (await createGroup(tx, vendorId, o.createdBy, p.groupName)).id;
    } else await loadGroup(tx, vendorId, groupId);
    for (const variantId of ids) await per(variantId, async (sp) => { await sp.insert(GI).values({ vendorId, groupId: groupId!, variantId }).onConflictDoNothing(); });
    extra.group = toGroupDto(await loadGroup(tx, vendorId, groupId), await groupCount(tx, vendorId, groupId));
  } else if (o.action === 'export') {
    const items = [...(await ledgerForVariants(tx, vendorId, vctx, ids, o.th)).values()].sort((a, b) => a.sku.localeCompare(b.sku));
    extra.export = { filename: `inventory-${new Date().toISOString().slice(0, 10)}.csv`, contentType: 'text/csv', rows: items.length, csv: toCsv([CSV_HEADER, ...items.map(csvRow)]) };
    for (const variantId of ids) results.push({ variantId, sku: skus.get(variantId) ?? null, ok: items.some((i) => i.variantId === variantId), ...(items.some((i) => i.variantId === variantId) ? {} : { error: { code: 'NOT_TRACKED', message: 'This product has no stock record' } }) });
  } else if (o.action === 'sync') {
    const ls = ids.length ? await rows(tx, sql`select distinct l.variant_id, l.marketplace_account_id acc from marketplace_listings l where l.vendor_id = ${vendorId}::uuid and l.status = 'active' and l.variant_id in (${uuidList(ids)})`) : [];
    const accounts = [...new Set(ls.map((l) => String(l.acc)))];
    const listed = new Set(ls.map((l) => String(l.variant_id)));
    extra.syncAccounts = accounts; // queued by the caller AFTER this transaction closes (the sync route needs its own connection)
    for (const variantId of ids) results.push({ variantId, sku: skus.get(variantId) ?? null, ok: listed.has(variantId), ...(listed.has(variantId) ? {} : { error: { code: 'NOT_LISTED', message: 'This product has no live channel listing to sync' } }) });
  }
  return { action: o.action, total: results.length, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results, ...extra };
}

/** the warehouse holding the most sellable stock of each variant (target of a bulk adjustment without an explicit location) */
async function topWarehouses(tx: Tx, vendorId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rs = await tx.select({ variantId: I.variantId, warehouseId: I.warehouseId }).from(I)
    .innerJoin(schema.warehouses, and(eq(schema.warehouses.id, I.warehouseId), eq(schema.warehouses.vendorId, I.vendorId)))
    .where(and(eq(I.vendorId, vendorId), inArray(I.variantId, ids), eq(schema.warehouses.status, 'active'), sql`${schema.warehouses.deletedAt} IS NULL`))
    .orderBy(sql`${I.quantityOnHand} - ${I.quantityReserved} desc`, schema.warehouses.code);
  const out = new Map<string, string>();
  for (const r of rs) if (!out.has(r.variantId)) out.set(r.variantId, r.warehouseId);
  return out;
}

