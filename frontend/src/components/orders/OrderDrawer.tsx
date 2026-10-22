import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useOrderDetail, useOrderDrawer, useOrderTimeline } from "@/hooks/useOrders";
import { formatDateTime, formatInZone } from "@/utils/format";
import type { OrderDetail, OrderDrawerData, OrderTimelineEntry } from "@/types/orders";
import { OrderActions } from "./OrderActions";
import { SLA_TEXT, addressLines, formatMoney, sentenceCase, textOf } from "./orderFormat";
import { OrderStatusPill } from "./orderUi";

const LABEL = "text-[12px] font-normal leading-[145%] text-[#666666]";

function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={`w-full flex flex-col items-start gap-2 ${first ? "" : "border-t border-[#EAEAEA] pt-3"}`}>
      <h4 className={`${LABEL} m-0`}>{title}</h4>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="w-full flex flex-row justify-between items-center gap-3">
      <span className="text-[12px] font-normal leading-[15px] text-[#666666]">{label}</span>
      <span className={`text-[13px] font-medium leading-[15px] text-right ${tone ?? "text-[#000000]"}`}>{value}</span>
    </div>
  );
}

function SlaCard({ sla }: { sla: OrderDrawerData["sla"] }) {
  const fill = sla.state === "safe" ? "bg-[#16A34A]" : sla.state === "approaching" ? "bg-[#D97706]" : "bg-[#DC2626]";
  return (
    <div className="w-full flex flex-col items-start gap-1.5">
      <div className="w-full flex flex-row justify-between items-start">
        <span className={LABEL}>Dispatch SLA</span>
        <span data-sla={sla.state} className={`text-[13px] font-semibold leading-[16px] ${SLA_TEXT[sla.state]}`}>{sla.label ?? "No dispatch deadline"}</span>
      </div>
      {sla.progressPct !== null && (
        <div
          role="progressbar"
          aria-label="Share of the dispatch window used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={sla.progressPct}
          className="relative w-full h-[6px] bg-[#F5F5F5] rounded-full overflow-visible"
        >
          <div className={`h-[6px] ${fill} rounded-full`} style={{ width: `${sla.progressPct}%` }} />
          <div className="absolute right-0 top-[-2px] w-[2px] h-[10px] bg-[#DC2626] rounded-sm" />
        </div>
      )}
      <div className="w-full flex flex-row justify-between items-start pt-0.5">
        <span className="text-[11px] font-normal leading-[13px] text-[#666666]">{sla.stageLabel || "Now"}</span>
        <span className="text-[11px] font-normal leading-[13px] text-[#666666]">{sla.dueAt ? `Dispatch deadline · ${formatDateTime(sla.dueAt)}` : "Dispatch deadline"}</span>
      </div>
    </div>
  );
}

function PaymentPill({ status }: { status: string }) {
  const ok = status === "paid";
  const bad = status === "failed";
  return (
    <div className={`flex flex-row items-center gap-1 px-1.5 py-0.5 rounded ${ok ? "bg-green-50" : bad ? "bg-red-50" : "bg-amber-50"}`}>
      {ok && <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2px]" aria-hidden />}
      <span className={`text-[12px] font-medium leading-[14px] ${ok ? "text-[#16A34A]" : bad ? "text-[#DC2626]" : "text-[#D97706]"}`}>{sentenceCase(status)}</span>
    </div>
  );
}

