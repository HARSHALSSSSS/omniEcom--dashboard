/**
 * Meesho supplier API wire types. Meesho does not publish its supplier API: EVERYTHING here is PROVISIONAL and must be
 * confirmed against the contract you receive from Meesho before live use (see capabilities.ts readiness).
 */
export interface MeeError { code?: string; message?: string; field?: string }
export interface MeeProfile { supplierId: string; name: string; active: boolean }

export type MeeSubOrderStatus = 'PENDING' | 'ACCEPTED' | 'READY_TO_SHIP' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
export interface MeeLine { lineId: string; productId?: string; sku: string; name: string; quantity: number; supplierPrice: string; gst: string; discount: string }
/** a Meesho "sub-order" is the supplier's share of a customer order: it is our order */
export interface MeeSubOrder {
  subOrderId: string; placedOn: string; modifiedOn: string; status: MeeSubOrderStatus; paymentMode: 'PREPAID' | 'COD';
  customerName?: string; customerPhone?: string;
  address?: { line1: string; city: string; state: string; pincode: string; country: string };
  lines: MeeLine[];
  shipment?: { courier: string; awb: string };
}
export interface MeeOrdersPage { subOrders: MeeSubOrder[]; total: number; offset: number }

export type MeeProductStatus = 'LIVE' | 'UNDER_REVIEW' | 'BLOCKED' | 'ACTION_REQUIRED' | 'INACTIVE';
export interface MeeProductError { code: string; message: string; field?: string; warning?: boolean }
export interface MeeProduct {
  sku: string; productId?: string; name?: string; brand?: string; categoryId?: string; mrp?: string; price?: string; stock?: number;
  status: MeeProductStatus; errors?: MeeProductError[]; attributes?: Record<string, string | number | boolean>; images?: string[];
}
export interface MeeProductsPage { products: MeeProduct[]; total: number; offset: number }
export interface MeeCategory { id: string; name: string }
export interface MeeAttributeRule { key: string; label?: string; required: boolean; kind: 'text' | 'number' | 'boolean' | 'list'; options?: string[]; maxLen?: number }
export type MeeBulkResult = Array<{ sku: string; ok: boolean; code?: string; message?: string; errors?: MeeProductError[] }>;

export interface MeeReturn { returnId: string; subOrderId: string; status: string; reason?: string; createdOn: string }
export interface MeeReturnsPage { returns: MeeReturn[]; total: number; offset: number }
