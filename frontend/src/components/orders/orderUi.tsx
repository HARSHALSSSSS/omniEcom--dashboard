import { cn } from "@/utils/cn";
import { SLA_TEXT } from "./orderFormat";
import type { LedgerSla, OrderStatus } from "@/types/orders";

/** the dispatch deadline as the API words it ("Due in 25 min", "Overdue 2 h", "Healthy"); no deadline reads as plain text */
export function SlaChip({ sla, className }: { sla: LedgerSla; className?: string }) {
  const text = sla.label ?? (sla.state === "none" ? "No deadline" : sla.state);
  return (
    <span data-sla={sla.state} className={cn("text-[12px] font-normal leading-[140%]", SLA_TEXT[sla.state], sla.state === "breached" && "font-semibold", className)}>
      {text}
    </span>
  );
}

const PILL: Record<OrderStatus, { text: string; bar: string; bg: string }> = {
  new: { text: "text-[#2563EB]", bar: "bg-[#2563EB]", bg: "bg-blue-50/60" },
  confirmed: { text: "text-[#2563EB]", bar: "bg-[#2563EB]", bg: "bg-blue-50/60" },
  picking: { text: "text-[#2563EB]", bar: "bg-[#2563EB]", bg: "bg-blue-50/60" },
  packed: { text: "text-[#2563EB]", bar: "bg-[#2563EB]", bg: "bg-blue-50/60" },
  ready_to_dispatch: { text: "text-[#2563EB]", bar: "bg-[#2563EB]", bg: "bg-blue-50/60" },
  dispatched: { text: "text-[#16A34A]", bar: "bg-[#16A34A]", bg: "bg-green-50" },
  in_transit: { text: "text-[#16A34A]", bar: "bg-[#16A34A]", bg: "bg-green-50" },
  delivered: { text: "text-[#16A34A]", bar: "bg-[#16A34A]", bg: "bg-green-50" },
  cancelled: { text: "text-[#666666]", bar: "bg-[#BDBDBD]", bg: "bg-[#F5F5F5]" },
  returned: { text: "text-[#DC2626]", bar: "bg-[#DC2626]", bg: "bg-red-50" },
};

/** the drawer's status pill: a short bar and the status label, coloured by where the order is */
export function OrderStatusPill({ status, label }: { status: OrderStatus; label: string }) {
  const tone = PILL[status];
  return (
    <div className={cn("flex flex-row items-center gap-1.5 px-2 py-0.5 rounded", tone.bg)}>
      <div className={cn("w-[3px] h-[12px]", tone.bar)} />
      <span className={cn("text-[12px] font-semibold leading-[14px]", tone.text)}>{label}</span>
    </div>
  );
}
