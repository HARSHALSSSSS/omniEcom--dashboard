import { MarketplaceHttpClient, type ConnectorContext, type HttpTransport } from '@oms/marketplace-core';
import type { ShpFulfillmentOrder, ShpLocation, ShpOrder, ShpOrdersPage, ShpProduct, ShpProductsPage, ShpShop } from './dto';
import { apiBase } from './environment';
import { mapShopifyError } from './errors';

export class ShopifyClient {
  private readonly http: MarketplaceHttpClient;
  constructor(transport: HttpTransport, shop: string, token: string) {
    this.http = new MarketplaceHttpClient({ baseUrl: `${apiBase(shop)}/`, transport, mapError: (res) => mapShopifyError(res), headers: { 'x-shopify-access-token': token, 'user-agent': 'OMS-Platform/1.0' } });
  }
  static from(ctx: ConnectorContext, transport: HttpTransport, shop: string): ShopifyClient { return new ShopifyClient(transport, shop, String(ctx.credentials.accessToken ?? '')); }

  async shop(): Promise<ShpShop> { return (await this.http.get<{ shop: ShpShop }>('shop.json')).body.shop; }
  async locations(): Promise<ShpLocation[]> { return (await this.http.get<{ locations: ShpLocation[] }>('locations.json')).body.locations; }

  async products(o: { sinceId?: number; limit: number }): Promise<ShpProduct[]> {
    return (await this.http.get<ShpProductsPage>('products.json', { limit: o.limit, ...(o.sinceId ? { since_id: o.sinceId } : {}) })).body.products;
  }
  async product(id: string | number): Promise<ShpProduct> { return (await this.http.get<{ product: ShpProduct }>(`products/${id}.json`)).body.product; }
  async createProduct(product: unknown): Promise<ShpProduct> { return (await this.http.post<{ product: ShpProduct }>('products.json', { product })).body.product; }
  async updateProduct(id: string | number, product: unknown): Promise<ShpProduct> { return (await this.http.put<{ product: ShpProduct }>(`products/${id}.json`, { product })).body.product; }
  async updateVariant(id: number, variant: Record<string, unknown>): Promise<void> { await this.http.put(`variants/${id}.json`, { variant: { id, ...variant } }); }

  async setInventory(o: { locationId: number; inventoryItemId: number; available: number }): Promise<void> {
    await this.http.post('inventory_levels/set.json', { location_id: o.locationId, inventory_item_id: o.inventoryItemId, available: o.available });
  }

  async orders(o: { updatedSince: Date; sinceId?: number; limit: number }): Promise<ShpOrder[]> {
    return (await this.http.get<ShpOrdersPage>('orders.json', { status: 'any', updated_at_min: o.updatedSince.toISOString(), limit: o.limit, ...(o.sinceId ? { since_id: o.sinceId } : {}) })).body.orders;
  }
  async order(id: string | number): Promise<ShpOrder> { return (await this.http.get<{ order: ShpOrder }>(`orders/${id}.json`)).body.order; }
  async cancelOrder(id: string | number, reason: string): Promise<void> { await this.http.post(`orders/${id}/cancel.json`, { reason: 'other', note: reason }); }
  async fulfillmentOrders(orderId: string | number): Promise<ShpFulfillmentOrder[]> { return (await this.http.get<{ fulfillment_orders: ShpFulfillmentOrder[] }>(`orders/${orderId}/fulfillment_orders.json`)).body.fulfillment_orders; }
  async createFulfillment(body: unknown): Promise<void> { await this.http.post('fulfillments.json', { fulfillment: body }); }
}
