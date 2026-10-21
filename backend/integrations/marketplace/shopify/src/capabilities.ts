import { NO_CAPABILITIES, type ConnectorCapabilities, type ConnectorReadiness, type PollingStrategy } from '@oms/marketplace-core';

export const capabilities: ConnectorCapabilities = {
  ...NO_CAPABILITIES,
  // an installed app receives a permanent (offline) access token: nothing to refresh, uninstalling the app revokes it
  auth: { type: 'oauth2', refreshable: false, redirectFlow: true },
  account: { fetchProfile: true },
  catalog: { import: true },
  // a store has no category tree or marketplace review: products go live as soon as they are created
  listings: { create: true, update: true, deactivate: true, fetch: true, requiresCategoryMapping: false, categorySearch: false, statusLookup: true },
  // stock is held per inventory item and location: one call per SKU
  inventory: { push: true, pull: true, batch: false },
  pricing: { push: true, pull: false },
  // order webhooks are pushed; polling stays on as the safety net. A fulfilment with tracking is the only status the seller sets.
  orders: { fetch: true, webhook: true, acknowledge: false, updateStatus: true, cancel: true, maxLookbackDays: 60 },
  returns: { fetch: false, webhook: false },
  shipping: { createShipment: false, generateLabel: false, marketplaceManagedLogistics: false, manifest: false },
  // the REST Admin API leaky bucket refills 2 calls per second (burst 40 on standard plans)
  limits: { requestsPerSecond: 2, burst: 10, maxBatchSize: 1 },
};

export const readiness: ConnectorReadiness = {
  sandbox: true,
  live: false,
  notes:
    'Follows the public Shopify Admin REST API (2024-10) for products, inventory levels, orders, fulfilments and webhooks, but has only been exercised against the in-process simulator. ' +
    'Live use needs a Shopify app (client id and secret) and a pass against a Shopify development store (set config.sandbox.target to "vendor-sandbox") before readiness.live can be set.',
};

export const polling: PollingStrategy = {
  orders: { intervalSeconds: 300, lookbackMinutes: 24 * 60, overlapMinutes: 10 },
  listingStatus: { intervalSeconds: 900 },
};
