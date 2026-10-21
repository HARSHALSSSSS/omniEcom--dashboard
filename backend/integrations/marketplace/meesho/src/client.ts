import { ConnectorError, MarketplaceHttpClient, defaultHttpError, parseRetryAfter, type ConnectorContext, type HttpResponse, type HttpTransport } from '@oms/marketplace-core';
import type { MeeAttributeRule, MeeBulkResult, MeeCategory, MeeError, MeeOrdersPage, MeeProduct, MeeProductsPage, MeeProfile, MeeReturnsPage, MeeSubOrder } from './dto';

export function mapMeeshoError(res: HttpResponse): ConnectorError | null {
  const b = (res.body ?? {}) as MeeError;
  const message = b.message ?? `Meesho request failed (HTTP ${res.status})`;
  if (res.status === 401 || res.status === 403) return new ConnectorError('auth', message, { code: b.code ?? `http_${res.status}` });
  if (res.status === 429) return new ConnectorError('rate_limited', message, { code: 'rate_limited', retryAfterMs: parseRetryAfter(res.headers) ?? 2000 });
  if (res.status === 404) return new ConnectorError('permanent', message, { code: 'not_found' });
  if (res.status === 400 || res.status === 409 || res.status === 422) return new ConnectorError('permanent', message, { code: b.code ?? 'bad_request', field: b.field });
  if (res.status >= 500) return new ConnectorError('transient', message, { code: `http_${res.status}`, retryAfterMs: parseRetryAfter(res.headers) });
  return res.status >= 400 ? defaultHttpError(res) : null;
}

export class MeeshoClient {
  private readonly http: MarketplaceHttpClient;
  constructor(transport: HttpTransport, baseUrl: string, supplierId: string, apiKey: string) {
    this.http = new MarketplaceHttpClient({ baseUrl, transport, mapError: (res) => mapMeeshoError(res), headers: { 'x-meesho-supplier': supplierId, 'x-meesho-key': apiKey, 'user-agent': 'OMS-Platform/1.0' } });
  }
  static from(ctx: ConnectorContext, transport: HttpTransport, baseUrl: string): MeeshoClient { return new MeeshoClient(transport, baseUrl, String(ctx.credentials.supplierId ?? ''), String(ctx.credentials.apiKey ?? '')); }

  async profile(): Promise<MeeProfile> { return (await this.http.get<MeeProfile>('/supplier/v1/profile')).body; }

  async orders(o: { modifiedAfter?: Date; offset: number; limit: number }): Promise<MeeOrdersPage> {
    return (await this.http.get<MeeOrdersPage>('/supplier/v1/orders', { offset: o.offset, limit: o.limit, ...(o.modifiedAfter ? { modifiedAfter: o.modifiedAfter.toISOString() } : {}) })).body;
  }
  async order(id: string): Promise<MeeSubOrder> { return (await this.http.get<MeeSubOrder>(`/supplier/v1/orders/${encodeURIComponent(id)}`)).body; }
  async transition(id: string, body: { status: string; courier?: string; awb?: string }): Promise<void> { await this.http.post(`/supplier/v1/orders/${encodeURIComponent(id)}/status`, body); }
  async cancel(id: string, reason: string): Promise<void> { await this.http.post(`/supplier/v1/orders/${encodeURIComponent(id)}/cancel`, { reason }); }
  async returns(o: { since: Date; offset: number; limit: number }): Promise<MeeReturnsPage> {
    return (await this.http.get<MeeReturnsPage>('/supplier/v1/returns', { since: o.since.toISOString(), offset: o.offset, limit: o.limit })).body;
  }

  async products(o: { offset: number; limit: number }): Promise<MeeProductsPage> { return (await this.http.get<MeeProductsPage>('/supplier/v1/catalog', { offset: o.offset, limit: o.limit })).body; }
  async product(sku: string): Promise<MeeProduct> { return (await this.http.get<MeeProduct>(`/supplier/v1/catalog/${encodeURIComponent(sku)}`)).body; }
  async upsertProduct(body: unknown): Promise<MeeBulkResult> { return (await this.http.post<{ results: MeeBulkResult }>('/supplier/v1/catalog', { products: [body] })).body.results; }
  async deactivate(sku: string): Promise<void> { await this.http.post(`/supplier/v1/catalog/${encodeURIComponent(sku)}/deactivate`, {}); }
  async updateInventory(items: Array<{ sku: string; quantity: number }>): Promise<MeeBulkResult> { return (await this.http.post<{ results: MeeBulkResult }>('/supplier/v1/inventory', { items })).body.results; }
  async updatePrices(items: Array<{ sku: string; price: string }>): Promise<MeeBulkResult> { return (await this.http.post<{ results: MeeBulkResult }>('/supplier/v1/prices', { items })).body.results; }

  async categories(q?: string): Promise<MeeCategory[]> { return (await this.http.get<{ categories: MeeCategory[] }>('/supplier/v1/categories', q ? { q } : {})).body.categories; }
  async attributes(categoryId: string): Promise<MeeAttributeRule[]> { return (await this.http.get<{ attributes: MeeAttributeRule[] }>(`/supplier/v1/categories/${encodeURIComponent(categoryId)}/attributes`)).body.attributes; }
}
