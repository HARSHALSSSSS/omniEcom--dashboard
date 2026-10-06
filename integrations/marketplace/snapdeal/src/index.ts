import { NO_CAPABILITIES, unsupported, type ConnectorCapabilities, type MarketplaceConnector } from '@oms/marketplace-core';

/**
 * Snapdeal Seller
 * Snapdeal seller API: capabilities below are PROVISIONAL and must be confirmed against the partner API contract before Stage 3.
 * Stage 1: contract + declared capabilities only. No network calls are implemented yet.
 */
export class SnapdealConnector implements MarketplaceConnector {
  readonly code = 'snapdeal' as const;
  readonly implementation = 'planned' as const;
  readonly displayName = 'Snapdeal Seller';
  readonly capabilities: ConnectorCapabilities = {
    ...NO_CAPABILITIES,
    auth: { type: 'custom', refreshable: true },
    orders: { updateStatus: false, fetch: true, webhook: false, acknowledge: true, cancel: true },
    inventory: { push: true, pull: false, batch: false },
    pricing: { push: true, pull: false },
    listings: { create: false, update: true, deactivate: true, fetch: true, requiresCategoryMapping: false },
    shipping: { createShipment: false, generateLabel: true, marketplaceManagedLogistics: false, manifest: false },
    returns: { fetch: true, webhook: false },
    limits: { requestsPerSecond: 1, burst: 3, maxBatchSize: 20 },
  };

  async verifyConnection(): Promise<{ ok: boolean; message?: string }> {
    throw unsupported(this.code, 'verifyConnection');
  }
}

export const createSnapdealConnector = (): MarketplaceConnector => new SnapdealConnector();
