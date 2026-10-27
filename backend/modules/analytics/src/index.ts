import type { FastifyPluginAsync } from 'fastify';
import type { JobHandler } from '@oms/module-kit';
import { manifest } from './manifest';
import { profitRoutes } from './profit-routes';
import { analyticsRoutes } from './routes';
import { rollupRecent } from './rollup';
import { spendRoutes } from './spend-routes';

export { manifest };
export { analyticsRoutes } from './routes';
export { profitRoutes } from './profit-routes';
export { spendRoutes } from './spend-routes';
export { policyTargetBps, marginTargetBps } from './margin-target';
export { previousRange, overview, productPerformance, marketplacePerformance, dailyUnits, dailyRevenueSeries } from './queries';
export { inventoryHealth, productHealth, businessHealth, classifyStock, healthScore, stockLines, DEFAULT_THRESHOLDS, type InventoryFinding, type InventoryThresholds, type HealthIssue } from './health';
export { profitability, collectProfit, computeProfit, splitWindows, type Profit } from './profit';
export { profitWaterfall, buildSteps } from './waterfall';
export { advertisingSpend, parseAmountMinor, parseSpendDate } from './spend';
export { rollupRecent, rollupVendor } from './rollup';

export const JOB_ROLLUP = 'analytics.rollup';

/** every 15 minutes: recompute today and yesterday for all vendors from the operational tables (one statement per read model) */
const jobs: JobHandler[] = [{
  queue: 'maintenance',
  name: JOB_ROLLUP,
  async handle(_env, c) { const w = await rollupRecent(c, 2); c.logger.debug({ window: w }, 'analytics roll-up'); },
}];

const routes: FastifyPluginAsync = async (app) => {
  await app.register(analyticsRoutes);
  await app.register(profitRoutes);
  await app.register(spendRoutes);
};

/**
 * Analytics: the reporting / aggregation layer. Dashboards read small daily roll-ups instead of scanning orders; profitability keeps
 * actual, estimated and missing data apart (with the P&L bridge and advertising spend); product, inventory and business health find problems in the real data.
 */
export const analyticsModule = { manifest, routes, jobs };
