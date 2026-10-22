import { Link } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useReturnDetail, useReturnOrder } from "@/hooks/useReturns";
import { cn } from "@/utils/cn";
import type { InspectionStatus, ReturnDetail, ReturnOrder } from "@/types/returns";
import { CloseButton, DrawerShell, DRAWER_BTN_DARK, DRAWER_BTN_LIGHT } from "@/components/returns/design";
import { ReturnActions } from "@/components/returns/ReturnActions";
import { fmtDay, fmtFullStamp, formatMoney, humanize } from "@/components/returns/returnFormat";
import { INSPECTION_LABELS, REFUND_LABELS } from "@/components/returns/returnParams";

interface ReturnDetailDrawerProps {
  /** the return to show; the drawer is closed when this is null */
  returnId: string | null;
  onClose: () => void;
  onStartInspection: (returnId: string) => void;
  onOpenRefund: (returnId: string) => void;
  /** "Review selected": the drawer steps through the picked returns */
  review?: { index: number; total: number; onPrev: (() => void) | null; onNext: (() => void) | null; onStop: () => void } | null;
}

const STEP_TITLE: Record<ReturnDetail["timeline"][number]["step"], string> = {
  requested: "Requested",
  approved: "Approved",
  received: "Received",
  inspection: "Inspection",
  refund: "Refund",
  disposition: "Disposition",
  closed: "Closed",
};

const INSPECTION_ACTION: Record<InspectionStatus, string> = {
  not_started: "Start inspection",
  in_progress: "Continue inspection",
  requires_review: "Review inspection",
  passed: "View inspection",
  failed: "View inspection",
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center py-2 text-[12px]">
      <span className="w-[130px] shrink-0 text-[#666666]">{label}</span>
      <span className="min-w-0 text-black">{children}</span>
    </div>
  );
}

function DateCell({ label, iso }: { label: string; iso: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] leading-[16px] text-[#666666]">{label}</span>
      <span className="text-[12px] leading-[17px] text-black">{iso ? fmtDay(iso) : "—"}</span>
    </div>
  );
}