function Buyer({ detail, drawer }: { detail: OrderDetail | undefined; drawer: OrderDrawerData }) {
  const fallback = drawer.customer;
  const name = (detail && textOf(detail.customer, "name")) ?? fallback.name;
  const email = detail ? textOf(detail.customer, "email") : null;
  const phone = detail ? textOf(detail.customer, "phone") : null;
  const lines = detail ? addressLines(detail.shippingAddress) : [[fallback.city, fallback.state].filter(Boolean).join(", ")].filter(Boolean);
  const cur = drawer.value.currency;
  const method = drawer.value.paymentMethod === "cod" ? "Cash on delivery" : drawer.value.paymentMethod === "prepaid" ? "Prepaid" : "Unknown";
  return (
    <div className="w-full flex flex-col items-start gap-3">
      <div className="w-full flex flex-col items-start gap-[3px]">
        <span className={LABEL}>Customer</span>
        <span className="text-[14px] font-semibold leading-[18px] text-[#000000]">{name ?? "Customer details not shared by the marketplace"}</span>
        {lines.map((l) => (
          <span key={l} className="text-[12px] font-normal leading-[15px] text-[#666666]">
            {l}
          </span>
        ))}
        {phone && <span className="text-[12px] font-normal leading-[15px] text-[#666666]">Phone: {phone}</span>}
        {email && <span className="text-[12px] font-normal leading-[15px] text-[#666666]">Email: {email}</span>}
      </div>

      <div className="w-full flex flex-row justify-between items-center pt-1 border-t border-[#EAEAEA]">
        <span className={LABEL}>Order Value</span>
        <div className="flex flex-row items-center gap-2.5">
          <span className="text-[15px] font-semibold leading-[18px] text-[#000000]">{formatMoney(drawer.value.totalMinor, cur)}</span>
          <PaymentPill status={drawer.value.paymentStatus} />
        </div>
      </div>

      <div role="group" className="w-full flex flex-col items-start gap-1.5" aria-label="Payment">
        <Row label="Method" value={method} />
        <Row label="Status" value={sentenceCase(drawer.value.paymentStatus)} />
        {detail?.payment.codAmountMinor != null && <Row label="To collect on delivery" value={formatMoney(detail.payment.codAmountMinor, cur)} />}
        {detail && (
          <>
            <Row label="Subtotal" value={formatMoney(detail.subtotalMinor, cur)} />
            <Row label="Tax" value={formatMoney(detail.taxMinor, cur)} />
            <Row label="Shipping" value={formatMoney(detail.shippingMinor, cur)} />
            {detail.discountMinor > 0 && <Row label="Discount" value={`- ${formatMoney(detail.discountMinor, cur)}`} />}
            <Row label="Total" value={formatMoney(drawer.value.totalMinor, cur)} />
          </>
        )}
      </div>
    </div>
  );
}

function Items({ detail, drawer }: { detail: OrderDetail | undefined; drawer: OrderDrawerData }) {
  return (
    <Section title={`Items · ${drawer.items.units} ${drawer.items.units === 1 ? "unit" : "units"}`}>
      {detail
        ? detail.items.map((it) => (
            <div key={it.id} className="w-full flex flex-col gap-0.5">
              <div className="w-full flex flex-row justify-between items-center gap-3">
                <span className="text-[13px] font-medium leading-[16px] text-[#000000] line-clamp-2">{it.title}</span>
                <span className="text-[13px] font-normal leading-[16px] text-[#666666] shrink-0">× {it.quantity}</span>
              </div>
              <span className="text-[11px] leading-[13px] text-[#666666]">
                SKU: {it.sku} · {formatMoney(it.unitPriceMinor, detail.currency)} each
              </span>
              {it.reservedQuantity < it.quantity && (
                <span className="text-[11px] font-medium leading-[13px] text-[#D97706]">
                  Stock held for {it.reservedQuantity} of {it.quantity} units
                </span>
              )}
              {it.variantId === null && <span className="text-[11px] font-medium leading-[13px] text-[#D97706]">SKU is not mapped to a product yet</span>}
            </div>
          ))
        : drawer.items.lines.map((l) => (
            <div key={`${l.sku}-${l.title}`} className="w-full flex flex-col gap-0.5">
              <div className="w-full flex flex-row justify-between items-center gap-3">
                <span className="text-[13px] font-medium leading-[16px] text-[#000000] line-clamp-2">{l.title}</span>
                <span className="text-[13px] font-normal leading-[16px] text-[#666666] shrink-0">× {l.qty}</span>
              </div>
              <span className="text-[11px] leading-[13px] text-[#666666]">SKU: {l.sku}</span>
            </div>
          ))}
    </Section>
  );
}

const PICKING = { pending: { text: "Pending", tone: "text-[#666666]" }, in_progress: { text: "In progress", tone: "text-[#2563EB]" }, done: { text: "Done", tone: "text-[#16A34A]" } } as const;

function Shipment({ detail, drawer }: { detail: OrderDetail | undefined; drawer: OrderDrawerData }) {
  const f = drawer.fulfillment;
  return (
    <>
      <Section title="Fulfillment">
        <Row label="Warehouse" value={f.warehouse ?? "Not assigned"} />
        <Row label="Fulfillment" value={f.status ? sentenceCase(f.status) : "Not started"} />
        {f.picking && <Row label="Picking" value={PICKING[f.picking].text} tone={PICKING[f.picking].tone} />}
        <Row label="Carrier" value={detail?.tracking.carrier ?? "—"} />
        <Row label="Tracking number" value={<span className="font-mono">{detail?.tracking.number ?? "—"}</span>} />
        {detail?.dispatchedAt && <Row label="Dispatched" value={formatDateTime(detail.dispatchedAt)} />}
        {detail?.deliveredAt && <Row label="Delivered" value={formatDateTime(detail.deliveredAt)} />}
        {detail?.cancelledAt && <Row label="Cancelled" value={`${formatDateTime(detail.cancelledAt)}${detail.cancelReason ? ` - ${detail.cancelReason}` : ""}`} />}
      </Section>

      {drawer.marketplaceStatus && (
        <div className="box-border w-full flex flex-row justify-between items-center gap-3 pt-3 border-t border-[#EAEAEA]">
          <span className={LABEL}>Marketplace status</span>
          <span className="text-[12px] font-normal leading-[14px] text-[#666666] text-right">{drawer.marketplaceStatus}</span>
        </div>
      )}
    </>
  );
}

