import { and, eq, inArray, schema, sql, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import type { OpCtx } from '@oms/module-kit';
import { evaluateVariant, type Verdict } from '../domain/eligibility';
import { promoPrice, type Terms } from '../domain/terms';
import { MAX_ITEMS, accountFacts, resolveSelection, targetAccounts, variantInfo, type CampaignRow, type ItemRow, type Selection, type TargetAccount } from '../infrastructure/queries';

const I = schema.promotionItems;

export const termsOf = (c: CampaignRow): Terms => ({ type: c.type as Terms['type'], valueBps: c.valueBps, valueMinor: c.valueMinor, buyQuantity: c.buyQuantity, getQuantity: c.getQuantity });

export const loadItems = (tx: Tx, vendorId: string, campaignId: string): Promise<ItemRow[]> =>
  tx.select().from(I).where(and(eq(I.vendorId, vendorId), eq(I.campaignId, campaignId))).orderBy(I.createdAt, I.id);

export interface Evaluation { accounts: TargetAccount[]; items: ItemRow[]; verdicts: Map<string, Verdict> }

/**
 * Re-price and re-check every item of the campaign against the current variant prices, listings, cost, margin floors, other
 * campaigns and existing sales; stores the result on the items (eligible / ineligible with the reason).
 */
export async function evaluateItems(tx: Tx, ctx: OpCtx, campaign: CampaignRow, now: Date): Promise<Evaluation> {
  const items = await loadItems(tx, ctx.vendorId, campaign.id);
  const accounts = await targetAccounts(tx, ctx.vendorId, campaign.accountIds);
  const variants = await variantInfo(tx, ctx.vendorId, items.map((i) => i.variantId));
  const connectors = ctx.c.connectors;
  const canPush = (marketplace: string) => { try { return connectors.get(marketplace as never).capabilities.pricing.push; } catch { return false; } };
  const facts = await accountFacts(tx, ctx.vendorId, campaign, accounts, variants, canPush, now);
  const terms = termsOf(campaign);
  const verdicts = new Map<string, Verdict>();
  const updated: ItemRow[] = [];
  for (const item of items) {
    const v = variants.get(item.variantId);
    const info = v ?? { active: false, sellingPriceMinor: null, costMinor: null };
    const raw = info.sellingPriceMinor && info.sellingPriceMinor > 0 ? promoPrice(terms, info.sellingPriceMinor) : 0;
    const verdict = evaluateVariant(info, item.originalPriceMinor, raw, facts.get(item.variantId) ?? [], (base) => promoPrice(terms, base));
    verdicts.set(item.variantId, verdict);
    const keepsState = campaign.status !== 'draft' && verdict.status === 'eligible' && item.status !== 'eligible' && item.status !== 'ineligible';
    const next = { originalPriceMinor: verdict.originalMinor, promoPriceMinor: verdict.promoMinor, status: keepsState ? item.status : verdict.status, reason: verdict.reason };
    if (next.originalPriceMinor !== item.originalPriceMinor || next.promoPriceMinor !== item.promoPriceMinor || next.status !== item.status || next.reason !== item.reason) {
      const [row] = await tx.update(I).set(next).where(eq(I.id, item.id)).returning();
      updated.push(row!);
    } else updated.push(item);
  }
  return { accounts, items: updated, verdicts };
}

export interface SetItemsResult { total: number; added: number; removed: number; skipped: Array<{ variantId: string; reason: string }>; droppedNoListing: number }

/** put products into a draft campaign: `replace` makes the selection the whole set, `add` keeps what is there */
export async function setItems(tx: Tx, ctx: OpCtx, campaign: CampaignRow, sel: Selection, mode: 'replace' | 'add', now: Date): Promise<SetItemsResult> {
  const accounts = await targetAccounts(tx, ctx.vendorId, campaign.accountIds);
  const resolved = await resolveSelection(tx, ctx.vendorId, sel, accounts);
  const existing = await loadItems(tx, ctx.vendorId, campaign.id);
  const have = new Set(existing.map((i) => i.variantId));
  const want = new Set(resolved.variantIds);
  const keep = mode === 'replace' ? [...have].filter((id) => want.has(id)) : [...have];
  const added = resolved.variantIds.filter((id) => !have.has(id));
  if (keep.length + added.length > MAX_ITEMS) throw Errors.validation({ rule: 'too_many_items', max: MAX_ITEMS, requested: keep.length + added.length });
  const removeIds = mode === 'replace' ? [...have].filter((id) => !want.has(id)) : [];
  if (removeIds.length) await tx.delete(I).where(and(eq(I.vendorId, ctx.vendorId), eq(I.campaignId, campaign.id), inArray(I.variantId, removeIds)));
  if (added.length) {
    const info = await variantInfo(tx, ctx.vendorId, added);
    const terms = termsOf(campaign);
    for (let i = 0; i < added.length; i += 500) {
      await tx.insert(I).values(added.slice(i, i + 500).map((variantId) => {
        const original = info.get(variantId)!.sellingPriceMinor!;
        return { vendorId: ctx.vendorId, campaignId: campaign.id, variantId, originalPriceMinor: original, promoPriceMinor: Math.min(original, Math.max(1, promoPrice(terms, original))) };
      }));
    }
  }
  await evaluateItems(tx, ctx, campaign, now);
  return { total: keep.length + added.length, added: added.length, removed: removeIds.length, skipped: resolved.skipped, droppedNoListing: resolved.droppedNoListing };
}

export async function removeItems(tx: Tx, vendorId: string, campaignId: string, variantIds: string[]): Promise<number> {
  const rows = await tx.delete(I).where(and(eq(I.vendorId, vendorId), eq(I.campaignId, campaignId), inArray(I.variantId, variantIds))).returning({ id: I.id });
  return rows.length;
}

export async function itemCounts(tx: Tx, vendorId: string, campaignIds: string[]): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (campaignIds.length === 0) return out;
  const rows = await tx.select({ campaignId: I.campaignId, status: I.status, n: sql<string>`count(*)` }).from(I).where(and(eq(I.vendorId, vendorId), inArray(I.campaignId, campaignIds))).groupBy(I.campaignId, I.status);
  for (const r of rows) out.set(r.campaignId, { ...(out.get(r.campaignId) ?? {}), [r.status]: Number(r.n) });
  return out;
}
