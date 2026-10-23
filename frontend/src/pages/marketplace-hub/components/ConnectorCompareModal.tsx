import { X } from "lucide-react";
import type { ConnectorDirectoryItem } from "@/types/connection";
import { WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import { CAPABILITY_ROWS, FEE_TEXT, accessText, capabilitySupport, environmentText, limitText, regionsText, statusLabel } from "./connectorFacts";

interface ConnectorCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ConnectorDirectoryItem[];
  onConnect: (connectorId: string) => void;
  onManage: (connectorId: string) => void;
  canConnect?: boolean;
}

const FACT_ROWS: Array<{ label: string; value: (c: ConnectorDirectoryItem) => string }> = [
  { label: "Connection", value: accessText },
  { label: "Regions", value: regionsText },
  { label: "Environment", value: environmentText },
  { label: "Request limit", value: limitText },
  { label: "Connector fee", value: () => FEE_TEXT },
];

export function ConnectorCompareModal({
  isOpen,
  onClose,
  items,
  onConnect,
  onManage,
  canConnect = true,
}: ConnectorCompareModalProps) {
  if (!isOpen || items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px] animate-in fade-in duration-150">
      <div className="w-full max-w-5xl rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F0F0F0] px-8 py-6">
          <div>
            <h2 className="text-[18px] font-bold text-[#111111]">
              Compare connectors
            </h2>
            <p className="mt-1 text-[13px] text-[#737373]">
              Review supported capabilities before choosing a connector.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {/* Connector Top Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col justify-end pb-2">
              <span className="text-[12px] font-semibold text-[#111111]">
                Capabilities and access
              </span>
              <span className="text-[11px] text-[#737373]">
                Supported · Depends · N/A
              </span>
            </div>

            {items.map((connector) => {
              const isConnected = connector.status === "connected" || connector.status === "needs_attention";
              const isUnavailable = connector.status === "unavailable";

              return (
                <div
                  key={connector.id}
                  className="rounded-xl border border-[#E5E5E5] bg-[#FFFFFF] p-5 shadow-sm space-y-3"
                >
                  <div>
                    <h3 className="text-[15px] font-bold text-[#111111]">
                      {connector.name}
                    </h3>
                    <p className="text-[11px] font-medium text-[#737373] mt-0.5">
                      {statusLabel(connector, connector.accountCount ?? 0)}
                    </p>
                  </div>

                  {isUnavailable && connector.statusReason && <p className="text-[11px] text-[#737373]">{connector.statusReason}</p>}

                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => onManage(connector.id)}
                      className="w-full h-8 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
                    >
                      Manage
                    </button>
                  ) : (
                    <span title={canConnect ? undefined : WRITE_REASON} className="block">
                      <button
                        type="button"
                        disabled={isUnavailable || !canConnect}
                        onClick={() => onConnect(connector.id)}
                        className="w-full h-8 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Connect
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Capability Matrix Rows */}
          <div className="border border-[#EDEDED] rounded-xl overflow-hidden divide-y divide-[#F0F0F0] text-[12px]">
            {CAPABILITY_ROWS.map((row) => (
              <div key={row.key} className="grid grid-cols-4 items-center px-4 py-3 hover:bg-[#FAFAFA]">
                <span className="font-medium text-[#111111]">{row.label}</span>
                {items.map((connector) => {
                  const support = capabilitySupport(connector, row.key);
                  return (
                    <div key={connector.id} className="text-[#525252]">
                      {support === "Supported" ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#16A34A]">
                          ✓ Supported
                        </span>
                      ) : support === "Depends" ? (
                        <span className="text-[#737373]">Depends</span>
                      ) : (
                        <span className="text-[#A3A3A3]">N/A</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Access and setup, from the connector directory */}
          <div className="border border-[#EDEDED] rounded-xl overflow-hidden divide-y divide-[#F0F0F0] text-[12px]">
            {FACT_ROWS.map((row) => (
              <div key={row.label} className="grid grid-cols-4 items-start px-4 py-3 hover:bg-[#FAFAFA]">
                <span className="font-medium text-[#111111]">{row.label}</span>
                {items.map((connector) => (
                  <span key={connector.id} className="text-[#525252] pr-2">
                    {row.value(connector)}
                  </span>
                ))}
              </div>
            ))}
          </div>

          {/* Disclaimer Footnote */}
          <p className="text-[11px] text-[#737373] leading-relaxed">
            Capabilities come from each connector's declared capability matrix. "Depends" means the marketplace gives API access only to approved partners, so support is confirmed during setup. Reviews are not synchronized by any connector yet.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-[#F0F0F0] px-8 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-medium text-[#525252] hover:text-[#111111]"
          >
            ← Back to available connectors
          </button>
        </div>
      </div>
    </div>
  );
}
