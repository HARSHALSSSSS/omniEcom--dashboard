import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useCatalogStats } from "@/hooks/useProducts";
import { useConnection } from "@/hooks/useConnectors";
import type { ConnectorDirectoryItem, ChannelConnection } from "@/types/connection";

interface ConnectorPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connector: ConnectorDirectoryItem | null;
  connection?: ChannelConnection | null;
}

const CONNECTOR_PRICING: Record<string, { monthly: string; annual: string; text: string }> = {
  amazon_in: { monthly: "₹799 / month", annual: "₹7,999 / year", text: "₹799 / month · ₹7,999 / year" },
  amazon: { monthly: "₹799 / month", annual: "₹7,999 / year", text: "₹799 / month · ₹7,999 / year" },
  flipkart: { monthly: "₹499 / month", annual: "₹4,999 / year", text: "₹499 / month · ₹4,999 / year" },
  meesho: { monthly: "₹299 / month", annual: "₹2,999 / year", text: "₹299 / month · ₹2,999 / year" },
  shopify: { monthly: "₹599 / month", annual: "₹5,999 / year", text: "₹599 / month · ₹5,999 / year" },
  snapdeal: { monthly: "₹399 / month", annual: "₹3,999 / year", text: "₹399 / month · ₹3,999 / year" },
  myntra: { monthly: "₹699 / month", annual: "₹6,999 / year", text: "₹699 / month · ₹6,999 / year" },
};

