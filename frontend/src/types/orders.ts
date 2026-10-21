import { z } from "zod";
import { OrderStatus, SlaState, ReturnStatus, ReturnDisposition } from "@/constants/enums";
export { OrderStatus, SlaState, ReturnStatus, ReturnDisposition };

export interface OrderItem {
  id: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  imageUrl?: string;
  hsn?: string;
  taxRatePct: number;
}

export interface CustomerDetails {
  name: string;
  email?: string;
  phone: string;
  city: string;
  state: string;
  pincode: string;
  addressLine: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  channel: "amazon" | "flipkart" | "meesho" | "shopify";
  channelOrderId: string;
  status: OrderStatus;
  slaState: SlaState;
  slaDeadline: string;
  orderedAt: string;
  customer: CustomerDetails;
  items: OrderItem[];
  totalAmount: number;
  paymentMethod: "prepaid" | "cod";
  paymentStatus: "paid" | "pending" | "failed";
  shippingCarrier?: "Delhivery" | "Blue Dart" | "Amazon ATS" | "Ekart";
  awbNumber?: string;
  warehouseId: string;
  warehouseName: string;
  timeline: Array<{
    status: OrderStatus;
    timestamp: string;
    description: string;
  }>;
}

export interface OrdersSummaryKPIs {
  totalOrdersToday: number;
  revenueTodayPaise: number;
  pendingDispatchCount: number;
  slaAtRiskCount: number;
  avgFulfillmentTimeHours: number;
  cancellationRatePct: number;
}

export interface FulfillmentBatch {
  id: string;
  batchNumber: string;
  carrier: string;
  orderCount: number;
  status: "picking" | "packing" | "manifested" | "dispatched";
  createdAt: string;
  orderIds: string[];
}

export interface ShippingMethod {
  id: string;
  carrier: string;
  serviceType: "express" | "surface" | "same_day";
  avgCostINR: number;
  deliveryTimeDays: string;
  isRecommended?: boolean;
}

export interface ReturnOrder {
  id: string;
  returnNumber: string;
  orderNumber: string;
  channel: "amazon" | "flipkart" | "meesho" | "shopify";
  customerName: string;
  reason: string;
  status: ReturnStatus;
  requestedAt: string;
  receivedAt?: string;
  inspectionStatus?: "pending" | "review" | "not_started" | "passed" | "failed";
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    disposition?: ReturnDisposition;
  }>;
  refundAmount: number;
  refundStatus: "pending" | "ready" | "processed" | "refunded" | "rejected" | "na";
  inventoryDisposition?: "pending" | "damaged" | "sellable" | "rejected";
  issueNote?: string;
  actionText?: string;
}

export const orderFilterSchema = z.object({
  channel: z.string().optional(),
  status: z.string().optional(),
  slaState: z.string().optional(),
  search: z.string().optional(),
});
export type OrderFilterInput = z.infer<typeof orderFilterSchema>;
