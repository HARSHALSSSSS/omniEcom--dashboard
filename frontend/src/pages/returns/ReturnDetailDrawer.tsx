import React from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

export interface DrawerReturnData {
  id: string;
  orderId: string;
  productName: string;
  sku: string;
  marketplace: string;
  returnReason: string;
  quantity: number;
  returnStatus: string;
  receivedDate?: string;
  inspection?: string;
  refund?: string;
  inventoryDisposition?: string;
  customerName?: string;
  customerEmail?: string;
}

interface ReturnDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  returnData: DrawerReturnData | null;
  onStartInspection?: (returnId: string) => void;
  onViewOrder?: (orderId: string) => void;
}

export const ReturnDetailDrawer: React.FC<ReturnDetailDrawerProps> = ({
  isOpen,
  onClose,
  returnData,
  onStartInspection,
  onViewOrder,
}) => {
  if (!isOpen || !returnData) return null;

  const customerName = returnData.customerName || "Emma Wilson";
  const customerEmail = returnData.customerEmail || "emma.w@example.com";
  const receivedDisplay = returnData.receivedDate && returnData.receivedDate !== "—"
    ? `${returnData.receivedDate} 2026`
    : "07 Oct 2026";

  const timelineEvents = [
    {
      title: "Requested",
      time: "05 Oct 2026 · 09:14",
      status: `Complete · Customer via ${returnData.marketplace}`,
      statusColor: "text-[#16A34A]",
      details: `${returnData.returnReason} · ${returnData.quantity} × ${returnData.sku}`,
      isDone: true,
    },
    {
      title: "Approved",
      time: "05 Oct 2026 · 10:02",
      status: "Complete · Abhishek",
      statusColor: "text-[#16A34A]",
      details: "Return accepted for receipt",
      isDone: true,
    },
    {
      title: "Received",
      time: "07 Oct 2026 · 14:20",
      status: "Complete · Abhishek",
      statusColor: "text-[#16A34A]",
      details: `${returnData.quantity} of ${returnData.quantity} expected units received`,
      isDone: true,
    },
    {
      title: "Inspection",
      time: "Pending · No timestamp yet",
      status: "Pending · Unassigned",
      statusColor: "text-[#D97706]",
      details: "Verify product condition",
      isDone: false,
    },
    {
      title: "Refund",
      time: "Pending · No timestamp yet",
      status: `Pending · ${returnData.marketplace}`,
      statusColor: "text-[#D97706]",
      details: "Awaiting inspection decision",
      isDone: false,
    },
    {
      title: "Disposition",
      time: "Pending · No timestamp yet",
      status: "Pending · Operator decision",
      statusColor: "text-[#D97706]",
      details: "No stock movement confirmed",
      isDone: false,
    },
    {
      title: "Closed",
      time: "Pending · No timestamp yet",
      status: "Pending · System",
      statusColor: "text-[#D97706]",
      details: "Requires refund and disposition resolution",
      isDone: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
      />

      {/* Drawer Container (536px width matching Figma spec) */}
      <aside
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-white border-l border-[#EAEAEA] shadow-2xl transition-transform duration-300 ease-out animate-in slide-in-from-right font-['Inter',sans-serif] text-[#0A0A0A]",
          "w-full sm:w-[536px] max-w-[536px]"
        )}
      >
        {/* Drawer Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 1. Drawer Heading */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold leading-[26px] text-black">
                Return {returnData.id}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#666666] hover:bg-neutral-100 hover:text-black transition-colors"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4 stroke-[1.5]" />
              </button>
            </div>
            <p className="text-[11px] leading-[16px] text-[#666666]">
              {returnData.orderId} · {returnData.marketplace} · {customerName}
            </p>
          </div>

          {/* 2. Return Summary Box */}
          <div className="rounded-lg bg-[#F5F5F5] p-3 flex flex-col gap-1">
            <div className="text-[13px] font-semibold leading-[19px] text-black">
              {returnData.productName} · {returnData.sku}
            </div>
            <div className="text-[12px] leading-[17px] text-[#666666]">
              Quantity {returnData.quantity} · {returnData.returnReason} · Received {receivedDisplay}
            </div>
          </div>

          {/* 3. Return Details Heading & Fields */}
          <div className="space-y-1 pt-1">
            <h3 className="text-[14px] font-semibold leading-[20px] text-black pb-1">
              Return Details
            </h3>

            <div className="divide-y divide-[#EAEAEA]">
              <div className="flex items-center py-2 text-[12px]">
                <span className="w-[130px] shrink-0 text-[#666666]">Order ID</span>
                <span className="text-black">{returnData.orderId}</span>
              </div>

              <div className="flex items-center py-2 text-[12px]">
                <span className="w-[130px] shrink-0 text-[#666666]">Marketplace</span>
                <span className="text-black">{returnData.marketplace}</span>
              </div>

              <div className="flex items-center py-2 text-[12px]">
                <span className="w-[130px] shrink-0 text-[#666666]">Customer</span>
                <span className="text-black">{customerName} · {customerEmail}</span>
              </div>

              <div className="flex items-center py-2 text-[12px]">
                <span className="w-[130px] shrink-0 text-[#666666]">Product</span>
                <span className="text-black">{returnData.productName}</span>
              </div>

              <div className="flex items-center py-2 text-[12px]">
                <span className="w-[130px] shrink-0 text-[#666666]">SKU</span>
                <span className="text-black">{returnData.sku}</span>
              </div>

              <div className="flex items-center py-2 text-[12px]">
                <span className="w-[130px] shrink-0 text-[#666666]">Quantity</span>
                <span className="text-black">
                  {returnData.quantity} expected · {returnData.quantity} received
                </span>
              </div>

              <div className="flex items-center py-2 text-[12px]">
                <span className="w-[130px] shrink-0 text-[#666666]">Return reason</span>
                <span className="text-black">{returnData.returnReason}</span>
              </div>
            </div>
          </div>

          {/* 4. Dates (3-Column Layout) */}
          <div className="grid grid-cols-3 gap-5 py-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] leading-[16px] text-[#666666]">Requested</span>
              <span className="text-[12px] leading-[17px] text-black">05 Oct 2026</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] leading-[16px] text-[#666666]">Approved</span>
              <span className="text-[12px] leading-[17px] text-black">05 Oct 2026</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] leading-[16px] text-[#666666]">Received</span>
              <span className="text-[12px] leading-[17px] text-black">{receivedDisplay}</span>
            </div>
          </div>

          {/* 5. Current State Box */}
          <div className="rounded-lg bg-[#FFFBF5] p-3 flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold leading-[19px] text-black">
              Current State
            </span>
            <span className="text-[12px] leading-[17px] text-[#D97706]">
              Inspection {returnData.inspection || "Pending"} · Refund {returnData.refund || "Pending"}
            </span>
            <span className="text-[12px] leading-[17px] text-black">
              Disposition {returnData.inventoryDisposition || "Pending"} · No decision confirmed
            </span>
          </div>

          {/* 6. Event Timeline */}
          <div className="space-y-2 pt-1">
            <h3 className="text-[14px] font-semibold leading-[20px] text-black pb-1">
              Event timeline
            </h3>

            <div className="flex flex-col">
              {timelineEvents.map((evt, idx) => {
                const isLast = idx === timelineEvents.length - 1;
                return (
                  <div key={evt.title} className="flex items-start gap-3 pb-3.5">
                    {/* Marker & Connector line */}
                    <div className="flex flex-col items-center shrink-0 w-3 pt-1">
                      {evt.isDone ? (
                        <div className="h-[9px] w-[9px] rounded-full bg-[#16A34A] border border-[#16A34A]" />
                      ) : (
                        <div className="h-[9px] w-[9px] rounded-full bg-white border border-[#BDBDBD]" />
                      )}
                      {!isLast && <div className="w-[1px] h-12 bg-[#EAEAEA] mt-1" />}
                    </div>

                    {/* Event Info */}
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-black leading-tight">
                          {evt.title}
                        </span>
                        <span className="text-[10px] text-[#666666]">
                          {evt.time}
                        </span>
                      </div>
                      <span className={cn("text-[11px] leading-[16px]", evt.statusColor)}>
                        {evt.status}
                      </span>
                      <span className="text-[11px] leading-[16px] text-[#666666]">
                        {evt.details}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 7. Drawer Actions (Bottom) */}
        <div className="border-t border-[#EAEAEA] p-4 bg-white flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStartInspection ? onStartInspection(returnData.id) : alert(`Starting inspection for ${returnData.id}...`)}
            className="h-[34px] px-3.5 bg-[#111111] border border-[#EAEAEA] rounded-lg text-[12px] font-semibold text-white hover:bg-black transition-colors"
          >
            Start inspection
          </button>
          <button
            type="button"
            onClick={() => onViewOrder ? onViewOrder(returnData.orderId) : alert(`Viewing order ${returnData.orderId}...`)}
            className="h-[34px] px-3.5 bg-white border border-[#EAEAEA] rounded-lg text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors"
          >
            View Order
          </button>
        </div>
      </aside>
    </div>
  );
};
