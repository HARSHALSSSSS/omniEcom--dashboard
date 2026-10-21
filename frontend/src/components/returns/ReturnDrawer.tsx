import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useReturnDetail, useReturnOrder } from "@/hooks/useReturns";
import { formatDateTime } from "@/utils/format";
import type { ReturnDetail, ReturnOrder } from "@/types/returns";
import { ReturnActions } from "./ReturnActions";
import { formatMoney, humanize } from "./returnFormat";
import { INSPECTION_LABELS, REFUND_LABELS } from "./returnParams";
import { StagePill } from "./returnUi";

const STEP_TITLE: Record<ReturnDetail["timeline"][number]["step"], string> = {
  requested: "Requested",
  approved: "Approved",
  received: "Goods received",
  inspection: "Inspection",
  refund: "Refund",
  disposition: "Disposition",
  closed: "Closed",
};

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
      <span className={`text-right ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Items({ order, product }: { order: ReturnOrder | undefined; product: ReturnDetail["product"] }) {
  return (
    <Section title="Returned items">
      {product.title && (
        <p className="text-foreground">
          {product.title}
          {product.itemCount > 1 ? ` and ${product.itemCount - 1} more` : ""}
        </p>
      )}
      {!order ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        order.items.map((it) => (
          <div key={it.id} className="space-y-1 rounded-lg border border-border p-3">
            <p className="font-mono text-[11px] font-semibold text-foreground">{it.sku ?? "No SKU"}</p>
            <p className="text-[11px] text-muted-foreground">
              Requested {it.quantity} · received {it.receivedQuantity} · decided {it.dispositionedQuantity}
              {it.restockedQuantity > 0 ? ` · restocked ${it.restockedQuantity}` : ""}
            </p>
            {(it.condition || it.disposition) && (
              <p className="text-[11px] text-muted-foreground">
                {it.condition ? `Condition: ${humanize(it.condition)}` : ""}
                {it.condition && it.disposition ? " · " : ""}
                {it.disposition ? `Disposition: ${humanize(it.disposition)}` : ""}
              </p>
            )}
          </div>
        ))
      )}
    </Section>
  );
}

function State({ d, order }: { d: ReturnDetail; order: ReturnOrder | undefined }) {
  const { inspection, refund, disposition } = d.currentState;
  const pickup = order?.pickup;
  return (
    <Section title="Where it stands">
      <div className="space-y-2 rounded-lg border border-border p-3">
        <Row label="Inspection" value={INSPECTION_LABELS[inspection.status]} />
        {inspection.inspector?.name && <Row label="Inspector" value={inspection.inspector.name} />}
        <Row label="Disposition" value={humanize(disposition)} />
        <Row label="Refund" value={REFUND_LABELS[refund.status]} strong />
        <Row label="Refund amount" value={refund.amountMinor === null ? "—" : formatMoney(refund.amountMinor, refund.currency)} strong />
        {refund.source && <Row label="Refund handled by" value={refund.source === "connector" ? "The marketplace" : "Recorded manually"} />}
        {refund.error && (
          <p role="alert" className="text-rose-700">
            Refund failed: {refund.error}
          </p>
        )}
        {order?.refund.reference && <Row label="Reference" value={order.refund.reference} />}
        {pickup && pickup.status !== "not_required" && (
          <>
            <Row label="Reverse pickup" value={humanize(pickup.status)} />
            {pickup.awb && <Row label="AWB" value={<span className="font-mono">{pickup.awb}</span>} />}
            {pickup.scheduledAt && <Row label="Pickup scheduled" value={formatDateTime(pickup.scheduledAt)} />}
          </>
        )}
      </div>
      {d.receipt.match === "quantity_mismatch" && d.receipt.mismatch && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
          Quantity mismatch: {d.receipt.mismatch.expected} expected, {d.receipt.mismatch.received} received.
        </p>
      )}
    </Section>
  );
}

function Timeline({ steps }: { steps: ReturnDetail["timeline"] }) {
  return (
    <Section title="Return timeline">
      <ol className="space-y-3 border-l border-border pl-3">
        {steps.map((s) => (
          <li key={s.step} className="space-y-0.5">
            <p className={s.status === "complete" ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}>
              {STEP_TITLE[s.step]}
              <span className="sr-only">{s.status === "complete" ? " (done)" : " (pending)"}</span>
            </p>
            {s.note && <p className="text-[11px] text-muted-foreground">{s.note}</p>}
            {s.status === "complete" && (
              <p className="font-mono text-[10px] text-muted-foreground">
                {s.at ? formatDateTime(s.at) : ""}
                {s.actor?.name ? ` · ${s.actor.name}` : ""}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

interface ReturnDrawerProps {
  returnId: string | null;
  onClose: () => void;
}

/** one return: customer and reason, items, inspection and refund state, timeline and the next steps (detail + return + next-actions) */
export function ReturnDrawer({ returnId, onClose }: ReturnDrawerProps) {
  const detail = useReturnDetail(returnId);
  const order = useReturnOrder(returnId);
  const d = detail.data;

  return (
    <ContextDrawer
      open={returnId !== null}
      onClose={onClose}
      className="w-[460px] sm:max-w-[460px]"
      title={d ? `Return ${d.header.number}` : "Return"}
      description={d ? `Order ${d.header.orderNumber ?? "—"} · ${d.header.channel.name}` : undefined}
      badge={order.data ? <StagePill stage={order.data.stage} label={order.data.stageLabel} /> : undefined}
    >
      {detail.isLoading && (
        <div role="status" aria-label="Loading return" className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {detail.isError && (
        <div role="alert" className="space-y-2 text-xs">
          <p className="text-muted-foreground">This return could not be loaded. {errorMessage(detail.error)}</p>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {d && returnId && (
        <div className="space-y-6 text-xs">
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
            <Row label="Customer" value={d.details.customer?.name ?? "Not provided by the channel"} strong />
            {d.details.customer?.email && <Row label="Email" value={d.details.customer.email} />}
            <Row label="Reason" value={d.details.reason.label} strong />
            {d.details.reason.text && <p className="text-muted-foreground">{d.details.reason.text}</p>}
            <Row label="Requested" value={d.details.dates.requestedAt ? formatDateTime(d.details.dates.requestedAt) : "—"} />
            <Row label="Order" value={<Link to={`${ROUTES.ORDERS}?drawer=order:${d.header.orderId}`} className="font-mono text-primary hover:underline">{d.header.orderNumber ?? d.header.orderId}</Link>} />
          </div>
          <Items order={order.data} product={d.product} />
          <State d={d} order={order.data} />
          <ReturnActions returnId={returnId} returnNumber={d.header.number} status={d.header.status} />
          <Timeline steps={d.timeline} />
        </div>
      )}
    </ContextDrawer>
  );
}
