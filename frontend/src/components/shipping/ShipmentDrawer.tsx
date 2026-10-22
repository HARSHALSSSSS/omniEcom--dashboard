import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { toast } from "@/hooks/useToast";
import { useCancelShipment, useNdrAction, useNdrCases, useRefreshTracking, useShipmentRow, useTracking } from "@/hooks/useShipping";
import { formatINR } from "@/utils/format";
import type { NdrAction, NdrCase, ShipmentRow, TrackingEvent } from "@/types/shipping";
import { ShipmentStatusPill } from "./shippingUi";
import { NO_WRITE_REASON, dateOrDash, orDash, paymentText } from "./shippingFormat";
import { STATUS_LABELS } from "./shippingParams";

const CANCELLABLE = ["created", "label_ready", "manifested"];
const TRACKABLE = ["dispatched", "in_transit", "out_for_delivery", "delivery_failed", "rto_initiated", "rto_in_transit"];
const NDR_STATES = ["delivery_failed", "rto_initiated", "rto_in_transit", "rto_delivered"];

const NDR_ACTIONS: ReadonlyArray<{ id: NdrAction; label: string }> = [
  { id: "reattempt", label: "Re-attempt delivery" },
  { id: "contact_customer", label: "Contact customer" },
  { id: "rto", label: "Return to origin" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function Timeline({ events }: { events: TrackingEvent[] }) {
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <p className="font-semibold text-foreground">{STATUS_LABELS[e.status] ?? e.status}</p>
          <p className="text-[11px] text-muted-foreground">
            {[e.location, e.note].filter(Boolean).join(" · ")}
            {e.location || e.note ? " · " : ""}
            {dateOrDash(e.occurredAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function NdrCard({ ndr, canWrite, busy, onAct }: { ndr: NdrCase; canWrite: boolean; busy: boolean; onAct: (id: string, action: NdrAction) => void }) {
  const open = ndr.status === "open" || ndr.status === "action_requested";
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <p className="font-semibold text-foreground">
        Attempt {ndr.attemptNo} failed: {ndr.reasonText ?? ndr.reasonCode.replace(/_/g, " ")}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {ndr.status.replace(/_/g, " ")}
        {ndr.action ? ` · action: ${ndr.action.replace(/_/g, " ")}` : ""}
        {ndr.nextAttemptAt ? ` · next attempt ${dateOrDash(ndr.nextAttemptAt)}` : ""}
      </p>
      {open && (
        <div className="flex flex-wrap gap-2">
          {NDR_ACTIONS.map((a) => (
            <Button key={a.id} size="sm" variant="outline" className="h-7 text-xs" disabled={!canWrite || busy} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => onAct(ndr.id, a.id)}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ShipmentDrawerProps {
  shipmentId: string | null;
  canWrite: boolean;
  labelBusy: boolean;
  onClose: () => void;
  onLabel: (id: string) => void;
}

/** one shipment: the facts of the row, the tracking timeline, failed-delivery decisions and the actions the API allows */
export function ShipmentDrawer({ shipmentId, canWrite, labelBusy, onClose, onLabel }: ShipmentDrawerProps) {
  // the drawer loads its own shipment by id, so it also works from a link or after a reload
  const rowQuery = useShipmentRow(shipmentId);
  const row: ShipmentRow | undefined = rowQuery.data;
  const tracking = useTracking(shipmentId);
  const ndr = useNdrCases(shipmentId, row !== undefined && NDR_STATES.includes(row.status));
  const refresh = useRefreshTracking();
  const cancel = useCancelShipment();
  const ndrAction = useNdrAction();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const onRefresh = () => {
    if (!shipmentId) return;
    refresh.mutate(shipmentId, {
      onSuccess: (r) =>
        toast({ title: r.recorded > 0 ? "Tracking updated" : "No new tracking", description: r.recorded > 0 ? `${r.recorded} new ${r.recorded === 1 ? "event" : "events"} recorded.` : "The carrier has nothing newer.", variant: r.recorded > 0 ? "success" : "default" }),
      onError: (e) => toast({ title: "Tracking could not be refreshed", description: errorMessage(e), variant: "destructive" }),
    });
  };

  const onCancel = () => {
    if (!shipmentId) return;
    cancel.mutate(
      { id: shipmentId },
      {
        onSuccess: () => {
          setConfirmCancel(false);
          toast({ title: "Shipment cancelled", description: "The booking was cancelled with the carrier and the order is back to packed.", variant: "success" });
        },
        onError: (e) => {
          setConfirmCancel(false);
          toast({ title: "Shipment could not be cancelled", description: errorMessage(e), variant: "destructive" });
        },
      },
    );
  };

  const onNdr = (id: string, action: NdrAction) =>
    ndrAction.mutate(
      { id, action },
      {
        onSuccess: () => toast({ title: "Decision recorded", variant: "success" }),
        onError: (e) => toast({ title: "Decision could not be recorded", description: errorMessage(e), variant: "destructive" }),
      },
    );

  const off = !canWrite;
  return (
    <>
      <ContextDrawer
        open={shipmentId !== null}
        onClose={onClose}
        title={row ? (row.awb ?? row.number) : "Shipment"}
        description={row ? `${row.carrier} · order ${row.orderNumber}` : "Tracking history"}
        badge={row ? <ShipmentStatusPill status={row.status} label={row.statusLabel} /> : undefined}
        footer={
          row ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="text-xs" disabled={!row.labelAvailable || labelBusy} title={row.labelAvailable ? undefined : "This shipment has no label."} onClick={() => onLabel(row.id)}>
                Print label
              </Button>
              {TRACKABLE.includes(row.status) && (
                <Button size="sm" variant="outline" className="text-xs" disabled={off || refresh.isPending} title={off ? NO_WRITE_REASON : "Ask the carrier for the latest tracking"} onClick={onRefresh}>
                  {refresh.isPending ? "Refreshing..." : "Refresh tracking"}
                </Button>
              )}
              {CANCELLABLE.includes(row.status) && (
                <Button size="sm" variant="outline" className="text-xs text-rose-700" disabled={off || cancel.isPending} title={off ? NO_WRITE_REASON : undefined} onClick={() => setConfirmCancel(true)}>
                  Cancel shipment
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="space-y-5 text-xs">
          {rowQuery.isLoading && <Skeleton role="status" aria-label="Loading shipment" className="h-24 w-full" />}
          {rowQuery.isError && (
            <p role="alert" className="text-rose-700">
              The shipment could not be loaded. {errorMessage(rowQuery.error)}{" "}
              <button type="button" className="font-semibold underline" onClick={() => void rowQuery.refetch()}>
                Retry
              </button>
            </p>
          )}
          {row && (
            <>
              <Section title="Shipment">
                <div className="space-y-1.5 rounded-lg border border-border p-3">
                  <Row label="Carrier" value={`${row.carrier}${row.service ? ` · ${row.service}` : ""}`} />
                  <Row label="AWB" value={<span className="font-mono">{orDash(row.awb)}</span>} />
                  <Row label="Order" value={<Link to={`${ROUTES.ORDERS}?drawer=order:${row.orderId}`} className="font-mono font-semibold text-primary hover:underline">{row.orderNumber}</Link>} />
                  <Row label="Created" value={dateOrDash(row.createdAt)} />
                  <Row label="Dispatched" value={dateOrDash(row.dispatchedAt)} />
                  <Row label="Expected delivery" value={dateOrDash(row.estimatedDeliveryAt)} />
                  {row.deliveredAt && <Row label="Delivered" value={dateOrDash(row.deliveredAt)} />}
                  <Row label="Delivery attempts" value={row.attempts} />
                  {row.trackingUrl && (
                    <Row label="Carrier tracking" value={<a href={row.trackingUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">Open page</a>} />
                  )}
                </div>
              </Section>
              <Section title="Destination and payment">
                <div className="space-y-1.5 rounded-lg border border-border p-3">
                  <Row label="Customer" value={orDash(row.customerName)} />
                  <Row label="City" value={[row.destination.city, row.destination.state].filter(Boolean).join(", ") || "—"} />
                  <Row label="Pincode" value={<span className="font-mono">{orDash(row.destination.pincode)}</span>} />
                  <Row label="Payment" value={paymentText(row.paymentMethod)} />
                  {row.paymentMethod === "cod" && row.codAmountMinor !== null && <Row label="To collect" value={formatINR(row.codAmountMinor)} />}
                </div>
              </Section>
              {NDR_STATES.includes(row.status) && (
                <Section title="Failed delivery">
                  {ndr.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : ndr.isError ? (
                    <p role="alert" className="text-rose-700">
                      {errorMessage(ndr.error)}{" "}
                      <button type="button" className="font-semibold underline" onClick={() => void ndr.refetch()}>
                        Retry
                      </button>
                    </p>
                  ) : (ndr.data ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No failed delivery attempt is recorded for this shipment.</p>
                  ) : (
                    (ndr.data ?? []).map((n) => <NdrCard key={n.id} ndr={n} canWrite={canWrite} busy={ndrAction.isPending} onAct={onNdr} />)
                  )}
                </Section>
              )}
            </>
          )}
          <Section title="Tracking">
            {tracking.isLoading ? (
              <div role="status" aria-label="Loading tracking" className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : tracking.isError ? (
              <p role="alert" className="text-rose-700">
                Tracking could not be loaded. {errorMessage(tracking.error)}{" "}
                <button type="button" className="font-semibold underline" onClick={() => void tracking.refetch()}>
                  Retry
                </button>
              </p>
            ) : (tracking.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">No tracking events yet. They appear once the carrier reports the parcel.</p>
            ) : (
              <Timeline events={tracking.data ?? []} />
            )}
          </Section>
        </div>
      </ContextDrawer>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this shipment?"
        description="The booking is cancelled with the carrier, its label becomes void and the order goes back to packed so it can be booked again."
        confirmText="Cancel shipment"
        cancelText="Keep shipment"
        variant="destructive"
        loading={cancel.isPending}
        onConfirm={onCancel}
      />
    </>
  );
}