function ItemsList({ order }: { order: ReturnOrder | undefined }) {
  if (!order) return <div role="status" aria-label="Loading items" className="h-12 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />;
  return (
    <div className="space-y-2">
      {order.items.map((it) => (
        <div key={it.id} className="space-y-0.5 rounded-lg border border-[#EAEAEA] p-3">
          <p className="font-mono text-[11px] font-semibold text-black">{it.sku ?? "No SKU"}</p>
          <p className="text-[11px] text-[#666666]">
            Requested {it.quantity} · received {it.receivedQuantity} · decided {it.dispositionedQuantity}
            {it.restockedQuantity > 0 ? ` · restocked ${it.restockedQuantity}` : ""}
          </p>
          {(it.condition || it.disposition) && (
            <p className="text-[11px] text-[#666666]">
              {it.condition ? `Condition: ${humanize(it.condition)}` : ""}
              {it.condition && it.disposition ? " · " : ""}
              {it.disposition ? `Disposition: ${humanize(it.disposition)}` : ""}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Timeline({ steps }: { steps: ReturnDetail["timeline"] }) {
  return (
    <div className="space-y-2 pt-1">
      <h3 className="pb-1 text-[14px] font-semibold leading-[20px] text-black">Event timeline</h3>
      <ol className="flex flex-col">
        {steps.map((s, idx) => {
          const done = s.status === "complete";
          const isLast = idx === steps.length - 1;
          const who = s.actor?.name ?? null;
          return (
            <li key={s.step} className="flex items-start gap-3 pb-3.5">
              <div className="flex w-3 shrink-0 flex-col items-center pt-1">
                <div className={cn("h-[9px] w-[9px] rounded-full border", done ? "border-[#16A34A] bg-[#16A34A]" : "border-[#BDBDBD] bg-white")} />
                {!isLast && <div className="mt-1 h-12 w-[1px] bg-[#EAEAEA]" />}
              </div>
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold leading-tight text-black">
                    {STEP_TITLE[s.step]}
                    <span className="sr-only">{done ? " (done)" : " (pending)"}</span>
                  </span>
                  <span className="text-[10px] text-[#666666]">{done && s.at ? fmtFullStamp(s.at) : "Pending · No timestamp yet"}</span>
                </div>
                <span className={cn("text-[11px] leading-[16px]", done ? "text-[#16A34A]" : "text-[#D97706]")}>
                  {done ? "Complete" : "Pending"}
                  {who ? ` · ${who}` : ""}
                </span>
                {s.note && <span className="text-[11px] leading-[16px] text-[#666666]">{s.note}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** one return, from the real detail (customer, reason, dates, current state, timeline) and the aggregate (items, pickup), with the next steps */
export function ReturnDetailDrawer({ returnId, onClose, onStartInspection, onOpenRefund, review }: ReturnDetailDrawerProps) {
  if (!returnId) return null;
  return <Body returnId={returnId} onClose={onClose} onStartInspection={onStartInspection} onOpenRefund={onOpenRefund} review={review} />;
}

function Body({ returnId, onClose, onStartInspection, onOpenRefund, review }: Omit<ReturnDetailDrawerProps, "returnId"> & { returnId: string }) {
  const detail = useReturnDetail(returnId);
  const order = useReturnOrder(returnId);
  const d = detail.data;
  const o = order.data;

  const customerName = d?.details.customer?.name ?? null;
  const customerLine = customerName ? `${customerName}${d?.details.customer?.email ? ` · ${d.details.customer.email}` : ""}` : "Not provided by the channel";

  const footer = (
    <div className="flex items-center gap-2 border-t border-[#EAEAEA] bg-white p-4">
      <button type="button" disabled={!d} onClick={() => onStartInspection(returnId)} className={DRAWER_BTN_DARK}>
        {d ? INSPECTION_ACTION[d.currentState.inspection.status] : "Start inspection"}
      </button>
      {d && (
        <Link to={`${ROUTES.ORDERS}?drawer=order:${d.header.orderId}`} className={cn(DRAWER_BTN_LIGHT, "inline-flex items-center")}>
          View Order
        </Link>
      )}
    </div>
  );

  return (
    <DrawerShell label={d ? `Return ${d.header.number}` : "Return"} onClose={onClose} footer={footer}>
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold leading-[26px] text-black">{d ? `Return ${d.header.number}` : "Return"}</h2>
            <CloseButton onClick={onClose} />
          </div>
          {d && (
            <p className="text-[11px] leading-[16px] text-[#666666]">
              {d.header.orderNumber ?? "—"} · {d.header.channel.name} · {customerName ?? "Customer not provided"}
            </p>
          )}
        </div>

        {review && (
          <div role="group" aria-label="Review selected returns" className="flex items-center justify-between gap-2 rounded-lg bg-[#F5F8FE] px-3 py-2 text-[11px] text-black">
            <span className="font-semibold">
              Reviewing {review.index + 1} of {review.total}
            </span>
            <span className="flex items-center gap-3">
              <button type="button" disabled={!review.onPrev} onClick={review.onPrev ?? undefined} className="font-medium hover:underline disabled:cursor-not-allowed disabled:text-[#BDBDBD] disabled:no-underline">
                ← Previous
              </button>
              <button type="button" disabled={!review.onNext} onClick={review.onNext ?? undefined} className="font-medium hover:underline disabled:cursor-not-allowed disabled:text-[#BDBDBD] disabled:no-underline">
                Next →
              </button>
              <button type="button" onClick={review.onStop} className="text-[#666666] hover:text-black hover:underline">
                Stop reviewing
              </button>
            </span>
          </div>
        )}

        {detail.isLoading && (
          <div role="status" aria-label="Loading return" className="space-y-3">
            <div className="h-16 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />
            <div className="h-28 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />
            <div className="h-40 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />
          </div>
        )}
        {detail.isError && (
          <div role="alert" className="space-y-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-[12px]">
            <p className="text-[#991B1B]">This return could not be loaded. {errorMessage(detail.error)}</p>
            <button type="button" className={DRAWER_BTN_LIGHT} onClick={() => void detail.refetch()}>
              Retry
            </button>
          </div>
        )}

        {d && (
          <>
            <div className="flex flex-col gap-1 rounded-lg bg-[#F5F5F5] p-3">
              <div className="text-[13px] font-semibold leading-[19px] text-black">
                {d.product.title ?? "No product"}
                {d.product.itemCount > 1 ? ` and ${d.product.itemCount - 1} more` : ""}
                {d.product.sku ? ` · ${d.product.sku}` : ""}
              </div>
              <div className="text-[12px] leading-[17px] text-[#666666]">
                Quantity {d.details.quantity.expected} · {d.details.reason.label} · {d.details.dates.receivedAt ? `Received ${fmtDay(d.details.dates.receivedAt)}` : "Not received yet"}
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <h3 className="pb-1 text-[14px] font-semibold leading-[20px] text-black">Return Details</h3>
              <div className="divide-y divide-[#EAEAEA]">
                <Detail label="Order ID">{d.header.orderNumber ?? d.header.orderId}</Detail>
                <Detail label="Marketplace">{d.header.channel.name}</Detail>
                <Detail label="Customer">{customerLine}</Detail>
                <Detail label="Product">{d.product.title ?? "—"}</Detail>
                <Detail label="SKU">{d.product.sku ?? "No SKU"}</Detail>
                <Detail label="Quantity">
                  {d.details.quantity.expected} expected · {d.details.quantity.received} received
                </Detail>
                <Detail label="Return reason">
                  {d.details.reason.label}
                  {d.details.reason.text ? ` · ${d.details.reason.text}` : ""}
                </Detail>
                {o && o.pickup.status !== "not_required" && <Detail label="Reverse pickup">{humanize(o.pickup.status)}{o.pickup.awb ? ` · AWB ${o.pickup.awb}` : ""}</Detail>}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-[14px] font-semibold leading-[20px] text-black">Returned items</h3>
              <ItemsList order={o} />
            </div>

            <div className={cn("grid gap-5 py-2", d.details.dates.completedAt ? "grid-cols-4" : "grid-cols-3")}>
              <DateCell label="Requested" iso={d.details.dates.requestedAt} />
              <DateCell label="Approved" iso={d.details.dates.approvedAt} />
              <DateCell label="Received" iso={d.details.dates.receivedAt} />
              {d.details.dates.completedAt && <DateCell label="Closed" iso={d.details.dates.completedAt} />}
            </div>

            <div className="flex flex-col gap-1.5 rounded-lg bg-[#FFFBF5] p-3">
              <span className="text-[13px] font-semibold leading-[19px] text-black">Current State</span>
              <span className="text-[12px] leading-[17px] text-[#D97706]">
                Inspection {INSPECTION_LABELS[d.currentState.inspection.status]} · Refund {REFUND_LABELS[d.currentState.refund.status]}
                {d.currentState.refund.amountMinor !== null ? ` (${formatMoney(d.currentState.refund.amountMinor, d.currentState.refund.currency)})` : ""}
              </span>
              <span className="text-[12px] leading-[17px] text-black">
                Disposition {humanize(d.currentState.disposition)}
                {d.currentState.disposition === "pending" ? " · No decision confirmed" : ""}
              </span>
              {d.currentState.inspection.inspector?.name && <span className="text-[12px] leading-[17px] text-[#666666]">Inspector {d.currentState.inspection.inspector.name}</span>}
              {d.currentState.refund.source && <span className="text-[12px] leading-[17px] text-[#666666]">{d.currentState.refund.source === "connector" ? "Refund handled by the marketplace" : "Refund recorded manually"}</span>}
              {o?.refund.reference && <span className="text-[12px] leading-[17px] text-[#666666]">Reference {o.refund.reference}</span>}
              {d.currentState.refund.error && (
                <span role="alert" className="text-[12px] leading-[17px] text-[#DC2626]">
                  Refund failed: {d.currentState.refund.error}
                </span>
              )}
            </div>
            {d.receipt.match === "quantity_mismatch" && d.receipt.mismatch && (
              <p className="rounded-lg border border-[#FDE68A]/60 bg-[#FFFBF5] p-3 text-[12px] text-[#D97706]">
                Quantity mismatch: {d.receipt.mismatch.expected} expected, {d.receipt.mismatch.received} received.
              </p>
            )}

            <Timeline steps={d.timeline} />

            <ReturnActions returnId={returnId} returnNumber={d.header.number} status={d.header.status} onOpenInspection={() => onStartInspection(returnId)} onOpenRefund={() => onOpenRefund(returnId)} />
          </>
        )}
      </div>
    </DrawerShell>
  );
}
