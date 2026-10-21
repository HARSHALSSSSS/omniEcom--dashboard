import { randomInt } from 'node:crypto';
import { and, desc, eq, escapeLike, ilike, inArray, isNull, or, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, type OpCtx } from '@oms/module-kit';
import { validateTerms, type Terms } from '../domain/terms';
import { isEditable, type Status } from '../domain/lifecycle';
import { assertAccounts, loadCampaign, type CampaignRow, type Selection } from '../infrastructure/queries';
import { evaluateItems, loadItems, setItems, termsOf, type SetItemsResult } from './items';
import { campaignVelocity, type Velocity } from './results';

const C = schema.promotionCampaigns;
const I = schema.promotionItems;
const A = schema.marketplaceAccounts;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface CampaignInput {
  name: string; code?: string | null; description?: string | null; type: Terms['type'];
  valueBps?: number | null; valueMinor?: number | null; buyQuantity?: number | null; getQuantity?: number | null;
  minOrderMinor?: number; budgetMinor?: number; startsAt?: Date | null; endsAt?: Date | null; accountIds?: string[];
}
export type CampaignPatch = Partial<CampaignInput> & { version: number };

const normalizeCode = (code: string) => code.trim().toUpperCase();

async function codeTaken(tx: Tx, vendorId: string, code: string, exceptId?: string): Promise<boolean> {
  const [row] = await tx.select({ id: C.id }).from(C).where(and(eq(C.vendorId, vendorId), isNull(C.deletedAt), sql`lower(${C.code}) = ${code.toLowerCase()}`, exceptId ? sql`${C.id} <> ${exceptId}` : undefined)).limit(1);
  return Boolean(row);
}
const duplicateCode = (code: string) => Errors.conflict(`The code ${code} is already used by another campaign`, { rule: 'duplicate_code', code });

async function freshCode(tx: Tx, vendorId: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = `PROMO${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')}`;
    if (!(await codeTaken(tx, vendorId, code))) return code;
  }
  throw new AppError('CONFLICT', 'Could not generate a free campaign code, send one', { details: { rule: 'code_generation_failed' } });
}

function assertWindow(startsAt: Date | null | undefined, endsAt: Date | null | undefined): void {
  if (startsAt && endsAt && endsAt <= startsAt) throw Errors.validation({ rule: 'invalid_window', issues: [{ path: 'endsAt', message: 'must be after startsAt' }] });
}

export async function createCampaign(tx: Tx, ctx: OpCtx, input: CampaignInput, selection: Selection | undefined, now: Date): Promise<{ row: CampaignRow; items: SetItemsResult | null }> {
  const terms: Terms = { type: input.type, valueBps: input.valueBps ?? null, valueMinor: input.valueMinor ?? null, buyQuantity: input.buyQuantity ?? null, getQuantity: input.getQuantity ?? null };
  validateTerms(terms);
  assertWindow(input.startsAt, input.endsAt);
  const accountIds = [...new Set(input.accountIds ?? [])];
  await assertAccounts(tx, ctx.vendorId, accountIds);
  const code = input.code ? normalizeCode(input.code) : await freshCode(tx, ctx.vendorId);
  if (input.code && (await codeTaken(tx, ctx.vendorId, code))) throw duplicateCode(code);
  const [row] = await tx.insert(C).values({
    vendorId: ctx.vendorId, name: input.name.trim(), code, description: input.description?.trim() || null, ...terms,
    minOrderMinor: input.minOrderMinor ?? 0, budgetMinor: input.budgetMinor ?? 0, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, accountIds, createdBy: ctx.actor.id,
  }).returning();
  const items = selection && (selection.variantIds?.length || selection.categoryIds?.length || selection.allActive) ? await setItems(tx, ctx, row!, selection, 'replace', now) : null;
  const fx = effects(tx, ctx);
  await fx.audit({ action: 'promotion.created', resourceType: 'promotion_campaign', resourceId: row!.id, after: { name: row!.name, code, type: row!.type, items: items?.total ?? 0 } });
  await fx.event({ type: 'promotion.created', aggregateType: 'promotion_campaign', aggregateId: row!.id, payload: { campaignId: row!.id, code, name: row!.name, type: row!.type } });
  return { row: row!, items };
}

