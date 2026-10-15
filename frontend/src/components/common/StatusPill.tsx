import React from "react";
import { cn } from "@/utils/cn";
import {
  ORDER_STATUS_MAP,
  LISTING_STATUS_MAP,
  CONNECTION_STATUS_MAP,
  INVENTORY_HEALTH_MAP,
  PRODUCT_STATUS_MAP,
  ISSUE_PRIORITY_MAP,
  SLA_STATE_MAP,
  PURCHASE_ORDER_STATUS_MAP,
  JOB_STATUS_MAP,
  RETURN_STATUS_MAP,
  type StatusConfig,
} from "@/constants/statusMaps";
import {
  OrderStatus,
  ListingStatus,
  ConnectionStatus,
  InventoryHealth,
  ProductStatus,
  IssuePriority,
  SlaState,
  PurchaseOrderStatus,
  JobStatus,
  ReturnStatus,
} from "@/constants/enums";

type AnyStatus =
  | OrderStatus
  | ListingStatus
  | ConnectionStatus
  | InventoryHealth
  | ProductStatus
  | IssuePriority
  | SlaState
  | PurchaseOrderStatus
  | JobStatus
  | ReturnStatus
  | string;

interface StatusPillProps {
  status: AnyStatus;
  size?: "sm" | "default";
  className?: string;
  showDot?: boolean;
}

function resolveStatusConfig(status: AnyStatus): StatusConfig {
  if (status in ORDER_STATUS_MAP)
    return ORDER_STATUS_MAP[status as OrderStatus];
  if (status in LISTING_STATUS_MAP)
    return LISTING_STATUS_MAP[status as ListingStatus];
  if (status in CONNECTION_STATUS_MAP)
    return CONNECTION_STATUS_MAP[status as ConnectionStatus];
  if (status in INVENTORY_HEALTH_MAP)
    return INVENTORY_HEALTH_MAP[status as InventoryHealth];
  if (status in PRODUCT_STATUS_MAP)
    return PRODUCT_STATUS_MAP[status as ProductStatus];
  if (status in ISSUE_PRIORITY_MAP)
    return ISSUE_PRIORITY_MAP[status as IssuePriority];
  if (status in SLA_STATE_MAP) return SLA_STATE_MAP[status as SlaState];
  if (status in PURCHASE_ORDER_STATUS_MAP)
    return PURCHASE_ORDER_STATUS_MAP[status as PurchaseOrderStatus];
  if (status in JOB_STATUS_MAP) return JOB_STATUS_MAP[status as JobStatus];
  if (status in RETURN_STATUS_MAP)
    return RETURN_STATUS_MAP[status as ReturnStatus];

  return {
    label: String(status),
    className: "bg-neutral-100 text-neutral-700",
    dotClass: "bg-neutral-400",
  };
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  size = "default",
  className,
  showDot = true,
}) => {
  const config = resolveStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium select-none",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        config.className,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dotClass)}
        />
      )}
      <span>{config.label}</span>
    </span>
  );
};
