import type { JobHandler } from '@oms/module-kit';
import { manifest } from './manifest';
import { JOB_TICK, tick } from './application/lifecycle';
import { promotionRoutes } from './http/routes';

export { manifest };
export { promotionRoutes } from './http/routes';
export { JOB_TICK };

/** every minute: start due campaigns, end finished ones (window over or budget used up), refresh the results */
const jobs: JobHandler[] = [{
  queue: 'maintenance',
  name: JOB_TICK,
  async handle(_env, c) {
    const r = await tick(c);
    if (r.activated || r.ended) c.logger.info(r, 'promotions processed');
  },
}];

/**
 * Promotions: discount campaigns (percentage, flat, buy-X-get-Y, bundle) on chosen products and channels. Activation puts the
 * promotional prices on the marketplace prices as scheduled sale prices through the pricing module; results come from real orders.
 */
export const promotionsModule = { manifest, routes: promotionRoutes, jobs };
