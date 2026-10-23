import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { ChannelConnection } from "@/types/connection";

interface ConnectionRecoveryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connection: ChannelConnection | null;
  onRetrySync: (connectionId: string) => void;
  onReconnect?: (connectionId: string) => void;
}

export function ConnectionRecoveryDrawer({
  isOpen,
  onClose,
  connection,
  onRetrySync,
  onReconnect,
}: ConnectionRecoveryDrawerProps) {
  const navigate = useNavigate();
  const [isRetrying, setIsRetrying] = useState(false);

  if (!isOpen || !connection) return null;

  const isCritical = connection.status === "error";

  const handleAction = async () => {
    if (isCritical && onReconnect) {
      onReconnect(connection.id);
    } else {
      setIsRetrying(true);
      try {
        await onRetrySync(connection.id);
      } finally {
        setIsRetrying(false);
      }
    }
  };

  const handleViewProducts = () => {
    onClose();
    navigate(`${ROUTES.INVENTORY}?filter[channel]=${encodeURIComponent(connection.connectorId || connection.id)}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer */}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[490px] flex-col border-l border-[#E5E5E5] bg-[#FFFFFF] shadow-2xl transition-transform animate-in slide-in-from-right duration-200"
        aria-label={`${connection.name} recovery details`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F0F0F0] px-6 py-5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
                isCritical ? "text-[#DC2626]" : "text-[#D97706]"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isCritical ? "bg-[#DC2626]" : "bg-[#D97706]"}`} />
              {connection.name} · {isCritical ? "Critical" : "Attention"}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-[#111111]">
          {/* Title & Timing */}
          <div className="space-y-1.5">
            <h2 className="text-[20px] font-bold tracking-tight text-[#111111]">
              {isCritical ? "Connection unavailable" : "Inventory sync needs attention"}
            </h2>
            <p className="text-[12px] text-[#737373]">
              Last successful sync: {connection.lastSyncAt ? connection.lastSyncAt : "18 min ago"}
            </p>
            <div className="pt-1">
              <span className="text-[12px] font-semibold text-[#111111]">
                {isCritical ? "Affected: Products · Inventory · Orders" : "Affected: 23 products"}
              </span>
            </div>
          </div>

          {/* Section: What happened */}
          <div className="space-y-1.5 border-t border-[#F0F0F0] pt-4 text-[12px]">
            <h3 className="font-semibold text-[#111111]">What happened</h3>
            <p className="text-[#525252] leading-relaxed">
              {isCritical
                ? `${connection.name} has stopped synchronizing marketplace data.`
                : "The latest inventory synchronization did not complete successfully."}
            </p>
          </div>

          {/* Section: Business impact */}
          <div className="space-y-1.5 border-t border-[#F0F0F0] pt-4 text-[12px]">
            <h3 className="font-semibold text-[#111111]">Business impact</h3>
            <p className="text-[#525252] leading-relaxed">
              {isCritical
                ? "Potential stock mismatch and delayed order visibility across affected products."
                : "Potential stock mismatch across affected products."}
            </p>
          </div>

          {/* Section: Recommended action */}
          <div className="space-y-1.5 border-t border-[#F0F0F0] pt-4 text-[12px]">
            <h3 className="font-semibold text-[#111111]">Recommended action</h3>
            <p className="text-[#525252] leading-relaxed">
              {isCritical ? `Reconnect ${connection.name} account.` : "Retry inventory synchronization."}
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              disabled={isRetrying}
              onClick={handleAction}
              className="w-full h-10 rounded-lg bg-[#000000] text-[13px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-none disabled:opacity-50"
            >
              {isRetrying ? "Processing..." : isCritical ? "Reconnect" : "Retry sync"}
            </button>
            <button
              type="button"
              onClick={handleViewProducts}
              className="w-full h-10 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[13px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
            >
              {isCritical ? "View impact" : "View affected products"}
            </button>
          </div>

          {/* Recovery Pathway 5-Step Stepper */}
          <div className="border-t border-[#F0F0F0] pt-6 space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#737373]">
              Recovery pathway
            </h3>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[#16A34A] font-bold">✓</span>
                <span className="text-[#525252]">Detected</span>
              </div>
              <div className="h-[1px] flex-1 bg-[#16A34A] mx-2" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[#16A34A] font-bold">✓</span>
                <span className="text-[#525252]">Diagnosed</span>
              </div>
              <div className="h-[1px] flex-1 bg-[#000000] mx-2" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-[#1D4ED8] bg-white inline-block" />
                <span className="font-semibold text-[#111111]">{isCritical ? "Reconnect" : "Retry"}</span>
              </div>
              <div className="h-[1px] flex-1 bg-[#E5E5E5] mx-2" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#E5E5E5] inline-block" />
                <span className="text-[#8A8A8A]">Verified</span>
              </div>
              <div className="h-[1px] flex-1 bg-[#E5E5E5] mx-2" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#E5E5E5] inline-block" />
                <span className="text-[#8A8A8A]">Healthy</span>
              </div>
            </div>
          </div>

          {/* Suggested Next Step Section */}
          <div className="border-t border-[#F0F0F0] pt-5 space-y-2 text-[12px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
              Suggested next step
            </span>
            <h4 className="font-bold text-[#111111]">
              {isCritical ? `Reconnect ${connection.name} account` : `Retry ${connection.name} inventory synchronization`}
            </h4>
            <p className="text-[#525252] leading-relaxed">
              {isCritical
                ? "Authentication has expired and synchronization cannot resume until credentials are renewed."
                : "The connection is authenticated and product/order synchronization is healthy; inventory is the only affected stream."}
            </p>

            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleAction}
                className="font-semibold text-[#111111] hover:underline flex items-center gap-1"
              >
                {isCritical ? "Reconnect" : "Retry"} <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleViewProducts}
                className="text-[#737373] hover:text-[#111111] hover:underline flex items-center gap-1"
              >
                Review first <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
