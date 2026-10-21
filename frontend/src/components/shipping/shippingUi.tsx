import { cn } from "@/utils/cn";
import type { ShipmentStatus } from "@/types/shipping";
import { STATUS_LABELS } from "./shippingParams";

const TONE: Record<ShipmentStatus, string> = {
  created: "bg-slate-100 text-slate-700",
  label_ready: "bg-slate-100 text-slate-700",
  manifested: "bg-blue-50 text-blue-700",
  dispatched: "bg-blue-50 text-blue-700",
  in_transit: "bg-blue-50 text-blue-700",
  out_for_delivery: "bg-indigo-50 text-indigo-700",
  delivered: "bg-emerald-50 text-emerald-700",
  delivery_failed: "bg-amber-50 text-amber-700",
  rto_initiated: "bg-rose-50 text-rose-700",
  rto_in_transit: "bg-rose-50 text-rose-700",
  rto_delivered: "bg-rose-50 text-rose-700",
  cancelled: "bg-neutral-100 text-neutral-600",
};

export function ShipmentStatusPill({ status, label }: { status: ShipmentStatus; label?: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[status])}>{label ?? STATUS_LABELS[status]}</span>;
}
