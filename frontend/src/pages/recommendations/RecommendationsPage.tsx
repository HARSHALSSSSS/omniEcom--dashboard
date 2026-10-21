import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Check, Clock3, AlertCircle } from "lucide-react";
import { ROUTES } from "@/constants/routes";

// Deterministic inventory state calculation
const INVENTORY_DATA = {
  name: "Premium Travel Bag",
  sku: "TRV-1042",
  location: "Home Inventory",
  onHand: 6,
  reserved: 2,
  get available() {
    return this.onHand - this.reserved; // 4
  },
  lowStockThreshold: 10,
  recentSalesVelocity: 2, // units / day
  get estimatedStockCoverDays() {
    return Math.floor(this.available / this.recentSalesVelocity); // 2 days
  },
  movements: [
    { date: "Oct 4", type: "Stock received", qty: "+12", isPositive: true },
    { date: "Oct 5", type: "Dispatched", qty: "-6", isPositive: false },
    { date: "Oct 5", type: "Reserved", qty: "2", isPositive: false },
  ],
};

// Deterministic channel connection state
const CHANNEL_DATA = {
  name: "Meesho",
  sub: "Nova Living · Marketplace connection",
  status: "Connected",
  health: "Attention",
  lastSync: "18 min ago",
  openIssuesCount: 2,
  syncMode: "Automatic",
  issues: [
    {
      id: "iss-1",
      title: "Inventory update rejected",
      description:
        "The stock update for TRV-1042 was not accepted. Review the channel SKU mapping before retrying.",
      actionText: "Review mapping →",
      actionHref: ROUTES.LISTINGS,
    },
    {
      id: "iss-2",
      title: "Catalog sync delayed",
      description:
        "The latest catalog sync is waiting for the marketplace. Last successful sync: 18 minutes ago.",
      actionText: "View sync log →",
      actionHref: ROUTES.MARKETPLACE_HUB_HEALTH,
    },
  ],
};

// Deterministic rule-based replenishment calculations
// Target: 14-day stock cover based on sales velocity minus available stock
const SUGGESTED_REPLENISHMENT_ITEMS = [
  {
    id: "p1",
    name: "Premium Travel Bag",
    available: 4,
    salesVelocityPerDay: 2,
    leadTimeDays: 0,
    targetDays: 14,
    // (14 * 2) - 4 = 24
    get addUnits() {
      return this.targetDays * this.salesVelocityPerDay - this.available;
    },
  },
  {
    id: "p2",
    name: "Classic Backpack",
    available: 8,
    salesVelocityPerDay: 3,
    leadTimeDays: 0,
    targetDays: 14,
    // (14 * 3) - 8 = 34
    get addUnits() {
      return this.targetDays * this.salesVelocityPerDay - this.available;
    },
  },
  {
    id: "p3",
    name: "Weekender Duffel",
    available: 6,
    salesVelocityPerDay: 2,
    leadTimeDays: 0,
    targetDays: 14,
    // (14 * 2) - 6 = 22
    get addUnits() {
      return this.targetDays * this.salesVelocityPerDay - this.available;
    },
  },
  {
    id: "p4",
    name: "Canvas Tote",
    available: 5,
    salesVelocityPerDay: 2,
    leadTimeDays: 0,
    targetDays: 14,
    // (14 * 2) - 5 = 23
    get addUnits() {
      return this.targetDays * this.salesVelocityPerDay - this.available;
    },
  },
  {
    id: "p5",
    name: "Cotton Crew Tee",
    available: 9,
    salesVelocityPerDay: 3,
    leadTimeDays: 0,
    targetDays: 14,
    // (14 * 3) - 9 = 33
    get addUnits() {
      return this.targetDays * this.salesVelocityPerDay - this.available;
    },
  },
  {
    id: "p6",
    name: "Leather Tote",
    available: 3,
    salesVelocityPerDay: 2,
    leadTimeDays: 0,
    targetDays: 14,
    // (14 * 2) - 3 = 25
    get addUnits() {
      return this.targetDays * this.salesVelocityPerDay - this.available;
    },
  },
];

