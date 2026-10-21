import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useOrderDetail, useOrderDrawer, useOrderTimeline } from "@/hooks/useOrders";
import { formatDateTime } from "@/utils/format";
import type { OrderDetail, OrderDrawerData, OrderTimelineEntry } from "@/types/orders";
import { OrderActions } from "./OrderActions";
import { addressLines, formatMoney, textOf } from "./orderFormat";
import { OrderStatusPill, SlaChip } from "./orderUi";

const STATUS_NAME = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}

function SlaCard({ sla }: { sla: OrderDrawerData["sla"] }) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Dispatch SLA</span>
        <SlaChip sla={sla} />
      </div>
      {sla.progressPct !== null && (
        <div
          role="progressbar"
          aria-label="Share of the dispatch window used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={sla.progressPct}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className={`h-full ${sla.state === "safe" ? "bg-emerald-500" : sla.state === "approaching" ? "bg-amber-500" : "bg-rose-600"}`} style={{ width: `${sla.progressPct}%` }} />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {sla.stageLabel}
        {sla.dueAt ? ` · due ${formatDateTime(sla.dueAt)}` : ""}
      </p>
    </div>
  );
}

function Buyer({ detail, fallback }: { detail: OrderDetail | undefined; fallback: OrderDrawerData["customer"] }) {
  const name = (detail && textOf(detail.customer, "name")) ?? fallback.name;
  const email = detail ? textOf(detail.customer, "email") : null;
  const phone = detail ? textOf(detail.customer, "phone") : null;
  const lines = detail ? addressLines(detail.shippingAddress) : [fallback.city, fallback.state].filter((x): x is string => Boolean(x));
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <MapPin className="h-4 w-4 text-primary" aria-hidden />
        Customer and shipping address
      </div>
      <p className="font-semibold text-foreground">{name ?? "Customer details not shared by the marketplace"}</p>
      {lines.map((l) => (
        <p key={l} className="leading-relaxed text-muted-foreground">
          {l}
        </p>
      ))}
      {phone && <p className="text-muted-foreground">Phone: {phone}</p>}
      {email && <p className="text-muted-foreground">Email: {email}</p>}
    </div>
  );
}

function Items({ detail, drawer }: { detail: OrderDetail | undefined; drawer: OrderDrawerData }) {
  return (
    <Section title={`Items (${drawer.items.units} ${drawer.items.units === 1 ? "unit" : "units"})`}>
      {detail
        ? detail.items.map((it) => (
            <div key={it.id} className="space-y-0.5 rounded-lg border border-border p-3">
              <p className="line-clamp-2 font-semibold text-foreground">{it.title}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                SKU: {it.sku} · Qty: {it.quantity}
              </p>
              <p className="font-semibold text-foreground">{formatMoney(it.unitPriceMinor, detail.currency)} each</p>
              {it.reservedQuantity < it.quantity && <p className="text-[11px] font-medium text-amber-700">Stock held for {it.reservedQuantity} of {it.quantity} units</p>}
              {it.variantId === null && <p className="text-[11px] font-medium text-amber-700">SKU is not mapped to a product yet</p>}
            </div>
          ))
        : drawer.items.lines.map((l) => (
            <div key={`${l.sku}-${l.title}`} className="rounded-lg border border-border p-3">
              <p className="line-clamp-2 font-semibold text-foreground">{l.title}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                SKU: {l.sku} · Qty: {l.qty}
              </p>
            </div>
          ))}
    </Section>
  );
}

function Payment({ detail, drawer }: { detail: OrderDetail | undefined; drawer: OrderDrawerData }) {
  const cur = drawer.value.currency;
  const method = drawer.value.paymentMethod === "cod" ? "Cash on delivery" : drawer.value.paymentMethod === "prepaid" ? "Prepaid" : "Unknown";
  return (
    <Section title="Payment">
      <div className="space-y-1.5 rounded-lg border border-border p-3">
        <Row label="Method" value={method} />
        <Row label="Status" value={STATUS_NAME(drawer.value.paymentStatus)} />
        {detail?.payment.codAmountMinor != null && <Row label="To collect on delivery" value={formatMoney(detail.payment.codAmountMinor, cur)} />}
        {detail && (
          <>
            <div className="my-1 border-t border-border" />
            <Row label="Subtotal" value={formatMoney(detail.subtotalMinor, cur)} />
            <Row label="Tax" value={formatMoney(detail.taxMinor, cur)} />
            <Row label="Shipping" value={formatMoney(detail.shippingMinor, cur)} />
            {detail.discountMinor > 0 && <Row label="Discount" value={`- ${formatMoney(detail.discountMinor, cur)}`} />}
          </>
        )}
        <div className="my-1 border-t border-border" />
        <Row label="Total" value={formatMoney(drawer.value.totalMinor, cur)} strong />
      </div>
    </Section>
  );
}

