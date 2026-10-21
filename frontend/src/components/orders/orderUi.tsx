import { cn } from "@/utils/cn";
import type { LedgerSla, OrderStatus } from "@/types/orders";

const STATUS_TONE: Record<OrderStatus, string> = {
  new: "bg-blue-50 text-blue-700",
  confirmed: "bg-indigo-50 text-indigo-700",
  picking: "bg-amber-50 text-amber-700",
  packed: "bg-purple-50 text-purple-700",
  ready_to_dispatch: "bg-cyan-50 text-cyan-700",
  dispatched: "bg-emerald-50 text-emerald-700",
  in_transit: "bg-emerald-50 text-emerald-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-neutral-100 text-neutral-600",
  returned: "bg-rose-50 text-rose-700",
};

/** the API's own label for the status (`statusLabel`), coloured by the status */
export function OrderStatusPill({ status, label }: { status: OrderStatus; label: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[status])}>{label}</span>;
}

const SLA_TONE: Record<LedgerSla["state"], string> = {
  safe: "text-emerald-700",
  approaching: "rounded bg-amber-100 px-1.5 py-0.5 text-amber-800",
  at_risk: "rounded bg-rose-100 px-1.5 py-0.5 text-rose-700",
  breached: "rounded bg-rose-600 px-1.5 py-0.5 text-white",
  none: "text-muted-foreground",
};

/** the dispatch deadline as the API words it ("Due in 25 min", "Overdue 2 h", "Healthy"); no deadline reads as a dash */
export function SlaChip({ sla }: { sla: LedgerSla }) {
  const text = sla.label ?? (sla.state === "none" ? "No deadline" : sla.state);
  return (
    <span data-sla={sla.state} className={cn("inline-block font-mono text-xs font-semibold", SLA_TONE[sla.state])}>
      {text}
    </span>
  );
}