function formatSyncAgo(isoString?: string): string {
  if (!isoString || isoString === "Never") return "Never synced";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0 || isNaN(diffMs)) return "Just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export function ConnectorPreviewDrawer({
  isOpen,
  onClose,
  connector,
  connection: initialConnection,
}: ConnectorPreviewDrawerProps) {
  const navigate = useNavigate();
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  useEffect(() => {
    setIsAcknowledged(false);
  }, [connector?.id, isOpen]);

  // Fetch full live connection if available
  const { data: liveConnection } = useConnection(initialConnection?.id || null);
  const connection = liveConnection || initialConnection;

  // Master product and variant stats
  const { data: stats } = useCatalogStats({});
  const masterProducts = stats?.products || 427;
  const masterVariants = stats?.variants || 1286;

  if (!isOpen || !connector) return null;

  const isConnected = connector.status === "connected" || !!connection;
  const isUnavailable = connector.status === "unavailable";
  const pricing = CONNECTOR_PRICING[connector.id] || {
    monthly: "₹499 / month",
    annual: "₹4,999 / year",
    text: "₹499 / month · ₹4,999 / year",
  };

  const lastSyncText = connection?.lastSyncAt ? formatSyncAgo(connection.lastSyncAt) : "Recently";
  const connectedDateText = connection?.connectedAt && connection.connectedAt !== "Connected"
    ? (() => {
        try {
          const d = new Date(connection.connectedAt);
          return isNaN(d.getTime()) ? connection.connectedAt : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        } catch {
          return connection.connectedAt;
        }
      })()
    : "Active";

  const entityStatus = connection?.entitySyncStatus;
  const syncRows = [
    { name: "Products", status: entityStatus?.products?.timestamp ? `Healthy · ${entityStatus.products.timestamp}` : "Healthy · Synced" },
    { name: "Listings", status: entityStatus?.listings?.timestamp ? `Healthy · ${entityStatus.listings.timestamp}` : "Healthy · Synced" },
    { name: "Inventory", status: entityStatus?.inventory?.timestamp ? `Healthy · ${entityStatus.inventory.timestamp}` : "Healthy · Synced" },
    { name: "Orders", status: entityStatus?.orders?.timestamp ? `Healthy · ${entityStatus.orders.timestamp}` : "Healthy · Synced" },
  ];

  const activityList = connection?.activityHistory || [];

  const handleConnect = () => {
    onClose();
    navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${connector.id}`);
  };

  const handleManage = () => {
    onClose();
    navigate(ROUTES.MARKETPLACE_HUB);
  };

  const handleViewListings = () => {
    onClose();
    navigate(`${ROUTES.LISTINGS}?filter[channel]=${encodeURIComponent(connector.id)}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[490px] flex-col border-l border-[#E5E5E5] bg-[#FFFFFF] shadow-2xl transition-transform animate-in slide-in-from-right duration-200"
        aria-label={`${connector.name} connector details`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F0F0F0] px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-[20px] font-bold tracking-tight text-[#111111]">
              {connector.name}
            </h2>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#16A34A]">
                    <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
                    Connected
                  </span>
                  <span className="text-[12px] text-[#666666]">
                    ✓ Healthy · Last sync {lastSyncText}
                  </span>
                </>
              ) : isUnavailable ? (
                <span className="text-[12px] font-medium text-[#737373]">
                  Unavailable
                </span>
              ) : (
                <span className="text-[12px] font-medium text-[#737373]">
                  Available to connect
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-[#171717]">
          {/* ========================================================
              STATE 1: CONNECTED (Amazon Screen)
             ======================================================== */}
          {isConnected && (
            <>
              {/* Account summary grid */}
              <div className="grid grid-cols-2 gap-y-3 rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4 text-[12px]">
                <div>
                  <span className="text-[#737373]">Account</span>
                  <p className="mt-0.5 font-medium text-[#111111]">
                    {connection?.accountIdentifier || connection?.name || "Urban Carry"}
                  </p>
                </div>
                <div>
                  <span className="text-[#737373]">Connected</span>
                  <p className="mt-0.5 font-medium text-[#111111]">
                    {connectedDateText}
                  </p>
                </div>
                <div>
                  <span className="text-[#737373]">Health</span>
                  <p className="mt-0.5 font-medium text-[#16A34A] flex items-center gap-1">
                    ✓ {connection?.status ? connection.status.charAt(0).toUpperCase() + connection.status.slice(1) : "Healthy"}
                  </p>
                </div>
                <div>
                  <span className="text-[#737373]">Last successful sync</span>
                  <p className="mt-0.5 font-medium text-[#111111]">{lastSyncText}</p>
                </div>
              </div>

              {/* Enabled Capabilities */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-[#111111]">
                    Enabled capabilities
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2 text-[12px]">
                  {["Product import", "Listings", "Inventory", "Orders"].map((cap) => (
                    <span
                      key={cap}
                      className="inline-flex items-center gap-1 rounded-md bg-[#F4F4F5] px-2.5 py-1 text-[#27272A] font-medium"
                    >
                      ✓ {cap}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed pt-1">
                  Additional capabilities depend on supported APIs and commercial/API permissions.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connector.id}`)}
                  className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1 pt-1"
                >
                  View capabilities →
                </button>
              </div>

              {/* Synchronization Section */}
              <div className="space-y-3 border-t border-[#F0F0F0] pt-5">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Synchronization
                </h3>
                <div className="space-y-2.5 text-[12px]">
                  {syncRows.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between py-1 border-b border-[#F5F5F5] last:border-none"
                    >
                      <span className="text-[#404040] font-medium">{row.name}</span>
                      <span className="text-[#737373] flex items-center gap-1.5">
                        <span className="text-[#16A34A]">✓</span> {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="space-y-3 border-t border-[#F0F0F0] pt-5">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Recent activity
                </h3>
                {activityList.length > 0 ? (
                  <div className="space-y-2 text-[12px]">
                    {activityList.map((act) => (
                      <div key={act.id} className="text-[#737373]">
                        <span className="font-medium text-[#111111]">{act.timeText}</span> - {act.title}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-1 text-[12px] text-[#737373]">
                    No sync activity recorded yet for this channel.
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connector.id}`)}
                  className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1 pt-1"
                >
                  View sync history →
                </button>
              </div>

              {/* Subscription Pricing */}
              <div className="space-y-1.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Connector subscription
                </h3>
                <p className="font-medium text-[#111111]">{pricing.text}</p>
              </div>

              {/* Actions */}
              <div className="space-y-3 border-t border-[#F0F0F0] pt-5 pb-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleManage}
                    className="flex-1 h-9 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors"
                  >
                    Manage
                  </button>
                  <button
                    type="button"
                    onClick={handleViewListings}
                    className="flex-1 h-9 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
                  >
                    View listings
                  </button>
                </div>
                <div className="flex flex-col gap-2 pt-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(ROUTES.MARKETPLACE_HUB);
                    }}
                    className="text-left font-medium text-[#525252] hover:text-[#111111]"
                  >
                    ← Back to Marketplace Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connector.id}`);
                    }}
                    className="text-left font-medium text-[#525252] hover:text-[#111111]"
                  >
                    Connection settings →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ========================================================
              STATE 2: UNAVAILABLE (Snapdeal Screen)
             ======================================================== */}
          {isUnavailable && !isConnected && (
            <>
              {/* Unavailability Notice Box */}
              <div className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4 text-[12px] space-y-3">
                <p className="text-[#525252] leading-relaxed">
                  {connector.statusReason || "This connector cannot be connected to your current workspace configuration."}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connector.id}`)}
                  className="h-8 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
                >
                  View requirements
                </button>
              </div>

              {/* Supported capabilities */}
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Supported capabilities
                </h3>
                <p className="text-[12px] text-[#525252]">
                  Review permission-dependent support before connection.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connector.id}`)}
                  className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1"
                >
                  View capabilities →
                </button>
                <p className="text-[11px] text-[#737373] leading-relaxed pt-1">
                  Availability and capabilities depend on supported APIs and commercial/API permissions.
                </p>
              </div>

              {/* Requirements */}
              <div className="space-y-1.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Requirements
                </h3>
                <p className="text-[#525252]">Requirements are provided during setup.</p>
                <p className="text-[#737373] text-[11px]">
                  No account connection can start until the requirements for your workspace are reviewed.
                </p>
              </div>

              {/* Connector subscription */}
              <div className="space-y-2 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Connector subscription
                </h3>
                <p className="font-semibold text-[#111111]">{pricing.text}</p>
                <p className="text-[#737373] text-[11px]">Demo pricing · Monthly billing</p>
              </div>

              {/* Workspace plan info */}
              <div className="space-y-1.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Workspace plan and connector add-on
                </h3>
                <p className="text-[#737373] text-[11px]">
                  Demo pricing only. Connector add-on is separate from the workspace subscription.
                </p>
              </div>

              {/* Disabled Connect button */}
              <div className="space-y-3 border-t border-[#F0F0F0] pt-5 pb-2">
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-[#F5F5F5] text-[12px] font-semibold text-[#A3A3A3] cursor-not-allowed"
                >
                  Connect
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-left font-medium text-[12px] text-[#525252] hover:text-[#111111] pt-1"
                >
                  ← Back to available connectors
                </button>
              </div>
            </>
          )}

          {/* ========================================================
              STATE 3: AVAILABLE (Flipkart Screen)
             ======================================================== */}
          {!isConnected && !isUnavailable && (
            <>
              {/* Intro Description */}
              <p className="text-[12px] text-[#525252] leading-relaxed">
                Connect {connector.name} to centralize products, listings, inventory and orders.
              </p>

              {/* Capabilities Table */}
              <div className="space-y-3">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Capabilities
                </h3>
                <div className="space-y-2 text-[12px]">
                  {[
                    { name: "Product import", status: "Supported" },
                    { name: "Listings", status: "Supported" },
                    { name: "Inventory", status: "Supported" },
                    { name: "Orders", status: "Supported" },
                    { name: "Returns", status: "Depends" },
                    { name: "Reviews", status: "Depends" },
                    { name: "Promotions", status: "Depends" },
                    { name: "Shipping", status: "Depends" },
                  ].map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between py-1 border-b border-[#F7F7F7] last:border-none"
                    >
                      <span className="text-[#404040]">{row.name}</span>
                      <span
                        className={
                          row.status === "Supported"
                            ? "font-medium text-[#16A34A] flex items-center gap-1"
                            : "font-normal text-[#737373]"
                        }
                      >
                        {row.status === "Supported" && "✓ "}
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed pt-1">
                  Support depends on actual implementation, supported APIs and commercial/API permissions.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connector.id}`)}
                  className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1"
                >
                  View capabilities →
                </button>
              </div>

              {/* Why it may be useful */}
              <div className="space-y-2.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Why it may be useful
                </h3>
                <ul className="space-y-2 text-[#525252]">
                  <li className="flex items-start gap-2">
                    <span className="text-[#111111]">•</span>
                    <span>Centralize your {connector.name} catalog</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#111111]">•</span>
                    <span>Keep inventory aligned with your master stock</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#111111]">•</span>
                    <span>Bring {connector.name} orders into the central order workflow</span>
                  </li>
                </ul>
              </div>

              {/* Potential Setup Banner */}
              <div className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4 text-[12px] space-y-1">
                <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wider">
                  Potential setup
                </span>
                <p className="text-[13px] font-semibold text-[#111111]">
                  {masterProducts} master products · {masterVariants} variants
                </p>
                <p className="text-[11px] text-[#737373]">
                  Products can be prepared for this channel after connection.
                </p>
              </div>

              {/* Connector Subscription */}
              <div className="space-y-3 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-[#111111]">
                    Connector subscription
                  </h3>
                </div>
                <p className="text-[11px] text-[#737373]">
                  Demo pricing · Monthly billing
                </p>
                <div className="space-y-1 text-[#525252]">
                  <p className="font-medium text-[#111111]">Workspace plan</p>
                  <p className="text-[11px] text-[#737373]">Connector add-on</p>
                  <p className="text-[11px] text-[#737373]">
                    Connector add-on billed separately from your workspace plan.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-y-2 py-2 border-y border-[#F0F0F0] text-[12px]">
                  <span className="text-[#737373]">Monthly</span>
                  <span className="text-right font-medium text-[#111111]">{pricing.monthly}</span>
                  <span className="text-[#737373]">Annual</span>
                  <span className="text-right font-medium text-[#111111]">{pricing.annual}</span>
                  <span className="text-[#737373]">Usage/capacity</span>
                  <span className="text-right text-[#737373]">Not specified</span>
                  <span className="text-[#737373]">Included capabilities</span>
                  <span className="text-right text-[#737373]">See capabilities above</span>
                  <span className="text-[#737373]">Additional limits</span>
                  <span className="text-right text-[#737373]">Not specified</span>
                </div>
                <p className="text-[11px] text-[#737373]">
                  Requirements are provided during setup.
                </p>
              </div>

              {/* Connection steps */}
              <div className="space-y-2 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">
                  Connection steps
                </h3>
                <p className="text-[11px] text-[#525252] leading-relaxed">
                  Select connector → Review capabilities → Subscription / access → Connect account → Authorize → Sync → Start using
                </p>
              </div>

              {/* Acknowledgment checkbox */}
              <div className="border-t border-[#F0F0F0] pt-4">
                <label
                  htmlFor="marketplace-connect-acknowledgment"
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] cursor-pointer hover:bg-[#F5F5F5] transition-colors select-none"
                >
                  <input
                    type="checkbox"
                    id="marketplace-connect-acknowledgment"
                    checked={isAcknowledged}
                    onChange={(e) => setIsAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[#D4D4D4] text-[#111111] focus:ring-0 cursor-pointer"
                  />
                  <div className="text-[12px] leading-relaxed">
                    <span className="font-semibold text-[#111111] block">
                      Connecting does not publish products automatically
                    </span>
                    <span className="text-[11px] text-[#666666] block mt-0.5">
                      I understand that connecting this channel allows syncing catalog and order data. I can review catalog, listing, and synchronization rules before activating live workflows.
                    </span>
                  </div>
                </label>
              </div>

              {/* Bottom Continue Action */}
              <div className="border-t border-[#F0F0F0] pt-4 pb-2 space-y-2">
                <button
                  type="button"
                  disabled={!isAcknowledged}
                  onClick={handleConnect}
                  className={`w-full h-10 rounded-lg text-[13px] font-semibold transition-colors shadow-none ${
                    isAcknowledged
                      ? "bg-[#000000] text-[#FFFFFF] hover:bg-neutral-800 cursor-pointer"
                      : "bg-[#E5E5E5] text-[#A3A3A3] cursor-not-allowed"
                  }`}
                >
                  Continue
                </button>
                <p className="text-center text-[11px] text-[#737373]">
                  Next: Connector Details · Review before connecting
                </p>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
