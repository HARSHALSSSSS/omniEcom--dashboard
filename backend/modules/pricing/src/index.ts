import type { EventConsumer, JobHandler } from '@oms/module-kit';
import { manifest } from './manifest';
import { pricingRoutes } from './routes';
import { onBasePriceChanged, processSales } from './service';
import { generateAll, generateForVendor } from './generate';
import { JOB_GENERATE_PROPOSALS } from './proposal-routes';
import { expireProposals } from './proposals';

export { manifest };
export { pricingRoutes } from './routes';
export { computePrice, effectivePrice, saleActive, applyChange, type PriceResult, type Change } from './domain';
export { setMarketplacePrice, clearMarketplacePrice, processSales, applyRules, bulkUpdate, SyncWork } from './service';
export { latestCompetitorPrices, type CompetitorPrice } from './competitors';
export { createPriceProposal, type PriceProposalInput } from './proposals';
export { loadCostFacts, loadMarginView, priceFacts, policyTargetBps, type MarginView, type PricedListing } from './margins';
export { priceForMargin, marginBps, feeAmount, type FeeTerms } from './proposal-domain';

export const JOB_PROCESS_SALES = 'pricing.process-sales';
export const JOB_PROPOSALS_TICK = 'pricing.proposals-tick';
export { JOB_GENERATE_PROPOSALS };
export { generateProposals, type GenerateResult } from './generate';
export { decideProposal, expireProposals } from './proposals';

/** every minute: start the sales whose window opened, end the ones that closed (each exactly once) */
const jobs: JobHandler[] = [{
  queue: 'maintenance',
  name: JOB_PROCESS_SALES,
  async handle(_env, c) {
    const r = await processSales(c);
    // proposals that waited too long must not stay approvable: the same minute tick retires them (one UPDATE)
    const expired = await expireProposals(c);
    if (r.started || r.ended || expired) c.logger.info({ ...r, expiredProposals: expired }, 'sales processed');
  },
}, {
  /** hourly (scheduler entry `maintenance:pricing-proposals`): expire old proposals, then run every active policy for every vendor that has one */
  queue: 'maintenance',
  name: JOB_PROPOSALS_TICK,
  async handle(_env, c) {
    const expired = await expireProposals(c);
    const r = await generateAll(c);
    c.logger.info({ expired, ...r }, 'price proposals generated');
  },
}, {
  /** a large `POST /pricing/proposals/generate` (more than 200 variant+account pairs) */
  queue: 'heavy',
  name: JOB_GENERATE_PROPOSALS,
  async handle(env, c) {
    if (!env.vendorId) return;
    const d = (env.data ?? {}) as { accountId?: string; policyId?: string; variantIds?: string[] };
    const r = await generateForVendor(c, env.vendorId, d, 5_000);
    c.logger.info({ vendorId: env.vendorId, proposed: r.proposed, autoApplied: r.autoApplied }, 'price proposals generated (job)');
  },
}];

const consumers: EventConsumer[] = [{
  event: 'variant.price_changed',
  name: 'pricing.variant-price-changed',
  async handle(e, c) {
    const p = e.payload as { price?: Parameters<typeof onBasePriceChanged>[3] } | null;
    if (!e.vendorId || !p?.price) return;
    await onBasePriceChanged(c, e.vendorId, e.aggregateId, p.price);
  },
}];

/**
 * Pricing: base price on the variant, a price per marketplace account, scheduled sales, rule-driven prices, bulk updates with a
 * dry-run, and an append-only price history. Marketplaces differ: a connector that cannot take prices is skipped, not faked.
 */
export const pricingModule = { manifest, routes: pricingRoutes, jobs, consumers };
