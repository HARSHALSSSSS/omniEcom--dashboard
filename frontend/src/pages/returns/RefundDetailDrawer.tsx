import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { useRefundView, useReturnNextActions, useRunReturnAction } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";
import type { NextAction, RefundStatus, RefundView } from "@/types/returns";
import { CloseButton, DrawerShell, DRAWER_BTN_LIGHT, KeyValue } from "@/components/returns/design";
import { ReturnActionForm } from "@/components/returns/ReturnActionForm";
import { REFUND_DESIGN_LABELS } from "@/components/returns/returnParams";
import { NO_REFUND_REASON, NO_WRITE_REASON, fmtStamp, formatMoney, writeErrorMessage } from "@/components/returns/returnFormat";

interface RefundDetailDrawerProps {
  /** the return whose refund to show; the drawer is closed when this is null */
  returnId: string | null;
  onClose: () => void;
  onViewInspection: (returnId: string) => void;
}

const STATUS_COLOR: Record<RefundStatus, string> = {
  ready: "text-[#16A34A]",
  processed: "text-[#16A34A]",
  pending: "text-[#D97706]",
  processing: "text-[#2563EB]",
  failed: "text-[#DC2626]",
  not_applicable: "text-[#666666]",
};

function subtitleOf(v: RefundView): string {
  switch (v.refund.status) {
    case "pending":
      return v.actionable ? "Pending · Awaiting operator confirmation" : "Pending · Awaiting inspection decision";
    case "ready":
      return "Ready for Refund · Inspection completed";
    case "processing":
      return `Processing · Waiting for ${v.channel.name}`;
    case "processed":
      return "Refunded · Payment returned to customer";
    case "failed":
      return "Refund Failed · Connector or recording error";
    default:
      return "Not Applicable · No refund due";
  }
}

/** the dot and text colours of one step of the refund timeline */
function stepTone(step: RefundView["timeline"][number]["step"], status: RefundStatus, complete: boolean): { dot: string; text: string } {
  if (step === "processing" && status === "failed") return { dot: "bg-[#DC2626]", text: "text-[#DC2626]" };
  if (step === "completed" && status === "failed") return { dot: "bg-[#DC2626]", text: "text-[#DC2626]" };
  if (step === "processing" && status === "processing") return { dot: "bg-[#2563EB] animate-pulse", text: "text-[#2563EB]" };
  if (complete) return { dot: "bg-[#16A34A]", text: "text-[#16A34A]" };
  return { dot: "border border-[#BDBDBD] bg-white", text: "text-[#D97706]" };
}

const STEP_TITLE = { requested: "Requested", approved: "Approved", processing: "Processing", completed: "Completed" } as const;

