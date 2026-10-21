import { Star } from "lucide-react";
import { AuthThumbnail } from "@/components/products/list/AuthThumbnail";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatRelativeTime } from "@/utils/format";
import type { LedgerOrder } from "@/types/orders";
import { NO_WRITE_REASON, formatMoney } from "./orderFormat";
import { OrderStatusPill, SlaChip } from "./orderUi";

const TONE = { red: "bg-rose-50/40", amber: "bg-amber-50/40", green: "", none: "" } as const;

const ISSUE_ACTION = { allocate: "Allocate stock", restock: "Restock needed", map_sku: "SKU not mapped" } as const;

interface OrderRowProps {
  order: LedgerOrder;
  selected: boolean;
  canWrite: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

const initialsOf = (title: string) => title.trim().slice(0, 2).toUpperCase() || "—";

export function OrderRow({ order, selected, canWrite, onToggle, onOpen }: OrderRowProps) {
  const { destination: d, firstItem, carrier } = order;
  const place = [d.city, d.state].filter(Boolean).join(", ");
  const extraLines = order.lineCount - 1;
  return (
    <tr data-testid="order-row" className={cn("transition-colors hover:bg-muted/20", TONE[order.rowTone], selected && "bg-primary/5")}>
      <td className="py-3 pl-4 pr-2">
        <input
          type="checkbox"
          aria-label={`Select order ${order.number}`}
          checked={selected}
          disabled={!canWrite}
          title={canWrite ? undefined : NO_WRITE_REASON}
          onChange={() => onToggle(order.id)}
          className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-3 py-3">
        <button type="button" onClick={() => onOpen(order.id)} className="flex items-center gap-1 font-mono font-semibold text-foreground hover:underline">
          {order.number}
          {order.priority && <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label="Priority order" />}
        </button>
        <p className="text-[11px] text-muted-foreground">
          {order.marketplace.name} · {formatRelativeTime(order.placedAt)}
        </p>
      </td>
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground">{order.customerName ?? "Customer not shared"}</p>
        <p className="text-[11px] text-muted-foreground">{place ? `${place}${d.pincode ? ` (${d.pincode})` : ""}` : d.pincode ?? "Address not shared"}</p>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          {firstItem && <AuthThumbnail compact url={firstItem.imageUrl} alt="" initials={initialsOf(firstItem.title)} />}
          <div className="min-w-0">
            <p className="max-w-[180px] truncate text-[11px] font-medium text-foreground">{firstItem?.title ?? "No items"}</p>
            <p className="text-[11px] text-muted-foreground">
              {firstItem && <span className="font-mono font-semibold">{firstItem.sku}</span>}
              {extraLines > 0 && ` +${extraLines} more ${extraLines === 1 ? "line" : "lines"}`} · {order.itemCount} {order.itemCount === 1 ? "unit" : "units"}
            </p>
            {order.inventoryIssue && (
              <p className="text-[11px] font-medium text-amber-700">
                {ISSUE_ACTION[order.inventoryIssue.action]}: needs {order.inventoryIssue.required}, {order.inventoryIssue.available} available
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground">{formatMoney(order.valueMinor, order.currency)}</p>
        <p className="text-[11px] text-muted-foreground">{order.paymentLabel}</p>
      </td>
      <td className="px-3 py-3">
        <SlaChip sla={order.sla} />
      </td>
      <td className="px-3 py-3">
        <OrderStatusPill status={order.status} label={order.statusLabel} />
        {order.fulfillmentStatus && <p className="mt-0.5 text-[11px] text-muted-foreground">Fulfillment: {order.fulfillmentStatus.replace(/_/g, " ")}</p>}
      </td>
      <td className="px-3 py-3">
        {carrier?.name || carrier?.trackingNumber ? (
          <>
            <p className="text-[11px] font-medium text-foreground">{carrier.name ?? "Carrier"}</p>
            {carrier.trackingNumber && <p className="font-mono text-[11px] text-muted-foreground">{carrier.trackingNumber}</p>}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Not shipped</p>
        )}
        {order.warehouse && <p className="text-[11px] text-muted-foreground">{order.warehouse.name}</p>}
      </td>
      <td className="py-3 pl-3 pr-4 text-right">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpen(order.id)} aria-label={`Open order ${order.number}`}>
          Open
        </Button>
      </td>
    </tr>
  );
}
