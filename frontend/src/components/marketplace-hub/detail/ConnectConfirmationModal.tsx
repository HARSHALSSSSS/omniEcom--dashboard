import { useState } from "react";
import { X, Check } from "lucide-react";

interface ConnectConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectorName: string;
  monthlyPrice?: string;
  annualPrice?: string;
  onConfirm: () => void;
}

export function ConnectConfirmationModal({
  isOpen,
  onClose,
  connectorName,
  monthlyPrice = "₹499 / month",
  annualPrice = "₹4,999 / year",
  onConfirm,
}: ConnectConfirmationModalProps) {
  const [selectedScopes, setSelectedScopes] = useState<Record<string, boolean>>({
    Products: true,
    Listings: true,
    Inventory: true,
    Orders: true,
  });

  if (!isOpen) return null;

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) => ({
      ...prev,
      [scope]: !prev[scope],
    }));
  };

  const scopes = ["Products", "Listings", "Inventory", "Orders"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] rounded-3xl bg-[#FFFFFF] p-8 md:p-9 shadow-2xl border border-[#E5E5E5] space-y-5 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-labelledby="confirm-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <h2
            id="confirm-modal-title"
            className="text-[26px] font-bold text-[#000000] tracking-tight m-0"
          >
            Connect {connectorName}?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#555555] hover:text-[#000000] hover:bg-neutral-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Intro */}
        <p className="text-[14px] text-[#000000] leading-[20px] m-0">
          This will authorize the connector and prepare the initial synchronization.
        </p>

        {/* Pricing details */}
        <div className="space-y-1 text-[14px] leading-[22px] text-[#000000]">
          <div>{connectorName} connector add-on · {monthlyPrice}</div>
          <div>Annual option · {annualPrice}</div>
          <div>Monthly billing · Demo pricing only</div>
        </div>

        {/* Divider 1 */}
        <div className="h-[1px] bg-[#EAEAEA] w-full" />

        {/* Scopes section */}
        <div className="space-y-3">
          <h3 className="text-[14px] font-bold text-[#000000] m-0">
            You can review before activation
          </h3>
          <div className="flex flex-wrap items-center gap-6 text-[14px]">
            {scopes.map((scope) => {
              const isChecked = selectedScopes[scope] ?? true;
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  className="flex items-center gap-2 cursor-pointer select-none text-[#000000] focus:outline-hidden"
                >
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                      isChecked
                        ? "border-[#000000] bg-[#000000] text-white"
                        : "border-[#777777] bg-white"
                    }`}
                  >
                    {isChecked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </div>
                  <span>{scope}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider 2 */}
        <div className="h-[1px] bg-[#EAEAEA] w-full" />

        {/* Disclaimer */}
        <p className="text-[12px] leading-[18px] text-[#666666] m-0">
          Connecting does not publish products automatically. Review mappings and synchronization settings before activating workflows.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-6 rounded-xl border border-[#000000] bg-white text-[14px] font-medium text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="h-11 px-6 rounded-xl bg-[#000000] text-[14px] font-medium text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
          >
            Continue to authorization
          </button>
        </div>
      </div>
    </div>
  );
}
