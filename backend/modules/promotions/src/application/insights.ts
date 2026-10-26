import { and, desc, eq, inArray, isNull, schema, sql, type Tx } from '@oms/database';
import { THRESHOLDS } from '../domain/candidates';
import { REASONS } from '../domain/eligibility';
import { validateTerms, type Terms } from '../domain/terms';
import { loadCampaign, type CampaignRow, type ItemRow } from '../infrastructure/queries';
import { analyze, addEconomics, contributionOf, NO_ECONOMICS, salesEconomics, stockFacts, worstChannel, type CanPush, type ChannelView, type Contribution, type Economics } from './analysis';
import { vendorAccounts } from './campaigns';
import { loadCandidates, type CandidateRow } from './candidates';
import { loadItems } from './items';
import { resultWindow } from './results';

const C = schema.promotionCampaigns;
const I = schema.promotionItems;

const HOUR = 3_600_000;
/** at most this many running/finished campaigns feed the economics and the margin check of the overview (the newest first) */
const OVERVIEW_CAMPAIGN_CAP = 100;
const MARGIN_CHECK_CAP = 50;

// ------------------------------------------------------------------------------------------------
// per campaign: what its sales earned, the average discount, margin risk
// ------------------------------------------------------------------------------------------------
const ranItems = (items: ItemRow[]) => items.filter((i) => i.status !== 'ineligible');

export async function campaignEconomics(tx: Tx, c: CampaignRow, now: Date): Promise<Economics> {
  const win = resultWindow(c, now);
  if (!win) return NO_ECONOMICS;
  return salesEconomics(tx, c.vendorId, ranItems(await loadItems(tx, c.vendorId, c.id)).map((i) => i.variantId), c.accountIds, win.from, win.to);
}

export interface CampaignExtras extends Contribution { avgDiscountBps: number | null }

/** the list columns that need a query per campaign: average discount over its products and the contribution of its sales */
export async function campaignExtras(tx: Tx, vendorId: string, rows: CampaignRow[], now: Date): Promise<Map<string, CampaignExtras>> {
  const out = new Map<string, CampaignExtras>();
  if (rows.length === 0) return out;
  const disc = await tx.select({ campaignId: I.campaignId, d: sql<string | null>`avg(case when ${I.originalPriceMinor} > 0 then (${I.originalPriceMinor} - ${I.promoPriceMinor}) * 10000.0 / ${I.originalPriceMinor} end)` }).from(I)
    .where(and(eq(I.vendorId, vendorId), inArray(I.campaignId, rows.map((r) => r.id)), sql`${I.status} <> 'ineligible'`)).groupBy(I.campaignId);
  const avgBy = new Map(disc.map((d) => [d.campaignId, d.d === null ? null : Math.round(Number(d.d))]));
  for (const c of rows) out.set(c.id, { avgDiscountBps: avgBy.get(c.id) ?? null, ...contributionOf(await campaignEconomics(tx, c, now)) });
  return out;
}

export interface MarginRisk { checkedProducts: number; belowTarget: number; unknownCost: number; conflicts: number }

/** the margin picture of a campaign's products at their promotional prices, from today's prices, costs, fees and policy targets (null for a finished campaign) */
export async function campaignMarginRisk(tx: Tx, c: CampaignRow, canPush: CanPush, now: Date): Promise<MarginRisk | null> {
  if (c.status === 'ended' || c.status === 'cancelled') return null;
  const items = ranItems(await loadItems(tx, c.vendorId, c.id));
  const an = await analyze(tx, c.vendorId, c, items.map((i) => i.variantId), canPush, now);
  let belowTarget = 0; let unknownCost = 0; let conflicts = 0;
  for (const i of items) {
    const ch = (an.byVariant.get(i.variantId) ?? []).filter((x) => x.listed);
    if (ch.some((x) => x.belowTarget === true)) belowTarget++;
    if (ch.length > 0 && ch.every((x) => x.unitCostMinor === null)) unknownCost++;
    if (ch.some((x) => x.conflict)) conflicts++;
  }
  return { checkedProducts: items.length, belowTarget, unknownCost, conflicts };
}