function Shipment({ detail, drawer }: { detail: OrderDetail | undefined; drawer: OrderDrawerData }) {
  const f = drawer.fulfillment;
  return (
    <Section title="Fulfillment and shipment">
      <div className="space-y-1.5 rounded-lg border border-border p-3">
        <Row label="Warehouse" value={f.warehouse ?? "Not assigned"} />
        <Row label="Fulfillment" value={f.status ? STATUS_NAME(f.status) : "Not started"} />
        {f.picking && <Row label="Picking" value={STATUS_NAME(f.picking)} />}
        <Row label="Carrier" value={detail?.tracking.carrier ?? "—"} />
        <Row label="Tracking number" value={<span className="font-mono">{detail?.tracking.number ?? "—"}</span>} />
        {detail?.dispatchedAt && <Row label="Dispatched" value={formatDateTime(detail.dispatchedAt)} />}
        {detail?.deliveredAt && <Row label="Delivered" value={formatDateTime(detail.deliveredAt)} />}
        {detail?.cancelledAt && <Row label="Cancelled" value={`${formatDateTime(detail.cancelledAt)}${detail.cancelReason ? ` - ${detail.cancelReason}` : ""}`} />}
        {drawer.marketplaceStatus && <Row label="Marketplace status" value={drawer.marketplaceStatus} />}
      </div>
    </Section>
  );
}

function Timeline({ entries, fallback }: { entries: OrderTimelineEntry[] | undefined; fallback: OrderDrawerData["activity"] }) {
  const items = entries
    ? entries.map((e) => ({
        key: String(e.id),
        title: STATUS_NAME(e.toStatus),
        note: e.applied ? e.note : `${e.marketplaceStatus ?? "Marketplace report"} was reported but not applied (out of order)`,
        at: e.createdAt,
      }))
    : fallback.map((a, i) => ({ key: String(i), title: a.text, note: null, at: a.at }));
  return (
    <Section title="Order timeline">
      {items.length === 0 ? (
        <p className="text-muted-foreground">No history yet.</p>
      ) : (
        <ol className="space-y-3 border-l border-border pl-3">
          {items.map((e) => (
            <li key={e.key} className="space-y-0.5">
              <p className="font-semibold text-foreground">{e.title}</p>
              {e.note && <p className="text-[11px] text-muted-foreground">{e.note}</p>}
              <p className="font-mono text-[10px] text-muted-foreground">{formatDateTime(e.at)}</p>
            </li>
          ))}
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
    <ContextDrawer
      open={orderId !== null}
      onClose={onClose}
      title={d ? `Order ${d.number}` : "Order"}
      description={d ? `${d.channel.name} · ${formatMoney(d.value.totalMinor, d.value.currency)} · placed ${formatDateTime(d.placedAt)}` : undefined}
      badge={d ? <OrderStatusPill status={d.status} label={STATUS_NAME(d.status)} /> : undefined}
      footer={d && orderId ? <OrderActions orderId={orderId} orderNumber={d.number} /> : undefined}
    >
      {drawer.isLoading && (
        <div role="status" aria-label="Loading order" className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {drawer.isError && (
        <div role="alert" className="space-y-2 text-xs">
          <p className="text-muted-foreground">This order could not be loaded. {errorMessage(drawer.error)}</p>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void drawer.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {d && (
        <div className="space-y-6 text-xs">
          <SlaCard sla={d.sla} />
          <Buyer detail={detail.data} fallback={d.customer} />
          <Items detail={detail.data} drawer={d} />
          <Payment detail={detail.data} drawer={d} />
          <Shipment detail={detail.data} drawer={d} />
          <Timeline entries={timeline.data} fallback={d.activity} />
        </div>
      )}
    </ContextDrawer>
  );
}
