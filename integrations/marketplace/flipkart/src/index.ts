import { NO_CAPABILITIES, unsupported, type ConnectorCapabilities, type MarketplaceConnector } from '@oms/marketplace-core';

/**
 * Flipkart Seller
 * Flipkart Seller API: OAuth2 client-credentials style access tokens, order dispatch requires acknowledgement and label generation.
 * Stage 1: contract + declared capabilities only. No network calls are implemented yet.
 */
export class FlipkartConnector implements MarketplaceConnector {
  readonly code = 'flipkart' as const;
  readonly implementation = 'planned' as const;
  readonly displayName = 'Flipkart Seller';
  readonly capabilities: ConnectorCapabilities = {
    ...NO_CAPABILITIES,
    auth: { type: 'oauth2', refreshable: true },
    orders: { updateStatus: false, fetch: true, webhook: true, acknowledge: true, cancel: true, maxLookbackDays: 30 },
    inventory: { push: true, pull: false, batch: true },
    pricing: { push: true, pull: false },
    listings: { create: true, update: true, deactivate: true, fetch: true, requiresCategoryMapping: true },
    shipping: { createShipment: false, generateLabel: true, marketplaceManagedLogistics: true, manifest: true },
    returns: { fetch: true, webhook: false },
    limits: { requestsPerSecond: 5, burst: 10, maxBatchSize: 100 },
  };

  async verifyConnection(): Promise<{ ok: boolean; message?: string }> {
    throw unsupported(this.code, 'verifyConnection');
  }
}

export const createFlipkartConnector = (): MarketplaceConnector => new FlipkartConnector();
