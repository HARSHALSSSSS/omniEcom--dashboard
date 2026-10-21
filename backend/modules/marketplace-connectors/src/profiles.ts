import type { MarketplaceConnector } from '@oms/marketplace-core';

/**
 * What the setup screens need to know about a connector beyond its capability matrix: where it sits in the directory, a description, and the
 * FORM to connect it. The form is described here (field list with secret / pattern / help) so the frontend renders it from the API and a new
 * connector never needs a frontend release. Adding a connector = add one entry below (a generic profile is derived when none exists).
 *
 * Nothing here is invented marketing data: there are no ratings, review counts or prices (the API reports them as null).
 */
export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required: boolean;
  /** secrets are sent once, stored encrypted and never returned */
  secret: boolean;
  /** regular expression source the value must match (client side hint; the connector validates for real) */
  pattern: string | null;
  help: string | null;
  options?: Array<{ value: string; label: string }>;
}

export interface AuthFlowDescriptor {
  /** the connector's authentication scheme (capabilities.auth.type) */
  type: string;
  /** redirect = the seller approves the app on the marketplace; credentials = the seller pastes keys; both = either works */
  mode: 'redirect' | 'credentials' | 'both';
  /** fields of the direct credentials form */
  fields: CredentialField[];
  /** fields needed BEFORE the redirect (kept in the account configuration), e.g. the shop domain */
  redirectFields: CredentialField[];
  /** the marketplace only gives API access to approved partners */
  partnerGated: boolean;
  refreshable: boolean;
}

export interface ConnectorProfile {
  category: 'marketplace' | 'storefront' | 'shipping';
  description: string;
  logoKey: string;
  supportedRegions: string[];
}

const field = (key: string, label: string, o: Partial<Omit<CredentialField, 'key' | 'label'>> = {}): CredentialField => ({
  key, label, type: o.secret ? 'password' : 'text', required: true, secret: false, pattern: null, help: null, ...o,
});

const PROFILES: Record<string, ConnectorProfile & { partnerGated?: boolean; fields: CredentialField[]; redirectFields?: CredentialField[] }> = {
  amazon_in: {
    category: 'marketplace', logoKey: 'amazon', supportedRegions: ['IN'],
    description: 'Amazon India (Selling Partner API): listings, FBM inventory, orders and dispatch confirmations.',
    fields: [field('sellerId', 'Seller ID (Merchant Token)', { help: 'Seller Central > Settings > Account Info > Business Information' }), field('refreshToken', 'SP-API refresh token', { secret: true })],
  },
  flipkart: {
    category: 'marketplace', logoKey: 'flipkart', supportedRegions: ['IN'],
    description: 'Flipkart Seller API: listings, bulk inventory and price updates, order and shipment handling.',
    fields: [field('appId', 'Application ID'), field('appSecret', 'Application secret', { secret: true })],
  },
  myntra: {
    category: 'marketplace', logoKey: 'myntra', supportedRegions: ['IN'], partnerGated: true,
    description: 'Myntra partner API: styles, inventory and prices, polled orders with release status updates.',
    fields: [field('apiKey', 'API key'), field('apiSecret', 'API secret', { secret: true })],
  },
  snapdeal: {
    category: 'marketplace', logoKey: 'snapdeal', supportedRegions: ['IN'],
    description: 'Snapdeal seller API: products, stock and prices, polled orders with status callbacks.',
    fields: [field('sellerId', 'Seller ID'), field('authToken', 'Seller auth token', { secret: true, help: 'Generated in the Snapdeal seller panel; rotate it there and reconnect' })],
  },
  shopify: {
    category: 'storefront', logoKey: 'shopify', supportedRegions: ['IN', 'GLOBAL'],
    description: 'Shopify online store: products, inventory by location, orders and fulfilments with webhooks.',
    redirectFields: [field('shopDomain', 'Store domain', { pattern: '^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$', help: 'yourstore.myshopify.com' })],
    fields: [
      field('shopDomain', 'Store domain', { pattern: '^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$', help: 'yourstore.myshopify.com' }),
      field('accessToken', 'Admin API access token', { secret: true, help: 'From a custom app in the store admin (starts with shpat_)' }),
    ],
  },
  meesho: {
    category: 'marketplace', logoKey: 'meesho', supportedRegions: ['IN'], partnerGated: true,
    description: 'Meesho supplier panel: catalogue, inventory and prices, polled orders and returns. Access needs supplier approval from Meesho.',
    fields: [field('supplierId', 'Supplier ID'), field('apiKey', 'API key', { secret: true, help: 'Issued by Meesho in the supplier panel' })],
  },
  mock: {
    category: 'marketplace', logoKey: 'mock', supportedRegions: ['IN'],
    description: 'A simulated marketplace for trying the platform without a real account.',
    fields: [field('sellerId', 'Seller ID'), field('apiKey', 'API key', { secret: true, help: 'Sandbox keys start with sandbox_' })],
  },
};

export function connectorProfile(c: MarketplaceConnector): ConnectorProfile & { authFlow: AuthFlowDescriptor } {
  const p = PROFILES[c.code];
  const auth = c.capabilities.auth;
  const redirect = Boolean(auth.redirectFlow && c.buildAuthorizationUrl);
  const credentials = Boolean(c.authenticate);
  return {
    category: p?.category ?? 'marketplace',
    description: p?.description ?? `${c.displayName} connector`,
    logoKey: p?.logoKey ?? c.code,
    supportedRegions: p?.supportedRegions ?? ['IN'],
    authFlow: {
      type: auth.type, mode: redirect && credentials ? 'both' : redirect ? 'redirect' : 'credentials',
      fields: credentials ? (p?.fields ?? []) : [], redirectFields: redirect ? (p?.redirectFields ?? []) : [], partnerGated: p?.partnerGated ?? false, refreshable: auth.refreshable,
    },
  };
}

/** fields of a connect request: which keys are secret credentials and which belong to the (non-secret) account configuration */
export function splitConnectInput(c: MarketplaceConnector, input: Record<string, unknown>): { credentials: Record<string, unknown>; config: Record<string, unknown> } {
  const flow = connectorProfile(c).authFlow;
  const configKeys = new Set(flow.redirectFields.map((f) => f.key));
  const config: Record<string, unknown> = {};
  for (const k of configKeys) if (input[k] !== undefined) config[k] = input[k];
  return { credentials: input, config };
}
