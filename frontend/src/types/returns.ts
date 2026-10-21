import { ReturnStatus, ReturnDisposition } from "@/constants/enums";
export { ReturnStatus, ReturnDisposition };

export interface ReturnItem {
  sku: string;
  title: string;
  quantity: number;
  unitPrice?: number;
  disposition?: ReturnDisposition | string;
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
  items: ReturnItem[];
  refundAmount: number;
  refundStatus: "pending" | "ready" | "processed" | "refunded" | "rejected" | "na";
  inventoryDisposition?: "pending" | "damaged" | "sellable" | "rejected";
  issueNote?: string;
  actionText?: string;
  conditions?: {
    packagingIntact: boolean;
    productUsable: boolean;
    accessoriesPresent: boolean;
    visibleDamage: boolean;
    productMismatch: boolean;
    missingQuantity: boolean;
  };
}

export interface CreateReturnInput {
  orderNumber: string;
  channel?: "amazon" | "flipkart" | "meesho" | "shopify";
  customerName?: string;
  customerEmail?: string;
  reason: string;
  notes?: string;
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    unitPrice?: number;
  }>;
}

export interface SubmitInspectionInput {
  status: "Pass" | "Fail" | "Needs Review";
  conditions: {
    packagingIntact: boolean;
    productUsable: boolean;
    accessoriesPresent: boolean;
    visibleDamage: boolean;
    productMismatch: boolean;
    missingQuantity: boolean;
  };
  notes?: string;
}

export interface ConfirmDispositionInput {
  disposition: "sellable" | "damaged" | "rejected" | "quarantine" | "repair" | "write_off";
  destination?: string;
  notes?: string;
}

export interface ProcessRefundInput {
  amount?: number;
  paymentMethod?: string;
}

export interface ReturnsListResponse {
  data: ReturnOrder[];
  meta: {
    total: number;
    open: number;
    awaitingInspection: number;
    refundsPending: number;
  };
}
