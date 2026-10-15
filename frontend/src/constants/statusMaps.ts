/**
 * Maps every status enum value to its display label and Tailwind color classes.
 * Used exclusively by <StatusPill status={...} />.
 * Never apply status colors directly in JSX — always go through StatusPill.
 */
import {
  OrderStatus,
  ListingStatus,
  ConnectionStatus,
  ReturnStatus,
  InventoryHealth,
  ProductStatus,
  IssuePriority,
  SlaState,
  PurchaseOrderStatus,
  JobStatus,
} from "./enums";

export interface StatusConfig {
  label: string;
  /** Tailwind bg + text classes for the pill */
  className: string;
  /** Dot color class for the status indicator */
  dotClass: string;
}

export const ORDER_STATUS_MAP: Record<OrderStatus, StatusConfig> = {
  [OrderStatus.New]: {
    label: "New",
    className: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
  [OrderStatus.Confirmed]: {
    label: "Confirmed",
    className: "bg-indigo-50 text-indigo-700",
    dotClass: "bg-indigo-500",
  },
  [OrderStatus.Picking]: {
    label: "Picking",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [OrderStatus.Packing]: {
    label: "Packing",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [OrderStatus.ReadyToDispatch]: {
    label: "Ready",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [OrderStatus.Dispatched]: {
    label: "Dispatched",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [OrderStatus.InTransit]: {
    label: "In Transit",
    className: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
  [OrderStatus.Delivered]: {
    label: "Delivered",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-400",
  },
  [OrderStatus.Cancelled]: {
    label: "Cancelled",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
  [OrderStatus.ReturnRequested]: {
    label: "Return Requested",
    className: "bg-orange-50 text-orange-700",
    dotClass: "bg-orange-500",
  },
};

export const LISTING_STATUS_MAP: Record<ListingStatus, StatusConfig> = {
  [ListingStatus.Live]: {
    label: "Live",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [ListingStatus.Ready]: {
    label: "Ready",
    className: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
  [ListingStatus.NeedsReview]: {
    label: "Needs Review",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [ListingStatus.Blocked]: {
    label: "Blocked",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
  [ListingStatus.Syncing]: {
    label: "Syncing",
    className: "bg-blue-50 text-blue-600",
    dotClass: "bg-blue-400",
  },
  [ListingStatus.Draft]: {
    label: "Draft",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
  [ListingStatus.NotListed]: {
    label: "Not Listed",
    className: "bg-neutral-50 text-neutral-500",
    dotClass: "bg-neutral-300",
  },
};

export const CONNECTION_STATUS_MAP: Record<ConnectionStatus, StatusConfig> = {
  [ConnectionStatus.Connected]: {
    label: "Connected",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [ConnectionStatus.NeedsAttention]: {
    label: "Attention",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [ConnectionStatus.Syncing]: {
    label: "Syncing",
    className: "bg-blue-50 text-blue-600",
    dotClass: "bg-blue-400",
  },
  [ConnectionStatus.Disconnected]: {
    label: "Disconnected",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
  [ConnectionStatus.AuthExpired]: {
    label: "Auth Expired",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
  [ConnectionStatus.Error]: {
    label: "Error",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
};

export const INVENTORY_HEALTH_MAP: Record<InventoryHealth, StatusConfig> = {
  [InventoryHealth.Healthy]: {
    label: "Healthy",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [InventoryHealth.LowStock]: {
    label: "Low Stock",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [InventoryHealth.OutOfStock]: {
    label: "Out of Stock",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
  [InventoryHealth.Overstock]: {
    label: "Overstock",
    className: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
};

export const PRODUCT_STATUS_MAP: Record<ProductStatus, StatusConfig> = {
  [ProductStatus.Active]: {
    label: "Active",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [ProductStatus.Draft]: {
    label: "Draft",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
  [ProductStatus.Archived]: {
    label: "Archived",
    className: "bg-neutral-100 text-neutral-500",
    dotClass: "bg-neutral-300",
  },
};

export const ISSUE_PRIORITY_MAP: Record<IssuePriority, StatusConfig> = {
  [IssuePriority.Critical]: {
    label: "Critical",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
  [IssuePriority.High]: {
    label: "High",
    className: "bg-orange-50 text-orange-700",
    dotClass: "bg-orange-500",
  },
  [IssuePriority.Medium]: {
    label: "Medium",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [IssuePriority.Low]: {
    label: "Low",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
};

export const SLA_STATE_MAP: Record<SlaState, StatusConfig> = {
  [SlaState.Safe]: {
    label: "Safe",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [SlaState.Approaching]: {
    label: "Approaching",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [SlaState.AtRisk]: {
    label: "At Risk",
    className: "bg-orange-50 text-orange-700",
    dotClass: "bg-orange-500",
  },
  [SlaState.Breached]: {
    label: "Breached",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
};

export const PURCHASE_ORDER_STATUS_MAP: Record<
  PurchaseOrderStatus,
  StatusConfig
> = {
  [PurchaseOrderStatus.Draft]: {
    label: "Draft",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
  [PurchaseOrderStatus.AwaitingApproval]: {
    label: "Awaiting Approval",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [PurchaseOrderStatus.Confirmed]: {
    label: "Confirmed",
    className: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
  [PurchaseOrderStatus.InTransit]: {
    label: "In Transit",
    className: "bg-indigo-50 text-indigo-700",
    dotClass: "bg-indigo-500",
  },
  [PurchaseOrderStatus.PartiallyReceived]: {
    label: "Partial",
    className: "bg-purple-50 text-purple-700",
    dotClass: "bg-purple-500",
  },
  [PurchaseOrderStatus.Received]: {
    label: "Received",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [PurchaseOrderStatus.Overdue]: {
    label: "Overdue",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
  [PurchaseOrderStatus.Cancelled]: {
    label: "Cancelled",
    className: "bg-neutral-100 text-neutral-500",
    dotClass: "bg-neutral-300",
  },
};

export const JOB_STATUS_MAP: Record<JobStatus, StatusConfig> = {
  [JobStatus.Queued]: {
    label: "Queued",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
  [JobStatus.Running]: {
    label: "Running",
    className: "bg-blue-50 text-blue-600",
    dotClass: "bg-blue-400",
  },
  [JobStatus.Succeeded]: {
    label: "Succeeded",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [JobStatus.Failed]: {
    label: "Failed",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
  [JobStatus.Partial]: {
    label: "Partial",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
};

export const RETURN_STATUS_MAP: Record<ReturnStatus, StatusConfig> = {
  [ReturnStatus.Requested]: {
    label: "Requested",
    className: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
  [ReturnStatus.Approved]: {
    label: "Approved",
    className: "bg-indigo-50 text-indigo-700",
    dotClass: "bg-indigo-500",
  },
  [ReturnStatus.InTransit]: {
    label: "In Transit",
    className: "bg-blue-50 text-blue-600",
    dotClass: "bg-blue-400",
  },
  [ReturnStatus.Received]: {
    label: "Received",
    className: "bg-purple-50 text-purple-700",
    dotClass: "bg-purple-500",
  },
  [ReturnStatus.Inspecting]: {
    label: "Inspecting",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  [ReturnStatus.Resolution]: {
    label: "Resolution",
    className: "bg-orange-50 text-orange-700",
    dotClass: "bg-orange-500",
  },
  [ReturnStatus.Refunded]: {
    label: "Refunded",
    className: "bg-green-50 text-green-700",
    dotClass: "bg-green-500",
  },
  [ReturnStatus.Closed]: {
    label: "Closed",
    className: "bg-neutral-100 text-neutral-600",
    dotClass: "bg-neutral-400",
  },
};
