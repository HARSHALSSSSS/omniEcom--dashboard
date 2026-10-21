import {
  fromMinor, toMinor,
  type InternalOrderStatus, type ListingInput, type ListingIssue, type ListingReportStatus, type ListingRequirement, type ListingStatusReport, type NormalizedOrder, type NormalizedProduct, type NormalizedReturn,
} from '@oms/marketplace-core';
import type { MeeAttributeRule, MeeProduct, MeeProductError, MeeProductStatus, MeeReturn, MeeSubOrder, MeeSubOrderStatus } from './dto';

export const ORDER_STATUS_MAP: Record<MeeSubOrderStatus, InternalOrderStatus> = {
  PENDING: 'new', ACCEPTED: 'confirmed', READY_TO_SHIP: 'ready_to_dispatch', SHIPPED: 'dispatched', IN_TRANSIT: 'in_transit', DELIVERED: 'delivered', CANCELLED: 'cancelled', RETURNED: 'returned',
};
export const toInternalOrderStatus = (s: string): InternalOrderStatus => ORDER_STATUS_MAP[s as MeeSubOrderStatus] ?? 'new';

/** supplierPrice / gst / discount are decimal strings per line; the total is what the supplier is owed for the lines */
export function mapSubOrder(o: MeeSubOrder): NormalizedOrder {
  const items = o.lines.map((l) => ({
    externalItemId: l.lineId, externalListingId: l.productId, sku: l.sku, title: l.name, quantity: l.quantity,
    unitPriceMinor: toMinor(l.supplierPrice), taxMinor: toMinor(l.gst), discountMinor: toMinor(l.discount),
  }));
  const total = items.reduce((n, i) => n + i.unitPriceMinor * i.quantity + i.taxMinor - i.discountMinor, 0);
  return {
    externalOrderId: o.subOrderId, status: toInternalOrderStatus(o.status), marketplaceStatus: o.status, placedAt: new Date(o.placedOn), currency: 'INR', totalMinor: total,
    buyer: { name: o.customerName, phone: o.customerPhone },
    shippingAddress: o.address ? { name: o.customerName, line1: o.address.line1, city: o.address.city, state: o.address.state, pincode: o.address.pincode, country: o.address.country } : undefined,
    payment: { method: o.paymentMode === 'COD' ? 'cod' : 'prepaid', ...(o.paymentMode === 'COD' ? { codAmountMinor: total } : {}) },
    items, raw: o,
  };
}

export const mapReturn = (r: MeeReturn): NormalizedReturn => ({ externalReturnId: r.returnId, externalOrderId: r.subOrderId, status: r.status, reason: r.reason, requestedAt: new Date(r.createdOn), raw: r });

export const PRODUCT_STATUS_MAP: Record<MeeProductStatus, ListingReportStatus> = { LIVE: 'active', UNDER_REVIEW: 'pending', BLOCKED: 'rejected', ACTION_REQUIRED: 'correction_required', INACTIVE: 'inactive' };
export const toListingStatus = (s: string): ListingReportStatus => PRODUCT_STATUS_MAP[s as MeeProductStatus] ?? 'pending';
export const toIssues = (e?: MeeProductError[]): ListingIssue[] => (e ?? []).map((x) => ({ code: x.code, message: x.message, attribute: x.field, severity: x.warning ? 'warning' : 'error' }));

export function mapProductReport(p: MeeProduct): ListingStatusReport {
  return { externalSku: p.sku, externalListingId: p.productId ?? p.sku, status: toListingStatus(p.status), marketplaceStatus: p.status, issues: toIssues(p.errors) };
}

export function mapProduct(p: MeeProduct): NormalizedProduct {
  const r = mapProductReport(p);
  return {
    externalListingId: r.externalListingId, externalSku: p.sku, title: p.name ?? p.sku, brand: p.brand, category: p.categoryId ? { id: p.categoryId, name: p.categoryId } : undefined,
    priceMinor: p.price ? toMinor(p.price) : undefined, mrpMinor: p.mrp ? toMinor(p.mrp) : undefined, currency: 'INR', quantity: p.stock, imageUrls: p.images, attributes: p.attributes ?? {},
    status: r.status, marketplaceStatus: r.marketplaceStatus, raw: p,
  };
}

export const mapAttributes = (rules: MeeAttributeRule[]): ListingRequirement[] =>
  rules.map((r) => ({
    name: r.key, label: r.label ?? r.key, required: r.required, type: r.kind === 'list' ? 'enum' : r.kind === 'text' ? 'string' : r.kind, allowedValues: r.options, maxLength: r.maxLen,
    coreField: r.key === 'name' ? 'title' : r.key === 'brand' ? 'brand' : r.key === 'description' ? 'description' : undefined,
  }));

export const buildProduct = (i: ListingInput) => ({
  sku: i.externalSku, name: i.title, brand: i.brand, description: i.description, categoryId: i.marketplaceCategoryId, barcode: i.barcode,
  mrp: i.mrpMinor ? fromMinor(i.mrpMinor) : undefined, price: fromMinor(i.priceMinor), stock: i.quantity, attributes: i.attributes ?? {}, images: i.imageUrls ?? [],
});
