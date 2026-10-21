import { cn } from "@/utils/cn";
import type { RefundStatus, ReturnStage } from "@/types/returns";
import { REFUND_LABELS } from "./returnParams";

const STAGE_TONE: Record<ReturnStage, string> = {
  requested: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-indigo-50 text-indigo-700 border-indigo-200",
  in_transit: "bg-sky-50 text-sky-700 border-sky-200",
  received: "bg-amber-50 text-amber-700 border-amber-200",
  inspecting: "bg-amber-50 text-amber-700 border-amber-200",
  resolution: "bg-purple-50 text-purple-700 border-purple-200",
  refunded: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-700 border-slate-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

const REFUND_TONE: Record<RefundStatus, string> = {
  not_applicable: "text-muted-foreground",
  pending: "text-amber-700",
  ready: "text-amber-700",
  processing: "text-sky-700",
  processed: "text-emerald-700",
  failed: "text-rose-700",
};

const PILL = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";

export function StagePill({ stage, label }: { stage: ReturnStage; label: string }) {
  return <span className={cn(PILL, STAGE_TONE[stage])}>{label}</span>;
}

export function RefundStatusText({ status }: { status: RefundStatus }) {
  return <span className={cn("text-[11px] font-semibold", REFUND_TONE[status])}>{REFUND_LABELS[status]}</span>;
}
