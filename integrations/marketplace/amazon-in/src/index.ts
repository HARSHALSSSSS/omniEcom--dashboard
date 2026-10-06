import { NO_CAPABILITIES, unsupported, type ConnectorCapabilities, type MarketplaceConnector } from '@oms/marketplace-core';

/**
 * Amazon India (SP-API)
 * Amazon SP-API: Login-with-Amazon OAuth, notifications via SQS/EventBridge (webhook capability is realised by an ingress adapter), strict per-operation rate limits.
 * Stage 1: contract + declared capabilities only. No network calls are implemented yet.
 */
export class AmazonInConnector implements MarketplaceConnector {
  readonly code = 'amazon_in' as const;
  readonly implementation = 'planned' as const;
  readonly displayName = 'Amazon India (SP-API)';
  readonly capabilities: ConnectorCapabilities = {
    ...NO_CAPABILITIES,
    auth: { type: 'oauth2_lwa', refreshable: true },
    orders: { updateStatus: false, fetch: true, webhook: true, acknowledge: false, cancel: false, maxLookbackDays: 30 },
    inventory: { push: true, pull: true, batch: true },
    pricing: { push: true, pull: true },
    listings: { create: true, update: true, deactivate: true, fetch: true, requiresCategoryMapping: true },
    shipping: { createShipment: false, generateLabel: false, marketplaceManagedLogistics: true, manifest: false },
    returns: { fetch: true, webhook: true },
    limits: { requestsPerSecond: 2, burst: 10, maxBatchSize: 1000 },
  };

  async verifyConnection(): Promise<{ ok: boolean; message?: string }> {
    throw unsupported(this.code, 'verifyConnection');
  }
}

export const createAmazonInConnector = (): MarketplaceConnector => new AmazonInConnector();
