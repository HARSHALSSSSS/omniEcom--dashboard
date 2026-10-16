export type PurchaseOrderStatus =
  | "draft"
  | "submitted"
  | "acknowledged"
  | "partially_received"
  | "received"
  | "cancelled";

export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  email: string;
  phone: string;
  leadTimeDays: number;
  paymentTerms: string; // e.g. "Net 30"
  activeSkusCount: number;
  rating: number; // e.g. 4.8
  gstin?: string;
  city: string;
  status: "active" | "inactive";
}

export interface POLineItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  warehouseLocation: string;
  status: PurchaseOrderStatus;
  itemsCount: number;
  totalAmount: number;
  currency: string;
  orderDate: string;
  expectedDeliveryDate: string;
  receivedDate?: string;
  notes?: string;
  lineItems: POLineItem[];
}
