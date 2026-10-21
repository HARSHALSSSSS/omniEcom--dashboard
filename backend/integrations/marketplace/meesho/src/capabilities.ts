import { NO_CAPABILITIES, type ConnectorCapabilities, type ConnectorReadiness, type PollingStrategy } from '@oms/marketplace-core';

export const capabilities: ConnectorCapabilities = {
  ...NO_CAPABILITIES,
  // a supplier id and a key issued in the supplier panel: static, no OAuth, nothing to refresh (rotate the key in the panel and reconnect)
  auth: { type: 'api_key', refreshable: false },
  account: { fetchProfile: true },
  catalog: { import: true },
  listings: { create: true, update: true, deactivate: true, fetch: true, requiresCategoryMapping: true, categorySearch: true, statusLookup: true },
  inventory: { push: true, pull: true, batch: true },
  pricing: { push: true, pull: false },
  // no push notifications: orders are POLLED. The supplier accepts, marks ready to ship and ships; Meesho assigns the courier and AWB.
  orders: { fetch: true, webhook: false, acknowledge: false, updateStatus: true, cancel: true, maxLookbackDays: 30 },
  returns: { fetch: true, webhook: false },
  shipping: { createShipment: false, generateLabel: false, marketplaceManagedLogistics: true, manifest: false },
  limits: { requestsPerSecond: 2, burst: 5, maxBatchSize: 50 },
};

export const readiness: ConnectorReadiness = {
  sandbox: true,
  live: false,
  notes:
    'Meesho does not publish its supplier API (access is partner gated). Endpoints, auth, statuses and payloads here are PROVISIONAL placeholders verified only against the in-process simulator. ' +
    'Obtain the supplier API contract from Meesho, align dto.ts/client.ts/mappers.ts to it, then run the live-readiness checklist in docs/integrations/CONNECTOR-GUIDE.md.',
};

export const polling: PollingStrategy = {
  orders: { intervalSeconds: 240, lookbackMinutes: 24 * 60, overlapMinutes: 10 },
  listingStatus: { intervalSeconds: 900 },
};
