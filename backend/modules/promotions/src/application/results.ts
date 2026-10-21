import { and, desc, eq, inArray, isNull, schema, type Tx } from '@oms/database';
import { velocityLiftBps } from '../domain/terms';
import { salesInWindow, type CampaignRow, type ItemRow } from '../infrastructure/queries';
import { loadItems } from './items';

const C = schema.promotionCampaigns;
const DAY = 86_400_000;
/** the 14 days before a campaign are its baseline; fewer sales than this and no lift is claimed */
export const BASELINE_DAYS = 14;
export const MIN_BASELINE_UNITS = 5;
/** a campaign must have run a full day before its sales rate means anything */
export const MIN_WINDOW_DAYS = 1;

/** the period in which orders count for the campaign, or null when it has not started */
export function resultWindow(c: Pick<CampaignRow, 'status' | 'startsAt' | 'endsAt'>, now: Date): { from: Date; to: Date } | null {
  if ((c.status !== 'active' && c.status !== 'ended') || !c.startsAt || c.startsAt >= now) return null;
  const to = c.endsAt && c.endsAt < now ? c.endsAt : now;
  return to > c.startsAt ? { from: c.startsAt, to } : null;
}

const ran = (items: ItemRow[]) => items.filter((i) => i.status !== 'ineligible');

/**
 * Recompute the cached results from real orders: units and revenue of the promoted variants on the campaign's accounts in its
 * window, and the spend, which is the discount actually given: (original - promo price) x units sold.
 */
export async function refreshResults(tx: Tx, campaign: CampaignRow, now: Date): Promise<CampaignRow> {
  const items = ran(await loadItems(tx, campaign.vendorId, campaign.id));
  const win = resultWindow(campaign, now);
  const sales = win ? await salesInWindow(tx, campaign.vendorId, items.map((i) => i.variantId), campaign.accountIds, win.from, win.to) : null;
  const spend = items.reduce((s, i) => s + (i.originalPriceMinor - i.promoPriceMinor) * (sales?.unitsByVariant.get(i.variantId) ?? 0), 0);
  const [row] = await tx.update(C).set({ spendMinor: spend, revenueMinor: sales?.revenueMinor ?? 0, unitsMoved: sales?.units ?? 0, ordersCount: sales?.orders ?? 0, statsUpdatedAt: now }).where(eq(C.id, campaign.id)).returning();
  return row!;
}

export interface Velocity { liftBps: number | null; promoUnits: number; promoDays: number; baselineUnits: number; baselineDays: number }

/** sales rate of the promoted variants during the campaign against the 14 days before it */
export async function campaignVelocity(tx: Tx, campaign: CampaignRow, now: Date): Promise<Velocity> {
  const none: Velocity = { liftBps: null, promoUnits: 0, promoDays: 0, baselineUnits: 0, baselineDays: BASELINE_DAYS };
  const win = resultWindow(campaign, now);
  if (!win) return none;
  const variantIds = ran(await loadItems(tx, campaign.vendorId, campaign.id)).map((i) => i.variantId);
  const promoDays = (win.to.getTime() - win.from.getTime()) / DAY;
  const [promo, base] = await Promise.all([
    salesInWindow(tx, campaign.vendorId, variantIds, campaign.accountIds, win.from, win.to),
    salesInWindow(tx, campaign.vendorId, variantIds, campaign.accountIds, new Date(win.from.getTime() - BASELINE_DAYS * DAY), win.from),
  ]);
  const enough = promoDays >= MIN_WINDOW_DAYS;
  return { liftBps: enough ? velocityLiftBps(promo.units, promoDays, base.units, BASELINE_DAYS, MIN_BASELINE_UNITS) : null, promoUnits: promo.units, promoDays, baselineUnits: base.units, baselineDays: BASELINE_DAYS };
}

export interface Overview {
  currency: string; activeCampaigns: number; scheduledCampaigns: number; draftCampaigns: number; endedCampaigns: number;
  revenueMinor: number; spendMinor: number; budgetMinor: number; budgetUsedBps: number | null; unitsMoved: number;
  velocityLiftBps: number | null; velocityCampaigns: number; statsUpdatedAt: string | null;
}

/** the tiles of the Promotions page; revenue, spend and units are the cached results of campaigns that have run */
export async function overview(tx: Tx, vendorId: string, now: Date): Promise<Overview> {
  const campaigns = await tx.select().from(C).where(and(eq(C.vendorId, vendorId), isNull(C.deletedAt)));
  const count = (s: string) => campaigns.filter((c) => c.status === s).length;
  const ran_ = campaigns.filter((c) => c.status === 'active' || c.status === 'ended');
  const sum = (f: (c: CampaignRow) => number) => ran_.reduce((s, c) => s + f(c), 0);
  const spend = sum((c) => c.spendMinor);
  const budget = sum((c) => c.budgetMinor);
  const recent = await tx.select().from(C).where(and(eq(C.vendorId, vendorId), isNull(C.deletedAt), inArray(C.status, ['active', 'ended']))).orderBy(desc(C.startsAt)).limit(50);
  let pU = 0; let pD = 0; let bU = 0; let bD = 0; let used = 0;
  for (const c of recent) {
    const v = await campaignVelocity(tx, c, now);
    if (v.liftBps === null) continue;
    pU += v.promoUnits; pD += v.promoDays; bU += v.baselineUnits; bD += v.baselineDays; used++;
  }
  const stamps = ran_.map((c) => c.statsUpdatedAt).filter((d): d is Date => d !== null);
  return {
    currency: 'INR', activeCampaigns: count('active'), scheduledCampaigns: count('scheduled'), draftCampaigns: count('draft'), endedCampaigns: count('ended'),
    revenueMinor: sum((c) => c.revenueMinor), spendMinor: spend, budgetMinor: budget, budgetUsedBps: budget > 0 ? Math.round((spend * 10_000) / budget) : null, unitsMoved: sum((c) => c.unitsMoved),
    velocityLiftBps: used ? velocityLiftBps(pU, pD, bU, bD, 0) : null, velocityCampaigns: used,
    statsUpdatedAt: stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))).toISOString() : null,
  };
}
