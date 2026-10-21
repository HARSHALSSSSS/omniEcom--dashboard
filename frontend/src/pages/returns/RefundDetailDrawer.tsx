import React from "react";
import { X, AlertCircle } from "lucide-react";
import { cn } from "@/utils/cn";

export interface RefundData {
  id: string;
  orderId: string;
  marketplace: string;
  productName: string;
  sku: string;
  quantity: number;
  refundAmount: string;
  refundStatus: "Pending" | "Ready for Refund" | "Processing" | "Refunded" | "Refund Failed" | "Not Applicable";
  returnStatus: string;
  inspectionStatus: string;
  lastUpdate: string;
  customerName?: string;
  customerEmail?: string;
  isConnectorFailure?: boolean;
  failureReason?: string;
  timeline?: {
    requestedDate?: string;
    approvedDate?: string;
    processingDate?: string;
    completedDate?: string;
  };
}

interface RefundDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: RefundData | null;
  onViewInspection?: (returnId: string) => void;
  onIssueRefund?: (returnId: string) => void;
  onRetryRefund?: (returnId: string) => void;
}

export const RefundDetailDrawer: React.FC<RefundDetailDrawerProps> = ({
  isOpen,
  onClose,
  data,
  onViewInspection,
  onIssueRefund,
  onRetryRefund,
}) => {
  if (!isOpen || !data) return null;

  const isPending = data.refundStatus === "Pending";
  const isReady = data.refundStatus === "Ready for Refund";
  const isProcessing = data.refundStatus === "Processing";
  const isRefunded = data.refundStatus === "Refunded";
  const isFailed = data.refundStatus === "Refund Failed";

  const subtitle = isPending
    ? "Pending · Awaiting inspection decision"
    : isReady
    ? "Ready for Refund · Inspection completed"
    : isProcessing
    ? "Processing · Sent to connector"
    : isRefunded
    ? "Refunded · Payment returned to customer"
    : isFailed
    ? "Refund Failed · Connector timeout"
    : "Not Applicable · Return rejected";

  const statusColor = isReady || isRefunded
    ? "text-[#16A34A]"
    : isPending
    ? "text-[#D97706]"
    : isProcessing
    ? "text-[#2563EB]"
    : isFailed
    ? "text-[#DC2626]"
    : "text-[#666666]";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-['Inter',sans-serif]">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
      />

      {/* Drawer Container (536px width matching Figma spec) */}
      <aside
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-white border-l border-[#EAEAEA] shadow-2xl transition-transform duration-300 ease-out animate-in slide-in-from-right text-[#0A0A0A]",
          "w-full sm:w-[536px] max-w-[536px]"
        )}
      >
        {/* Drawer Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-[18px] font-semibold text-black leading-tight">
                Refund — {data.id}
              </h2>
              <p className="text-[12px] text-[#666666]">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#666666] hover:bg-neutral-100 hover:text-black transition-colors cursor-pointer"
            >
              <X className="h-4 w-4 stroke-[1.5]" />
            </button>
          </div>

          {/* Key-Value Details */}
          <div className="divide-y divide-[#EAEAEA] border-y border-[#EAEAEA]">
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Order</span>
              <span className="text-black font-medium text-left flex-1">{data.orderId}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Marketplace</span>
              <span className="text-black font-medium text-left flex-1">{data.marketplace}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Return</span>
              <span className="text-black font-medium text-left flex-1">{data.id}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Product</span>
              <span className="text-black font-medium text-left flex-1">
                {data.productName} · {data.sku}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Quantity</span>
              <span className="text-black font-medium text-left flex-1">{data.quantity}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Refund amount</span>
              <span className="text-black font-medium text-left flex-1">
                {data.refundAmount} {data.refundAmount !== "—" ? "USD · From connector" : ""}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Refund status</span>
              <span className={cn("font-medium text-left flex-1", statusColor)}>
                {data.refundStatus}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[12px]">
              <span className="text-[#666666] w-36">Last update</span>
              <span className="text-black font-medium text-left flex-1">{data.lastUpdate}</span>
            </div>
          </div>

          {/* Connector Failure Notice (if failed) */}
          {(isFailed || data.isConnectorFailure) && (
            <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-[#DC2626] font-semibold text-[13px]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Connector Failure</span>
              </div>
              <p className="text-[12px] text-[#991B1B] leading-relaxed">
                {data.failureReason ||
                  "Amazon SP-API refund submission timed out (Error 504 Gateway Timeout). The connector did not receive confirmation from marketplace."}
              </p>
            </div>
          )}

          {/* Refund Status Timeline */}
          <div className="space-y-4">
            <h3 className="text-[14px] font-semibold text-black">Refund Status</h3>

            <div className="space-y-0 pl-1">
              {/* Step 1: Requested */}
              <div className="relative flex items-start gap-3.5 pb-6">
                {/* Connecting Line */}
                <div className="absolute left-[4.5px] top-2.5 bottom-0 w-[1px] bg-[#EAEAEA]" />
                {/* Dot */}
                <div className="relative z-10 mt-1 h-2.5 w-2.5 rounded-full bg-[#16A34A] ring-4 ring-white" />
                {/* Content */}
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-semibold text-black">Requested</span>
                    <span className="text-[11px] text-[#666666]">05 Oct · 09:14</span>
                  </div>
                  <div className="text-[11px] text-[#666666]">
                    Customer via {data.marketplace} · Complete
                  </div>
                </div>
              </div>

              {/* Step 2: Approved */}
              <div className="relative flex items-start gap-3.5 pb-6">
                {/* Connecting Line */}
                <div className="absolute left-[4.5px] top-2.5 bottom-0 w-[1px] bg-[#EAEAEA]" />
                {/* Dot */}
                <div
                  className={cn(
                    "relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-4 ring-white",
                    isReady || isProcessing || isRefunded
                      ? "bg-[#16A34A]"
                      : "border border-[#BDBDBD] bg-white"
                  )}
                />
                {/* Content */}
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-semibold text-black">Approved</span>
                    <span className="text-[11px] text-[#666666]">
                      {isReady || isProcessing || isRefunded ? "07 Oct · 10:02" : "Pending · No timestamp yet"}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "text-[11px]",
                      isReady || isProcessing || isRefunded
                        ? "text-[#16A34A]"
                        : "text-[#D97706]"
                    )}
                  >
                    {isReady || isProcessing || isRefunded
                      ? "Complete · Operator authorized refund"
                      : "Pending · Operator · Awaiting inspection"}
                  </div>
                </div>
              </div>

              {/* Step 3: Processing */}
              <div className="relative flex items-start gap-3.5 pb-6">
                {/* Connecting Line */}
                <div className="absolute left-[4.5px] top-2.5 bottom-0 w-[1px] bg-[#EAEAEA]" />
                {/* Dot */}
                <div
                  className={cn(
                    "relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-4 ring-white",
                    isRefunded
                      ? "bg-[#16A34A]"
                      : isProcessing
                      ? "bg-[#2563EB] animate-pulse"
                      : isFailed
                      ? "bg-[#DC2626]"
                      : "border border-[#BDBDBD] bg-white"
                  )}
                />
                {/* Content */}
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-semibold text-black">Processing</span>
                    <span className="text-[11px] text-[#666666]">
                      {isProcessing || isRefunded ? "08 Oct · 09:08" : isFailed ? "08 Oct · 09:12" : "Pending · No timestamp yet"}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "text-[11px]",
                      isRefunded
                        ? "text-[#16A34A]"
                        : isProcessing
                        ? "text-[#2563EB]"
                        : isFailed
                        ? "text-[#DC2626]"
                        : "text-[#D97706]"
                    )}
                  >
                    {isRefunded
                      ? `Complete · Processed by ${data.marketplace}`
                      : isProcessing
                      ? `In progress · ${data.marketplace} connector processing batch`
                      : isFailed
                      ? "Failed · Amazon SP-API Gateway Timeout (504)"
                      : `${data.marketplace} · Awaiting refund approval`}
                  </div>
                </div>
              </div>

              {/* Step 4: Completed */}
              <div className="relative flex items-start gap-3.5">
                {/* Dot */}
                <div
                  className={cn(
                    "relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-4 ring-white",
                    isRefunded
                      ? "bg-[#16A34A]"
                      : isFailed
                      ? "bg-[#DC2626]"
                      : "border border-[#BDBDBD] bg-white"
                  )}
                />
                {/* Content */}
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-semibold text-black">Completed</span>
                    <span className="text-[11px] text-[#666666]">
                      {isRefunded ? "05 Oct · 16:32" : "Pending · No timestamp yet"}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "text-[11px]",
                      isRefunded
                        ? "text-[#16A34A]"
                        : isFailed
                        ? "text-[#DC2626]"
                        : "text-[#D97706]"
                    )}
                  >
                    {isRefunded
                      ? "Refund processed to original payment method"
                      : isFailed
                      ? "Unresolved · Action required to retry or bypass connector"
                      : "No connector completion received"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Guidance */}
          <div className="pt-2 text-[12px] text-[#666666] leading-relaxed">
            Return approval is not refund approval. Inspect and decide before proceeding with a
            supported refund action.
          </div>
        </div>

        {/* Drawer Actions (Bottom) */}
        <div className="border-t border-[#EAEAEA] p-4 bg-white flex flex-wrap items-center gap-2">
          {/* Action to switch to inspection drawer */}
          <button
            type="button"
            onClick={() => onViewInspection && onViewInspection(data.id)}
            className="h-[34px] px-3.5 bg-white border border-[#EAEAEA] rounded-lg text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            View return inspection
          </button>

          {/* Action if ready for refund */}
          {isReady && (
            <button
              type="button"
              onClick={() => onIssueRefund && onIssueRefund(data.id)}
              className="h-[34px] px-3.5 bg-[#111111] text-white hover:bg-black rounded-lg text-[12px] font-semibold transition-colors cursor-pointer"
            >
              Issue Refund ({data.refundAmount})
            </button>
          )}

          {/* Action if failed connector */}
          {isFailed && (
            <button
              type="button"
              onClick={() => onRetryRefund && onRetryRefund(data.id)}
              className="h-[34px] px-3.5 bg-[#DC2626] text-white hover:bg-[#B91C1C] rounded-lg text-[12px] font-semibold transition-colors cursor-pointer"
            >
              Retry Refund via Connector
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="h-[34px] px-3.5 text-[12px] text-[#666666] hover:text-black transition-colors ml-auto cursor-pointer"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
};