const WHEN = { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false } as const;

function Timeline({ entries, fallback }: { entries: OrderTimelineEntry[] | undefined; fallback: OrderDrawerData["activity"] }) {
  const items = entries
    ? entries.map((e) => ({
        key: String(e.id),
        title: sentenceCase(e.toStatus),
        note: e.applied ? e.note : `${e.marketplaceStatus ?? "Marketplace report"} was reported but not applied (out of order)`,
        at: e.createdAt,
      }))
    : fallback.map((a, i) => ({ key: String(i), title: a.text, note: null, at: a.at }));
  return (
    <Section title="Activity">
      {items.length === 0 ? (
        <p className="text-[12px] text-[#666666] m-0">No history yet.</p>
      ) : (
        <ol className="w-full flex flex-col gap-2 m-0 p-0 list-none">
          {items.map((e, i) => {
            const active = i === items.length - 1;
            return (
              <li key={e.key} className="w-full flex flex-row items-start gap-2.5">
                <div className={`w-[7px] h-[7px] rounded-full shrink-0 mt-[5px] ${active ? "bg-[#2563EB]" : "bg-[#BDBDBD]"}`} />
                <span className="w-[78px] text-[11px] font-normal leading-[14px] text-[#666666] shrink-0 mt-px">{formatInZone(e.at, WHEN)}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] leading-[15px] m-0 ${active ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"}`}>{e.title}</p>
                  {e.note && <p className="text-[11px] leading-[13px] text-[#666666] m-0">{e.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

interface OrderDrawerProps {
  orderId: string | null;
  onClose: () => void;
}

/** one order: SLA, buyer, items, payment, shipment, history and the allowed next steps (drawer + order + timeline + next-actions) */
export function OrderDrawer({ orderId, onClose }: OrderDrawerProps) {
  const drawer = useOrderDrawer(orderId);
  const detail = useOrderDetail(orderId);
  const timeline = useOrderTimeline(orderId);
  const d = drawer.data;

  return (
    <Sheet open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="box-border flex flex-col gap-0 p-0 w-[360px] sm:w-[380px] max-w-full bg-white border-l border-y border-[#EAEAEA] rounded-l-[20px] shadow-2xl font-['Inter',sans-serif]"
      >
        <div className="flex-1 overflow-y-auto p-5 pb-3">
          <div className="w-full flex flex-col items-start gap-6">
            <div className="w-full flex flex-col items-start gap-1">
              <div className="w-full flex flex-row justify-between items-center h-5 pr-6">
                <SheetDescription className={LABEL}>Order details</SheetDescription>
              </div>
              <div className="w-full flex flex-row justify-between items-center min-h-[30px] pt-1 gap-2">
                <SheetTitle className="text-[20px] font-semibold leading-[145%] text-[#000000] m-0 p-0">{d ? `Order ${d.number}` : "Order"}</SheetTitle>
                {d && <OrderStatusPill status={d.status} label={sentenceCase(d.status)} />}
              </div>
              {d && (
                <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
                  {d.channel.name} · Created {formatDateTime(d.placedAt)}
                </span>
              )}
            </div>

            {drawer.isLoading && (
              <div role="status" aria-label="Loading order" className="w-full space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}
            {drawer.isError && (
              <div role="alert" className="w-full space-y-2 text-[12px]">
                <p className="text-[#666666]">This order could not be loaded. {errorMessage(drawer.error)}</p>
                <button type="button" onClick={() => void drawer.refetch()} className="h-[28px] px-3 rounded-lg border border-[#EAEAEA] text-[12px] font-medium text-[#000000] hover:bg-neutral-50 cursor-pointer">
                  Retry
                </button>
              </div>
            )}
            {d && (
              <>
                <SlaCard sla={d.sla} />
                <div className="w-full h-[1px] bg-[#EAEAEA]" />
                <Buyer detail={detail.data} drawer={d} />
                <Items detail={detail.data} drawer={d} />
                <Shipment detail={detail.data} drawer={d} />
                <Timeline entries={timeline.data} fallback={d.activity} />
              </>
            )}
          </div>
        </div>

        {d && orderId && (
          <div className="box-border w-full p-5 pt-0">
            <OrderActions orderId={orderId} orderNumber={d.number} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
