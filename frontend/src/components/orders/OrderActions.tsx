import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useAllocateOrder, useCancelOrder, useNextActions, useTransitionOrder } from "@/hooks/useOrders";
import { toast } from "@/hooks/useToast";
import { errorMessage } from "@/api/errors";
import { ORDER_STATUSES, type NextAction, type OrderStatus } from "@/types/orders";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { NO_WRITE_REASON, reasonText, writeErrorMessage } from "./orderFormat";

const statusOf = (a: NextAction): OrderStatus | null => {
  const s = a.body?.status;
  return ORDER_STATUSES.find((x) => x === s) ?? null;
};

/**
 * The steps the API allows from the order's status (GET /orders/{id}/next-actions). A step the warehouse flow owns is shown
 * disabled with the reason and a link to Fulfillment instead of a manual transition.
 */
export function OrderActions({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const canWrite = useCan("orders:write");
  const { data, isLoading, isError, error, refetch } = useNextActions(orderId);
  const transition = useTransitionOrder();
  const allocate = useAllocateOrder();
  const cancel = useCancelOrder();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const busy = transition.isPending || allocate.isPending || cancel.isPending;

  if (isLoading) return <Skeleton className="h-24 w-full" role="status" aria-label="Loading actions" />;
  if (isError || !data) {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-border p-3 text-xs">
        <p className="text-muted-foreground">Actions could not be loaded. {errorMessage(error)}</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const run = (a: NextAction) => {
    if (a.kind === "transition") {
      const status = statusOf(a);
      if (!status) return;
      const tracking = status === "dispatched" && (carrier.trim() || trackingNumber.trim()) ? { carrier: carrier.trim() || undefined, number: trackingNumber.trim() || undefined } : undefined;
      transition.mutate(
        { id: orderId, status, version: data.version, tracking },
        {
          onSuccess: (res) =>
            toast(
              res.statusUpdate.status === "failed"
                ? { title: `${orderNumber} updated`, description: "The marketplace could not be told yet. The push can be retried.", variant: "warning" }
                : { title: `${orderNumber} updated`, description: a.label, variant: "success" },
            ),
          onError: (e) => toast({ title: "Order not updated", description: writeErrorMessage(e), variant: "destructive" }),
        },
      );
    } else if (a.kind === "allocate") {
      allocate.mutate(orderId, {
        onSuccess: (res) => toast({ title: `${orderNumber}: stock held`, description: `${res.reserved} of ${res.wanted} units are now held.`, variant: res.reserved < res.wanted ? "warning" : "success" }),
        onError: (e) => toast({ title: "Stock not allocated", description: writeErrorMessage(e), variant: "destructive" }),
      });
    } else if (a.kind === "cancel") {
      setCancelError(null);
      setCancelOpen(true);
    }
  };

  const steps = data.actions.filter((a) => a.kind !== "fulfillment");
  const fulfillmentLink = data.actions.find((a) => a.kind === "fulfillment");
  const showsTracking = steps.some((a) => a.kind === "transition" && statusOf(a) === "dispatched" && a.enabled && canWrite);

  return (
    <section aria-label="Order actions" className="max-h-[40vh] space-y-3 overflow-y-auto">
      {data.managedByFulfillment && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-950">
          <p className="font-semibold">Managed by Fulfillment{data.fulfillment ? ` (${data.fulfillment.number})` : ""}</p>
          <p className="mt-0.5 text-indigo-900">This order follows the warehouse work (pick, pack, ship), so its status cannot be moved by hand here.</p>
          <Link to={ROUTES.FULFILLMENT} className="mt-1 inline-block font-semibold underline">
            Open Fulfillment
          </Link>
        </div>
      )}

      {showsTracking && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">
            <span className="font-semibold">Carrier (optional)</span>
            <Input value={carrier} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCarrier(e.target.value)} maxLength={100} className="h-8 text-xs" />
          </label>
          <label className="space-y-1">
            <span className="font-semibold">Tracking number (optional)</span>
            <Input value={trackingNumber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTrackingNumber(e.target.value)} maxLength={100} className="h-8 text-xs" />
          </label>
        </div>
      )}

      {steps.length === 0 && <p className="text-xs text-muted-foreground">No further steps: this order is {data.status.replace(/_/g, " ")}.</p>}
      <ul className="space-y-2">
        {steps.map((a) => {
          const allowed = a.enabled && canWrite;
          const reason = !canWrite ? NO_WRITE_REASON : reasonText(a.disabledReason, a.message);
          return (
            <li key={a.key} className="space-y-1">
              <Button
                size="sm"
                variant={a.kind === "cancel" ? "outline" : a.key === data.primaryAction ? "default" : "outline"}
                className={`h-8 w-full text-xs ${a.kind === "cancel" ? "text-rose-700" : ""}`}
                disabled={!allowed || busy}
                title={allowed ? undefined : reason}
                onClick={() => run(a)}
              >
                {a.label}
              </Button>
              {!allowed && reason && (
                <p className="text-[11px] text-muted-foreground">{reason}</p>
              )}
            </li>
          );
        })}
      </ul>
      {fulfillmentLink && !data.managedByFulfillment && (
        <Link to={ROUTES.FULFILLMENT} className="inline-block text-xs font-semibold underline">
          {fulfillmentLink.label}
        </Link>
      )}

      <CancelOrderDialog
        open={cancelOpen}
        subject={`order ${orderNumber}`}
        busy={cancel.isPending}
        error={cancelError}
        onClose={() => setCancelOpen(false)}
        onConfirm={(input) =>
          cancel.mutate(
            { id: orderId, ...input },
            {
              onSuccess: () => {
                setCancelOpen(false);
                toast({ title: `${orderNumber} cancelled`, variant: "success" });
              },
              onError: (e) => setCancelError(writeErrorMessage(e)),
            },
          )
        }
      />
    </section>
  );
}
