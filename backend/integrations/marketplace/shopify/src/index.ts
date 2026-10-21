import type { MarketplaceConnector } from '@oms/marketplace-core';
import { ShopifyConnector, type ShopifyOptions } from './adapter';

export { ShopifyConnector, type ShopifyOptions } from './adapter';
export { shopifyControl, shopifySimulator, shopifyWorld, createShopifySimulator } from './simulator';
export { capabilities as shopifyCapabilities, readiness as shopifyReadiness, polling as shopifyPolling } from './capabilities';
export { mapOrder as mapShopifyOrder, toInternalOrderStatus as toInternalShopifyOrderStatus } from './mappers';
export { normalizeShopDomain } from './environment';
export type { ShopifyAppCredentials } from './environment';

export const createShopifyConnector = (opts?: ShopifyOptions): MarketplaceConnector => new ShopifyConnector(opts);
