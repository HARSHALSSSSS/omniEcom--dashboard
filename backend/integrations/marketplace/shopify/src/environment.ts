import { ConnectorError, FetchTransport, type ConnectorContext, type HttpTransport } from '@oms/marketplace-core';

export const API_VERSION = '2024-10';
/** the OAuth scopes the platform asks for (the seller sees them on Shopify's consent screen) */
export const SCOPES = ['read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_orders', 'write_orders', 'read_fulfillments', 'write_fulfillments', 'read_locations'];

/** platform-level Shopify app (SHOPIFY_CLIENT_ID / _SECRET) for the redirect flow. Sandbox needs none. */
export interface ShopifyAppCredentials { clientId: string; clientSecret: string }

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

/**
 * Accepts "my-store", "my-store.myshopify.com" or a pasted admin URL and returns the canonical `my-store.myshopify.com`.
 * Only *.myshopify.com is ever contacted, so the field cannot be used to make the server call an arbitrary host (SSRF).
 */
export function normalizeShopDomain(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const host = text.replace(/^https?:\/\//, '').split(/[/?#]/)[0] ?? '';
  const full = host && !host.includes('.') ? `${host}.myshopify.com` : host;
  if (!SHOP_DOMAIN.test(full)) throw new ConnectorError('auth', 'Enter the shop domain as yourstore.myshopify.com', { code: 'invalid_shop_domain' });
  return full;
}

export const apiBase = (shop: string): string => `https://${shop}/admin/api/${API_VERSION}`;

export type SandboxTarget = 'simulator' | 'vendor-sandbox';
export const sandboxTarget = (config?: Record<string, unknown>): SandboxTarget =>
  (config?.sandbox as { target?: SandboxTarget } | undefined)?.target === 'vendor-sandbox' ? 'vendor-sandbox' : 'simulator';

export interface Target { transport: HttpTransport; shop: string; simulated: boolean }

/** `vendor-sandbox` = a real Shopify development store (same API, a *.myshopify.com host); `simulator` = the in-process sandbox */
export function selectTarget(opts: { mode?: 'live' | 'sandbox'; config?: Record<string, unknown>; shop: string }, simulator: HttpTransport): Target {
  const mode = opts.mode ?? 'sandbox';
  if (mode === 'sandbox' && sandboxTarget(opts.config) === 'simulator') return { transport: simulator, shop: opts.shop, simulated: true };
  return { transport: new FetchTransport(), shop: opts.shop, simulated: false };
}

/** the shop of an account: stored with the credentials, or in the account configuration before the seller has authorized */
export const shopOf = (credentials: Record<string, unknown>, config?: Record<string, unknown>): string => normalizeShopDomain(credentials.shopDomain ?? config?.shopDomain);
export const targetOf = (ctx: ConnectorContext, simulator: HttpTransport): Target => selectTarget({ mode: ctx.mode, config: ctx.config, shop: shopOf(ctx.credentials, ctx.config) }, simulator);
