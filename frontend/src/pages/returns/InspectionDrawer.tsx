import React, { useState } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/utils/cn";

export interface InspectionData {
  id: string;
  orderId?: string;
  productName: string;
  sku: string;
  expectedQuantity: number;
  receivedQuantity: number;
  missingNote?: string;
  status: "Pass" | "Fail" | "Needs Review";
  statusReason?: string;
  inspector: string;
  dateStr: string;
  conditions: {
    packagingIntact: boolean;
    productUsable: boolean;
    accessoriesPresent: boolean;
    visibleDamage: boolean;
    productMismatch: boolean;
    missingQuantity: boolean;
  };
}

interface InspectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: InspectionData | null;
  onSave?: (data: InspectionData) => void;
}

export const InspectionDrawer: React.FC<InspectionDrawerProps> = ({
  isOpen,
  onClose,
  data,
  onSave,
}) => {
  if (!isOpen || !data) return null;

  const [conditions, setConditions] = useState(data.conditions);
  const [selectedResult, setSelectedResult] = useState<"Pass" | "Fail" | "Needs Review">(data.status);

  const toggleCondition = (key: keyof typeof conditions, val: boolean) => {
    setConditions((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        ...data,
        status: selectedResult,
        conditions,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-['Inter',sans-serif]">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
      />

      {/* Drawer Container (536px width matching spec) */}
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
                Inspect {data.id}
              </h2>
              <p className="text-[12px] text-[#666666]">
                {data.status === "Needs Review" ? "Requires Review" : data.status} · {data.inspector} · {data.dateStr}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#666666] hover:bg-neutral-100 hover:text-black transition-colors"
            >
              <X className="h-4 w-4 stroke-[1.5]" />
            </button>
          </div>

          {/* Product Verification */}
          <div className="space-y-3">
            <h3 className="text-[14px] font-semibold text-black">
              Product Verification
            </h3>

            <div className="divide-y divide-[#EAEAEA] border-t border-[#EAEAEA]">
              <div className="flex items-center justify-between py-2 text-[12px]">
                <span className="text-[#666666] w-36">Product</span>
                <span className="text-black font-medium text-left flex-1">{data.productName}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-[12px]">
                <span className="text-[#666666] w-36">SKU</span>
                <span className="text-black font-medium text-left flex-1">{data.sku}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-[12px]">
                <span className="text-[#666666] w-36">Expected quantity</span>
                <span className="text-black text-left flex-1">{data.expectedQuantity}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-[12px]">
                <span className="text-[#666666] w-36">Received quantity</span>
                <span className="text-black text-left flex-1">{data.receivedQuantity}</span>
              </div>
            </div>

            {/* Missing Alert Box */}
            {data.expectedQuantity > data.receivedQuantity && (
              <div className="rounded-lg bg-[#FFFBF5] border border-[#FDE68A]/60 p-3.5 space-y-1">
                <div className="text-[12px] font-semibold text-[#D97706]">
                  {data.expectedQuantity - data.receivedQuantity} unit is missing
                </div>
                <div className="text-[12px] text-[#666666]">
                  Expected {data.expectedQuantity} · Received {data.receivedQuantity}. Review the receipt before confirming disposition.
                </div>
              </div>
            )}
          </div>

          {/* Condition Check */}
          <div className="space-y-3 pt-1">
            <h3 className="text-[14px] font-semibold text-black">
              Condition Check
            </h3>

            <div className="space-y-2.5 divide-y divide-[#EAEAEA]/80">
              {[
                { key: "packagingIntact", label: "Packaging intact", defaultVal: true },
                { key: "productUsable", label: "Product usable", defaultVal: true },
                { key: "accessoriesPresent", label: "Accessories present", defaultVal: false },
                { key: "visibleDamage", label: "Visible damage", defaultVal: false },
                { key: "productMismatch", label: "Product mismatch", defaultVal: false },
                { key: "missingQuantity", label: "Missing quantity", defaultVal: true },
              ].map(({ key, label }) => {
                const isYes = conditions[key as keyof typeof conditions];
                return (
                  <div key={key} className="flex items-center justify-between pt-2.5 text-[12px]">
                    <span className="text-black">{label}</span>
                    <div className="flex items-center rounded-lg border border-[#EAEAEA] p-0.5 bg-[#F5F5F5]">
                      <button
                        type="button"
                        onClick={() => toggleCondition(key as keyof typeof conditions, true)}
                        className={cn(
                          "px-3 py-1 rounded-md text-[11px] font-semibold transition-colors",
                          isYes
                            ? "bg-black text-white shadow-xs"
                            : "text-[#666666] hover:text-black"
                        )}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCondition(key as keyof typeof conditions, false)}
                        className={cn(
                          "px-3 py-1 rounded-md text-[11px] font-semibold transition-colors",
                          !isYes
                            ? "bg-black text-white shadow-xs"
                            : "text-[#666666] hover:text-black"
                        )}
                      >
                        No
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => alert("Add custom condition checklist item")}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 bg-black text-white rounded-lg text-[11px] font-semibold hover:bg-neutral-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Conditions</span>
              </button>
            </div>
          </div>

          {/* Inspection Result */}
          <div className="space-y-3 pt-1">
            <h3 className="text-[14px] font-semibold text-black">
              Inspection Result
            </h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedResult("Pass")}
                className={cn(
                  "h-8 px-4 rounded-lg text-[12px] font-medium border transition-colors",
                  selectedResult === "Pass"
                    ? "bg-[#16A34A] text-white border-[#16A34A] font-semibold"
                    : "border-[#EAEAEA] text-black hover:bg-neutral-50"
                )}
              >
                Pass
              </button>

              <button
                type="button"
                onClick={() => setSelectedResult("Fail")}
                className={cn(
                  "h-8 px-4 rounded-lg text-[12px] font-medium border transition-colors",
                  selectedResult === "Fail"
                    ? "bg-[#DC2626] text-white border-[#DC2626] font-semibold"
                    : "border-[#EAEAEA] text-black hover:bg-neutral-50"
                )}
              >
                Fail
              </button>

              <button
                type="button"
                onClick={() => setSelectedResult("Needs Review")}
                className={cn(
                  "h-8 px-4 rounded-lg text-[12px] font-medium border transition-colors",
                  selectedResult === "Needs Review"
                    ? "border-[#D97706] text-[#D97706] bg-[#FFFBF5] font-semibold"
                    : "border-[#EAEAEA] text-black hover:bg-neutral-50"
                )}
              >
                Needs Review
              </button>
            </div>

            <p className="text-[12px] text-[#666666] leading-relaxed">
              Requires Review: missing unit and accessory. Inspection does not approve a refund or select a disposition.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[#EAEAEA] p-4 bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="h-[34px] px-4 bg-[#111111] text-white text-[12px] font-semibold rounded-lg hover:bg-black transition-colors"
          >
            Save inspection
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[34px] px-4 bg-white border border-[#EAEAEA] text-black text-[12px] font-semibold rounded-lg hover:bg-neutral-50 transition-colors"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
};
