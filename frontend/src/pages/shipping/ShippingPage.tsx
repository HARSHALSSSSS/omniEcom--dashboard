import { useState } from "react";
import {
  GitBranch,
  Plus,
  RefreshCw,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  X,
  Info,
  Edit2,
  Trash2,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useShippingOverview, useSyncShipping } from "@/hooks/useShipping";

// Types for tabs and views
type TabType = "overview" | "orders" | "methods" | "rules" | "tracking";

export default function ShippingPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // React Query hooks for live data & sync
  const { data: shippingData, isFetching: isQueryFetching } = useShippingOverview();
  const syncMutation = useSyncShipping();

  const [hasConnectedShipping, setHasConnectedShipping] = useState<boolean>(true);
  const [selectedMethodId, setSelectedMethodId] = useState<string>("flipkart");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [expandedException, setExpandedException] = useState<string | null>("no-method");

  // Drawers state
  const [activeDrawer, setActiveDrawer] = useState<
    "choose-shipping" | "add-provider" | "create-rule" | null
  >(null);

  // Fallbacks & dynamic data from React Query
  const pulse = shippingData?.pulse || {
    readyToShip: 42,
    readyToShipDiff: 8,
    readyToShipAction: "2 need a decision",
    shippingSelected: 36,
    shippingSelectedDiff: 6,
    shippingSelectedAction: "Preference confirmed",
    labelReady: 31,
    labelReadyDiff: 4,
    labelReadyAction: "1 label unavailable",
    dispatched: 18,
    dispatchedDiff: 3,
    dispatchedAction: "Dispatch recorded",
    inTransit: 126,
    inTransitDiff: 12,
    inTransitAction: "1 tracking issue",
  };

  const orders = shippingData?.orders || [];
  const trackingList = shippingData?.tracking || [];
  const exceptionsList = shippingData?.exceptions || [];

  // Drawer 1: Choose Shipping state
  const [selectedOrderForDrawer, setSelectedOrderForDrawer] = useState<{
    id: string;
    marketplace: string;
    destination: string;
    warehouse: string;
    product: string;
    sku: string;
    weight: string;
    orderValue: string;
    chosenMethod: "flipkart" | "seller";
  }>({
    id: "ORD-10482",
    marketplace: "Flipkart",
    destination: "Pune, Maharashtra",
    warehouse: "Mumbai",
    product: "Cotton cushion",
    sku: "CUS-014",
    weight: "0.65 kg",
    orderValue: "₹1,899 · illustrative",
    chosenMethod: "flipkart",
  });

  // Drawer 2: Choose Shipping Method / Add Provider state
  const [selectedProviderType, setSelectedProviderType] = useState<
    "marketplace" | "seller" | "third-party" | "configured-logistics"
  >("marketplace");

  // Drawer 3: Create / Edit Rule state
  const [ruleMarketplace, setRuleMarketplace] = useState<string>("Flipkart");
  const [ruleWarehouse, setRuleWarehouse] = useState<string>("Mumbai");
  const [ruleConditionField, setRuleConditionField] = useState<string>("Order value");
  const [ruleConditionOp, setRuleConditionOp] = useState<string>("Greater than");
  const [ruleConditionValue, setRuleConditionValue] = useState<string>("Configured threshold");
  const [rulePreferredMethod, setRulePreferredMethod] = useState<string>("Configured shipping method");
  const [additionalConditions, setAdditionalConditions] = useState<string[]>([]);

  const toggleSelectAllOrders = () => {
    if (selectedOrders.length === orders.length && orders.length > 0) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map((o) => o.id));
    }
  };

  const toggleOrderSelection = (id: string) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const triggerSync = () => {
    syncMutation.mutate();
  };

  return (
    <div className="w-full space-y-8 pb-32 text-[#0A0A0A] font-['Inter',sans-serif]">
      {/* Top Header & Context Actions */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#707070]">
            SHIPPING OPERATIONS
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000]">
            Shipping
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveDrawer("create-rule")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-normal text-[#000000] hover:bg-neutral-50 transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5 text-[#666666] stroke-[1.5]" />
              <span>Shipping Rules</span>
            </button>

            <button
              onClick={() => setActiveDrawer("add-provider")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-normal text-[#000000] hover:bg-neutral-50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#666666] stroke-[1.5]" />
              <span>Add Provider</span>
            </button>

            <button
              onClick={triggerSync}
              disabled={syncMutation.isPending || isQueryFetching}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black bg-black px-3 text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors shadow-sm disabled:opacity-75"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 text-white stroke-[1.5]",
                  (syncMutation.isPending || isQueryFetching) && "animate-spin"
                )}
              />
              <span>{syncMutation.isPending ? "Syncing..." : "Sync Shipping"}</span>
            </button>

            <button className="inline-flex h-8 w-9 items-center justify-center rounded-lg border border-[#EAEAEA] bg-white text-[12px] text-[#000000] hover:bg-neutral-50 transition-colors">
              <MoreHorizontal className="h-4 w-4 text-[#666666]" />
            </button>
          </div>
        </div>

        <p className="text-[13px] leading-[19px] text-[#666666]">
          Choose, configure and monitor the shipping method used to move every order.
        </p>

        {/* Operational Status area */}
        {syncMutation.isPending ? (
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-2 text-[11px] text-blue-900 animate-pulse">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-blue-600 animate-spin" />
              <span className="font-medium">Synchronizing shipping data…</span>
              <span className="text-blue-700">Orders: 184 · Tracking updates: processing</span>
            </div>
            <span className="text-[11px] font-mono text-blue-700">Shipping statuses: 176 / 184</span>
          </div>
        ) : syncMutation.isSuccess ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-[#F3FAF5] px-3.5 py-2 text-[11px] text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
              <span className="font-semibold text-black">Shipping sync complete</span>
              <span className="text-[#666666]">184 processed · 181 updated · 3 require attention</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#666666]">3 exceptions from this sync</span>
              <button
                onClick={() => syncMutation.reset()}
                className="text-[11px] font-medium text-emerald-700 underline hover:text-emerald-900"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] leading-[16px] text-[#666666]">
            <CheckCircle2 className="h-3 w-3 text-[#16A34A] stroke-[1.5]" />
            <span>4 connected channels · 2 shipping methods active · {exceptionsList.length || 7} orders need attention</span>
          </div>
        )}

        {/* Workspace Navigation Tabs */}
        <div className="mt-2 flex items-center justify-between border-b border-[#EAEAEA]">
          <div className="flex items-center gap-7">
            {[
              { id: "overview", label: "Overview" },
              { id: "orders", label: "Orders to Ship" },
              { id: "methods", label: "Shipping Methods" },
              { id: "rules", label: "Rules" },
              { id: "tracking", label: "Tracking" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={cn(
                  "relative pb-2.5 text-[12px] transition-colors",
                  activeTab === tab.id
                    ? "font-semibold text-black after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-black"
                    : "font-normal text-[#666666] hover:text-black"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Development / User State Preview Toggle */}
          <div className="pb-2 text-[11px] text-[#666666] flex items-center gap-2">
            <span className="text-[10px] text-[#888888]">State:</span>
            <button
              onClick={() => setHasConnectedShipping(!hasConnectedShipping)}
              className="text-[10px] font-medium px-2 py-0.5 rounded border border-[#EAEAEA] bg-white text-black hover:bg-neutral-50 shadow-2xs"
            >
              {hasConnectedShipping ? "Simulate Empty State" : "Show Configured Workspace"}
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CENTERED EMPTY STATE (Displayed when no shipping methods are connected)
          ========================================================================= */}
      {!hasConnectedShipping ? (
        <div className="flex min-h-[500px] flex-col items-center justify-center py-12">
          <div className="w-full max-w-[900px] rounded-xl border border-[#EAEAEA] bg-[#FAF9F7] p-8 sm:p-10 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              {/* Left Column: Heading, description, CTA */}
              <div className="md:col-span-7 space-y-3">
                <h2 className="text-[22px] font-semibold tracking-tight text-black">
                  Shipping is ready when you are.
                </h2>
                <p className="text-[13px] text-[#666666] leading-relaxed max-w-[440px]">
                  Connect a marketplace or configure a shipping method to start processing orders.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    onClick={() => {
                      setHasConnectedShipping(true);
                      setActiveTab("methods");
                    }}
                    className="h-9 rounded-lg bg-black px-4 text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors shadow-sm"
                  >
                    Configure Shipping
                  </button>
                  <button
                    onClick={() => alert("Navigating to Connected Marketplaces...")}
                    className="h-9 rounded-lg border border-[#EAEAEA] bg-white px-4 text-[12px] font-medium text-black hover:bg-neutral-50 transition-colors shadow-2xs"
                  >
                    View Connected Marketplaces
                  </button>
                </div>
              </div>

              {/* Right Column: Guided steps checklist */}
              <div className="md:col-span-5 border-t md:border-t-0 md:border-l border-[#EAEAEA] pt-6 md:pt-0 md:pl-8 space-y-3">
                <span className="text-[12px] font-semibold text-black">Start with what you need</span>
                <ul className="space-y-2 text-[12px] text-[#666666]">
                  <li className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EAEAEA] text-[10px] font-semibold text-black">
                      1
                    </span>
                    <span>Connect your marketplace</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EAEAEA] text-[10px] font-semibold text-black">
                      2
                    </span>
                    <span>Configure one shipping method</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EAEAEA] text-[10px] font-semibold text-black">
                      3
                    </span>
                    <span>Review and confirm your first order</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* =========================================================================
          SECTION 1: OVERVIEW (MASTER VIEW)
          ========================================================================= */}
      {activeTab === "overview" && (
        <section className="space-y-7">
          {/* Shipping Pulse Rail */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-[#000000]">Shipping Pulse</h2>
                <p className="text-[11px] text-[#666666]">
                  Order → Shipping Decision → Carrier / Method → Label → Dispatch → Tracking
                </p>
              </div>
              <span className="text-[10px] text-[#666666]">Illustrative operational snapshot</span>
            </div>

            {/* Pulse Rail Stages */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5 border-y border-[#EAEAEA] py-3.5">
              {/* Stage 1 */}
              <div className="flex items-center justify-between pr-2 border-r border-[#EAEAEA] last:border-r-0">
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[20px] font-semibold text-black">{pulse.readyToShip}</span>
                    <span className="text-[12px] font-semibold text-black">Ready to Ship</span>
                  </div>
                  <div className="text-[10px] text-[#666666]">+{pulse.readyToShipDiff} since last sync</div>
                  <div className="text-[10px] font-medium text-[#D97706]">{pulse.readyToShipAction}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#BDBDBD] mr-1 hidden sm:block" />
              </div>

              {/* Stage 2 */}
              <div className="flex items-center justify-between pr-2 border-r border-[#EAEAEA] last:border-r-0">
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[20px] font-semibold text-black">{pulse.shippingSelected}</span>
                    <span className="text-[12px] font-semibold text-black">Shipping Selected</span>
                  </div>
                  <div className="text-[10px] text-[#666666]">+{pulse.shippingSelectedDiff} since last sync</div>
                  <div className="text-[10px] text-[#666666]">{pulse.shippingSelectedAction}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#BDBDBD] mr-1 hidden sm:block" />
              </div>

              {/* Stage 3 */}
              <div className="flex items-center justify-between pr-2 border-r border-[#EAEAEA] last:border-r-0">
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[20px] font-semibold text-black">{pulse.labelReady}</span>
                    <span className="text-[12px] font-semibold text-black">Label Ready</span>
                  </div>
                  <div className="text-[10px] text-[#666666]">+{pulse.labelReadyDiff} since last sync</div>
                  <div className="text-[10px] font-medium text-[#D97706]">{pulse.labelReadyAction}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#BDBDBD] mr-1 hidden sm:block" />
              </div>

              {/* Stage 4 */}
              <div className="flex items-center justify-between pr-2 border-r border-[#EAEAEA] last:border-r-0">
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[20px] font-semibold text-black">{pulse.dispatched}</span>
                    <span className="text-[12px] font-semibold text-black">Dispatched</span>
                  </div>
                  <div className="text-[10px] text-[#666666]">+{pulse.dispatchedDiff} since last sync</div>
                  <div className="text-[10px] text-[#666666]">{pulse.dispatchedAction}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#BDBDBD] mr-1 hidden sm:block" />
              </div>

              {/* Stage 5 */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[20px] font-semibold text-black">{pulse.inTransit}</span>
                    <span className="text-[12px] font-semibold text-black">In Transit</span>
                  </div>
                  <div className="text-[10px] text-[#666666]">+{pulse.inTransitDiff} since last sync</div>
                  <div className="text-[10px] font-medium text-[#D97706]">{pulse.inTransitAction}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Decision Field */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-black">Shipping Decision Field</h2>
                <p className="text-[11px] text-[#666666]">
                  Available methods are evaluated against your preference. A recommendation is not a confirmed selection.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("rules")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-normal text-black hover:bg-neutral-50 transition-colors"
              >
                Review decisions →
              </button>
            </div>

            {/* Decision routes card */}
            <div className="rounded-[10px] border border-[#EAEAEA] bg-white overflow-hidden text-[11px]">
              {/* Headings */}
              <div className="grid grid-cols-12 items-center bg-[#FAF9F7] px-4 py-2.5 text-[10px] font-medium text-[#666666] border-b border-[#EAEAEA]">
                <div className="col-span-2">ORDER</div>
                <div className="col-span-2">MARKETPLACE</div>
                <div className="col-span-3">AVAILABLE METHODS</div>
                <div className="col-span-2">MERCHANT PREFERENCE</div>
                <div className="col-span-3">SELECTED SHIPPING</div>
              </div>

              {/* Path 1 */}
              <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-[#EAEAEA] hover:bg-neutral-50/50 transition-colors">
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">ORD-10482</span>
                  <p className="text-[11px] text-[#666666]">1 item · 0.65 kg</p>
                </div>
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">Flipkart</span>
                  <p className="text-[11px] text-[#666666]">Mumbai</p>
                </div>
                <div className="col-span-3 space-y-0.5">
                  <span className="text-[11px] text-black">Flipkart Shipping / Seller Shipping</span>
                  <p className="text-[10px] text-[#666666]">Illustrative availability</p>
                </div>
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">Flipkart Shipping</span>
                  <p className="text-[11px] text-[#666666]">Default for Flipkart orders</p>
                </div>
                <div className="col-span-3">
                  <div className="rounded-lg bg-[#F3FAF5] p-2 flex flex-col gap-0.5 border border-emerald-100">
                    <div className="flex items-center gap-1.5 text-[#16A34A] text-[11px] font-medium">
                      <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                      <span>Flipkart Shipping ✓</span>
                    </div>
                    <span className="text-[11px] text-[#666666]">Selection confirmed</span>
                  </div>
                </div>
              </div>

              {/* Path 2 */}
              <div className="grid grid-cols-12 items-center px-4 py-3 hover:bg-neutral-50/50 transition-colors">
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">ORD-10491</span>
                  <p className="text-[11px] text-[#666666]">2 items · 1.20 kg</p>
                </div>
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">Flipkart</span>
                  <p className="text-[11px] text-[#666666]">Mumbai</p>
                </div>
                <div className="col-span-3 space-y-0.5">
                  <span className="text-[11px] text-black">Flipkart Shipping / Seller Shipping</span>
                  <p className="text-[10px] text-[#666666]">Illustrative availability</p>
                </div>
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">Seller Shipping</span>
                  <p className="text-[11px] text-[#666666]">Provider configured</p>
                </div>
                <div className="col-span-3">
                  <div className="rounded-lg bg-[#F3FAF5] p-2 flex flex-col gap-0.5 border border-emerald-100">
                    <div className="flex items-center gap-1.5 text-[#16A34A] text-[11px] font-medium">
                      <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                      <span>Seller Shipping ✓</span>
                    </div>
                    <span className="text-[11px] text-[#666666]">Manual override available</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit note */}
            <div className="flex items-center gap-2 px-1 text-[11px] text-[#666666]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#666666] shrink-0 stroke-[1.5]" />
              <span>
                Preference → selection → confirmation is visible for every order. Manual override remains available where supported.
              </span>
            </div>
          </div>

          {/* Availability comparison Table */}
          <div className="space-y-2.5">
            <div>
              <h2 className="text-[16px] font-semibold text-black">Availability comparison</h2>
              <p className="text-[11px] text-[#666666]">
                Verify connector capabilities before enabling operational actions.
              </p>
            </div>

            <div className="rounded-lg border border-[#EAEAEA] bg-white overflow-hidden text-[11px]">
              <div className="grid grid-cols-12 items-center bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666] border-b border-[#EAEAEA]">
                <div className="col-span-2">Marketplace</div>
                <div className="col-span-2">Method</div>
                <div className="col-span-3">Provider</div>
                <div className="col-span-3">Availability</div>
                <div className="col-span-1">Default</div>
                <div className="col-span-1">Override</div>
              </div>

              {[
                {
                  mkt: "Flipkart",
                  method: "Marketplace Shipping",
                  provider: "Marketplace-managed",
                  avail: "Requires configuration / capability verification",
                  availColor: "text-[#D97706]",
                  def: "Preferred",
                  over: "Where supported",
                },
                {
                  mkt: "Flipkart",
                  method: "Seller Shipping",
                  provider: "Merchant-managed",
                  avail: "Requires configuration / capability verification",
                  availColor: "text-[#D97706]",
                  def: "Order-specific",
                  over: "Where supported",
                },
                {
                  mkt: "Connected channel",
                  method: "Third-party shipping",
                  provider: "Configured third-party logistics provider",
                  avail: "Requires configuration",
                  availColor: "text-[#D97706]",
                  def: "Not set",
                  over: "Verify capability",
                },
                {
                  mkt: "Unverified connector",
                  method: "Label generation",
                  provider: "No verified provider",
                  avail: "Not supported by connector",
                  availColor: "text-black",
                  def: "Unavailable",
                  over: "Unavailable",
                },
              ].map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-center px-3 py-2.5 border-b border-[#EAEAEA] last:border-b-0 hover:bg-neutral-50/50"
                >
                  <div className="col-span-2 text-black">{row.mkt}</div>
                  <div className="col-span-2 text-black">{row.method}</div>
                  <div className="col-span-3 text-black">{row.provider}</div>
                  <div className={cn("col-span-3", row.availColor)}>{row.avail}</div>
                  <div className="col-span-1 text-black">{row.def}</div>
                  <div className="col-span-1 text-black">{row.over}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Attention band */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border-y border-[#EAEAEA] bg-[#FFFBF5] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-5 w-[3px] rounded-full bg-[#D97706]" />
              <span className="text-[12px] font-semibold text-black">7 orders need shipping attention</span>
            </div>
            <div className="text-[11px] text-[#666666]">
              2 undecided · 1 label · 1 tracking · 1 sync · 1 SLA risk · 1 capability
            </div>
            <button
              onClick={() => {
                const el = document.getElementById("exception-matrix-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-[11px] font-semibold text-[#D97706] hover:underline text-left sm:text-right"
            >
              View exceptions →
            </button>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 2: ORDERS TO SHIP
          ========================================================================= */}
      {(activeTab === "overview" || activeTab === "orders") && (
        <section className={cn("space-y-3.5", activeTab === "overview" ? "pt-4 border-t border-[#EAEAEA]" : "pt-1")}>
          {activeTab === "overview" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-[#666666]">ALTERNATE VIEW</span>
              <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
              <span className="text-[11px] font-semibold text-black">Orders to Ship</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-black">Orders to Ship</h2>
              <p className="text-[11px] text-[#666666]">
                Illustrative order values and weights · no shipping prices or SLA promises
              </p>
            </div>
            <span className="text-[11px] text-[#666666]">42 ready to ship</span>
          </div>

          {/* Operational filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-[500px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#666666] stroke-[1.5]" />
              <input
                type="text"
                placeholder="Search order / SKU"
                className="h-8 w-full rounded-lg border border-[#EAEAEA] bg-white pl-8 pr-3 text-[12px] text-black placeholder:text-[#666666] focus:border-black focus:outline-none"
              />
            </div>

            {["Marketplace", "Warehouse", "Shipping method", "SLA", "Status"].map((f) => (
              <button
                key={f}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-2.5 text-[12px] text-[#666666] hover:bg-neutral-50 transition-colors"
              >
                <span>{f}</span>
                <ChevronDown className="h-3 w-3 text-[#666666]" />
              </button>
            ))}
          </div>

          {/* Bulk action rail */}
          <div className="flex flex-wrap items-center gap-4 border-t border-[#EAEAEA] pt-2 text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedOrders.length === 5}
                onChange={toggleSelectAllOrders}
                className="h-3 w-3 rounded border-[#BDBDBD] accent-black"
              />
              <span className="text-black">Select all</span>
            </label>

            <button
              onClick={() => {
                if (selectedOrders.length > 0) {
                  const targetId = selectedOrders[0];
                  setSelectedOrderForDrawer({
                    id: selectedOrders.length === 1 ? targetId : `${selectedOrders.length} orders selected (${targetId}...)`,
                    marketplace: "Flipkart / Multi-channel",
                    destination: "Pune, Maharashtra",
                    warehouse: "Mumbai",
                    product: "Cotton cushion / Multi-item",
                    sku: "CUS-014",
                    weight: "0.65 kg (avg)",
                    orderValue: "₹1,899 · illustrative",
                    chosenMethod: "flipkart",
                  });
                } else {
                  setSelectedOrderForDrawer({
                    id: "ORD-10482",
                    marketplace: "Flipkart",
                    destination: "Pune, Maharashtra",
                    warehouse: "Mumbai",
                    product: "Cotton cushion",
                    sku: "CUS-014",
                    weight: "0.65 kg",
                    orderValue: "₹1,899 · illustrative",
                    chosenMethod: "flipkart",
                  });
                }
                setActiveDrawer("choose-shipping");
              }}
              className="font-semibold text-black hover:underline cursor-pointer"
            >
              Assign shipping method
            </button>

            <button
              disabled={selectedOrders.length === 0}
              onClick={() => alert(`Generating labels for ${selectedOrders.length} orders where supported...`)}
              className="font-semibold text-black disabled:opacity-40 disabled:cursor-not-allowed hover:underline"
            >
              Generate labels where supported
            </button>

            <button
              disabled={selectedOrders.length === 0}
              onClick={() => alert(`Recalculating shipping options for ${selectedOrders.length} orders...`)}
              className="text-black disabled:opacity-40 disabled:cursor-not-allowed hover:underline"
            >
              Recalculate shipping option
            </button>

            <button
              onClick={() => alert("Exporting orders to ship CSV...")}
              className="text-black hover:underline ml-auto"
            >
              Export
            </button>
          </div>

          {/* Operational table */}
          <div className="rounded-lg border border-[#EAEAEA] bg-white overflow-x-auto text-[11px]">
            <table className="w-full text-left min-w-[1000px]">
              <thead className="bg-[#F5F5F5] border-y border-[#EAEAEA] text-[10px] font-normal text-[#666666]">
                <tr>
                  <th className="py-2.5 pl-3 w-8"></th>
                  <th className="py-2.5 px-2">Order</th>
                  <th className="py-2.5 px-2">Marketplace</th>
                  <th className="py-2.5 px-2">Warehouse</th>
                  <th className="py-2.5 px-2">Destination</th>
                  <th className="py-2.5 px-2">Order Value</th>
                  <th className="py-2.5 px-2">Weight</th>
                  <th className="py-2.5 px-2">Available Shipping</th>
                  <th className="py-2.5 px-2">Selected Method</th>
                  <th className="py-2.5 px-2">SLA</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 pr-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {orders.map((ord) => {
                  const isSelected = selectedOrders.includes(ord.id);
                  return (
                    <tr key={ord.id} className="hover:bg-neutral-50/50">
                      <td className="py-2.5 pl-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOrderSelection(ord.id)}
                          className="h-3 w-3 rounded border-[#BDBDBD] accent-black"
                        />
                      </td>
                      <td className="py-2.5 px-2 font-semibold text-black">{ord.orderNumber}</td>
                      <td className="py-2.5 px-2 text-black">{ord.marketplace}</td>
                      <td className="py-2.5 px-2 text-black">{ord.warehouse}</td>
                      <td className="py-2.5 px-2 text-black">{ord.destination}</td>
                      <td className="py-2.5 px-2 text-black">{ord.orderValue}</td>
                      <td className="py-2.5 px-2 text-black">{ord.weight}</td>
                      <td className="py-2.5 px-2 text-black">{ord.availableMethodsSummary}</td>
                      <td className="py-2.5 px-2 text-black">{ord.selectedShipping}</td>
                      <td className="py-2.5 px-2 text-[#666666]">
                        {ord.slaText}
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={cn(
                            "font-medium",
                            ord.selectedShippingStatus === "Needs Shipping Decision" && "text-[#D97706]",
                            ord.selectedShippingStatus === "Selection confirmed" && "text-[#16A34A]",
                            ord.selectedShippingStatus === "Manual override available" && "text-[#16A34A]",
                            ord.selectedShippingStatus === "Label ready to print" && "text-[#16A34A]",
                            ord.selectedShippingStatus === "AWB assigned" && "text-[#2563EB]",
                            ord.selectedShippingStatus === "Shipping Exception" && "text-[#DC2626]"
                          )}
                        >
                          {ord.selectedShippingStatus}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedOrderForDrawer({
                              id: ord.id,
                              marketplace: ord.marketplace,
                              destination: ord.destination,
                              warehouse: ord.warehouse,
                              product: ord.product,
                              sku: ord.sku,
                              weight: ord.weight,
                              orderValue: ord.orderValue,
                              chosenMethod: ord.shippingMethodType === "marketplace" ? "flipkart" : "seller",
                            });
                            setActiveDrawer("choose-shipping");
                          }}
                          className={cn(
                            "hover:underline font-medium",
                            ord.actionText.includes("Resolve") ? "text-[#DC2626]" : "text-[#2563EB]"
                          )}
                        >
                          {ord.actionText}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="text-[10px] text-[#666666]">
              Showing 5 illustrative orders · actions require capability verification
            </span>
            <div className="flex items-center gap-2">
              <button className="px-2 py-0.5 rounded border border-[#EAEAEA] text-[#666666] hover:bg-neutral-50">‹</button>
              <span className="font-semibold text-black">1</span>
              <button className="px-2 py-0.5 rounded border border-[#EAEAEA] text-[#666666] hover:bg-neutral-50">›</button>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 3: SHIPPING METHODS (ALTERNATE VIEW)
          ========================================================================= */}
      {(activeTab === "overview" || activeTab === "methods") && (
        <section className="space-y-4 pt-4 border-t border-[#EAEAEA]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#666666]">ALTERNATE VIEW</span>
            <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
            <span className="text-[11px] font-semibold text-black">Shipping Methods</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-black">Shipping Methods</h2>
              <p className="text-[11px] text-[#666666]">
                Configured methods and connector capabilities, without inferred support.
              </p>
            </div>
            <button
              onClick={() => setActiveDrawer("add-provider")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black hover:bg-neutral-50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#666666] stroke-[1.5]" />
              <span>Add Provider</span>
            </button>
          </div>

          {/* Master-Detail Shipping Methods View */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left list: Connected Shipping Methods */}
            <div className="md:col-span-4 border-r border-[#EAEAEA] pr-4 space-y-2">
              <h3 className="text-[12px] font-semibold text-black mb-2">
                Connected Shipping Methods
              </h3>

              {/* Flipkart Shipping */}
              <div
                onClick={() => setSelectedMethodId("flipkart")}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer transition-colors space-y-1",
                  selectedMethodId === "flipkart"
                    ? "bg-[#F5F5F5] border-black border-l-4"
                    : "bg-white border-[#EAEAEA] hover:bg-neutral-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-black">Flipkart Shipping</span>
                  <ChevronRight className="h-3.5 w-3.5 text-black" />
                </div>
                <p className="text-[11px] text-[#666666]">Marketplace shipping · Flipkart</p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#16A34A] pt-0.5">
                  <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                  <span>Configured · active</span>
                </div>
              </div>

              {/* Seller Shipping */}
              <div
                onClick={() => setSelectedMethodId("seller")}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer transition-colors space-y-1",
                  selectedMethodId === "seller"
                    ? "bg-[#F5F5F5] border-black border-l-4"
                    : "bg-white border-[#EAEAEA] hover:bg-neutral-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-black">Seller Shipping</span>
                  {selectedMethodId === "seller" && <ChevronRight className="h-3.5 w-3.5 text-black" />}
                </div>
                <p className="text-[11px] text-[#666666]">Merchant managed · connected channels</p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#16A34A] pt-0.5">
                  <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                  <span>Configured · active</span>
                </div>
              </div>

              {/* Third-party provider */}
              <div
                onClick={() => setSelectedMethodId("thirdparty")}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer transition-colors space-y-1",
                  selectedMethodId === "thirdparty"
                    ? "bg-[#F5F5F5] border-black border-l-4"
                    : "bg-white border-[#EAEAEA] hover:bg-neutral-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-black">Third-party provider</span>
                  {selectedMethodId === "thirdparty" && <ChevronRight className="h-3.5 w-3.5 text-black" />}
                </div>
                <p className="text-[11px] text-[#666666]">No verified connector selected</p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#D97706] pt-0.5">
                  <AlertTriangle className="h-3 w-3 stroke-[2]" />
                  <span>Requires configuration</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-[#666666]">
                2 active methods · illustrative configuration
              </div>
            </div>

            {/* Right: Selected Method Details */}
            <div className="md:col-span-8 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-semibold text-black">
                  {selectedMethodId === "flipkart"
                    ? "Flipkart Shipping"
                    : selectedMethodId === "seller"
                    ? "Seller Shipping"
                    : "Third-party Logistics Provider"}
                </span>
                <div className="flex items-center gap-1 text-[11px] text-[#16A34A] font-medium">
                  <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                  <span>Configured</span>
                </div>
              </div>

              {/* Details table */}
              <div className="rounded-lg border border-[#EAEAEA] bg-white overflow-hidden text-[11px]">
                <div className="grid grid-cols-12 bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666] border-b border-[#EAEAEA]">
                  <div className="col-span-4">Property</div>
                  <div className="col-span-8">Configuration</div>
                </div>

                <div className="grid grid-cols-12 px-3 py-2.5 border-b border-[#EAEAEA]">
                  <div className="col-span-4 text-black">Method name</div>
                  <div className="col-span-8 text-black">
                    {selectedMethodId === "flipkart"
                      ? "Flipkart Shipping · Marketplace Shipping"
                      : selectedMethodId === "seller"
                      ? "Self-Fulfilled Express (Delhivery/Blue Dart)"
                      : "Aggregated 3PL Partner"}
                  </div>
                </div>

                <div className="grid grid-cols-12 px-3 py-2.5 border-b border-[#EAEAEA]">
                  <div className="col-span-4 text-black">Connected marketplace/provider</div>
                  <div className="col-span-8 text-black">
                    {selectedMethodId === "flipkart"
                      ? "Flipkart · marketplace-managed"
                      : "Direct API Integration"}
                  </div>
                </div>

                <div className="grid grid-cols-12 px-3 py-2.5 border-b border-[#EAEAEA]">
                  <div className="col-span-4 text-black">Supported order types</div>
                  <div className="col-span-8 text-[#D97706]">
                    Requires configuration / capability verification
                  </div>
                </div>

                <div className="grid grid-cols-12 px-3 py-2.5 border-b border-[#EAEAEA]">
                  <div className="col-span-4 text-black">Status / last successful sync</div>
                  <div className="col-span-8 text-black">Configured · 08 Oct, 12:40 (illustrative)</div>
                </div>

                <div className="grid grid-cols-12 px-3 py-2.5">
                  <div className="col-span-4 text-black">Default status</div>
                  <div className="col-span-8 text-black">
                    Preferred for Flipkart orders · illustrative
                  </div>
                </div>
              </div>

              {/* Action buttons for method */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px]">
                <button className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 font-normal text-black hover:bg-neutral-50 transition-colors">
                  Set as default
                </button>
                <button className="h-8 rounded-lg border border-black bg-black px-3 font-semibold text-white hover:bg-neutral-800 transition-colors">
                  Configure
                </button>
                <button className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 font-normal text-black hover:bg-neutral-50 transition-colors">
                  Disable
                </button>
                <button className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 font-normal text-black hover:bg-neutral-50 transition-colors">
                  View capability
                </button>
              </div>
            </div>
          </div>

          {/* Capability Matrix Table */}
          <div className="pt-4 space-y-2">
            <h3 className="text-[12px] font-semibold text-black">Capability matrix</h3>
            <div className="rounded-lg border border-[#EAEAEA] bg-white overflow-hidden text-[11px]">
              <div className="grid grid-cols-12 bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666] border-b border-[#EAEAEA]">
                <div className="col-span-3">Method</div>
                <div className="col-span-2">Label support</div>
                <div className="col-span-2">Tracking support</div>
                <div className="col-span-2">Dispatch update</div>
                <div className="col-span-3">Status synchronization</div>
              </div>

              {[
                { name: "Marketplace Shipping", s1: "Requires configuration", s2: "Requires configuration", s3: "Requires configuration", s4: "Requires configuration" },
                { name: "Seller Shipping", s1: "Requires configuration", s2: "Requires configuration", s3: "Requires configuration", s4: "Requires configuration" },
                { name: "Unverified connector", s1: "Not supported by connector", s2: "Not supported by connector", s3: "Not supported by connector", s4: "Not supported by connector" },
              ].map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 px-3 py-2.5 border-b border-[#EAEAEA] last:border-b-0 text-black hover:bg-neutral-50/50"
                >
                  <div className="col-span-3 font-medium">{row.name}</div>
                  <div className="col-span-2 text-[#666666]">{row.s1}</div>
                  <div className="col-span-2 text-[#666666]">{row.s2}</div>
                  <div className="col-span-2 text-[#666666]">{row.s3}</div>
                  <div className="col-span-3 text-[#666666]">{row.s4}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 4: SHIPPING RULES (ALTERNATE VIEW)
          ========================================================================= */}
      {(activeTab === "overview" || activeTab === "rules") && (
        <section className="space-y-4 pt-4 border-t border-[#EAEAEA]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#666666]">ALTERNATE VIEW</span>
            <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
            <span className="text-[11px] font-semibold text-black">Rules</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-black">Shipping Rules</h2>
              <p className="text-[11px] text-[#666666]">
                Control which shipping method is preferred for different operating conditions.
              </p>
            </div>
            <button
              onClick={() => setActiveDrawer("create-rule")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black bg-black px-3 text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 text-white stroke-[1.5]" />
              <span>Create Shipping Rule</span>
            </button>
          </div>

          {/* Selected rule and metadata container */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 border-y border-[#EAEAEA] py-4 text-[11px]">
            {/* Logic conditions */}
            <div className="md:col-span-7 space-y-2">
              <span className="text-[12px] font-semibold text-black">Flipkart · Mumbai preference</span>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-12 items-center justify-center rounded bg-[#F5F5F5] text-[10px] font-semibold text-[#666666]">
                    IF
                  </span>
                  <span className="text-black text-[12px]">Marketplace = Flipkart</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-12 items-center justify-center rounded bg-[#F5F5F5] text-[10px] font-semibold text-[#666666]">
                    AND
                  </span>
                  <span className="text-black text-[12px]">Warehouse = Mumbai</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-12 items-center justify-center rounded bg-[#F5F5F5] text-[10px] font-semibold text-[#666666]">
                    AND
                  </span>
                  <span className="text-black text-[12px]">Order Value &gt; configured threshold</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-12 items-center justify-center rounded bg-black text-[10px] font-semibold text-white">
                    THEN
                  </span>
                  <span className="text-black text-[12px] font-semibold">
                    Prefer = configured shipping method
                  </span>
                </div>
              </div>
            </div>

            {/* Rule metadata & actions */}
            <div className="md:col-span-5 space-y-2 md:border-l md:border-[#EAEAEA] md:pl-6">
              <div className="flex items-center gap-1.5 text-[11px] text-[#16A34A] font-medium">
                <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                <span>Enabled</span>
              </div>
              <div className="text-[12px] font-semibold text-black">Priority 1 · 18 orders affected</div>
              <div className="text-[11px] text-[#666666]">Last updated 08 Oct, 12:20</div>
              <p className="text-[10px] text-[#666666] leading-relaxed">
                Metadata and impact are illustrative, not actual merchant facts.
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black hover:bg-neutral-50 transition-colors">
                  Edit
                </button>
                <button className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black hover:bg-neutral-50 transition-colors">
                  Duplicate
                </button>
                <button className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black hover:bg-neutral-50 transition-colors">
                  Disable
                </button>
              </div>
            </div>
          </div>

          {/* Rules Table */}
          <div className="rounded-lg border border-[#EAEAEA] bg-white overflow-hidden text-[11px]">
            <div className="grid grid-cols-12 bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666] border-b border-[#EAEAEA]">
              <div className="col-span-4">Rule</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Priority</div>
              <div className="col-span-2">Last updated</div>
              <div className="col-span-2">Orders affected</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            <div className="grid grid-cols-12 items-center px-3 py-2.5 text-black hover:bg-neutral-50/50">
              <div className="col-span-4 font-medium">Fallback · Seller Shipping preference</div>
              <div className="col-span-1 text-[#666666]">Disabled</div>
              <div className="col-span-1">2</div>
              <div className="col-span-2 text-[#666666]">07 Oct, 16:10</div>
              <div className="col-span-2 text-[#666666]">0 · illustrative</div>
              <div className="col-span-2 text-right space-x-2">
                <button className="hover:underline text-black">Edit</button>
                <span>·</span>
                <button className="hover:underline text-black">Duplicate</button>
                <span>·</span>
                <button className="hover:underline text-emerald-700 font-medium">Enable</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 5: TRACKING (ALTERNATE VIEW)
          ========================================================================= */}
      {(activeTab === "overview" || activeTab === "tracking") && (
        <section className="space-y-4 pt-6 border-t border-[#EAEAEA]">
          {/* Eyebrow / State Label */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="font-semibold uppercase tracking-wider text-[#666666]">ALTERNATE VIEW</span>
            <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
            <span className="font-semibold text-black text-[11px]">Tracking</span>
          </div>

          {/* Section Heading & Action */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-black">Tracking</h2>
              <p className="text-[11px] text-[#666666]">
                Illustrative tracking records · connector support must be verified
              </p>
            </div>
            <button
              onClick={() => alert("Syncing tracking events across carriers...")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-black hover:bg-neutral-50 transition-colors shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#666666] stroke-[1.75]" />
              <span>Sync Tracking</span>
            </button>
          </div>

          {/* Tracking Lifecycle Rail */}
          <div className="flex items-center justify-between border-y border-[#EAEAEA] py-3.5 px-1 text-[12px]">
            {/* Stage 1: Dispatched */}
            <div className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-[#2563EB]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              </span>
              <span className="font-semibold text-black">Dispatched</span>
            </div>

            <div className="flex-1 mx-6 flex items-center justify-center">
              <div className="h-[1px] w-full bg-[#EAEAEA]" />
              <ArrowRight className="h-3.5 w-3.5 text-[#666666] ml-4 shrink-0 stroke-[1.5]" />
            </div>

            {/* Stage 2: In Transit */}
            <div className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-[#2563EB]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              </span>
              <span className="font-semibold text-black">In Transit</span>
            </div>

            <div className="flex-1 mx-6 flex items-center justify-center">
              <div className="h-[1px] w-full bg-[#EAEAEA]" />
              <ArrowRight className="h-3.5 w-3.5 text-[#666666] ml-4 shrink-0 stroke-[1.5]" />
            </div>

            {/* Stage 3: Delivered */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#16A34A] stroke-[2]" />
              <span className="font-semibold text-black">Delivered</span>
            </div>
          </div>

          {/* Tracking Table */}
          <div className="rounded-lg border border-[#EAEAEA] bg-white overflow-x-auto text-[11px]">
            <table className="w-full text-left min-w-[950px] border-collapse">
              <thead className="bg-[#F5F5F5] border-y border-[#EAEAEA] text-[10px] font-normal text-[#666666]">
                <tr>
                  <th className="py-2.5 px-3 font-normal">Order</th>
                  <th className="py-2.5 px-2 font-normal">Marketplace</th>
                  <th className="py-2.5 px-2 font-normal">Shipping Method</th>
                  <th className="py-2.5 px-2 font-normal">Tracking ID</th>
                  <th className="py-2.5 px-2 font-normal">Dispatch Date</th>
                  <th className="py-2.5 px-2 font-normal">Current Status</th>
                  <th className="py-2.5 px-2 font-normal">Last Update</th>
                  <th className="py-2.5 pr-3 text-right font-normal">Attention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {trackingList.map((trk) => (
                  <tr key={trk.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-black">{trk.orderNumber}</td>
                    <td className="py-2.5 px-2 text-black">{trk.carrier}</td>
                    <td className="py-2.5 px-2 text-black">{trk.status}</td>
                    <td className="py-2.5 px-2 text-black font-normal">{trk.awbNumber}</td>
                    <td className="py-2.5 px-2 text-black">{trk.lastCheckpoint}</td>
                    <td className="py-2.5 px-2 font-normal">
                      <span
                        className={cn(
                          trk.status === "In Transit" && "text-[#2563EB]",
                          trk.status === "Out for Delivery" && "text-[#D97706]",
                          trk.status === "Delivered" && "text-[#16A34A]",
                          trk.status === "Sync Failed" && "text-[#DC2626]"
                        )}
                      >
                        {trk.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-black">{trk.lastUpdated}</td>
                    <td className="py-2.5 pr-3 text-right text-black font-normal">
                      {trk.status === "Sync Failed" ? (
                        <button
                          onClick={() => triggerSync()}
                          className="text-[#DC2626] font-medium hover:underline"
                        >
                          Retry required
                        </button>
                      ) : (
                        <span>{trk.estimatedDelivery}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tracking Attention Card */}
          <div className="relative rounded-lg border-l-4 border-l-[#DC2626] bg-[#FFF8F8] p-3.5 text-[11px] space-y-2.5 shadow-sm border border-neutral-200/40">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#DC2626] text-[#DC2626] text-[9px] font-bold">
                  !
                </span>
                <span className="font-semibold text-black text-[12px]">
                  Tracking sync needs attention
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#DC2626]">
                <span className="flex h-3 w-3 items-center justify-center rounded-full border border-[#DC2626] text-[8px]">
                  ✕
                </span>
                <span>ORD-10474 · Sync failed</span>
              </div>
            </div>

            {/* Three columns breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-0.5">
              {/* Col 1: What failed? */}
              <div className="md:col-span-4 space-y-0.5">
                <span className="font-semibold text-black text-[11px]">What failed?</span>
                <p className="text-[#666666] text-[11px] leading-relaxed">
                  The latest tracking status was not received.
                </p>
                <p className="text-[#666666] text-[10px]">
                  Failed 08 Oct at 12:32 · ORD-10474
                </p>
              </div>

              {/* Col 2: Possible reason */}
              <div className="md:col-span-4 space-y-0.5">
                <span className="font-semibold text-black text-[11px]">Possible reason</span>
                <p className="text-[#666666] text-[11px] leading-relaxed">
                  The connector may have timed out or may need its tracking capability verified.
                </p>
              </div>

              {/* Col 3: Action */}
              <div className="md:col-span-4 space-y-1.5">
                <p className="text-[#666666] text-[11px] leading-relaxed">
                  Verify the connector configuration, then retry the tracking update.
                </p>
                <div>
                  <button
                    onClick={() => alert("Retrying tracking update for ORD-10474...")}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[11px] font-medium text-black hover:bg-neutral-50 transition-colors shadow-sm"
                  >
                    <RefreshCw className="h-3 w-3 text-[#666666] stroke-[1.75]" />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 6: CONTEXTUAL STATE — SHIPPING EXCEPTION MATRIX
          ========================================================================= */}
      {activeTab === "overview" && (
        <section id="exception-matrix-section" className="space-y-4 pt-6 border-t border-[#EAEAEA]">
          {/* Eyebrow / State Label */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="font-semibold uppercase tracking-wider text-[#666666]">CONTEXTUAL STATE</span>
            <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
            <span className="font-semibold text-black text-[11px]">Shipping exception</span>
          </div>

          {/* Section Heading & Export Button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-black">7 orders need shipping attention</h2>
              <p className="text-[11px] text-[#666666] mt-0.5">
                Illustrative unresolved state · 6 categories, 7 distinct orders
              </p>
            </div>
            <button
              onClick={() => alert("Exporting all exceptions...")}
              className="inline-flex h-8 items-center rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-black hover:bg-neutral-50 transition-colors shadow-sm"
            >
              Export exceptions
            </button>
          </div>

          {/* Exceptions Table Container */}
          <div className="w-full text-[11px]">
            {/* Header Row with light beige background */}
            <div className="grid grid-cols-12 items-center bg-[#FAF9F7] px-4 py-2 text-[10px] font-medium text-[#666666]">
              <div className="col-span-4 pl-6 uppercase tracking-wider">EXCEPTION</div>
              <div className="col-span-1 text-center uppercase tracking-wider">COUNT</div>
              <div className="col-span-4 uppercase tracking-wider">AFFECTED ORDERS</div>
              <div className="col-span-3 text-right uppercase tracking-wider">NEXT ACTION</div>
            </div>

            {/* Exception 1: No shipping method selected (Accordion item) */}
            <div className="border-b border-[#EAEAEA]/80">
              <div
                onClick={() => setExpandedException(expandedException === "no-method" ? null : "no-method")}
                className="grid grid-cols-12 items-center px-4 py-3 hover:bg-neutral-50/50 cursor-pointer select-none"
              >
                <div className="col-span-4 flex items-center gap-2 text-black font-semibold">
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-[#666666] transition-transform",
                      expandedException !== "no-method" && "-rotate-90"
                    )}
                  />
                  <AlertTriangle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
                  <span>No shipping method selected</span>
                </div>
                <div className="col-span-1 text-center font-semibold text-[#D97706]">2</div>
                <div className="col-span-4 text-[#666666]">ORD-10482 · ORD-10484</div>
                <div className="col-span-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOrderForDrawer({
                        id: "ORD-10482",
                        marketplace: "Flipkart",
                        destination: "Pune, Maharashtra",
                        warehouse: "Mumbai",
                        product: "Cotton cushion",
                        sku: "CUS-014",
                        weight: "0.65 kg",
                        orderValue: "₹1,899 · illustrative",
                        chosenMethod: "flipkart",
                      });
                      setActiveDrawer("choose-shipping");
                    }}
                    className="font-medium text-black hover:underline"
                  >
                    Choose shipping →
                  </button>
                </div>
              </div>

              {/* Sub-accordion explanation card with warm beige tint */}
              {expandedException === "no-method" && (
                <div className="bg-[#FAF9F7] px-10 py-5 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Column 1: What happened? */}
                    <div className="md:col-span-3 space-y-1">
                      <span className="text-[11px] font-semibold text-black">What happened?</span>
                      <p className="text-[11px] text-[#666666] leading-relaxed">
                        No shipping method has been confirmed.
                      </p>
                      <p className="text-[11px] font-semibold text-black mt-1">
                        Which order? ORD-10482
                      </p>
                    </div>

                    {/* Column 2: Why? */}
                    <div className="md:col-span-4 space-y-1">
                      <span className="text-[11px] font-semibold text-black">Why?</span>
                      <p className="text-[11px] text-[#666666] leading-relaxed">
                        A default preference exists, but the shipping selection still needs merchant confirmation.
                      </p>
                    </div>

                    {/* Column 3: What can I do now? */}
                    <div className="md:col-span-5 space-y-2">
                      <span className="text-[11px] font-semibold text-black">What can I do now?</span>
                      <p className="text-[11px] text-[#666666] leading-relaxed">
                        Compare available methods and confirm a selection. Manual override is available where supported.
                      </p>
                      <div className="pt-1">
                        <button
                          onClick={() => {
                            setSelectedOrderForDrawer({
                              id: "ORD-10482",
                              marketplace: "Flipkart",
                              destination: "Pune, Maharashtra",
                              warehouse: "Mumbai",
                              product: "Cotton cushion",
                              sku: "CUS-014",
                              weight: "0.65 kg",
                              orderValue: "₹1,899 · illustrative",
                              chosenMethod: "flipkart",
                            });
                            setActiveDrawer("choose-shipping");
                          }}
                          className="inline-flex h-8 items-center rounded-lg bg-black px-4 text-[11px] font-medium text-white hover:bg-neutral-800 transition-colors shadow-sm"
                        >
                          Choose Shipping
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Exception 2: Label unavailable */}
            <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-[#EAEAEA]/80 hover:bg-neutral-50/50">
              <div className="col-span-4 flex items-center gap-2 text-black">
                <ChevronRight className="h-3.5 w-3.5 text-[#666666]" />
                <AlertTriangle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
                <span className="font-normal text-black">Label unavailable</span>
              </div>
              <div className="col-span-1 text-center font-semibold text-[#D97706]">1</div>
              <div className="col-span-4 text-[#666666]">ORD-10495</div>
              <div className="col-span-3 text-right">
                <button className="text-black font-medium hover:underline">
                  Verify label capability →
                </button>
              </div>
            </div>

            {/* Exception 3: Tracking not received */}
            <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-[#EAEAEA]/80 hover:bg-neutral-50/50">
              <div className="col-span-4 flex items-center gap-2 text-black">
                <ChevronRight className="h-3.5 w-3.5 text-[#666666]" />
                <AlertTriangle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
                <span className="font-normal text-black">Tracking not received</span>
              </div>
              <div className="col-span-1 text-center font-semibold text-[#D97706]">1</div>
              <div className="col-span-4 text-[#666666]">ORD-10471</div>
              <div className="col-span-3 text-right">
                <button className="text-black font-medium hover:underline">
                  Review tracking →
                </button>
              </div>
            </div>

            {/* Exception 4: Shipping sync failed */}
            <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-[#EAEAEA]/80 hover:bg-neutral-50/50">
              <div className="col-span-4 flex items-center gap-2 text-black">
                <ChevronRight className="h-3.5 w-3.5 text-[#666666]" />
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#DC2626] text-[#DC2626] text-[8px] font-bold">
                  ✕
                </span>
                <span className="font-normal text-black">Shipping sync failed</span>
              </div>
              <div className="col-span-1 text-center font-semibold text-[#DC2626]">1</div>
              <div className="col-span-4 text-[#666666]">ORD-10474</div>
              <div className="col-span-3 text-right">
                <button className="text-black font-medium hover:underline">
                  Retry sync →
                </button>
              </div>
            </div>

            {/* Exception 5: SLA risk */}
            <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-[#EAEAEA]/80 hover:bg-neutral-50/50">
              <div className="col-span-4 flex items-center gap-2 text-black">
                <ChevronRight className="h-3.5 w-3.5 text-[#666666]" />
                <AlertTriangle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
                <span className="font-normal text-black">SLA risk</span>
              </div>
              <div className="col-span-1 text-center font-semibold text-[#D97706]">1</div>
              <div className="col-span-4 text-[#666666]">ORD-10488</div>
              <div className="col-span-3 text-right">
                <button className="text-black font-medium hover:underline">
                  Review order deadline →
                </button>
              </div>
            </div>

            {/* Exception 6: Connector capability limitation */}
            <div className="grid grid-cols-12 items-center px-4 py-3 hover:bg-neutral-50/50">
              <div className="col-span-4 flex items-center gap-2 text-black">
                <ChevronRight className="h-3.5 w-3.5 text-[#666666]" />
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#DC2626] text-[#DC2626] text-[8px] font-bold">
                  ✕
                </span>
                <span className="font-normal text-black">Connector capability limitation</span>
              </div>
              <div className="col-span-1 text-center font-semibold text-[#DC2626]">1</div>
              <div className="col-span-4 text-[#666666]">ORD-10503</div>
              <div className="col-span-3 text-right">
                <button className="text-black font-medium hover:underline">
                  View capability →
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 7: SYNCHRONIZATION & FIRST-USE / EMPTY STATES
          ========================================================================= */}
      {activeTab === "overview" && (
        <section className="space-y-4 pt-4 border-t border-[#EAEAEA]">
          <div>
            <h2 className="text-[16px] font-semibold text-black">Synchronization &amp; first-use states</h2>
            <p className="text-[11px] text-[#666666]">
              Compact status area replacements and a guided setup state · nonblocking
            </p>
          </div>

          {/* State replacements showcase cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card A: Syncing (Light blue tinted box with progress bar) */}
            <div className="rounded-xl border border-[#DCEBFE] bg-[#F7FAFF] p-5 space-y-3 shadow-sm">
              {/* Header / Eyebrow */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-semibold uppercase tracking-wider text-[#666666]">STATUS REPLACEMENT</span>
                <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
                <span className="font-semibold text-black text-[11px]">Syncing</span>
              </div>

              {/* Title with blue rotating refresh icon */}
              <div className="flex items-center gap-2 text-[13px] font-semibold text-black">
                <RefreshCw className="h-4 w-4 text-[#2563EB] animate-spin stroke-[2]" />
                <span>Synchronizing shipping data…</span>
              </div>

              {/* Orders and Shipping statuses count */}
              <div className="flex items-center justify-between text-[11px] text-black">
                <span>Orders: 184</span>
                <span>Shipping statuses: 176 / 184</span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-[#EAEAEA] overflow-hidden">
                <div className="h-full w-[95%] rounded-full bg-[#2563EB]" />
              </div>

              {/* Tracking updates indicator */}
              <div className="flex items-center gap-2 text-[11px] font-medium text-[#2563EB] pt-0.5">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#2563EB]">
                  <span className="h-1 w-1 rounded-full bg-[#2563EB]" />
                </span>
                <span>Tracking updates: processing</span>
              </div>

              {/* Sub-note */}
              <p className="text-[11px] text-[#666666]">
                Keep working while shipping data synchronizes.
              </p>
            </div>

            {/* Card B: Completion (Light green tinted box with View Exceptions button) */}
            <div className="rounded-xl border border-[#DCFCE7] bg-[#F9FEFA] p-5 space-y-3 shadow-sm">
              {/* Header / Eyebrow */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-semibold uppercase tracking-wider text-[#666666]">STATUS REPLACEMENT</span>
                <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
                <span className="font-semibold text-black text-[11px]">Completion</span>
              </div>

              {/* Title with green checkmark circle */}
              <div className="flex items-center gap-2 text-[13px] font-semibold text-black">
                <CheckCircle2 className="h-4 w-4 text-[#16A34A] stroke-[2]" />
                <span>Shipping sync complete</span>
              </div>

              {/* Stat counts row */}
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="font-bold text-black">184 processed</span>
                <span className="font-medium text-[#16A34A]">181 updated</span>
                <span className="font-medium text-[#D97706]">3 require attention</span>
              </div>

              {/* Explanation text */}
              <p className="text-[11px] text-[#666666] leading-relaxed">
                3 exceptions from this sync only; Overview's 7 represent overall shipping attention.
              </p>

              {/* Action button: View Exceptions */}
              <div className="pt-1">
                <button
                  onClick={() => {
                    const el = document.getElementById("exception-matrix-section");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-black hover:bg-neutral-50 transition-colors shadow-sm"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-black stroke-[1.75]" />
                  <span>View Exceptions</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
        </>
      )}

      {/* =========================================================================
          DRAWER 1: CHOOSE SHIPPING (ORD-10482)
          ========================================================================= */}
      {activeDrawer === "choose-shipping" && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveDrawer(null)}
          />

          {/* Drawer Content */}
          <div className="relative z-50 flex h-full w-[440px] max-w-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#EAEAEA] px-6 py-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] text-[#666666] uppercase font-semibold">
                  <span>DRAWER</span>
                  <span className="h-2 w-[1px] bg-[#BDBDBD]" />
                  <span className="text-black capitalize font-medium text-[11px]">Choose Shipping</span>
                </div>
                <h3 className="text-[17px] font-semibold text-black mt-1">
                  Choose Shipping — {selectedOrderForDrawer.id}
                </h3>
                <p className="text-[11px] text-[#666666]">Selection preview · not yet confirmed</p>
              </div>
              <button
                onClick={() => setActiveDrawer(null)}
                className="rounded-md p-1.5 text-[#666666] hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-[12px]">
              {/* Order Metadata Table */}
              <div className="rounded-lg border border-[#EAEAEA] divide-y divide-[#EAEAEA]/80">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[#666666]">Marketplace</span>
                  <span className="font-medium text-black">{selectedOrderForDrawer.marketplace}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[#666666]">Destination</span>
                  <span className="font-medium text-black">{selectedOrderForDrawer.destination}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[#666666]">Warehouse</span>
                  <span className="font-medium text-black">{selectedOrderForDrawer.warehouse}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[#666666]">Product / SKU</span>
                  <span className="font-medium text-black">
                    {selectedOrderForDrawer.product} / {selectedOrderForDrawer.sku}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[#666666]">Weight</span>
                  <span className="font-medium text-black">{selectedOrderForDrawer.weight}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[#666666]">Order value</span>
                  <span className="font-medium text-black">{selectedOrderForDrawer.orderValue}</span>
                </div>
              </div>

              {/* Available Shipping Selection */}
              <div className="space-y-3">
                <h4 className="text-[12px] font-semibold text-black">Available Shipping</h4>

                {/* Option 1: Flipkart Shipping (Recommended) */}
                <div
                  onClick={() =>
                    setSelectedOrderForDrawer((prev) => ({ ...prev, chosenMethod: "flipkart" }))
                  }
                  className={cn(
                    "cursor-pointer rounded-xl border p-3.5 transition-all space-y-1.5",
                    selectedOrderForDrawer.chosenMethod === "flipkart"
                      ? "border-[#16A34A] bg-[#F9FEFA] shadow-xs"
                      : "border-[#EAEAEA] bg-white hover:bg-neutral-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border",
                          selectedOrderForDrawer.chosenMethod === "flipkart"
                            ? "border-[#16A34A] bg-[#16A34A]"
                            : "border-[#BDBDBD] bg-white"
                        )}
                      >
                        {selectedOrderForDrawer.chosenMethod === "flipkart" && (
                          <div className="h-1.5 w-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className="font-semibold text-black text-[12px]">Flipkart Shipping</span>
                    </div>
                    <span className="text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                      ☉ Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-[#666666] pl-6">Available · Marketplace-managed</p>
                  <p className="text-[11px] font-medium text-[#16A34A] pl-6">
                    Selected · awaiting confirmation
                  </p>
                </div>

                {/* Option 2: Seller Shipping */}
                <div
                  onClick={() =>
                    setSelectedOrderForDrawer((prev) => ({ ...prev, chosenMethod: "seller" }))
                  }
                  className={cn(
                    "cursor-pointer rounded-xl border p-3.5 transition-all space-y-1",
                    selectedOrderForDrawer.chosenMethod === "seller"
                      ? "border-black bg-neutral-50 shadow-xs"
                      : "border-[#EAEAEA] bg-white hover:bg-neutral-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        selectedOrderForDrawer.chosenMethod === "seller"
                          ? "border-black bg-black"
                          : "border-[#BDBDBD] bg-white"
                      )}
                    >
                      {selectedOrderForDrawer.chosenMethod === "seller" && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="font-semibold text-black text-[12px]">Seller Shipping</span>
                  </div>
                  <p className="text-[11px] text-[#666666] pl-6">Available · Merchant-managed</p>
                </div>
              </div>

              {/* Why this method? */}
              <div className="space-y-2">
                <h4 className="text-[12px] font-semibold text-black">Why this method?</h4>
                <p className="text-[11px] text-[#666666]">
                  Matches your default preference for Flipkart orders.
                </p>

                {/* Blue Info Callout Box */}
                <div className="flex items-center gap-2 rounded-lg border border-[#DCEBFE] bg-[#EFF6FF] p-3 text-[11px] text-[#1E40AF]">
                  <Info className="h-4 w-4 shrink-0 text-[#2563EB]" />
                  <span>Flipkart Shipping matches the configured preference.</span>
                </div>
              </div>

              <p className="text-[10px] text-[#888888] pt-2">
                Illustrative availability. Verify connector support before confirming operational actions.
              </p>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-3 border-t border-[#EAEAEA] px-6 py-4 bg-white">
              <button
                onClick={() => {
                  alert(`Confirmed ${selectedOrderForDrawer.chosenMethod === "flipkart" ? "Flipkart Shipping" : "Seller Shipping"} for ${selectedOrderForDrawer.id}`);
                  setActiveDrawer(null);
                }}
                className="h-9 flex-1 rounded-lg bg-black px-4 text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors shadow-sm"
              >
                Confirm Selection
              </button>
              <button
                onClick={() => setActiveDrawer(null)}
                className="h-9 rounded-lg border border-[#EAEAEA] bg-white px-4 text-[12px] font-medium text-black hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          DRAWER 2: CHOOSE SHIPPING METHOD / ADD PROVIDER
          ========================================================================= */}
      {activeDrawer === "add-provider" && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveDrawer(null)}
          />

          {/* Drawer Content */}
          <div className="relative z-50 flex h-full w-[440px] max-w-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#EAEAEA] px-6 py-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] text-[#666666] uppercase font-semibold">
                  <span>DRAWER</span>
                  <span className="h-2 w-[1px] bg-[#BDBDBD]" />
                  <span className="text-black capitalize font-medium text-[11px]">Add Provider</span>
                </div>
                <h3 className="text-[17px] font-semibold text-black mt-1">
                  Choose Shipping Method
                </h3>
                <p className="text-[11px] text-[#666666]">Options depend on available connector capabilities.</p>
              </div>
              <button
                onClick={() => setActiveDrawer(null)}
                className="rounded-md p-1.5 text-[#666666] hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-[12px]">
              {/* Method Options Radio List */}
              <div className="space-y-3">
                {/* Option 1: Marketplace shipping */}
                <div
                  onClick={() => setSelectedProviderType("marketplace")}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3.5 transition-all space-y-1",
                    selectedProviderType === "marketplace"
                      ? "border-black bg-neutral-50 shadow-xs"
                      : "border-[#EAEAEA] bg-white hover:bg-neutral-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        selectedProviderType === "marketplace"
                          ? "border-black bg-black"
                          : "border-[#BDBDBD] bg-white"
                      )}
                    >
                      {selectedProviderType === "marketplace" && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="font-semibold text-black text-[12px]">Marketplace shipping</span>
                  </div>
                  <p className="text-[11px] text-[#666666] pl-6">Use a connected marketplace method.</p>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#D97706] pl-6 pt-0.5">
                    <AlertTriangle className="h-3 w-3 stroke-[2]" />
                    <span>Requires configuration</span>
                  </div>
                </div>

                {/* Option 2: Seller shipping */}
                <div
                  onClick={() => setSelectedProviderType("seller")}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3.5 transition-all space-y-1",
                    selectedProviderType === "seller"
                      ? "border-black bg-neutral-50 shadow-xs"
                      : "border-[#EAEAEA] bg-white hover:bg-neutral-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        selectedProviderType === "seller"
                          ? "border-black bg-black"
                          : "border-[#BDBDBD] bg-white"
                      )}
                    >
                      {selectedProviderType === "seller" && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="font-semibold text-black text-[12px]">Seller shipping</span>
                  </div>
                  <p className="text-[11px] text-[#666666] pl-6">Configure merchant-managed shipping.</p>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#D97706] pl-6 pt-0.5">
                    <AlertTriangle className="h-3 w-3 stroke-[2]" />
                    <span>Requires configuration</span>
                  </div>
                </div>

                {/* Option 3: Supported third-party provider */}
                <div
                  onClick={() => setSelectedProviderType("third-party")}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3.5 transition-all space-y-1",
                    selectedProviderType === "third-party"
                      ? "border-black bg-neutral-50 shadow-xs"
                      : "border-[#EAEAEA] bg-white hover:bg-neutral-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        selectedProviderType === "third-party"
                          ? "border-black bg-black"
                          : "border-[#BDBDBD] bg-white"
                      )}
                    >
                      {selectedProviderType === "third-party" && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="font-semibold text-black text-[12px]">Supported third-party provider</span>
                  </div>
                  <p className="text-[11px] text-[#666666] pl-6">
                    Choose only after connector verification. No verified provider listed.
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#D97706] pl-6 pt-0.5">
                    <AlertTriangle className="h-3 w-3 stroke-[2]" />
                    <span>Requires configuration</span>
                  </div>
                </div>

                {/* Option 4: Configured logistics provider */}
                <div
                  onClick={() => setSelectedProviderType("configured-logistics")}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3.5 transition-all space-y-1",
                    selectedProviderType === "configured-logistics"
                      ? "border-black bg-neutral-50 shadow-xs"
                      : "border-[#EAEAEA] bg-white hover:bg-neutral-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        selectedProviderType === "configured-logistics"
                          ? "border-black bg-black"
                          : "border-[#BDBDBD] bg-white"
                      )}
                    >
                      {selectedProviderType === "configured-logistics" && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="font-semibold text-black text-[12px]">Configured logistics provider</span>
                  </div>
                  <p className="text-[11px] text-[#666666] pl-6">
                    Use an existing verified configuration. No provider selected.
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#D97706] pl-6 pt-0.5">
                    <AlertTriangle className="h-3 w-3 stroke-[2]" />
                    <span>Requires configuration</span>
                  </div>
                </div>
              </div>

              {/* Capabilities checklist table */}
              <div className="space-y-2 pt-1">
                <h4 className="text-[12px] font-semibold text-black">Capabilities</h4>
                <div className="rounded-lg border border-[#EAEAEA] divide-y divide-[#EAEAEA]/80">
                  <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                    <span className="text-black font-medium">Shipping label</span>
                    <span className="text-[#D97706]">Requires configuration</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                    <span className="text-black font-medium">Tracking</span>
                    <span className="text-[#D97706]">Requires configuration</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                    <span className="text-black font-medium">Dispatch update</span>
                    <span className="text-[#D97706]">Requires configuration</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                    <span className="text-black font-medium">Status synchronization</span>
                    <span className="text-[#D97706]">Requires configuration</span>
                  </div>
                </div>
              </div>

              {/* Notice */}
              <div className="flex items-start gap-2 rounded-lg border border-[#EAEAEA] bg-[#FAF9F7] p-3 text-[11px] text-[#666666]">
                <Info className="h-4 w-4 shrink-0 text-[#666666] mt-0.5" />
                <span>
                  Supported only after verification. When a capability is unavailable, show "Not supported by connector".
                </span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-3 border-t border-[#EAEAEA] px-6 py-4 bg-white">
              <button
                onClick={() => {
                  alert(`Configuring ${selectedProviderType} method...`);
                  setActiveDrawer(null);
                }}
                className="h-9 rounded-lg bg-black px-5 text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors shadow-sm"
              >
                Configure method
              </button>
              <button
                onClick={() => setActiveDrawer(null)}
                className="h-9 rounded-lg border border-[#EAEAEA] bg-white px-4 text-[12px] font-medium text-black hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          DRAWER 3: CREATE / EDIT SHIPPING RULE
          ========================================================================= */}
      {activeDrawer === "create-rule" && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveDrawer(null)}
          />

          {/* Drawer Content */}
          <div className="relative z-50 flex h-full w-[440px] max-w-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#EAEAEA] px-6 py-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] text-[#666666] uppercase font-semibold">
                  <span>DRAWER</span>
                  <span className="h-2 w-[1px] bg-[#BDBDBD]" />
                  <span className="text-black capitalize font-medium text-[11px]">Create / edit rule</span>
                </div>
                <h3 className="text-[17px] font-semibold text-black mt-1">
                  Create Shipping Rule
                </h3>
                <p className="text-[11px] text-[#666666]">Choose a condition before configuring its value.</p>
              </div>
              <button
                onClick={() => setActiveDrawer(null)}
                className="rounded-md p-1.5 text-[#666666] hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-[12px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">WHEN</span>

              {/* Marketplace Condition */}
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#666666]">Marketplace · Equals</label>
                <div className="relative">
                  <select
                    value={ruleMarketplace}
                    onChange={(e) => setRuleMarketplace(e.target.value)}
                    className="h-9 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[12px] font-medium text-black focus:border-black focus:outline-none"
                  >
                    <option value="Flipkart">Flipkart</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Shopify">Shopify</option>
                    <option value="Meesho">Meesho</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#666666]" />
                </div>
              </div>

              {/* Warehouse Condition */}
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#666666]">AND Warehouse · Equals</label>
                <div className="relative">
                  <select
                    value={ruleWarehouse}
                    onChange={(e) => setRuleWarehouse(e.target.value)}
                    className="h-9 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[12px] font-medium text-black focus:border-black focus:outline-none"
                  >
                    <option value="Mumbai">Mumbai</option>
                    <option value="Delhi">Delhi</option>
                    <option value="Bengaluru">Bengaluru</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#666666]" />
                </div>
              </div>

              {/* Nested Condition Field Box */}
              <div className="rounded-xl border border-[#EAEAEA] bg-[#FAF9F7] p-3.5 space-y-3">
                {/* Field Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[#666666]">AND Condition field</label>
                  <div className="relative">
                    <select
                      value={ruleConditionField}
                      onChange={(e) => setRuleConditionField(e.target.value)}
                      className="h-8 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[11px] font-medium text-black focus:border-black focus:outline-none"
                    >
                      <option value="Order value">Order value</option>
                      <option value="Weight">Weight</option>
                      <option value="Destination zone">Destination zone</option>
                      <option value="Product SKU">Product SKU</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-[#666666]" />
                  </div>
                </div>

                {/* Operator Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[#666666]">Condition</label>
                  <div className="relative">
                    <select
                      value={ruleConditionOp}
                      onChange={(e) => setRuleConditionOp(e.target.value)}
                      className="h-8 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[11px] font-medium text-black focus:border-black focus:outline-none"
                    >
                      <option value="Greater than">Greater than</option>
                      <option value="Less than">Less than</option>
                      <option value="Equals">Equals</option>
                      <option value="Contains">Contains</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-[#666666]" />
                  </div>
                  <span className="text-[9px] text-[#888888] block">
                    Equals · Contains · Greater than · Less than
                  </span>
                </div>

                {/* Value Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[#666666]">Value</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={ruleConditionValue}
                      onChange={(e) => setRuleConditionValue(e.target.value)}
                      className="h-8 w-full rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[11px] text-black focus:border-black focus:outline-none"
                    />
                    <Edit2 className="absolute right-2.5 top-2.5 h-3 w-3 text-[#666666]" />
                  </div>
                </div>
              </div>

              {/* Additional conditions pills */}
              {additionalConditions.length > 0 && (
                <div className="space-y-2">
                  {additionalConditions.map((cond, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-[11px]"
                    >
                      <span>AND {cond} · Configured</span>
                      <button
                        onClick={() =>
                          setAdditionalConditions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-[#DC2626] hover:bg-neutral-100 p-1 rounded"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add a condition buttons */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-semibold text-black block">Add a condition</span>
                <div className="flex flex-wrap gap-1.5">
                  {["Marketplace", "Warehouse", "Location", "Order value", "Product", "Weight"].map(
                    (tag) => (
                      <button
                        key={tag}
                        onClick={() => setAdditionalConditions((prev) => [...prev, tag])}
                        className="rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1 text-[11px] text-[#666666] hover:border-black hover:text-black transition-colors"
                      >
                        {tag}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* THEN Clause */}
              <div className="space-y-2 pt-3 border-t border-[#EAEAEA]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">THEN</span>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-[#666666]">Preferred shipping method</label>
                  <div className="relative">
                    <select
                      value={rulePreferredMethod}
                      onChange={(e) => setRulePreferredMethod(e.target.value)}
                      className="h-9 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[12px] font-medium text-black focus:border-black focus:outline-none"
                    >
                      <option value="Configured shipping method">Configured shipping method</option>
                      <option value="Flipkart Shipping">Flipkart Shipping</option>
                      <option value="Seller Shipping">Seller Shipping</option>
                      <option value="Marketplace Direct">Marketplace Direct</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#666666]" />
                  </div>
                </div>

                {/* Info Callout */}
                <div className="flex items-center gap-2 rounded-lg border border-[#EAEAEA] bg-[#FAF9F7] p-3 text-[11px] text-[#666666]">
                  <Info className="h-4 w-4 shrink-0 text-[#666666]" />
                  <span>Manual override remains available where supported.</span>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-3 border-t border-[#EAEAEA] px-6 py-4 bg-white">
              <button
                onClick={() => {
                  alert(`Saved rule: WHEN ${ruleMarketplace} + ${ruleWarehouse} THEN ${rulePreferredMethod}`);
                  setActiveDrawer(null);
                }}
                className="h-9 rounded-lg bg-black px-5 text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors shadow-sm"
              >
                Save Rule
              </button>
              <button
                onClick={() => setActiveDrawer(null)}
                className="h-9 rounded-lg border border-[#EAEAEA] bg-white px-4 text-[12px] font-medium text-black hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
