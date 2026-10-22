import { useState } from "react";
import { Link } from "react-router-dom";
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
 * The pinned bottom of the order drawer: the steps the API allows from the order's status (GET /orders/{id}/next-actions), then
 * "Open fulfillment" and "Cancel order". A step the warehouse flow owns is shown disabled with the reason and a link to
 * Fulfillment instead of a manual transition.
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
      <div role="alert" className="w-full space-y-2 rounded-lg border border-[#EAEAEA] p-3 text-[12px]">
        <p className="text-[#666666]">Actions could not be loaded. {errorMessage(error)}</p>
        <button type="button" onClick={() => void refetch()} className="h-[28px] px-3 rounded-lg border border-[#EAEAEA] text-[12px] font-medium text-[#000000] hover:bg-neutral-50 cursor-pointer">
          Retry
        </button>
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

  const cancelAction = data.actions.find((a) => a.kind === "cancel");
  const steps = data.actions.filter((a) => a.kind !== "fulfillment" && a.kind !== "cancel");
  const fulfillmentLink = data.actions.find((a) => a.kind === "fulfillment");
  const showsTracking = steps.some((a) => a.kind === "transition" && statusOf(a) === "dispatched" && a.enabled && canWrite);
  const cancelAllowed = Boolean(cancelAction?.enabled) && canWrite;
  const cancelReason = cancelAction && !cancelAllowed ? (!canWrite ? NO_WRITE_REASON : reasonText(cancelAction.disabledReason, cancelAction.message)) : undefined;
  const fulfillmentLabel = fulfillmentLink?.label ?? "Open fulfillment";

  return (
    <section aria-label="Order actions" className="w-full max-h-[45vh] overflow-y-auto flex flex-col gap-3">
      {data.managedByFulfillment && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-[12px] text-indigo-950">
          <p className="font-semibold">Managed by Fulfillment{data.fulfillment ? ` (${data.fulfillment.number})` : ""}</p>
          <p className="mt-0.5 text-indigo-900">This order follows the warehouse work (pick, pack, ship), so its status cannot be moved by hand here.</p>
        </div>
      )}

      {showsTracking && (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
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

      {steps.length === 0 && !cancelAction && <p className="text-[12px] text-[#666666]">No further steps: this order is {data.status.replace(/_/g, " ")}.</p>}
      {steps.length > 0 && (
        <ul className="space-y-2 m-0 p-0 list-none">
          {steps.map((a) => {
            const allowed = a.enabled && canWrite;
            const reason = !canWrite ? NO_WRITE_REASON : reasonText(a.disabledReason, a.message);
            const primary = a.key === data.primaryAction;
            return (
              <li key={a.key} className="space-y-1">
                <button
                  type="button"
                  className={`w-full flex flex-row justify-center items-center h-[38px] px-3 rounded-lg border text-[13px] font-medium leading-[145%] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                    primary ? "bg-[#000000] border-[#000000] text-white hover:bg-neutral-800" : "bg-white border-[#EAEAEA] text-[#000000] hover:bg-neutral-50"
                  }`}
                  disabled={!allowed || busy}
                  title={allowed ? undefined : reason}
                  onClick={() => run(a)}
                >
                  {a.label}
                </button>
                {!allowed && reason && <p className="text-[11px] text-[#666666]">{reason}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {(fulfillmentLink || data.managedByFulfillment || cancelAction) && (
        <div className="w-full flex flex-row items-center gap-2.5 min-h-[42px] pt-4 border-t border-[#EAEAEA]">
          {(fulfillmentLink || data.managedByFulfillment) && (
            <Link
              to={ROUTES.FULFILLMENT}
              className="flex-1 flex flex-row justify-center items-center h-[38px] px-3 bg-[#000000] border border-[#000000] rounded-lg hover:bg-neutral-800 transition-colors text-[13px] font-medium leading-[145%] text-[#FFFFFF]"
            >
              {fulfillmentLabel}
            </Link>
          )}
          {cancelAction && (
            <button
              type="button"
              disabled={!cancelAllowed || busy}
              title={cancelAllowed ? undefined : cancelReason}
              onClick={() => run(cancelAction)}
              className="flex-1 flex flex-row justify-center items-center h-[38px] px-3 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors text-[13px] font-medium leading-[145%] text-[#DC2626] text-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelAction.label}
            </button>
          )}
        </div>
      )}
      {cancelReason && <p className="text-[11px] text-[#666666]">{cancelReason}</p>}

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
