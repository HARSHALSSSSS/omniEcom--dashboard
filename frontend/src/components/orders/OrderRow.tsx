import { ExternalLink, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import type { LedgerOrder } from "@/types/orders";
import { NO_WRITE_REASON, createdLabel, formatMoney, railColor, sentenceCase } from "./orderFormat";
import { FULFILLMENT_LABELS } from "./orderParams";
import { SlaChip } from "./orderUi";

/** the shared column template of the header and the rows */
export const ORDER_GRID = "grid grid-cols-[40px_1.2fr_1fr_1.2fr_0.8fr_0.9fr_0.8fr_1.3fr_1fr_1.1fr_0.9fr_60px]";

const PAYMENT_TEXT = (status: string) => (status === "paid" ? "text-[#16A34A]" : status === "failed" ? "text-[#DC2626]" : "text-[#D97706]");

interface Banner {
  title: string;
  reason: string;
  item: string;
  detail: string;
  action: { label: string; to?: string };
}

const ISSUE_REASON = {
  allocate: "Stock is available but not held for this order.",
  restock: "Not enough stock to fulfil this order.",
  map_sku: "This SKU is not mapped to a product yet.",
} as const;

/** the line under a row that needs a person: the stock problem first, then a dispatch deadline in danger, then a failed payment */
function bannerOf(o: LedgerOrder): Banner | null {
  const item = o.firstItem?.title ?? "Order";
  if (o.inventoryIssue) {
    const i = o.inventoryIssue;
    return {
      title: "Inventory issue",
      reason: ISSUE_REASON[i.action],
      item: i.productTitle,
      detail: `Required: ${i.required} · Available: ${i.available}`,
      action: i.action === "allocate" ? { label: "Allocate stock →" } : { label: i.action === "map_sku" ? "Map the SKU →" : "Review inventory →", to: i.action === "map_sku" ? ROUTES.PRODUCTS : ROUTES.INVENTORY },
    };
  }
  if (o.sla.state === "at_risk" || o.sla.state === "breached") {
    return {
      title: "SLA critical",
      reason: o.sla.state === "breached" ? "The dispatch deadline has passed." : "The dispatch deadline is close.",
      item,
      detail: o.sla.label ?? "",
      action: { label: "Expedite packing & dispatch →" },
    };
  }
  if (o.payment.status === "failed") {
    return { title: "Payment failed", reason: "The payment for this order did not go through.", item, detail: o.paymentLabel, action: { label: "Review order →" } };
  }
  return null;
}

interface OrderRowProps {
  order: LedgerOrder;
  selected: boolean;
  canWrite: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

export function OrderRow({ order, selected, canWrite, onToggle, onOpen }: OrderRowProps) {
  const rail = railColor(order.rowTone, order.status);
  const banner = bannerOf(order);
  const fulfillment = order.inventoryIssue
    ? { text: "Inventory Issue", tone: "text-[#DC2626]" }
    : order.fulfillmentStatus
      ? { text: FULFILLMENT_LABELS[order.fulfillmentStatus as keyof typeof FULFILLMENT_LABELS] ?? sentenceCase(order.fulfillmentStatus), tone: "text-[#2563EB]" }
      : { text: "Not started", tone: "text-[#666666]" };
  const place = [order.destination.city, order.destination.state].filter(Boolean).join(", ");

  return (
    <div className="w-full flex flex-col items-start">
      <div
        role="row"
        data-testid="order-row"
        className={`relative w-full ${ORDER_GRID} items-center min-h-[44px] py-1 border-b border-[#EAEAEA] hover:bg-neutral-50/70 transition-colors px-1 ${selected ? "bg-neutral-50" : "bg-white"}`}
      >
        {rail && <div className="absolute left-0 top-[6px] w-[3px] h-[32px]" style={{ backgroundColor: rail }} aria-hidden />}

        <div role="cell" className="flex items-center justify-center">
          <input
            type="checkbox"
            aria-label={`Select order ${order.number}`}
            checked={selected}
            disabled={!canWrite}
            title={canWrite ? undefined : NO_WRITE_REASON}
            onChange={() => onToggle(order.id)}
            className="w-3.5 h-3.5 rounded-[2px] border border-[#BDBDBD] text-black focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        <div role="cell" className="px-2">
          <button type="button" onClick={() => onOpen(order.id)} className="flex items-center gap-1 text-[12px] font-semibold leading-[140%] text-[#000000] hover:underline text-left cursor-pointer">
            {order.number}
            {order.priority && <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label="Priority order" />}
          </button>
        </div>

        <div role="cell" className="px-2">
          <span className="text-[12px] font-normal leading-[140%] text-[#000000]">{order.marketplace.name}</span>
        </div>

        <div role="cell" className="px-2 min-w-0">
          <span className="text-[12px] font-normal leading-[140%] text-[#000000] truncate block">{order.customerName ?? "Customer not shared"}</span>
          {place && <span className="text-[10px] font-normal leading-[12px] text-[#666666] truncate block">{place}</span>}
        </div>

        <div role="cell" className="px-2" title={order.firstItem ? `${order.firstItem.title} (${order.firstItem.sku})${order.lineCount > 1 ? ` +${order.lineCount - 1} more` : ""}` : undefined}>
          <span className="text-[12px] font-normal leading-[140%] text-[#000000]">
            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        <div role="cell" className="px-2">
          <span className="text-[12px] font-semibold leading-[140%] text-[#000000]">{formatMoney(order.valueMinor, order.currency)}</span>
        </div>

        <div role="cell" className="px-2" title={order.paymentLabel}>
          <span className={`text-[12px] font-normal leading-[140%] ${PAYMENT_TEXT(order.payment.status)}`}>
            {sentenceCase(order.payment.status)}
            {order.payment.method === "cod" ? " · COD" : ""}
          </span>
        </div>

        <div role="cell" className="px-2">
          <span className={`text-[12px] font-normal leading-[140%] ${fulfillment.tone}`}>{fulfillment.text}</span>
          {order.carrier?.trackingNumber && <span className="text-[10px] font-normal leading-[12px] text-[#666666] truncate block">{order.carrier.name ?? "Carrier"} · {order.carrier.trackingNumber}</span>}
        </div>

        <div role="cell" className="px-2">
          <SlaChip sla={order.sla} />
        </div>

        <div role="cell" className="px-2">
          <span className="text-[12px] font-normal leading-[140%] text-[#000000]">{order.statusLabel}</span>
        </div>

        <div role="cell" className="px-2">
          <span className="text-[12px] font-normal leading-[140%] text-[#000000]" title={order.placedAt}>
            {createdLabel(order.placedAt)}
          </span>
        </div>

        <div role="cell" className="px-2 flex items-center justify-center">
          <button
            type="button"
            onClick={() => onOpen(order.id)}
            title="Open order drawer"
            aria-label={`Open order ${order.number}`}
            className="flex items-center justify-center w-[28px] h-[28px] rounded-[5px] bg-[#F5F5F5] hover:bg-neutral-200 text-[#666666] transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 stroke-[1.5px]" aria-hidden />
          </button>
        </div>
      </div>

      {banner && (
        <div data-testid="order-banner" className="box-border w-full flex flex-row flex-wrap items-center py-1 pl-[28px] pr-[10px] gap-x-[18px] gap-y-1 min-h-[45px] bg-white border-b border-[#EAEAEA]">
          <div className="flex flex-col items-start gap-[2px] w-[266px] max-w-full shrink-0">
            <span className="text-[11px] font-semibold leading-[13px] text-[#DC2626]">{banner.title}</span>
            <span className="text-[11px] font-normal leading-[13px] text-[#666666]">{banner.reason}</span>
          </div>

          <div className="flex-1 min-w-[160px] flex flex-col items-start gap-[2px]">
            <span className="text-[11px] font-normal leading-[13px] text-[#000000]">{banner.item}</span>
            {banner.detail && <span className="text-[10px] font-normal leading-[12px] text-[#666666]">{banner.detail}</span>}
          </div>

          <div className="flex flex-col items-end gap-[2px] shrink-0">
            <span className="text-[9px] font-normal leading-[11px] text-[#666666]">Recommended next step</span>
            {banner.action.to ? (
              <Link to={banner.action.to} className="text-[11px] font-medium leading-[13px] text-[#000000] hover:underline cursor-pointer">
                {banner.action.label}
              </Link>
            ) : (
              <button type="button" onClick={() => onOpen(order.id)} className="text-[11px] font-medium leading-[13px] text-[#000000] hover:underline cursor-pointer">
                {banner.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
