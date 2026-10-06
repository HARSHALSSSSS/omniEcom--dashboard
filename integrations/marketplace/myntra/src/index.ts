import { NO_CAPABILITIES, unsupported, type ConnectorCapabilities, type MarketplaceConnector } from '@oms/marketplace-core';

/**
 * Myntra Partner
 * Myntra partner integration: capabilities below are PROVISIONAL and must be confirmed against the partner API contract before Stage 3.
 * Stage 1: contract + declared capabilities only. No network calls are implemented yet.
 */
export class MyntraConnector implements MarketplaceConnector {
  readonly code = 'myntra' as const;
  readonly implementation = 'planned' as const;
  readonly displayName = 'Myntra Partner';
  readonly capabilities: ConnectorCapabilities = {
    ...NO_CAPABILITIES,
    auth: { type: 'api_key', refreshable: false },
    orders: { updateStatus: false, fetch: true, webhook: false, acknowledge: true, cancel: false },
    inventory: { push: true, pull: false, batch: true },
    pricing: { push: true, pull: false },
    listings: { create: false, update: false, deactivate: false, fetch: true, requiresCategoryMapping: true },
    shipping: { createShipment: false, generateLabel: false, marketplaceManagedLogistics: true, manifest: false },
    returns: { fetch: true, webhook: false },
    limits: { requestsPerSecond: 2, burst: 5, maxBatchSize: 50 },
  };

  async verifyConnection(): Promise<{ ok: boolean; message?: string }> {
    throw unsupported(this.code, 'verifyConnection');
  }
}

export const createMyntraConnector = (): MarketplaceConnector => new MyntraConnector();
