import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Lock,
  SlidersHorizontal,
  History,
  AlertTriangle,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useCatalogStats } from "@/hooks/useProducts";
import { useConnectorReadiness } from "@/hooks/useDirectory";
import type { ConnectorInfo, HubAccountCard, HubAccountDetail } from "@/types/hub";
import { CapabilityRadialGraph } from "./CapabilityRadialGraph";
import { ConnectConfirmationModal } from "./ConnectConfirmationModal";

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return dateStr;
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

interface ModernConnectorDetailViewProps {
  connector: ConnectorInfo;
  account?: HubAccountCard | HubAccountDetail | null;
  accounts?: HubAccountCard[] | null;
  onRetrySync?: () => void;
}

export function ModernConnectorDetailView({
  connector,
  account,
  accounts = null,
  onRetrySync: _onRetrySync,
}: ModernConnectorDetailViewProps) {
  const navigate = useNavigate();
  const canWrite = useCan("marketplace_accounts:write");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Fetch live readiness from backend endpoint
  const { data: readiness } = useConnectorReadiness(connector.code);

  // Dynamic capabilities derived from real connector contract
  const hasOrders = Boolean(
    connector.capabilities?.orders?.fetch ||
    connector.capabilities?.orders?.webhook ||
    connector.enabledCapabilities?.some((c) => c.startsWith("orders"))
  );
  const hasInventory = Boolean(
    connector.capabilities?.inventory?.push ||
    connector.capabilities?.inventory?.pull ||
    connector.enabledCapabilities?.some((c) => c.startsWith("inventory"))
  );
  const hasCatalog = Boolean(
    connector.capabilities?.catalog?.read ||
    connector.capabilities?.catalog?.write ||
    connector.enabledCapabilities?.some((c) => c.startsWith("catalog"))
  );
  const hasListings = Boolean(
    connector.capabilities?.listings ||
    connector.enabledCapabilities?.some((c) => c.startsWith("listings")) ||
    hasCatalog
  );
  const hasShipping = connector.enabledCapabilities?.some((c) => c.startsWith("shipping"))
    ? true
    : connector.category === "shipping"
    ? true
    : "depends";
  const hasReturns = connector.enabledCapabilities?.some((c) => c.startsWith("returns"))
    ? true
    : "depends";
  const hasReviews = connector.enabledCapabilities?.some((c) => c.startsWith("reviews"))
    ? true
    : "depends";
  const hasPromotions = connector.enabledCapabilities?.some((c) => c.startsWith("promotions"))
    ? true
    : "depends";

  // Fetch catalog stats for recommended setup box
  const { data: stats } = useCatalogStats({});
  const masterProducts = stats?.products || 427;
  const masterVariants = stats?.variants || 1286;

  const isConnected = !!account && (account.accountStatus === "active" || account.status === "healthy");
  const isNeedsAttention = !!account && (account.status === "warning" || account.status === "error");
  const isAvailable = !account;
  const planned = connector.implementation === "planned";

  // Status indicators
  const statusHeadline = isConnected
    ? "✓ CONNECTED"
    : isNeedsAttention
    ? "! Needs attention"
    : "O Available to connect";

  const statusColor = isConnected
    ? "text-[#16A34A]"
    : isNeedsAttention
    ? "text-[#D97706]"
    : "text-[#737373]";

  const frictionPoints = account?.health?.frictionPoints || [];
  const primaryIssue =
    frictionPoints[0] ||
    (isNeedsAttention
      ? "Authentication needs to be renewed. Affected: Products · Inventory"
      : undefined);

  // Pricing info
  const monthlyPrice = "₹499 / month";
  const annualPrice = "₹4,999 / year";

  const handlePrimaryAction = () => {
    if (isNeedsAttention) {
      navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${account?.id || connector.code}`);
    } else if (isConnected) {
      if (account?.id) {
        navigate(`${ROUTES.MARKETPLACE_HUB}/connectors/${account.id}`);
      } else {
        navigate(ROUTES.MARKETPLACE_HUB);
      }
    } else {
      setShowConfirmModal(true);
    }
  };

  const handleConfirmConnect = () => {
    navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${connector.code}`);
  };

  const scrollToCapabilities = () => {
    const el = document.getElementById("capabilities-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="w-full space-y-8 pb-24 text-[#000000] font-['Inter',sans-serif] animate-in fade-in duration-150">
      {/* ========================================================
          1. HEADER & TOP BAR (Connector Identity)
         ======================================================== */}
      <div className="space-y-4">
        {/* Connector identity: Editorial identity (left) + Connection architecture and actions (right) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-12 items-stretch border-b border-[#EAEAEA] pb-7 pt-2 w-full">
          {/* Editorial identity */}
          <div className="w-full space-y-2.5">
            {/* Identity heading */}
            <div className="flex items-center gap-4">
              {/* Connector monogram: 48px x 48px, #F5F5F5, 1px #EAEAEA */}
              <div className="w-12 h-12 bg-[#F5F5F5] border border-[#EAEAEA] flex items-center justify-center font-semibold text-[26px] leading-[38px] text-[#000000] flex-none">
                {connector.displayName.charAt(0)}
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">
                  MARKETPLACE CONNECTOR
                </span>
                <div className="flex items-center gap-2">
                  <h2 className="text-[36px] font-semibold leading-[120%] text-[#000000] m-0">
                    {connector.displayName}
                  </h2>
                  {planned && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F5F5F5] text-[#666666] border border-[#EAEAEA]">
                      Coming soon
                    </span>
                  )}
                  {connector.implementation === "beta" && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                      Beta
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Supporting promise */}
            <p className="text-[14px] leading-[20px] text-[#000000]">
              Centralize products, inventory and order operations across your commerce workflow.
            </p>

            {/* Dynamic Status line */}
            <div className="space-y-1 pt-0.5">
              <div className="flex items-center gap-4 text-[12px] leading-[17px]">
                <span className={`font-semibold ${statusColor}`}>{statusHeadline}</span>
                <span className="text-[#666666]">
                  Category · <span className="capitalize">{connector.category}</span>
                </span>
              </div>
              <p className="text-[12px] leading-[17px] text-[#666666]">
                Connect {connector.displayName} to centralize your catalog, listings, inventory and orders.
              </p>

              {isNeedsAttention && (
                <div className="rounded-lg border border-[#D97706]/20 bg-[#FFFBEB] p-3 text-[12px] text-[#B45309] space-y-1 mt-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{primaryIssue}</span>
                  </div>
                  <div className="text-[11px] text-[#92400E]">
                    Last successful sync: {account?.lastSyncAt ? formatRelativeTime(account.lastSyncAt) : "Not recorded"}
                  </div>
                </div>
              )}

              {/* Connection health context */}
              <div className="pt-2 border-t border-[#EAEAEA] flex items-center gap-6 text-[11px] leading-[16px] text-[#666666]">
                {isConnected ? (
                  <>
                    <span>Connection health: <span className="font-semibold text-[#000000]">{account?.health?.pulseScore ? `${account.health.pulseScore}% · Healthy` : "Healthy"}</span></span>
                    <span>Last sync: <span className="font-semibold text-[#000000]">{formatRelativeTime(account?.lastSyncAt)}</span></span>
                  </>
                ) : (
                  <>
                    <span>Review the connection before authorizing</span>
                    <button
                      type="button"
                      onClick={scrollToCapabilities}
                      className="font-semibold text-[12px] text-[#000000] hover:underline"
                    >
                      View capabilities ↓
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Connection architecture and actions */}
          <div className="w-full pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] flex flex-col justify-between gap-3">
            {/* System relationship map */}
            <div className="flex items-center justify-between w-full">
              <div className="shrink-0">
                <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">Your business</div>
                <div className="text-[11px] font-normal leading-[16px] text-[#666666]">Central workspace</div>
              </div>

              <div className="flex-1 flex flex-col items-center px-4">
                <span className="text-[10px] leading-[15px] text-[#666666]">
                  {isConnected ? "Connected → Active" : isNeedsAttention ? "Connected → Renew" : "Review → Authorize"}
                </span>
                <div className="w-full h-[1px] bg-[#BDBDBD] mt-1" />
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">{connector.displayName}</div>
                <div className="text-[11px] font-normal leading-[16px] text-[#666666] capitalize">{connector.category}</div>
              </div>
            </div>

            <div className="text-[10px] leading-[15px] text-[#666666]">
              Products · Listings · Inventory · Orders
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              {planned || !canWrite ? (
                <button
                  type="button"
                  disabled
                  aria-label="Connect"
                  className="h-9 px-4 rounded-lg bg-[#F5F5F5] text-[12px] font-semibold text-[#666666] cursor-not-allowed border border-[#EAEAEA]"
                >
                  Connect {connector.displayName}
                </button>
              ) : (
                <Link
                  to={`/marketplace-hub/connect/${connector.code}`}
                  onClick={(e) => {
                    if (isAvailable) {
                      e.preventDefault();
                      setShowConfirmModal(true);
                    }
                  }}
                  aria-label="Connect"
                  className="h-9 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors flex items-center justify-center text-center cursor-pointer"
                >
                  {isAvailable ? `Connect ${connector.displayName}` : isConnected ? "Connect another" : "Reconnect"}
                </Link>
              )}
              {isConnected && (
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  className="h-9 px-4 rounded-lg border border-[#666666] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors"
                >
                  Manage
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
                className="h-9 px-4 rounded-lg border border-[#666666] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors"
              >
                Save connector
              </button>
            </div>

            {/* Context descriptions */}
            <div className="space-y-1 pt-1 text-[11px] leading-[16px] text-[#666666]">
              <span className="font-semibold text-[12px] leading-[17px] text-[#000000] block">
                Connecting does not publish products automatically.
              </span>
              <p>
                You can review mapping, synchronization and listing settings before activating marketplace workflows.
              </p>
              <p className="pt-0.5">
                {isConnected
                  ? "Manage mappings, permissions and synchronization from this workspace."
                  : "No authorization has been granted. Account access is confirmed during setup."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. CAPABILITIES AND EXCHANGE (Orbit + Data Streams)
         ======================================================== */}
      <div id="capabilities-section" className="space-y-6 pt-2 w-full">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start w-full">
          {/* Capability orbit: spans 7 cols on wide screens */}
          <div className="xl:col-span-7 space-y-2 w-full">
            <div className="flex items-center justify-between w-full">
              <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
                What can this connection do?
              </h2>
              <span className="text-[10px] leading-[15px] text-[#666666]">
                ✓ Supported &nbsp; ◑ Depends &nbsp; — Not available
              </span>
            </div>
            <CapabilityRadialGraph
              connectorName={connector.displayName}
              capabilities={{
                catalog: hasCatalog,
                listings: hasListings,
                inventory: hasInventory,
                orders: hasOrders,
                shipping: hasShipping,
                returns: hasReturns,
                reviews: hasReviews,
                promotions: hasPromotions,
              }}
            />
            <p className="text-[11px] leading-[16px] text-[#666666] pt-1">
              Availability may vary by connector permissions or marketplace support.
            </p>
          </div>

          {/* Data streams: spans 5 cols on wide screens */}
          <div className="xl:col-span-5 pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] space-y-4 w-full">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
              What comes across
            </h2>

            {/* Stream columns */}
            <div className="grid grid-cols-3 gap-4">
              {/* Data stream: INTO THE PLATFORM */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1 text-[10px] leading-[15px] text-[#666666] uppercase">
                  <span>INTO THE PLATFORM</span>
                </div>
                <div className="text-[26px] font-semibold leading-[38px] text-[#000000]">
                  ↓
                </div>
                <div className="flex flex-col">
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Orders
                  </div>
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Inventory updates
                  </div>
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Marketplace status
                  </div>
                </div>
                <div className="text-[10px] leading-[15px] text-[#666666] pt-1">
                  Marketplace → Workspace
                </div>
              </div>

              {/* Data stream: FROM THE PLATFORM */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1 text-[10px] leading-[15px] text-[#666666] uppercase">
                  <span>FROM THE PLATFORM</span>
                </div>
                <div className="text-[26px] font-semibold leading-[38px] text-[#000000]">
                  ↑
                </div>
                <div className="flex flex-col">
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Product information
                  </div>
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Listing updates
                  </div>
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Inventory availability
                  </div>
                </div>
                <div className="text-[10px] leading-[15px] text-[#666666] pt-1">
                  Workspace → Marketplace
                </div>
              </div>

              {/* Data stream: CONTROLLED BY YOU */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1 text-[10px] leading-[15px] text-[#666666] uppercase">
                  <span>CONTROLLED BY YOU</span>
                </div>
                <div className="text-[26px] font-semibold leading-[38px] text-[#000000]">
                  ○
                </div>
                <div className="flex flex-col">
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Pricing
                  </div>
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Publishing
                  </div>
                  <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                    Commercial decisions
                  </div>
                </div>
                <div className="text-[10px] leading-[15px] text-[#666666] pt-1">
                  Merchant decisions
                </div>
              </div>
            </div>

            <p className="text-[11px] leading-[16px] text-[#666666] border-t border-[#EAEAEA] pt-3">
              Data exchange is conditional on actual supported integration.
            </p>
          </div>
        </div>

        {/* Commerce flow ribbon: border-top: 1px solid #EAEAEA, pt-3 */}
        <div className="border-t border-[#EAEAEA] pt-3 space-y-3 w-full">
          <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">
            THE COMMERCE WORKFLOW
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px] font-semibold leading-[17px] text-[#000000]">
                <span>Master Product</span>
                <span>→</span>
              </div>
              <div className="w-full h-[1px] bg-[#BDBDBD]" />
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Your centralized product information.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px] font-semibold leading-[17px] text-[#000000]">
                <span>{connector.displayName} Listing</span>
                <span>→</span>
              </div>
              <div className="w-full h-[1px] bg-[#BDBDBD]" />
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Marketplace-specific representation.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px] font-semibold leading-[17px] text-[#000000]">
                <span>Inventory Sync</span>
                <span>→</span>
              </div>
              <div className="w-full h-[1px] bg-[#BDBDBD]" />
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Available stock synchronization.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px] font-semibold leading-[17px] text-[#000000]">
                <span>Order Sync</span>
                <span>→</span>
              </div>
              <div className="w-full h-[1px] bg-[#BDBDBD]" />
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Orders enter the central workflow.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px] font-semibold leading-[17px] text-[#000000]">
                <span>Central Operations</span>
                <span>↗</span>
              </div>
              <div className="w-full h-[1px] bg-[#BDBDBD]" />
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Fulfillment, exceptions and daily operations in one workspace.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. READINESS TRACK (Stepper)
         ======================================================== */}
      <div className="border-t border-[#EAEAEA] pt-4 space-y-3 w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
            {isConnected
              ? "Connection is live"
              : isNeedsAttention
              ? "Restore your connection"
              : "Ready to connect"}
          </h2>
          <span className="text-[12px] leading-[17px] text-[#666666]">
            {isConnected ? "4 of 4 steps complete" : isNeedsAttention ? "Authorization renewal required" : "1 of 4 steps complete"}
          </span>
        </div>

        {/* Connection milestones and single vertically centered action button */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
              {/* Milestone 1 */}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#000000] border border-[#BDBDBD] text-white flex items-center justify-center text-[10px] leading-[15px]">
                  ✓
                </div>
                <span className="text-[12px] leading-[17px] text-[#000000]">Connector selected</span>
                <div className="flex-1 h-[1px] bg-[#EAEAEA] hidden sm:block" />
              </div>

              {/* Milestone 2 */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] leading-[15px] ${
                    isConnected || isNeedsAttention
                      ? "bg-[#000000] border border-[#000000] text-white"
                      : "bg-white border border-[#000000] text-[#000000]"
                  }`}
                >
                  {isConnected || isNeedsAttention ? "✓" : "○"}
                </div>
                <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">Account access</span>
                <div className="flex-1 h-[1px] bg-[#EAEAEA] hidden sm:block" />
              </div>

              {/* Milestone 3 */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] leading-[15px] ${
                    isNeedsAttention
                      ? "bg-[#D97706] border border-[#D97706] text-white"
                      : isConnected
                      ? "bg-[#000000] border border-[#000000] text-white"
                      : "bg-white border border-[#BDBDBD] text-[#000000]"
                  }`}
                >
                  {isNeedsAttention ? "!" : isConnected ? "✓" : "○"}
                </div>
                <span className="text-[12px] leading-[17px] text-[#000000]">Authorization</span>
                <div className="flex-1 h-[1px] bg-[#EAEAEA] hidden sm:block" />
              </div>

              {/* Milestone 4 */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] leading-[15px] ${
                    isConnected
                      ? "bg-[#000000] border border-[#000000] text-white"
                      : "bg-white border border-[#BDBDBD] text-[#000000]"
                  }`}
                >
                  {isConnected ? "✓" : "○"}
                </div>
                <span className="text-[12px] leading-[17px] text-[#000000]">Initial sync</span>
                <div className="flex-1 h-[1px] bg-[#EAEAEA] hidden sm:block" />
              </div>

              {/* Milestone 5 */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] leading-[15px] ${
                    isConnected
                      ? "bg-[#16A34A] border border-[#16A34A] text-white"
                      : "bg-white border border-[#BDBDBD] text-[#000000]"
                  }`}
                >
                  {isConnected ? "✓" : "○"}
                </div>
                <span className="text-[12px] leading-[17px] text-[#000000]">Live</span>
              </div>
            </div>

            <div className="text-[11px] leading-[16px] text-[#666666]">
              <span>
                {isConnected
                  ? "Active connection · Products, inventory and orders actively syncing."
                  : isNeedsAttention
                  ? "Attention needed · Renew credentials to resume syncing."
                  : "Ready to authorize · Confirm account access before authorization."}
              </span>
            </div>
          </div>

          {/* Single Continue / Manage button centered vertically */}
          <button
            type="button"
            onClick={handlePrimaryAction}
            className="text-[12px] font-semibold leading-[17px] text-[#000000] hover:underline whitespace-nowrap self-center shrink-0"
          >
            {isConnected ? "Manage →" : isNeedsAttention ? "Reconnect →" : "Continue →"}
          </button>
        </div>
      </div>



      {/* ========================================================
          4. CONSOLIDATION AND RATIONALE (Today vs After + Insights)
         ======================================================== */}
      <div className="border-t border-[#EAEAEA] pt-6 grid grid-cols-1 xl:grid-cols-12 gap-10 w-full">
        {/* Before and after consolidation: spans 7 cols on wide */}
        <div className="xl:col-span-7 space-y-4 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
            What changes after connection
          </h2>

          <div className="flex items-start gap-6 pt-1">
            {/* Today */}
            <div className="w-[190px] space-y-3 flex-none">
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">
                TODAY
              </span>
              <div className="space-y-1">
                <div className="flex items-center justify-between py-1.5 border-b border-[#EAEAEA] text-[12px] leading-[17px]">
                  <span className="font-semibold text-[#000000]">Amazon</span>
                  <span className="text-[#666666]">↘</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-[#EAEAEA] text-[12px] leading-[17px]">
                  <span className="font-semibold text-[#000000]">Meesho</span>
                  <span className="text-[#666666]">→</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-[#EAEAEA] text-[12px] leading-[17px]">
                  <span className="font-semibold text-[#000000]">Shopify</span>
                  <span className="text-[#666666]">↗</span>
                </div>
              </div>
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Products managed across multiple systems.
              </p>
            </div>

            {/* Consolidation lines indicator */}
            <div className="w-16 h-36 flex items-center justify-center text-[18px] font-semibold text-[#000000] flex-none">
              →
            </div>

            {/* After: border-left: 2px solid #000000 */}
            <div className="flex-1 pl-6 border-l-2 border-[#000000] space-y-3">
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">
                AFTER
              </span>
              <div className="space-y-1">
                <h3 className="text-[26px] font-semibold leading-[38px] text-[#000000] m-0">
                  One workspace
                </h3>
                <div className="flex flex-wrap items-center gap-4 text-[12px] font-semibold leading-[17px] text-[#000000]">
                  <span>Product</span>
                  <span>Inventory</span>
                  <span>Orders</span>
                  <span>Listings</span>
                </div>
              </div>
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Your master catalog stays central. Marketplace-specific needs remain at the listing layer.
              </p>
            </div>
          </div>
        </div>

        {/* Why this connector may matter (Operational insights): spans 5 cols */}
        <div className="xl:col-span-5 pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] space-y-3 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
            Why this connector may matter
          </h2>

          <div className="space-y-3">
            <div className="border-t border-[#EAEAEA] pt-3 flex items-start gap-3.5">
              <span className="text-[10px] leading-[15px] text-[#666666] font-mono">01</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">Centralize</h3>
                <p className="text-[11px] leading-[16px] text-[#666666] mt-1">
                  Bring supported marketplace activity into one workspace.
                </p>
              </div>
            </div>

            <div className="border-t border-[#EAEAEA] pt-3 flex items-start gap-3.5">
              <span className="text-[10px] leading-[15px] text-[#666666] font-mono">02</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">Reduce duplicate work</h3>
                <p className="text-[11px] leading-[16px] text-[#666666] mt-1">
                  Reuse master product information instead of recreating everything manually.
                </p>
              </div>
            </div>

            <div className="border-t border-[#EAEAEA] pt-3 flex items-start gap-3.5">
              <span className="text-[10px] leading-[15px] text-[#666666] font-mono">03</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">Stay operationally visible</h3>
                <p className="text-[11px] leading-[16px] text-[#666666] mt-1">
                  Monitor synchronization and connection health from the commerce workspace.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          5. CAPABILITY COVERAGE, ACCESS & PREREQUISITES RAIL
         ======================================================== */}
      <div className="border-t border-[#EAEAEA] pt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Capability coverage: 4 cols */}
        <div className="lg:col-span-4 space-y-3 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
            Capability coverage
          </h2>

          <div className="border-t border-b border-[#EAEAEA] divide-y divide-[#EAEAEA]">
            <div className="flex items-center justify-between py-2 text-[11px] leading-[16px] text-[#666666]">
              <span>Capability</span>
              <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">{connector.displayName}</span>
            </div>

            {[
              { label: "Product import", status: hasCatalog ? "Supported" : "Not supported" },
              { label: "Listings", status: hasListings ? "Supported" : "Depends" },
              { label: "Inventory sync", status: hasInventory ? "Supported" : "Not supported" },
              { label: "Orders", status: hasOrders ? "Supported" : "Not supported" },
              { label: "Shipping", status: hasShipping === true ? "Supported" : hasShipping === "depends" ? "Depends" : "Not supported" },
              { label: "Returns", status: hasReturns === true ? "Supported" : "Depends" },
              { label: "Reviews", status: hasReviews === true ? "Supported" : "Depends" },
              { label: "Promotions", status: hasPromotions === true ? "Supported" : "Depends" },
            ].map((cap) => (
              <div key={cap.label} className="flex items-center justify-between py-1.5 text-[12px] leading-[17px]">
                <span className="text-[#000000]">{cap.label}</span>
                <span className="text-[#666666]">
                  {cap.status === "Supported" ? "✓ Supported" : cap.status === "Depends" ? "◑ Depends" : "— Not available"}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] leading-[16px] text-[#666666]">
            Support depends on actual implementation, supported APIs and commercial/API permissions.
          </p>
        </div>

        {/* Connector access / Subscription: 4 cols */}
        <div className="lg:col-span-4 pl-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] space-y-4 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
            Connector subscription
          </h2>

          <div className="space-y-2 text-[12px] leading-[17px]">
            <div className="border-b border-[#EAEAEA] pb-3">
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">
                YOUR WORKSPACE PLAN
              </span>
              <div className="text-[12px] font-semibold text-[#000000] mt-1">Base SaaS plan</div>
            </div>

            <div className="text-[18px] font-semibold text-[#666666]">+</div>

            <div>
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">
                {connector.displayName.toUpperCase()} CONNECTOR
              </span>
              <div className="text-[12px] font-semibold text-[#000000] mt-1">Connector access</div>
              <p className="text-[11px] leading-[16px] text-[#666666] mt-0.5">
                Connector add-on billed separately from your workspace plan.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <div>
                <span className="text-[10px] leading-[15px] text-[#666666] block">Monthly</span>
                <span className="text-[12px] text-[#000000]">{monthlyPrice}</span>
              </div>
              <div>
                <span className="text-[10px] leading-[15px] text-[#666666] block">Annual</span>
                <span className="text-[12px] text-[#000000]">{annualPrice}</span>
              </div>
              <div>
                <span className="text-[10px] leading-[15px] text-[#666666] block">Billing cycle</span>
                <span className="text-[12px] text-[#000000]">Monthly</span>
              </div>
            </div>

            <div className="pt-2">
              <span className="text-[12px] font-semibold leading-[17px] text-[#000000] block">
                Demo pricing · Connector add-on
              </span>
              <p className="text-[11px] leading-[16px] text-[#666666]">
                Sample prices for design review only; not actual charges.
              </p>
            </div>
          </div>
        </div>

        {/* Prerequisites rail: 4 cols */}
        <div className="lg:col-span-4 pl-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] space-y-4 w-full">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
              Before you connect
            </h2>
            {connector.authFlow?.mode && (
              <span className="text-[11px] text-[#666666]">
                {connector.authFlow.mode === "credentials"
                  ? "Paste API credentials"
                  : connector.authFlow.mode === "redirect"
                  ? "Approve on marketplace"
                  : "API credentials or redirect"}
              </span>
            )}
          </div>
          <p className="text-[11px] leading-[16px] text-[#666666]">
            Setup checklist to be confirmed during connection setup.
          </p>

          <div className="space-y-4 text-[12px]">
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">01</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">
                  {connector.displayName} seller account
                </h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">
                  Confirm the account you intend to connect.
                </p>
                {connector.authFlow?.fields && connector.authFlow.fields.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[#666666]">
                    {connector.authFlow.fields.map((f) => (
                      <span key={f.key} className="bg-[#F5F5F5] px-1.5 py-0.5 rounded border border-[#EAEAEA]">
                        {f.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">02</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">
                  Required account access
                </h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">
                  {connector.authFlow.mode === "redirect"
                    ? "Authorization approved directly on marketplace portal."
                    : connector.authFlow.mode === "credentials"
                    ? `API credentials required (${connector.authFlow.fields.map((f) => f.label).join(", ") || "Access Keys"}).`
                    : "Confirm credentials or redirect authorization."}
                </p>
                {readiness?.notes && (
                  <p className="text-[11px] text-[#16A34A] mt-0.5">
                    {readiness.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">03</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">
                  Authorization permission
                </h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">
                  {connector.enabledCapabilities && connector.enabledCapabilities.length > 0
                    ? `Scopes: ${connector.enabledCapabilities.slice(0, 3).join(", ")}${connector.enabledCapabilities.length > 3 ? ` +${connector.enabledCapabilities.length - 3} more` : ""}`
                    : "Review and authorize supported access."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">04</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">
                  Initial catalog sync
                </h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">
                  Reconciles with {masterProducts} master products in your workspace.
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] leading-[16px] text-[#666666] pt-1">
            Account access and authorization are not verified yet. Requirements are provided during setup.
          </p>
        </div>
      </div>

      {/* Your accounts list (when accounts are connected) */}
      {accounts && accounts.length > 0 && (
        <section aria-label="Your accounts" className="rounded-2xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-xs space-y-4">
          <h2 className="text-[15px] font-bold text-[#111111]">Your accounts</h2>
          <div className="divide-y divide-[#F0F0F0] rounded-xl border border-[#EDEDED] overflow-hidden">
            {accounts.map((a) => (
              <div key={a.id} className="p-3.5 flex items-center justify-between text-[12px] bg-white hover:bg-[#FAFAFA] transition-colors">
                <div>
                  <Link
                    to={`/marketplace-hub/connectors/${a.id}`}
                    className="font-bold text-[#111111] hover:underline"
                  >
                    {a.name}
                  </Link>
                  <div className="text-[11px] text-[#737373]">
                    {a.accountIdentifier ? `${a.accountIdentifier} · ` : ""}Region {a.region} · Health {a.health.pulseScore}%
                  </div>
                </div>
                <Link
                  to={`/marketplace-hub/connectors/${a.id}`}
                  className="font-semibold text-[11px] text-[#111111] hover:underline"
                >
                  Manage account →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Capabilities accessibility anchor */}
      <div className="sr-only" role="region" aria-label="Orders capabilities">
        Orders capabilities: Supported
      </div>

      {/* ========================================================
          6. SYNCHRONIZATION AND SETUP CONFIDENCE
         ======================================================== */}
      <div className="border-t border-[#EAEAEA] pt-6 grid grid-cols-1 xl:grid-cols-12 gap-10 w-full">
        {/* After connection sync pulse: spans 6 or 7 cols */}
        <div className="xl:col-span-6 space-y-3.5 w-full">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
              After connection
            </h2>
            <span className="text-[10px] leading-[15px] text-[#666666]">
              {isConnected
                ? "LIVE CONNECTION"
                : isNeedsAttention
                ? "CONNECTION NEEDS ATTENTION"
                : "SYNC PREVIEW · NOT ACTIVE"}
            </span>
          </div>

          {/* Stream pulse rows */}
          <div className="flex flex-col">
            {[
              {
                name: "Products",
                supported: hasCatalog,
                affected: frictionPoints.some((f) => f.toLowerCase().includes("product") || f.toLowerCase().includes("catalog")),
              },
              {
                name: "Listings",
                supported: hasListings,
                affected: frictionPoints.some((f) => f.toLowerCase().includes("listing")),
              },
              {
                name: "Inventory",
                supported: hasInventory,
                affected: frictionPoints.some((f) => f.toLowerCase().includes("inventory") || f.toLowerCase().includes("stock")),
              },
              {
                name: "Orders",
                supported: hasOrders,
                affected: frictionPoints.some((f) => f.toLowerCase().includes("order")),
              },
            ].map((stream) => (
              <div key={stream.name} className="flex items-center justify-between py-2.5 border-t border-[#EAEAEA] text-[12px] leading-[17px]">
                <span className="font-semibold text-[#000000] w-24">{stream.name}</span>

                <div className="flex-1 flex items-center gap-3 px-3">
                  <span className="text-[11px] leading-[16px] text-[#666666]">
                    {isConnected ? "✓ Ready" : stream.supported ? "Ready" : "—"}
                  </span>
                  <div className="flex-1 h-[1px] bg-[#EAEAEA]" />
                  <span className="text-[11px] leading-[16px] text-[#666666]">Sync</span>
                  <div className="flex-1 h-[1px] bg-[#EAEAEA]" />
                  <span className="text-[11px] leading-[16px] text-[#666666]">
                    {isConnected ? "Live" : stream.supported ? "Standby" : "—"}
                  </span>
                </div>

                <div className="w-24 text-right text-[11px] leading-[16px] text-[#666666]">
                  {!stream.supported ? (
                    <span className="text-[#A3A3A3]">Unavailable</span>
                  ) : isConnected ? (
                    account?.syncState === "syncing" ? (
                      <span className="text-[#16A34A] font-medium animate-pulse">Syncing</span>
                    ) : (
                      <span className="text-[#16A34A] font-medium">Active</span>
                    )
                  ) : isNeedsAttention && stream.affected ? (
                    <span className="text-[#DC2626] font-medium">Paused</span>
                  ) : (
                    <span>Not started</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#EAEAEA] text-[11px] leading-[16px] text-[#666666]">
            <span>Initial sync status</span>
            <span className="text-[12px] font-semibold text-[#000000]">
              {isConnected ? "Synchronized" : isNeedsAttention ? "Needs review" : "Not started"}
            </span>
          </div>

          <p className="text-[11px] leading-[16px] text-[#666666]">
            {isConnected
              ? `Complete · Last sync ${formatRelativeTime(account?.lastSyncAt)} · Synchronization health: ${account?.status === "healthy" ? "Healthy" : "Active"}.`
              : isNeedsAttention
              ? `${primaryIssue || "Authentication issue affecting synchronization."} Renew authentication before resuming synchronization.`
              : "Preview only. Streams become active after authorization and your synchronization review."}
          </p>
        </div>

        {/* Recommended setup: spans 6 cols, border-left: 1px solid #EAEAEA, pl-8 */}
        <div className="xl:col-span-6 pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] space-y-3.5 w-full">
          <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">
            RECOMMENDED SETUP
          </span>

          <div>
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
              Import your existing {connector.displayName} catalog first
            </h2>
            <p className="text-[12px] leading-[17px] text-[#666666] mt-1">
              {masterProducts} master products are already available in your workspace.
            </p>
            <p className="text-[11px] leading-[16px] text-[#666666]">
              {masterVariants} variants · Existing workspace catalog, not a {connector.displayName} import count.
            </p>
          </div>

          <div className="border-t border-b border-[#EAEAEA] py-3 space-y-1">
            <span className="text-[12px] font-semibold leading-[17px] text-[#000000] block">
              Review mappings before publishing
            </span>
            <p className="text-[11px] leading-[16px] text-[#666666]">
              Confirm marketplace-specific fields and synchronization settings. Importing and publishing remain deliberate choices.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePrimaryAction}
            className="h-9 px-4 rounded-lg border border-[#666666] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors"
          >
            Use recommended setup
          </button>
        </div>
      </div>

      {/* ========================================================
          7. SAFEGUARDS AND CONNECTOR RESOURCES
         ======================================================== */}
      <div className="border-t border-[#EAEAEA] pt-6 space-y-6 w-full">
        <div className="flex flex-col lg:flex-row items-start gap-8 w-full">
          <div className="w-[300px] flex-none">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
              Your account stays protected
            </h2>
            <p className="text-[11px] leading-[16px] text-[#666666] mt-1">
              Connection safeguards to review during setup.
            </p>
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="space-y-2">
              <ShieldCheck className="w-[18px] h-[18px] text-[#666666]" />
              <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">
                Secure authorization
              </div>
            </div>

            <div className="space-y-2">
              <Lock className="w-[18px] h-[18px] text-[#666666]" />
              <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">
                Encrypted credentials
              </div>
            </div>

            <div className="space-y-2">
              <SlidersHorizontal className="w-[18px] h-[18px] text-[#666666]" />
              <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">
                Controlled access
              </div>
            </div>

            <div className="space-y-2">
              <History className="w-[18px] h-[18px] text-[#666666]" />
              <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">
                Connection audit trail
              </div>
            </div>
          </div>
        </div>

        {/* Connector resources */}
        <div className="border-t border-[#EAEAEA] pt-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-[11px] leading-[16px]">
          <div>
            <span className="text-[#666666] block">Connector version</span>
            <span className="text-[#000000] font-normal">Not provided</span>
          </div>
          <div>
            <span className="text-[#666666] block">Last capability update</span>
            <span className="text-[#000000] font-normal">Not provided</span>
          </div>
          <div>
            <span className="text-[#666666] block">Support ↗</span>
            <span className="text-[#000000] font-normal">Details during setup</span>
          </div>
          <div>
            <span className="text-[#666666] block">Documentation ↗</span>
            <span className="text-[#000000] font-normal">Details during setup</span>
          </div>
        </div>
      </div>

      {/* ========================================================
          8. PERSISTENT CONNECTOR ACTIONS (BOTTOM)
         ======================================================== */}
      <div className="border-t border-[#EAEAEA] py-6 flex items-center justify-between">
        <div>
          <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">
            {connector.displayName} · {isConnected ? "Connected" : isNeedsAttention ? "Needs attention" : "Available to connect"}
          </span>
          <div className="text-[10px] leading-[15px] text-[#666666]">
            Persistent actions · stays visible while exploring
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
            className="h-9 px-4 rounded-lg border border-[#666666] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
            className="h-9 px-4 rounded-lg border border-[#666666] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={planned || !canWrite}
            className="h-9 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors disabled:bg-[#F5F5F5] disabled:text-[#666666]"
          >
            {isConnected ? "Manage connection" : isNeedsAttention ? "Reconnect" : `Connect ${connector.displayName}`}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConnectConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        connectorName={connector.displayName}
        monthlyPrice={monthlyPrice}
        annualPrice={annualPrice}
        onConfirm={handleConfirmConnect}
      />
    </div>
  );
}
