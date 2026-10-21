import {
  fromMinor, toMinor,
  type InternalOrderStatus, type ListingInput, type ListingIssue, type ListingReportStatus, type ListingStatusReport, type NormalizedOrder, type NormalizedProduct,
} from '@oms/marketplace-core';
import type { ShpFulfillment, ShpOrder, ShpProduct } from './dto';

// ---------------------------------------------------------------- orders
const DELIVERY: Record<string, InternalOrderStatus> = { in_transit: 'in_transit', out_for_delivery: 'in_transit', attempted_delivery: 'in_transit', delivered: 'delivered' };

/**
 * A Shopify order has no single status word: it is a combination of cancellation, fulfilment and payment state.
 * cancelled > refunded after shipping (returned) > delivered / in transit / dispatched (from the carrier's shipment status) > partly fulfilled (confirmed) > new.
 */
export function toInternalOrderStatus(o: Pick<ShpOrder, 'cancelled_at' | 'fulfillment_status' | 'financial_status' | 'fulfillments'>): InternalOrderStatus {
  if (o.cancelled_at) return 'cancelled';
  if (o.fulfillment_status === 'fulfilled') {
    if (o.financial_status === 'refunded') return 'returned';
    const last: ShpFulfillment | undefined = [...o.fulfillments].reverse().find((f) => f.status !== 'cancelled');
    return (last?.shipment_status ? DELIVERY[last.shipment_status] : undefined) ?? 'dispatched';
  }
  return o.fulfillment_status === 'partial' ? 'confirmed' : 'new';
}

/** the word shown to support: the three Shopify states joined, e.g. "paid/fulfilled" */
export const marketplaceStatusOf = (o: ShpOrder): string => (o.cancelled_at ? 'cancelled' : `${o.financial_status}/${o.fulfillment_status ?? 'unfulfilled'}`);

const isCod = (o: ShpOrder): boolean => o.payment_gateway_names.some((g) => /cash on delivery|\bcod\b/i.test(g));

/**
 * Shopify prices in India include tax (`taxes_included`): the line price already contains the tax, so adding it again would overstate the order.
 * For tax-inclusive orders the line `taxMinor` is 0 and the tax is carried by the order's `taxMinor`; `totalMinor` is always Shopify's own total.
 */
export function mapOrder(o: ShpOrder): NormalizedOrder {
  const items = o.line_items.map((l) => ({
    externalItemId: String(l.id), externalListingId: l.product_id ? String(l.product_id) : undefined, sku: l.sku ?? '', title: l.title, quantity: l.quantity,
    unitPriceMinor: toMinor(l.price), taxMinor: o.taxes_included ? 0 : l.tax_lines.reduce((n, t) => n + toMinor(t.price), 0), discountMinor: toMinor(l.total_discount),
  }));
  const a = o.shipping_address;
  const totalMinor = toMinor(o.total_price);
  const cod = isCod(o);
  const fulfilment = o.fulfillments.find((f) => f.tracking_number);
  return {
    externalOrderId: String(o.id), status: toInternalOrderStatus(o), marketplaceStatus: marketplaceStatusOf(o), placedAt: new Date(o.created_at), currency: o.currency, totalMinor,
    subtotalMinor: toMinor(o.subtotal_price), taxMinor: toMinor(o.total_tax), shippingMinor: toMinor(o.total_shipping_price_set?.shop_money.amount), discountMinor: toMinor(o.total_discounts),
    buyer: { name: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || undefined, email: o.customer?.email ?? undefined, phone: o.customer?.phone ?? a?.phone ?? undefined },
    shippingAddress: a ? { name: a.name, line1: a.address1, line2: a.address2 ?? undefined, city: a.city, state: a.province, pincode: a.zip, country: a.country_code } : undefined,
    payment: { method: cod ? 'cod' : o.financial_status === 'pending' ? 'unknown' : 'prepaid', status: o.financial_status, ...(cod ? { codAmountMinor: totalMinor } : {}) },
    items, raw: fulfilment ? { ...o, tracking: { number: fulfilment.tracking_number, carrier: fulfilment.tracking_company } } : o,
  };
}

// ---------------------------------------------------------------- products / listings
export const PRODUCT_STATUS_MAP: Record<ShpProduct['status'], ListingReportStatus> = { active: 'active', draft: 'inactive', archived: 'inactive' };
export const toListingStatus = (s: string): ListingReportStatus => PRODUCT_STATUS_MAP[s as ShpProduct['status']] ?? 'pending';

/** our listing = one variant (SKU) of a Shopify product */
const variantOf = (p: ShpProduct, sku?: string) => p.variants.find((v) => v.sku === sku) ?? p.variants[0];

export function mapProductReport(p: ShpProduct, sku?: string): ListingStatusReport {
  const v = variantOf(p, sku);
  return { externalSku: v?.sku ?? sku ?? String(p.id), externalListingId: String(p.id), status: toListingStatus(p.status), marketplaceStatus: p.status, issues: [] };
}

export function mapProductToProduct(p: ShpProduct, v: ShpProduct['variants'][number]): NormalizedProduct {
  return {
    externalListingId: String(p.id), externalSku: v.sku, title: p.title, description: p.body_html ?? undefined, brand: p.vendor || undefined, barcode: v.barcode ?? undefined,
    category: p.product_type ? { id: p.product_type, name: p.product_type } : undefined, priceMinor: toMinor(v.price), mrpMinor: v.compare_at_price ? toMinor(v.compare_at_price) : undefined, currency: 'INR',
    quantity: v.inventory_quantity, imageUrls: p.images.map((i) => i.src), attributes: {}, status: toListingStatus(p.status), marketplaceStatus: p.status, raw: p,
  };
}

/** the request body for POST/PUT products.json; the variant carries SKU, price, compare-at price (MRP) and barcode */
export function buildProduct(i: ListingInput, existing?: { variantId?: number }) {
  return {
    title: i.title, body_html: i.description ?? '', vendor: i.brand ?? '', product_type: i.marketplaceCategoryId ?? '', status: 'active',
    variants: [{
      ...(existing?.variantId ? { id: existing.variantId } : {}),
      sku: i.externalSku, price: fromMinor(i.priceMinor), compare_at_price: i.mrpMinor && i.mrpMinor > i.priceMinor ? fromMinor(i.mrpMinor) : null, barcode: i.barcode ?? null, inventory_management: 'shopify',
    }],
    images: (i.imageUrls ?? []).map((src) => ({ src })),
  };
}

/** Shopify answers a rejected product with "title can't be blank; variants.price must be greater than 0": one issue per part, the first word names the field */
export function issuesFromError(message: string): ListingIssue[] {
  return message.split('; ').filter(Boolean).map((part) => ({ code: 'validation_failed', message: part, attribute: part.split(' ')[0]!.replace(/^variants\.\d*\.?/, '') || undefined, severity: 'error' as const }));
}
