import { ConnectorError, MarketplaceHttpClient, type HttpTransport } from '@oms/marketplace-core';
import { SCOPES, apiBase, type ShopifyAppCredentials } from './environment';
import { mapShopifyError } from './errors';

/** the page the seller approves the app on; Shopify redirects back with `code`, `shop`, `state` and a signed `hmac` */
export function buildAuthorizeUrl(app: ShopifyAppCredentials, shop: string, state: string, redirectUri: string): string {
  const u = new URL(`https://${shop}/admin/oauth/authorize`);
  u.searchParams.set('client_id', app.clientId);
  u.searchParams.set('scope', SCOPES.join(','));
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  return u.toString();
}

/** exchanges the one-time code for the permanent access token of the shop */
export async function exchangeCode(transport: HttpTransport, shop: string, app: ShopifyAppCredentials, code: string): Promise<{ accessToken: string; scopes: string[] }> {
  const http = new MarketplaceHttpClient({ baseUrl: `https://${shop}`, transport, mapError: (res) => mapShopifyError(res) });
  // a code Shopify refuses (used, expired, wrong app) is an authorization problem the seller fixes by starting again, not a business rule
  const res = await http.post<{ access_token: string; scope: string }>('/admin/oauth/access_token', { client_id: app.clientId, client_secret: app.clientSecret, code }).catch((e) => {
    if (e instanceof ConnectorError && e.kind === 'permanent') throw new ConnectorError('auth', e.message, { code: 'invalid_grant' });
    throw e;
  });
  return { accessToken: res.body.access_token, scopes: res.body.scope.split(',').map((s) => s.trim()).filter(Boolean) };
}

export { apiBase };