export default function RecommendationsPage() {
  const navigate = useNavigate();
  const [channelPanelOpen, setChannelPanelOpen] = useState(true);
  const [inventoryPanelOpen, setInventoryPanelOpen] = useState(true);
  const [recommendationPanelOpen, setRecommendationPanelOpen] = useState(true);
  const [isRetryingSync, setIsRetryingSync] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleRetrySync = () => {
    setIsRetryingSync(true);
    setTimeout(() => {
      setIsRetryingSync(false);
      setSyncSuccess(true);
    }, 1000);
  };

  const handleReviewReplenishment = () => {
    navigate(ROUTES.PROCUREMENT);
  };

  const handleDismiss = () => {
    setRecommendationPanelOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Details Introduction */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#666666]">
          Contextual Detail States
        </span>
        <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">
          Inspect. Understand. Decide.
        </h1>
        <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
          Companion panels opened from channel health, inventory health and the recommended action.
        </p>
      </div>

      {/* 3 Detail Panels Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
        {/* PANEL 1: CHANNEL CONNECTION (Meesho) */}
        {channelPanelOpen && (
          <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex flex-col gap-6">
              {/* Header */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-normal leading-[145%] text-[#666666] uppercase tracking-wide">
                    Channel connection
                  </span>
                  <button
                    type="button"
                    onClick={() => setChannelPanelOpen(false)}
                    className="p-1 hover:bg-neutral-100 rounded text-[#666666] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                  {CHANNEL_DATA.name}
                </h2>
                <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  {CHANNEL_DATA.sub}
                </p>
              </div>

              {/* Status pills */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2 h-[26px] bg-[#F5F5F5] border border-[#EAEAEA] rounded-[4px] text-[11px] font-normal text-[#333333]">
                  <Check className="h-3 w-3 text-[#333333] stroke-[2.5]" />
                  Connected
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 h-[26px] bg-white border border-[#EAEAEA] rounded-[4px] text-[11px] font-normal text-[#333333]">
                  <Clock3 className="h-3 w-3 text-[#333333]" />
                  Attention
                </span>
              </div>

              {/* Connection metadata list */}
              <div className="flex flex-col divide-y divide-[#EAEAEA] border-t border-[#EAEAEA]">
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Last sync</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {CHANNEL_DATA.lastSync}
                  </span>
                </div>
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Open issues</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {CHANNEL_DATA.openIssuesCount} issues
                  </span>
                </div>
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Sync mode</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {CHANNEL_DATA.syncMode}
                  </span>
                </div>
              </div>

              {/* What needs attention */}
              <div className="flex flex-col gap-3">
                <h3 className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                  What needs attention
                </h3>

                <div className="flex flex-col divide-y divide-[#EAEAEA]">
                  {CHANNEL_DATA.issues.map((issue) => (
                    <div key={issue.id} className="py-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-[#666666] shrink-0" />
                        <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                          {issue.title}
                        </span>
                      </div>
                      <p className="text-[12px] font-normal text-[#666666] leading-[145%] pl-5.5">
                        {issue.description}
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate(issue.actionHref)}
                        className="text-[12px] font-medium text-[#000000] hover:underline text-left pl-5.5"
                      >
                        {issue.actionText}
                      </button>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] font-normal text-[#666666] leading-[145%] pt-1">
                  These are Meesho&apos;s 2 issues. The dashboard queue covers 2 channel connections across the workspace.
                </p>
              </div>
            </div>

            {/* Bottom buttons */}
            <div className="flex flex-col gap-3 pt-6">
              <button
                type="button"
                onClick={handleRetrySync}
                disabled={isRetryingSync}
                className="w-full sm:w-[200px] h-10 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors"
              >
                {isRetryingSync ? "Retrying..." : syncSuccess ? "Synced!" : "Retry sync"}
              </button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
                className="text-[12px] font-medium text-[#000000] hover:underline text-left"
              >
                Manage connection →
              </button>
            </div>
          </div>
        )}

        {/* PANEL 2: PRODUCT / INVENTORY (Premium Travel Bag) */}
        {inventoryPanelOpen && (
          <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex flex-col gap-6">
              {/* Header */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-normal leading-[145%] text-[#666666] uppercase tracking-wide">
                    Product / Inventory
                  </span>
                  <button
                    type="button"
                    onClick={() => setInventoryPanelOpen(false)}
                    className="p-1 hover:bg-neutral-100 rounded text-[#666666] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                  {INVENTORY_DATA.name}
                </h2>
                <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  {INVENTORY_DATA.sku} · {INVENTORY_DATA.location}
                </p>
              </div>

              {/* Low stock pill */}
              <div>
                <span className="inline-flex items-center gap-1.5 px-2 h-[26px] bg-white border border-[#EAEAEA] rounded-[4px] text-[11px] font-normal text-[#333333]">
                  <Clock3 className="h-3 w-3 text-[#333333]" />
                  Low stock
                </span>
              </div>

              {/* Available Stock Big Metric */}
              <div className="flex flex-col gap-1">
                <span className="text-[26px] font-semibold text-[#000000] leading-[145%]">
                  {INVENTORY_DATA.available} units available
                </span>
                <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  On-hand stock minus reserved units
                </span>
              </div>

              {/* Stock Details Table */}
              <div className="flex flex-col divide-y divide-[#EAEAEA] border-t border-[#EAEAEA]">
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">On hand</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {INVENTORY_DATA.onHand} units
                  </span>
                </div>
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Reserved</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {INVENTORY_DATA.reserved} units
                  </span>
                </div>
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Available</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {INVENTORY_DATA.available} units
                  </span>
                </div>
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Low-stock threshold</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {INVENTORY_DATA.lowStockThreshold} units
                  </span>
                </div>
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Recent sales velocity</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {INVENTORY_DATA.recentSalesVelocity} units / day
                  </span>
                </div>
                <div className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">Estimated stock cover</span>
                  <span className="text-[12px] font-medium text-[#000000]">
                    {INVENTORY_DATA.estimatedStockCoverDays} days
                  </span>
                </div>
              </div>

              {/* Recent stock movement */}
              <div className="flex flex-col gap-2">
                <h3 className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                  Recent stock movement
                </h3>
                <div className="flex flex-col divide-y divide-[#EAEAEA]">
                  {INVENTORY_DATA.movements.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between h-[34px] text-[11px]"
                    >
                      <span className="text-[#666666]">
                        {m.date} · {m.type}
                      </span>
                      <span className="text-[12px] font-medium text-[#000000]">
                        {m.qty}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] font-normal text-[#666666] leading-[145%] pt-1">
                  This central stock source is shared across your connected channels.
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col gap-3 pt-6">
              <button
                type="button"
                onClick={handleReviewReplenishment}
                className="w-full sm:w-[200px] h-10 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors"
              >
                Review replenishment
              </button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.PRODUCTS)}
                className="text-[12px] font-medium text-[#000000] hover:underline text-left"
              >
                Open product →
              </button>
            </div>
          </div>
        )}

        {/* PANEL 3: RECOMMENDATION DETAILS (System-generated) */}
        {recommendationPanelOpen && (
          <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs">
            <div className="flex flex-col gap-5">
              {/* Header */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-normal leading-[145%] text-[#666666] uppercase tracking-wide">
                    Recommendation details
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecommendationPanelOpen(false)}
                    className="p-1 hover:bg-neutral-100 rounded text-[#666666] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                  Replenish 6 products this week
                </h2>
                <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  18 products are approaching their stock threshold.
                </p>
              </div>

              {/* Why this is recommended (System algorithm explanation) */}
              <div className="bg-[#F5F5F5] rounded-[8px] p-4 flex flex-col gap-2">
                <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                  Why this is recommended
                </span>
                <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  Based on recent sales velocity, replenishing 6 products this week could reduce potential stockouts.
                </p>
              </div>

              {/* Suggested quantities table */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                    Suggested quantities
                  </span>
                  <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                    14-day target cover, less available stock
                  </span>
                </div>

                {/* Table */}
                <div className="flex flex-col divide-y divide-[#EAEAEA] pt-1">
                  {/* Header */}
                  <div className="flex items-center justify-between bg-[#F5F5F5] px-2.5 h-[30px] text-[10px] text-[#000000] font-normal">
                    <span>Product / Available</span>
                    <span>Add units</span>
                  </div>

                  {/* 6 Replenishment Rows */}
                  {SUGGESTED_REPLENISHMENT_ITEMS.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-2.5 h-[43px]"
                    >
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-[#000000] leading-[145%]">
                          {item.name}
                        </span>
                        <span className="text-[10px] font-normal text-[#666666] leading-[145%]">
                          {item.available} available
                        </span>
                      </div>
                      <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                        +{item.addUnits}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] font-normal text-[#666666] leading-[145%] pt-1">
                  Recommendation only. Review quantities and supplier lead times before deciding. No inventory changes have been made.
                </p>
              </div>
            </div>

            {/* Decision Actions Bottom */}
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                onClick={handleReviewReplenishment}
                className="flex-1 sm:w-[202px] h-10 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors flex items-center justify-center"
              >
                Review replenishment
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="w-[68px] h-10 rounded-[8px] bg-white border border-[#EAEAEA] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
