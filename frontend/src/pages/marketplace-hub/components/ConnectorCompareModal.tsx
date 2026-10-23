import { X } from "lucide-react";
import type { ConnectorDirectoryItem } from "@/types/connection";

interface ConnectorCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ConnectorDirectoryItem[];
  onConnect: (connectorId: string) => void;
  onManage: (connectorId: string) => void;
}

const CONNECTOR_PRICING: Record<string, string> = {
  amazon_in: "₹799 / month · ₹7,999 / year",
  amazon: "₹799 / month · ₹7,999 / year",
  flipkart: "₹499 / month · ₹4,999 / year",
  meesho: "₹299 / month · ₹2,999 / year",
  shopify: "₹599 / month · ₹5,999 / year",
  snapdeal: "₹399 / month · ₹3,999 / year",
  myntra: "₹699 / month · ₹6,999 / year",
};

// Standard capabilities mapped from matrix
const CAPABILITY_ROWS = [
  { key: "product_import", label: "Product import" },
  { key: "listings", label: "Listings" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "returns", label: "Returns" },
  { key: "reviews", label: "Reviews" },
  { key: "promotions", label: "Promotions" },
  { key: "shipping", label: "Shipping" },
];

function getCapabilitySupport(connector: ConnectorDirectoryItem, key: string): "Supported" | "Depends" | "N/A" {
  const caps = (connector.capabilities || []).map((c) => String(c).toLowerCase());
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === "reviews") {
    // Platform does not track or expose review synchronization
    return "N/A";
  }

  const isMatched = caps.some((c) => {
    if (normalizedKey === "product_import") return c.includes("product") || c.includes("catalog");
    if (normalizedKey === "listings") return c.includes("listing");
    if (normalizedKey === "inventory") return c.includes("inventory");
    if (normalizedKey === "orders") return c.includes("order");
    if (normalizedKey === "shipping") return c.includes("shipping");
    if (normalizedKey === "returns") return c.includes("return");
    if (normalizedKey === "promotions") return c.includes("promotion");
    return c === normalizedKey;
  });

  if (!isMatched) {
    return "N/A";
  }

  if (connector.isPartnerGated || connector.authType === "partner_gated" || connector.authFlow?.partnerGated) {
    return "Depends";
  }

  return "Supported";
}

export function ConnectorCompareModal({
  isOpen,
  onClose,
  items,
  onConnect,
  onManage,
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
              const isConnected = connector.status === "connected";
              const pricing = CONNECTOR_PRICING[connector.id] || "₹499 / month · ₹4,999 / year";

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
                      {isConnected ? "Connected" : "Available"}
                    </p>
                  </div>

                  <p className="text-[11px] text-[#737373]">
                    {isConnected ? "✓ Connected & Active" : "Available to connect"}
                  </p>

                  <p className="text-[11px] font-medium text-[#111111]">
                    {pricing}
                  </p>

                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => onManage(connector.id)}
                      className="w-full h-8 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
                    >
                      Manage
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConnect(connector.id)}
                      className="w-full h-8 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-none"
                    >
                      Connect
                    </button>
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
                  const support = getCapabilitySupport(connector, row.key);
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

          {/* Disclaimer Footnote */}
          <p className="text-[11px] text-[#737373] leading-relaxed">
            Demo pricing only. Advanced matrix is illustrative and subject to actual implementation, supported APIs and commercial/API permissions. "Depends" requires a review of the connector's supported access during setup.
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
