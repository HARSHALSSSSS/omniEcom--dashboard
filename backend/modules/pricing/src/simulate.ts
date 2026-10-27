import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq, schema, type Tx } from '@oms/database';
import { successEnvelope } from '@oms/contracts';
import { ok, vendorTx } from '@oms/module-kit';
import { AppError, Errors } from '@oms/shared';
import { marginTargetBps } from '@oms/mod-analytics';
import { resolveSettings } from '@oms/mod-vendors';
import { NO_FEES, feeAmount, marginBps, priceForMargin, type FeeTerms } from './proposal-domain';

const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const FP = schema.feeProfiles;
const MP = schema.marketplacePrices;

const Body = z.object({
  variantId: z.uuid(),
  accountId: z.uuid().optional().describe('The channel whose fee profile to use; without it no marketplace fees are charged'),
  priceMinor: z.number().int().min(1).max(100_000_000_000).optional().describe('The price to test; default: the channel price, else the variant selling price'),
});

const Out = z.object({
  variant: z.object({ id: z.string(), sku: z.string(), title: z.string(), costMinor: z.number().int().nullable(), mrpMinor: z.number().int().nullable(), sellingPriceMinor: z.number().int().nullable(), gstRateBps: z.number().int().nullable() }),
  account: z.object({ id: z.string(), name: z.string(), marketplace: z.string(), feesConfigured: z.boolean(), feeBps: z.number().int().nullable(), fixedFeeMinor: z.number().int().nullable() }).nullable(),
  rules: z.object({ workspaceFloorBps: z.number().int().nullable(), effectiveTargetBps: z.number().int().nullable(), withholdBufferBps: z.number().int(), legalMetrologyMrpGate: z.boolean() }),
  priceMinor: z.number().int(),
  breakdown: z.object({
    gstMinor: z.number().int().nullable().describe('GST contained in the price (reverse-calculated); null when the product has no GST rate'),
    feeMinor: z.number().int().nullable().describe('Marketplace commission + fixed fee at this price; null when the channel has no fee profile'),
    withholdMinor: z.number().int(), costMinor: z.number().int().nullable(), netRealizationMinor: z.number().int().nullable(), contributionMinor: z.number().int().nullable(),
  }),
  marginBps: z.number().int().nullable().describe('Margin after cost and marketplace fees: the same figure the Pricing screens show'),
  belowTarget: z.boolean().nullable(),
  floorPriceMinor: z.number().int().nullable().describe('Lowest price that still earns the effective target margin'),
  exceedsMrp: z.boolean(),
}).meta({ id: 'PriceSimulation' });

/** The Settings > Pricing simulator: real variant, real channel fees, the saved rules, and the same margin maths as the proposal engine. */
async function simulate(tx: Tx, vendorId: string, b: z.infer<typeof Body>) {
  const [v] = await tx.select({ id: V.id, sku: V.sku, cost: V.costPriceMinor, mrp: V.mrpMinor, selling: V.sellingPriceMinor, title: P.title, gst: P.gstRateBps })
    .from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(and(eq(V.vendorId, vendorId), eq(V.id, b.variantId)));
  if (!v) throw Errors.notFound('Variant', b.variantId);
  let account: z.infer<typeof Out>['account'] = null;
  let fees: FeeTerms | null = null;
  let channelPrice: number | null = null;
  if (b.accountId) {
    const [a] = await tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace }).from(A).where(and(eq(A.vendorId, vendorId), eq(A.id, b.accountId)));
    if (!a) throw Errors.notFound('Marketplace account', b.accountId);
    const [f] = await tx.select({ bps: FP.feePercentBps, fixed: FP.fixedFeeMinor }).from(FP).where(and(eq(FP.vendorId, vendorId), eq(FP.marketplaceAccountId, a.id)));
    fees = f ? { feeBps: f.bps, fixedMinor: f.fixed } : null;
    account = { id: a.id, name: a.name, marketplace: String(a.marketplace), feesConfigured: Boolean(f), feeBps: f?.bps ?? null, fixedFeeMinor: f?.fixed ?? null };
    const [mp] = await tx.select({ price: MP.priceMinor }).from(MP).where(and(eq(MP.vendorId, vendorId), eq(MP.variantId, v.id), eq(MP.marketplaceAccountId, a.id)));
    channelPrice = mp?.price ?? null;
  }
  const price = b.priceMinor ?? channelPrice ?? v.selling;
  if (!price || price <= 0) throw new AppError('VALIDATION_FAILED', 'This variant has no selling price: enter a price to test', { details: { rule: 'price_required' } });
  const [vendor] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const st = resolveSettings(vendor?.settings).pricing;
  const target = await marginTargetBps(tx, vendorId);
  const f = fees ?? NO_FEES;
  const feeMinor = fees ? feeAmount(price, fees) : null;
  const gstMinor = v.gst === null ? null : price - Math.round((price * 10_000) / (10_000 + v.gst));
  const withholdMinor = Math.round((price * st.withholdBufferBps) / 10_000);
  const m = marginBps(price, v.cost, f);
  return {
    variant: { id: v.id, sku: v.sku, title: v.title, costMinor: v.cost, mrpMinor: v.mrp, sellingPriceMinor: v.selling, gstRateBps: v.gst },
    account,
    rules: { workspaceFloorBps: st.marginFloorBps, effectiveTargetBps: target, withholdBufferBps: st.withholdBufferBps, legalMetrologyMrpGate: st.legalMetrologyMrpGate },
    priceMinor: price,
    breakdown: {
      gstMinor, feeMinor, withholdMinor, costMinor: v.cost,
      netRealizationMinor: feeMinor === null ? null : price - (gstMinor ?? 0) - feeMinor - withholdMinor,
      contributionMinor: v.cost === null ? null : price - v.cost - (feeMinor ?? 0),
    },
    marginBps: m,
    belowTarget: m === null || target === null ? null : m < target,
    floorPriceMinor: target === null ? null : priceForMargin(v.cost, target, f),
    exceedsMrp: st.legalMetrologyMrpGate && v.mrp !== null && price > v.mrp,
  };
}

export const simulateRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post('/pricing/simulate', {
    config: { access: { permission: 'pricing:read' } },
    schema: {
      tags: ['Pricing'], summary: 'Simulate the unit economics of one price',
      description: 'Real variant (cost, MRP, selling price), the fee profile of the chosen channel and the rules saved in Settings (workspace margin floor, TCS/TDS withholding buffer, MRP gate). The margin is the one the proposal engine and the margin view use, so the numbers agree everywhere. Nothing is saved.',
      body: Body, response: { 200: successEnvelope(Out) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => simulate(tx, vendorId, req.body))));
};
