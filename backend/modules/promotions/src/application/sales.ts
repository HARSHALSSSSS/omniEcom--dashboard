import { eq, schema, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { OpCtx } from '@oms/module-kit';
import { SyncWork, clearMarketplacePrice, setMarketplacePrice } from '@oms/mod-pricing';
import { priceRows, sameTime, type CampaignRow } from '../infrastructure/queries';
import { evaluateItems, loadItems } from './items';

const I = schema.promotionItems;
const A = schema.marketplaceAccounts;

const canPushFor = (ctx: OpCtx) => (marketplace: string): boolean => { try { return ctx.c.connectors.get(marketplace as never).capabilities.pricing.push; } catch { return false; } };

/**
 * Put the campaign's promotional prices on the marketplace prices as scheduled sale prices (through the pricing module: history,
 * listing update and price push included). Only items that pass the eligibility check on an account get a sale there.
 * Throws when nothing at all could be applied, which rolls the whole step back.
 */
export async function applySales(tx: Tx, ctx: OpCtx, work: SyncWork, campaign: CampaignRow, saleStart: Date, now: Date): Promise<void> {
  const ev = await evaluateItems(tx, ctx, campaign, now);
  let applied = 0;
  for (const item of ev.items) {
    const verdict = ev.verdicts.get(item.variantId)!;
    if (verdict.status !== 'eligible') continue;
    const failures: string[] = [];
    let ok = 0;
    for (const a of verdict.accounts) {
      if (!a.ok) continue;
      try {
        await tx.transaction((sp) => setMarketplacePrice(sp, ctx, work, {
          variantId: item.variantId, accountId: a.accountId, salePriceMinor: a.promoMinor, saleStartsAt: saleStart, saleEndsAt: campaign.endsAt,
          source: 'schedule', reason: `promotion:${campaign.code}`,
        }));
        ok++;
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        failures.push(`${a.label}: ${e.message}`);
      }
    }
    if (ok === 0) await tx.update(I).set({ status: 'ineligible', reason: failures.join('; ').slice(0, 500) }).where(eq(I.id, item.id));
    else applied++;
  }
  if (applied === 0) throw Errors.conflict('No product of the campaign can run: see the product list for the reasons', { rule: 'no_eligible_items' });
}

/** Remove the sale prices this campaign put on (a sale someone else set, or a different window, is left alone). Returns how many were cleared. */
export async function clearSales(tx: Tx, ctx: OpCtx, work: SyncWork, campaign: CampaignRow): Promise<number> {
  const items = await loadItems(tx, ctx.vendorId, campaign.id);
  const rows = await priceRows(tx, ctx.vendorId, items.map((i) => i.variantId));
  let cleared = 0;
  for (const r of rows) {
    // the sale was put on by a campaign (source 'schedule') in exactly this window; the price itself differs per account and may have been repriced since
    if (r.source !== 'schedule' || r.salePriceMinor === null) continue;
    if (!sameTime(r.saleStartsAt, campaign.startsAt) || !sameTime(r.saleEndsAt, campaign.endsAt)) continue;
    await tx.transaction(async (sp) => {
      const { row } = await setMarketplacePrice(sp, ctx, work, { variantId: r.variantId, accountId: r.marketplaceAccountId, salePriceMinor: null, source: 'schedule', reason: `promotion-ended:${campaign.code}` });
      // a price row the campaign created for the sale and that holds nothing else goes away: the listing follows the variant again
      if (row.priceMinor === null && row.mrpMinor === null) await clearMarketplacePrice(sp, ctx, work, row.id);
    });
    cleared++;
  }
  return cleared;
}

/**
 * Derive the item statuses from what is really on the marketplace prices: scheduled -> pending_sync; running -> live once the
 * sale price is applied on an account whose connector takes prices, else pending_sync with the honest reason; finished -> ended.
 */
export async function syncItemStates(tx: Tx, ctx: OpCtx, campaign: CampaignRow, now: Date, endReason: string | null = null): Promise<void> {
  const items = await loadItems(tx, ctx.vendorId, campaign.id);
  const accounts = new Map((await tx.select({ id: A.id, marketplace: A.marketplace, name: A.displayName }).from(A).where(eq(A.vendorId, ctx.vendorId))).map((a) => [a.id, a]));
  const rows = campaign.status === 'active' ? await priceRows(tx, ctx.vendorId, items.map((i) => i.variantId)) : [];
  const canPush = canPushFor(ctx);
  for (const item of items) {
    if (item.status === 'ineligible') continue;
    let next: { status: string; reason: string | null; lastSyncedAt?: Date | null };
    if (campaign.status === 'scheduled') next = { status: 'pending_sync', reason: null };
    else if (campaign.status === 'active') {
      const applied = rows.filter((r) => r.variantId === item.variantId && r.source === 'schedule' && r.salePriceMinor !== null && r.appliedPriceMinor === r.salePriceMinor && sameTime(r.saleStartsAt, campaign.startsAt) && sameTime(r.saleEndsAt, campaign.endsAt));
      const blocked = applied.filter((r) => !canPush(accounts.get(r.marketplaceAccountId)?.marketplace ?? ''));
      const names = blocked.map((r) => accounts.get(r.marketplaceAccountId)?.name ?? r.marketplaceAccountId).join(', ');
      if (applied.length > blocked.length) next = { status: 'live', reason: blocked.length ? `connector_cannot_push_prices: ${names}` : null, lastSyncedAt: now };
      else if (blocked.length) next = { status: 'pending_sync', reason: `connector_cannot_push_prices: ${names}` };
      else next = { status: 'pending_sync', reason: 'waiting for the sale price to apply' };
    } else if (campaign.status === 'ended' || campaign.status === 'cancelled') next = { status: 'ended', reason: endReason ?? campaign.status };
    else continue;
    if (next.status !== item.status || next.reason !== item.reason) await tx.update(I).set(next).where(eq(I.id, item.id));
  }
}
