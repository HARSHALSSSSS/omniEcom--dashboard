/**
 * Shopify Admin REST API wire types (the subset the connector uses). Ids are numbers on the wire, money is a decimal string.
 * Field names follow the public Admin API documentation; the connector has only been exercised against the in-process simulator.
 */
export interface ShpShop { id: number; name: string; myshopify_domain: string; currency: string; country_code: string; taxes_included?: boolean; plan_name?: string }
export interface ShpLocation { id: number; name: string; active: boolean }

export interface ShpVariant {
  id: number; product_id: number; sku: string; price: string; compare_at_price: string | null; barcode: string | null; inventory_item_id: number; inventory_quantity?: number;
}
export type ShpProductStatus = 'active' | 'draft' | 'archived';
export interface ShpProduct {
  id: number; title: string; body_html: string | null; vendor: string; product_type: string; status: ShpProductStatus; tags: string;
  variants: ShpVariant[]; images: Array<{ id?: number; src: string }>; updated_at: string;
}
export interface ShpProductsPage { products: ShpProduct[] }

export interface ShpTaxLine { title?: string; price: string; rate?: number }
export interface ShpLineItem {
  id: number; product_id: number | null; variant_id: number | null; sku: string | null; title: string; quantity: number; price: string; total_discount: string; tax_lines: ShpTaxLine[];
}
export interface ShpFulfillment { id: number; status: string; tracking_number: string | null; tracking_company: string | null; shipment_status: string | null }
export interface ShpAddress { name?: string; address1?: string; address2?: string | null; city?: string; province?: string; zip?: string; country_code?: string; phone?: string | null }
export interface ShpOrder {
  id: number; name: string; created_at: string; updated_at: string; currency: string; taxes_included: boolean;
  financial_status: 'pending' | 'authorized' | 'paid' | 'partially_paid' | 'partially_refunded' | 'refunded' | 'voided';
  fulfillment_status: 'fulfilled' | 'partial' | 'restocked' | null;
  cancelled_at: string | null;
  total_price: string; subtotal_price: string; total_tax: string; total_discounts: string; total_shipping_price_set?: { shop_money: { amount: string } };
  payment_gateway_names: string[];
  customer?: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
  shipping_address?: ShpAddress | null;
  line_items: ShpLineItem[];
  fulfillments: ShpFulfillment[];
}
export interface ShpOrdersPage { orders: ShpOrder[] }

export interface ShpFulfillmentOrder { id: number; status: string; assigned_location_id: number | null }
/** Admin API errors: `errors` is a string, or a map field -> messages for validation failures */
export interface ShpError { errors?: string | Record<string, string[] | string> }
