import { ConnectorError, defaultHttpError, parseRetryAfter, type HttpResponse } from '@oms/marketplace-core';
import type { ShpError } from './dto';

/** "title can't be blank; variants.price must be greater than 0" */
export function describeErrors(body: unknown): { message: string; field?: string } | null {
  const errors = (body as ShpError | null)?.errors;
  if (!errors) return null;
  if (typeof errors === 'string') return { message: errors.slice(0, 300) };
  const parts = Object.entries(errors).map(([field, v]) => ({ field, text: `${field} ${Array.isArray(v) ? v.join(', ') : v}` }));
  return parts.length ? { message: parts.map((p) => p.text).join('; ').slice(0, 300), field: parts[0]!.field } : null;
}

export function mapShopifyError(res: HttpResponse): ConnectorError | null {
  const d = describeErrors(res.body);
  const message = d?.message ?? `Shopify request failed (HTTP ${res.status})`;
  // 401: token revoked / app uninstalled. 402 / 423: the shop is frozen or locked, which no retry fixes: the seller has to act
  if (res.status === 401) return new ConnectorError('auth', message, { code: 'invalid_token' });
  if (res.status === 402 || res.status === 423) return new ConnectorError('auth', message, { code: 'shop_unavailable' });
  if (res.status === 403) return new ConnectorError('permanent', message, { code: 'scope_missing' });
  if (res.status === 429) return new ConnectorError('rate_limited', message, { code: 'rate_limited', retryAfterMs: parseRetryAfter(res.headers) ?? 2000 });
  if (res.status === 404) return new ConnectorError('permanent', message, { code: 'not_found' });
  if (res.status === 400 || res.status === 409 || res.status === 422) return new ConnectorError('permanent', message, { code: res.status === 422 ? 'validation_failed' : 'bad_request', field: d?.field });
  if (res.status >= 500) return new ConnectorError('transient', message, { code: `http_${res.status}`, retryAfterMs: parseRetryAfter(res.headers) });
  return res.status >= 400 ? defaultHttpError(res) : null;
}
