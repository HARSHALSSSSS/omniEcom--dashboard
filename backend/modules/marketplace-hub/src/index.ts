import { manifest } from './manifest';
import { marketplaceHubRoutes } from './routes';

export { manifest };
export { marketplaceHubRoutes };
export { healthScore, healthStatus, frictionPoints, tokenHealth, successRate, buildLanes, networkStatus, capabilityTags } from './health';

/**
 * Marketplace Hub: read models for the hub screens (connector directory merged with my accounts, account cards, network health),
 * one-call sync and the guided connect. It owns no tables: it reads accounts, listings, orders and sync jobs and drives the
 * existing account, connector and sync services.
 *
 * Layering inside the module: http (routes.ts) -> application (connect.ts, sync.ts) -> queries.ts / health.ts (pure scoring rules).
 */
export const marketplaceHubModule = { manifest, routes: marketplaceHubRoutes };