export async function updateCampaign(tx: Tx, ctx: OpCtx, id: string, patch: CampaignPatch, now: Date): Promise<CampaignRow> {
  const cur = await loadCampaign(tx, ctx.vendorId, id, true);
  if (!isEditable(cur.status as Status)) throw new AppError('INVALID_STATE', 'Only a draft campaign can be edited', { details: { rule: 'campaign_not_editable', status: cur.status } });
  if (patch.version !== cur.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: cur.version } });
  const type = patch.type ?? (cur.type as Terms['type']);
  // changing the type starts from a clean slate: the fields of the old type are dropped unless sent again
  const reset = patch.type !== undefined && patch.type !== cur.type;
  const pick = <K extends 'valueBps' | 'valueMinor' | 'buyQuantity' | 'getQuantity'>(k: K): number | null => (patch[k] !== undefined ? (patch[k] as number | null) : reset ? null : cur[k]);
  const terms: Terms = { type, valueBps: pick('valueBps'), valueMinor: pick('valueMinor'), buyQuantity: pick('buyQuantity'), getQuantity: pick('getQuantity') };
  validateTerms(terms);
  const startsAt = patch.startsAt !== undefined ? patch.startsAt : cur.startsAt;
  const endsAt = patch.endsAt !== undefined ? patch.endsAt : cur.endsAt;
  assertWindow(startsAt, endsAt);
  const accountIds = patch.accountIds ? [...new Set(patch.accountIds)] : cur.accountIds;
  if (patch.accountIds) await assertAccounts(tx, ctx.vendorId, accountIds);
  const code = patch.code ? normalizeCode(patch.code) : cur.code;
  if (code.toLowerCase() !== cur.code.toLowerCase() && (await codeTaken(tx, ctx.vendorId, code, cur.id))) throw duplicateCode(code);
  const [row] = await tx.update(C).set({
    name: patch.name?.trim() ?? cur.name, code, description: patch.description !== undefined ? patch.description?.trim() || null : cur.description, ...terms,
    minOrderMinor: patch.minOrderMinor ?? cur.minOrderMinor, budgetMinor: patch.budgetMinor ?? cur.budgetMinor, startsAt, endsAt, accountIds, version: sql`${C.version} + 1`,
  }).where(eq(C.id, cur.id)).returning();
  await evaluateItems(tx, ctx, row!, now); // prices, accounts and dates decide the eligibility of every product
  await effects(tx, ctx).audit({ action: 'promotion.updated', resourceType: 'promotion_campaign', resourceId: cur.id, before: { name: cur.name, code: cur.code, type: cur.type, valueBps: cur.valueBps, valueMinor: cur.valueMinor, budgetMinor: cur.budgetMinor }, after: { name: row!.name, code, type, valueBps: terms.valueBps, valueMinor: terms.valueMinor, budgetMinor: row!.budgetMinor } });
  return row!;
}

export async function deleteCampaign(tx: Tx, ctx: OpCtx, id: string, version?: number): Promise<void> {
  const cur = await loadCampaign(tx, ctx.vendorId, id, true);
  if (!isEditable(cur.status as Status)) throw new AppError('INVALID_STATE', 'Only a draft campaign can be deleted', { details: { rule: 'campaign_not_editable', status: cur.status } });
  if (version !== undefined && version !== cur.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: cur.version } });
  await tx.update(C).set({ deletedAt: new Date(), version: sql`${C.version} + 1` }).where(eq(C.id, cur.id));
  await tx.delete(I).where(and(eq(I.vendorId, ctx.vendorId), eq(I.campaignId, cur.id)));
  await effects(tx, ctx).audit({ action: 'promotion.deleted', resourceType: 'promotion_campaign', resourceId: cur.id, before: { name: cur.name, code: cur.code, status: cur.status } });
}

