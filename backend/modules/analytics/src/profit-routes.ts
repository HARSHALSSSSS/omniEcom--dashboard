import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successEnvelope } from '@oms/contracts';
import { ok, vendorTx } from '@oms/module-kit';
import { collectProfit, computeProfit, profitability } from './profit';
import { previousRange } from './queries';
import { D, range } from './range';
import { advertisingSpend } from './spend';
import { adComponent, profitDeltas, profitWaterfall } from './waterfall';

const TAGS = ['Analytics'];
const Money = z.number().int();
const Comp = z.object({ amountMinor: Money.nullable(), basis: z.enum(['actual', 'estimated', 'missing']), coverage: z.number() });
const Delta = z.object({ changeMinor: Money.nullable(), changePercent: z.number().nullable() });
const ProfitBody = z.object({
  revenue: Comp, productCost: Comp, shipping: Comp, marketplaceFees: Comp, penalties: Comp, refunds: Comp, contributionMinor: Money.nullable().describe('Only present when NO component is missing'), knownPartMinor: Money.describe('Revenue minus the components that are known (not a profit figure while data is missing)'),
  marginPercent: z.number().nullable(), missing: z.array(z.string()), completeness: z.enum(['complete', 'estimated', 'incomplete']),
});
const Range = z.object({ from: z.string(), to: z.string() });
const Span = z.object({
  from: D.optional().describe('First day (UTC), default: 29 days before `to`'), to: D.optional().describe('Last day (UTC), default: today'),
  compare: z.enum(['previous']).optional().describe('`previous`: also return the period of the same length right before this one, with the differences'),
});

/** Profitability read models: the plain breakdown (by product / marketplace / order) and the P&L bridge of the screen. */
export const profitRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/analytics/profitability', {
    config: { access: { permission: 'analytics:read' } },
    schema: {
      tags: TAGS, summary: 'Profitability by product, marketplace or order, with actual / estimated / missing data kept apart',
      description: 'Revenue and discounts are actual; shipping is the courier cost recorded on the shipment; fees and penalties come from `PUT /orders/{id}/financials` (fees may fall back to a vendor-entered fee profile, labelled estimated); product cost is the variant\'s CURRENT cost price (estimated). `contributionMinor` is null while any component is missing: nothing is guessed, and it is BEFORE advertising (see `advertising` and `/analytics/profitability/waterfall` for the net figure). Ranges up to 366 days are read in 31-day windows; `truncated` says that a window held more than 5,000 orders (`ordersInRange` is the real count). With `compare=previous` the preceding period of the same length is returned with the differences.',
      querystring: Span.extend({ groupBy: z.enum(['product', 'marketplace', 'order']).default('product') }),
      response: { 200: successEnvelope(z.object({
        range: Range, groupBy: z.string(), ordersAnalysed: z.number().int(), ordersInRange: z.number().int(), windows: z.number().int(), truncated: z.boolean().describe('More orders than the analysis limit in at least one window: narrow the range'), allocation: z.string().nullable(),
        total: ProfitBody, advertising: Comp.describe('Marketing spend recorded for the range (missing when none was recorded)'),
        groups: z.array(ProfitBody.extend({ key: z.string(), label: z.string(), orders: z.number().int(), advertising: Comp.nullable().describe('Marketplace groups only: spend of that marketplace\'s accounts') })),
        comparison: z.object({ range: Range, ordersAnalysed: z.number().int(), truncated: z.boolean(), total: ProfitBody, advertising: Comp, deltas: z.object({ revenue: Delta, productCost: Delta, shipping: Delta, marketplaceFees: Delta, refunds: Delta, contribution: Delta, marginPoints: z.number().nullable() }) }).nullable(),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const rg = range(req.query);
    const out = await profitability(tx, vendorId, rg, req.query.groupBy);
    const spend = await advertisingSpend(tx, vendorId, rg);
    const groups = out.groups.map((g) => ({ ...g, advertising: req.query.groupBy === 'marketplace' ? (spend.rows > 0 ? { amountMinor: spend.byMarketplace.get(g.key) ?? 0, basis: 'actual' as const, coverage: 1 } : { amountMinor: null, basis: 'missing' as const, coverage: 0 }) : null }));
    let comparison = null;
    if (req.query.compare === 'previous') {
      const pr = previousRange(rg);
      const pc = await collectProfit(tx, vendorId, pr, 'none');
      const prev = computeProfit(pc.inputs);
      comparison = { range: pr, ordersAnalysed: pc.ordersAnalysed, truncated: pc.truncated, total: prev, advertising: adComponent(await advertisingSpend(tx, vendorId, pr)), deltas: profitDeltas(out.total, prev) };
    }
    return { ...out, groups, advertising: adComponent(spend), comparison };
  })));

  const Step = z.object({
    key: z.string(), label: z.string(), type: z.enum(['positive', 'negative', 'subtotal']), amountMinor: Money.nullable().describe('Signed: revenue positive, every deduction negative, null when nothing is known'), basis: z.enum(['actual', 'estimated', 'missing']), coverage: z.number(),
    shareOfRevenuePercent: z.number().nullable(), tooltip: z.string(), previousAmountMinor: Money.nullable().optional(), change: Delta.optional(),
  });
  const Cell = Comp;
  r.get('/analytics/profitability/waterfall', {
    config: { access: { permission: 'analytics:read' } },
    schema: {
      tags: TAGS, summary: 'P&L bridge from gross revenue to net contribution, plus the per-marketplace table',
      description: 'Steps in order: gross revenue, returns and refunds, product cost, marketplace fees (with penalties), shipping, advertising, net contribution. Each step has an amount (signed, null when unknown), a basis (actual | estimated | missing), the share of revenue it covers and a tooltip saying where the number comes from. `netContributionMinor` is null while any component is missing (`missing` lists them); `knownPartMinor` is then the revenue minus the known costs. Advertising comes from `/analytics/marketing-spend`: it is `missing` until at least one row (a 0 is fine) is recorded in the range; once the seller records spend, a marketplace without rows counts as 0. `channels` has the screen\'s columns per marketplace. Ranges up to 366 days; `compare=previous` adds the previous period to every step.',
      querystring: Span,
      response: { 200: successEnvelope(z.object({
        range: Range, ordersAnalysed: z.number().int(), ordersInRange: z.number().int(), windows: z.number().int(), truncated: z.boolean(),
        steps: z.array(Step), grossRevenueMinor: Money, netContributionMinor: Money.nullable(), knownPartMinor: Money, netMarginPercent: z.number().nullable(), missing: z.array(z.string()), completeness: z.enum(['complete', 'estimated', 'incomplete']),
        unallocatedAdvertisingMinor: Money.describe('Spend not tied to a marketplace account: in the total, in no channel row'),
        channels: z.array(z.object({
          channel: z.string(), label: z.string(), orders: z.number().int(), grossRevenue: Cell, cogs: Cell, marketplaceFees: Cell, shippingCosts: Cell, returnsImpact: Cell, advertisingSpend: Cell,
          netProfitMinor: Money.nullable(), knownPartMinor: Money, netMarginPercent: z.number().nullable(), missing: z.array(z.string()),
        })),
        comparison: z.object({
          range: Range, ordersAnalysed: z.number().int(), truncated: z.boolean(), grossRevenue: Delta, netContribution: Delta, netMarginPoints: z.number().nullable(), previousNetContributionMinor: Money.nullable(), previousGrossRevenueMinor: Money.nullable(),
        }).nullable(),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => profitWaterfall(tx, vendorId, range(req.query), req.query.compare === 'previous'))));
};