// ------------------------------------------------------------------------------------------------
// promoted products: margin, stock, conflicts
// ------------------------------------------------------------------------------------------------
export interface ItemInsight {
  availableStock: number | null; lowStock: boolean | null;
  unitCostMinor: number | null; marginRegularBps: number | null; marginPromoBps: number | null; targetMarginBps: number | null; belowTarget: boolean | null; minPromoPriceMinor: number | null;
  conflict: { kind: string; message: string } | null; channelDetails: ChannelView[];
}
const NO_INSIGHT: ItemInsight = { availableStock: null, lowStock: null, unitCostMinor: null, marginRegularBps: null, marginPromoBps: null, targetMarginBps: null, belowTarget: null, minPromoPriceMinor: null, conflict: null, channelDetails: [] };

/**
 * Today's margin and stock picture of the products on a page, grouped by campaign (one analysis per campaign). Products of a finished
 * campaign carry no analysis: their prices are history, only the stock is current.
 */
export async function itemInsights(tx: Tx, vendorId: string, rows: Array<{ itemId: string; campaignId: string; campaignStatus: string; variantId: string }>, canPush: CanPush, now: Date): Promise<Map<string, ItemInsight>> {
  const out = new Map<string, ItemInsight>();
  if (rows.length === 0) return out;
  const stock = await stockFacts(tx, vendorId, [...new Set(rows.map((r) => r.variantId))]);
  const byCampaign = new Map<string, typeof rows>();
  for (const r of rows) byCampaign.set(r.campaignId, [...(byCampaign.get(r.campaignId) ?? []), r]);
  for (const [campaignId, list] of byCampaign) {
    const live = list[0]!.campaignStatus !== 'ended' && list[0]!.campaignStatus !== 'cancelled';
    const an = live ? await analyze(tx, vendorId, await loadCampaign(tx, vendorId, campaignId), list.map((r) => r.variantId), canPush, now) : null;
    for (const r of list) {
      const st = stock.get(r.variantId);
      const base = { ...NO_INSIGHT, availableStock: st?.available ?? null, lowStock: st ? st.lowStock : null };
      const channels = an?.byVariant.get(r.variantId) ?? [];
      const w = worstChannel(channels);
      const blocked = channels.find((c) => c.conflict)?.conflict ?? null;
      out.set(r.itemId, w ? {
        ...base, unitCostMinor: w.unitCostMinor, marginRegularBps: w.marginRegularBps, marginPromoBps: w.marginPromoBps, targetMarginBps: w.targetMarginBps, belowTarget: w.belowTarget,
        minPromoPriceMinor: w.minPromoPriceMinor, conflict: blocked, channelDetails: channels,
      } : base);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// the dialog preview: price, margin and conflicts before anything is saved
// ------------------------------------------------------------------------------------------------
export interface PreviewInput { terms: Terms; accountIds: string[]; variantIds: string[]; startsAt: Date | null; endsAt: Date | null }

export async function previewCampaign(tx: Tx, vendorId: string, input: PreviewInput, canPush: CanPush, now: Date) {
  validateTerms(input.terms);
  // a draft that is not saved: only its terms, channels and window are read by the analysis
  const draft = { id: '00000000-0000-0000-0000-000000000000', vendorId, status: 'draft', ...input.terms, accountIds: input.accountIds, startsAt: input.startsAt, endsAt: input.endsAt } as unknown as CampaignRow;
  const an = await analyze(tx, vendorId, draft, input.variantIds, canPush, now);
  const stock = await stockFacts(tx, vendorId, [...an.variants.keys()]);
  const items = [...an.variants.values()].flatMap((v) => (an.byVariant.get(v.id) ?? []).map((ch) => ({
    variantId: v.id, productId: v.productId, productName: v.title, sku: v.sku, availableStock: stock.get(v.id)?.available ?? null, lowStock: stock.get(v.id)?.lowStock ?? null, ...ch,
  })));
  const listed = items.filter((i) => i.listed);
  const known = items.filter((i) => i.discountBps > 0);
  const missing = input.variantIds.filter((id) => !an.variants.has(id));
  return {
    summary: {
      products: an.variants.size, placements: items.length, runnable: items.filter((i) => i.ok).length, notRunnable: items.filter((i) => !i.ok).length,
      notListed: items.filter((i) => !i.listed).length, belowMarginTarget: listed.filter((i) => i.belowTarget === true).length, unknownCost: listed.filter((i) => i.unitCostMinor === null).length,
      conflicts: items.filter((i) => i.conflict).length, connectorCannotPush: items.filter((i) => !i.canPushPrices).length,
      avgDiscountBps: known.length ? Math.round(known.reduce((s, i) => s + i.discountBps, 0) / known.length) : null,
      unknownVariants: missing.length,
    },
    items,
  };
}

// ------------------------------------------------------------------------------------------------
// overview
// ------------------------------------------------------------------------------------------------
export interface Pressure { variantId: string; productName: string; sku: string; accountId: string; channel: string; availableStock: number; marginBps: number | null; unitsSold30d: number; eligibility: string; reasons: Array<{ key: string; text: string }> }
const pressureOf = (r: CandidateRow): Pressure => ({ variantId: r.variantId, productName: r.productName, sku: r.sku, accountId: r.accountId, channel: r.channel, availableStock: r.availableStock, marginBps: r.marginBps, unitsSold30d: r.unitsSold30d, eligibility: r.eligibility, reasons: r.recommendationReasons });

const targetsAccount = (c: { accountIds: string[] }, a: { id: string; status: string }): boolean => (c.accountIds.length === 0 ? a.status === 'active' : c.accountIds.includes(a.id));
const REASON_CONFLICT = [REASONS.conflicting_campaign, REASONS.existing_sale];

export async function overviewInsights(tx: Tx, vendorId: string, canPush: CanPush, now: Date) {
  const [campaigns, accounts, items, base] = await Promise.all([
    tx.select().from(C).where(and(eq(C.vendorId, vendorId), isNull(C.deletedAt))).orderBy(desc(C.startsAt), desc(C.createdAt)),
    vendorAccounts(tx, vendorId),
    tx.select({ campaignId: I.campaignId, variantId: I.variantId, status: I.status, reason: I.reason }).from(I).innerJoin(C, and(eq(C.vendorId, I.vendorId), eq(C.id, I.campaignId)))
      .where(and(eq(I.vendorId, vendorId), isNull(C.deletedAt), inArray(C.status, ['draft', 'scheduled', 'active']))),
    loadCandidates(tx, vendorId, canPush, now),
  ]);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const distinct = (pred: (i: (typeof items)[number], c: CampaignRow) => boolean) => new Set(items.filter((i) => pred(i, byId.get(i.campaignId)!)).map((i) => i.variantId)).size;
  const active = campaigns.filter((c) => c.status === 'active');
  const upcoming = active.filter((c) => c.endsAt && c.endsAt > now).sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime());
  const ran = campaigns.filter((c) => c.status === 'active' || c.status === 'ended');

  // contribution of promoted sales: only when every promoted unit has a known cost
  let econ: Economics = NO_ECONOMICS;
  for (const c of ran.slice(0, OVERVIEW_CAMPAIGN_CAP)) econ = addEconomics(econ, await campaignEconomics(tx, c, now));
  // margin at the promotional prices of what is about to run or runs now
  let belowTarget = 0; let checked = 0;
  for (const c of campaigns.filter((x) => x.status === 'scheduled' || x.status === 'active').slice(0, MARGIN_CHECK_CAP)) {
    const risk = await campaignMarginRisk(tx, c, canPush, now);
    if (risk) { belowTarget += risk.belowTarget; checked += risk.checkedProducts; }
  }

  const rows = base.rows;
  const channels = accounts.map((a) => {
    const mine = rows.filter((r) => r.accountId === a.id);
    const forAccount = (s: string) => campaigns.filter((c) => c.status === s && targetsAccount(c, a));
    const liveHere = new Set(items.filter((i) => i.status === 'live' && targetsAccount(byId.get(i.campaignId)!, a) && byId.get(i.campaignId)!.status === 'active').map((i) => i.variantId)).size;
    const push = canPush(a.marketplace);
    return {
      accountId: a.id, marketplace: a.marketplace, displayName: a.displayName, status: a.status, canPushPrices: push,
      capability: (a.status !== 'active' ? 'verification_required' : push ? 'supported' : 'not_supported') as 'supported' | 'not_supported' | 'verification_required',
      activeCampaigns: forAccount('active').length, scheduledCampaigns: forAccount('scheduled').length, liveProducts: liveHere,
      listedProducts: new Set(mine.map((r) => r.variantId)).size, opportunities: new Set(mine.filter((r) => r.promotionStatus === 'recommended').map((r) => r.variantId)).size,
    };
  });

  const strong = rows.filter((r) => r.eligibility === 'eligible' && r.unitsSold30d > 0 && r.availableStock >= THRESHOLDS.highInventoryUnits && r.marginBps !== null && r.marginBps >= Math.max(THRESHOLDS.minHealthyMarginBps, r.targetMarginBps ?? 0))
    .sort((a, b) => b.unitsSold30d - a.unitsSold30d || a.sku.localeCompare(b.sku))[0];
  const risky = rows.filter((r) => r.unitsSold30d > 0 && (r.eligibility === 'low_inventory' || r.eligibility === 'margin_risk') && r.canPushPrices)
    .sort((a, b) => b.unitsSold30d - a.unitsSold30d || a.sku.localeCompare(b.sku))[0];

  const audit = await tx.select({ id: schema.auditLogs.id, action: schema.auditLogs.action, createdAt: schema.auditLogs.createdAt, resourceId: schema.auditLogs.resourceId })
    .from(schema.auditLogs).where(and(eq(schema.auditLogs.vendorId, vendorId), eq(schema.auditLogs.resourceType, 'promotion_campaign'), sql`${schema.auditLogs.action} like 'promotion.%'`)).orderBy(desc(schema.auditLogs.id)).limit(10);
  const names = new Map(campaigns.map((c) => [c.id, c.name]));

  const contribution = contributionOf(econ);
  return {
    productsOnPromotion: distinct((i, c) => (c.status === 'scheduled' || c.status === 'active') && (i.status === 'pending_sync' || i.status === 'live')),
    liveProducts: distinct((i, c) => c.status === 'active' && i.status === 'live'),
    eligibleProducts: distinct((i) => i.status === 'eligible' || i.status === 'pending_sync' || i.status === 'live'),
    conflictItems: items.filter((i) => i.reason && REASON_CONFLICT.some((r) => i.reason!.includes(r))).length,
    belowMarginTargetItems: checked > 0 || belowTarget > 0 ? belowTarget : null,
    endingSoonCampaigns: upcoming.filter((c) => c.endsAt!.getTime() - now.getTime() <= THRESHOLDS.endingSoonHours * HOUR).length,
    nextEndsAt: upcoming[0]?.endsAt?.toISOString() ?? null,
    resultsCampaigns: ran.filter((c) => c.statsUpdatedAt !== null).length,
    opportunities: new Set(rows.filter((r) => r.promotionStatus === 'recommended').map((r) => r.variantId)).size,
    listedProducts: base.listedProducts, unlistedVariants: base.unlistedVariants,
    connectorLimitations: accounts.filter((a) => a.status !== 'active' || !canPush(a.marketplace)).length,
    ...contribution,
    channels,
    pressure: { strongCandidate: strong ? pressureOf(strong) : null, reviewFirst: risky ? pressureOf(risky) : null },
    recentActivity: audit.map((a) => ({ id: a.id, action: a.action, createdAt: a.createdAt.toISOString(), campaignId: a.resourceId, campaignName: a.resourceId ? (names.get(a.resourceId) ?? null) : null })),
    thresholds: { ...THRESHOLDS },
  };
}