/** a copy as a new draft: no dates, no results, the same products re-priced and re-checked */
export async function duplicateCampaign(tx: Tx, ctx: OpCtx, id: string, now: Date): Promise<CampaignRow> {
  const src = await loadCampaign(tx, ctx.vendorId, id);
  let code = `${src.code.slice(0, 26)}-COPY`;
  for (let n = 2; await codeTaken(tx, ctx.vendorId, code); n++) code = `${src.code.slice(0, 24)}-COPY${n}`;
  const { row } = await createCampaign(tx, ctx, {
    name: `${src.name.slice(0, 112)} (copy)`, code, description: src.description, ...termsOf(src), minOrderMinor: src.minOrderMinor, budgetMinor: src.budgetMinor, accountIds: src.accountIds,
  }, { variantIds: (await loadItems(tx, ctx.vendorId, src.id)).map((i) => i.variantId) }, now);
  await effects(tx, ctx).audit({ action: 'promotion.duplicated', resourceType: 'promotion_campaign', resourceId: row.id, metadata: { sourceId: src.id } });
  return row;
}

// ------------------------------------------------------------------------------------------------
// reads
// ------------------------------------------------------------------------------------------------
export interface ListFilters { status?: string; type?: string; q?: string }

const listWhere = (vendorId: string, f: ListFilters, withStatus: boolean): SQL | undefined => and(
  eq(C.vendorId, vendorId), isNull(C.deletedAt),
  withStatus && f.status ? eq(C.status, f.status) : undefined, f.type ? eq(C.type, f.type) : undefined,
  f.q?.trim() ? or(ilike(C.name, `%${escapeLike(f.q.trim())}%`), ilike(C.code, `%${escapeLike(f.q.trim())}%`)) : undefined,
);

export async function listCampaigns(tx: Tx, vendorId: string, f: ListFilters, win: { limit: number; offset: number }) {
  const [rows, [total], grouped] = await Promise.all([
    tx.select().from(C).where(listWhere(vendorId, f, true)).orderBy(desc(C.createdAt), desc(C.id)).limit(win.limit).offset(win.offset),
    tx.select({ n: sql<string>`count(*)` }).from(C).where(listWhere(vendorId, f, true)),
    tx.select({ status: C.status, n: sql<string>`count(*)` }).from(C).where(listWhere(vendorId, f, false)).groupBy(C.status),
  ]);
  const counts: Record<string, number> = { all: 0, draft: 0, scheduled: 0, active: 0, ended: 0, cancelled: 0 };
  for (const g of grouped) { counts[g.status] = Number(g.n); counts.all! += Number(g.n); }
  return { rows, total: Number(total?.n ?? 0), counts };
}

export interface AccountLite { id: string; marketplace: string; displayName: string; status: string }
export const vendorAccounts = (tx: Tx, vendorId: string): Promise<AccountLite[]> =>
  tx.select({ id: A.id, marketplace: A.marketplace, displayName: A.displayName, status: A.status }).from(A).where(eq(A.vendorId, vendorId)).orderBy(A.createdAt);

/** why ended campaigns ended, from the audit trail (the campaign row has no column for it) */
export async function endReasons(tx: Tx, vendorId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await tx.select({ id: schema.auditLogs.resourceId, reason: sql<string | null>`${schema.auditLogs.metadata}->>'reason'` }).from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.vendorId, vendorId), eq(schema.auditLogs.resourceType, 'promotion_campaign'), inArray(schema.auditLogs.resourceId, ids), inArray(schema.auditLogs.action, ['promotion.ended', 'promotion.cancelled']))).orderBy(desc(schema.auditLogs.id));
  for (const r of rows) if (r.id && r.reason && !out.has(r.id)) out.set(r.id, r.reason);
  return out;
}

export async function campaignDetail(tx: Tx, vendorId: string, id: string, now: Date): Promise<{ row: CampaignRow; velocity: Velocity }> {
  const row = await loadCampaign(tx, vendorId, id);
  return { row, velocity: await campaignVelocity(tx, row, now) };
}