function Timeline({ view }: { view: RefundView }) {
  const status = view.refund.status;
  return (
    <div className="space-y-4">
      <h3 className="text-[14px] font-semibold text-black">Refund Status</h3>
      <ol className="space-y-0 pl-1">
        {view.timeline.map((s, i) => {
          const complete = s.status === "complete";
          const tone = stepTone(s.step, status, complete);
          const last = i === view.timeline.length - 1;
          const who = s.actor?.name ?? null;
          const failedHere = (s.step === "processing" || s.step === "completed") && status === "failed";
          const detail = failedHere && s.step === "completed" ? "Unresolved · Action required to retry or record the refund" : s.note;
          return (
            <li key={s.step} className={cn("relative flex items-start gap-3.5", !last && "pb-6")}>
              {!last && <div className="absolute bottom-0 left-[4.5px] top-2.5 w-[1px] bg-[#EAEAEA]" />}
              <div className={cn("relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-4 ring-white", tone.dot)} />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-black">
                    {STEP_TITLE[s.step]}
                    <span className="sr-only">{complete ? " (done)" : " (pending)"}</span>
                  </span>
                  <span className="text-[11px] text-[#666666]">{complete && s.at ? fmtStamp(s.at) : "Pending · No timestamp yet"}</span>
                </div>
                <div className={cn("text-[11px]", tone.text)}>
                  {complete ? "Complete" : failedHere ? "Failed" : "Pending"}
                  {who ? ` · ${who}` : ""}
                  {detail ? ` · ${detail}` : ""}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** one return's refund: amount and status as tracked, the timeline, and (for a person who may) issuing it or retrying a failed one */
export function RefundDetailDrawer({ returnId, onClose, onViewInspection }: RefundDetailDrawerProps) {
  if (!returnId) return null;
  return <Body returnId={returnId} onClose={onClose} onViewInspection={onViewInspection} />;
}

function Body({ returnId, onClose, onViewInspection }: { returnId: string; onClose: () => void; onViewInspection: (id: string) => void }) {
  const refund = useRefundView(returnId);
  const next = useReturnNextActions(returnId);
  const run = useRunReturnAction();
  const permissions = useWorkspaceStore((s) => s.permissions);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const v = refund.data;

  const step: NextAction | undefined = next.data?.actions.find((a) => a.key === "refund");
  const isFailed = v?.refund.status === "failed";
  const isRetry = Boolean(step?.href.endsWith("/refund/retry"));
  const mayRefund = permissions.includes("returns:refund");
  const reason = !step || step.done ? null : !mayRefund ? (permissions.includes("returns:write") ? NO_REFUND_REASON : NO_WRITE_REASON) : step.enabled ? null : step.disabledReason;
  const showAction = Boolean(v && step && !step.done && (isRetry ? isFailed : v.refund.status !== "not_applicable"));
  const amount = v && v.refund.amountMinor !== null ? formatMoney(v.refund.amountMinor, v.refund.currency) : null;
  const actionLabel = isRetry ? (v?.refund.source === "connector" ? "Retry Refund via Connector" : "Retry Refund") : amount ? `Issue Refund (${amount})` : "Issue Refund";

  const submit = (body: Record<string, unknown>) => {
    if (!step || !v) return;
    const path = step.href.split(`/returns/${returnId}/`)[1] ?? "refund";
    run.mutate(
      { id: returnId, action: path, body },
      {
        onSuccess: () => {
          setOpen(false);
          setFormError(null);
          toast({ title: `${v.number} updated`, description: step.label, variant: "success" });
        },
        onError: (e) => setFormError(writeErrorMessage(e)),
      },
    );
  };

  const footer = (
    <div className="flex flex-wrap items-center gap-2 border-t border-[#EAEAEA] bg-white p-4">
      <button type="button" onClick={() => onViewInspection(returnId)} className={DRAWER_BTN_LIGHT}>
        View return inspection
      </button>
      {showAction && (
        <button
          type="button"
          disabled={reason !== null || run.isPending}
          title={reason ?? undefined}
          aria-expanded={open}
          onClick={() => {
            setFormError(null);
            setOpen((o) => !o);
          }}
          className={cn("h-[34px] rounded-lg px-3.5 text-[12px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50", isRetry ? "bg-[#DC2626] hover:bg-[#B91C1C]" : "bg-[#111111] hover:bg-black")}
        >
          {actionLabel}
        </button>
      )}
      <button type="button" onClick={onClose} className="ml-auto h-[34px] cursor-pointer px-3.5 text-[12px] text-[#666666] transition-colors hover:text-black">
        Close
      </button>
    </div>
  );

  return (
    <DrawerShell label={v ? `Refund ${v.number}` : "Refund"} onClose={onClose} footer={footer}>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-[18px] font-semibold leading-tight text-black">{v ? `Refund — ${v.number}` : "Refund"}</h2>
            {v && <p className="text-[12px] text-[#666666]">{subtitleOf(v)}</p>}
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {refund.isLoading && (
          <div role="status" aria-label="Loading refund" className="space-y-3">
            <div className="h-40 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />
            <div className="h-40 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />
          </div>
        )}
        {refund.isError && (
          <div role="alert" className="space-y-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-[12px]">
            <p className="text-[#991B1B]">The refund could not be loaded. {errorMessage(refund.error)}</p>
            <button type="button" className={DRAWER_BTN_LIGHT} onClick={() => void refund.refetch()}>
              Retry
            </button>
          </div>
        )}

        {v && (
          <>
            <div className="divide-y divide-[#EAEAEA] border-y border-[#EAEAEA]">
              <KeyValue label="Order">{v.orderNumber ?? v.orderId}</KeyValue>
              <KeyValue label="Marketplace">{v.channel.name}</KeyValue>
              <KeyValue label="Return">{v.number}</KeyValue>
              <KeyValue label="Product">
                {v.product.title ?? "—"}
                {v.product.sku ? ` · ${v.product.sku}` : ""}
              </KeyValue>
              <KeyValue label="Quantity">{v.quantity}</KeyValue>
              <KeyValue label="Refund amount">
                {amount ?? "—"}
                {amount ? ` ${v.refund.currency ?? ""} · From ${v.refund.amountFrom === "connector" ? "connector" : v.refund.amountFrom === "manual" ? "manual entry" : "the order"}`.trimEnd() : ""}
              </KeyValue>
              <KeyValue label="Refund status">
                <span className={STATUS_COLOR[v.refund.status]}>{REFUND_DESIGN_LABELS[v.refund.status]}</span>
              </KeyValue>
              {v.refund.reference && <KeyValue label="Reference">{v.refund.reference}</KeyValue>}
              <KeyValue label="Last update">{fmtStamp(v.refund.lastUpdateAt)}</KeyValue>
            </div>

            {isFailed && (
              <div role="alert" className="space-y-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#DC2626]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{v.refund.source === "connector" ? "Connector Failure" : "Refund Failed"}</span>
                </div>
                <p className="text-[12px] leading-relaxed text-[#991B1B]">{v.refund.error ?? "The refund failed. Retry it, or record it manually."}</p>
              </div>
            )}

            <Timeline view={v} />

            <div className="pt-2 text-[12px] leading-relaxed text-[#666666]">{v.note}</div>

            {open && step && (
              <ReturnActionForm kind="refund" action={step} busy={run.isPending} error={formError} submitLabel={isRetry ? "Retry refund" : "Issue refund"} onSubmit={submit} onClose={() => setOpen(false)} />
            )}
            {reason && showAction && <p className="text-[11px] text-[#666666]">{reason}</p>}
          </>
        )}
      </div>
    </DrawerShell>
  );
}
