import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  History,
  ChevronDown,
  X,
  ArrowUpRight,
  Minus,
  Check,
  HelpCircle,
  Clock,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";

interface AttentionQueueItem {
  id: string;
  priority: "Critical" | "High" | "Medium";
  priorityColor: string; // text/border color
  bulletColor: string; // dot indicator
  title: string;
  consequence: string;
  inProgressStatus?: string;
  area: "Orders" | "Inventory" | "Listings" | "Channels" | "Returns";
  impact: string;
  deadline: string;
  deadlineBold?: string;
  actionText: string;
  actionHref: string;
  // Drawer details
  categoryLabel: string;
  statusText: string;
  whyItMatters: string;
  affectedHeading: string;
  affectedItems: { id: string; label: string; href: string }[];
  additionalCountText?: string;
  deadlineCallout?: {
    heading: string;
    value: string;
  };
  recommendedAction: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
}

const ALL_ISSUES: AttentionQueueItem[] = [
  {
    id: "1",
    priority: "Critical",
    priorityColor: "#D74B61",
    bulletColor: "#000000",
    title: "7 orders are at risk of missing dispatch",
    consequence: "Dispatch delays may affect customer delivery expectations.",
    inProgressStatus: "In progress · Picking and packing review started",
    area: "Orders",
    impact: "Customer delivery risk",
    deadline: "Today · 3:30 PM",
    deadlineBold: "Today · 3:30 PM",
    actionText: "Review orders →",
    actionHref: ROUTES.ORDERS,
    categoryLabel: "Orders · Critical",
    statusText: "Open · Requires action",
    whyItMatters:
      "These orders are approaching their dispatch deadline and may affect customer delivery expectations.",
    affectedHeading: "Affected orders",
    affectedItems: [
      { id: "ORD-10482", label: "ORD-10482", href: "/orders" },
      { id: "ORD-10479", label: "ORD-10479", href: "/orders" },
      { id: "ORD-10472", label: "ORD-10472", href: "/orders" },
    ],
    additionalCountText: "+4 more",
    deadlineCallout: {
      heading: "Deadline",
      value: "Today · 3:30 PM",
    },
    recommendedAction:
      "Review picking and packing status for the affected orders.",
    primaryActionLabel: "Open affected orders",
    secondaryActionLabel: "Snooze issue",
  },
  {
    id: "2",
    priority: "High",
    priorityColor: "#B97818",
    bulletColor: "#666666",
    title: "18 products are below their stock threshold",
    consequence: "Low availability may interrupt sales without replenishment.",
    area: "Inventory",
    impact: "Potential stockout",
    deadline: "Today",
    actionText: "Review inventory →",
    actionHref: ROUTES.INVENTORY,
    categoryLabel: "Inventory · High",
    statusText: "Open · Requires action",
    whyItMatters:
      "Low availability may interrupt active marketplace listings and suppress organic ranking if out-of-stock.",
    affectedHeading: "Affected SKUs",
    affectedItems: [
      { id: "SKU-9921", label: "Premium Travel Bag (Charcoal)", href: "/inventory" },
      { id: "SKU-8834", label: "Wireless ANC Headphones", href: "/inventory" },
      { id: "SKU-7721", label: "Stainless Steel Tumbler 750ml", href: "/inventory" },
    ],
    additionalCountText: "+15 more",
    deadlineCallout: {
      heading: "Replenishment Due",
      value: "Today · End of Day",
    },
    recommendedAction:
      "Create purchase orders for top velocity items before daily cut-off.",
    primaryActionLabel: "Open replenishment view",
    secondaryActionLabel: "Acknowledge threshold",
  },
  {
    id: "3",
    priority: "High",
    priorityColor: "#B97818",
    bulletColor: "#666666",
    title: "4 marketplace listings are incomplete",
    consequence: "Missing listing details may limit product discovery.",
    area: "Listings",
    impact: "Reduced product visibility",
    deadline: "Today",
    actionText: "Fix listings →",
    actionHref: ROUTES.LISTINGS,
    categoryLabel: "Listings · High",
    statusText: "Open · Missing attributes",
    whyItMatters:
      "Missing mandatory attributes (HSN, GST slab, color variants) prevent products from appearing in search.",
    affectedHeading: "Affected channels & items",
    affectedItems: [
      { id: "LST-302", label: "Amazon: Ergonomic Desk Mat", href: "/listings" },
      { id: "LST-305", label: "Flipkart: Leather Cardholder", href: "/listings" },
      { id: "LST-310", label: "Myntra: Casual Canvas Tote", href: "/listings" },
    ],
    additionalCountText: "+1 more",
    deadlineCallout: {
      heading: "Compliance Window",
      value: "Today · 6:00 PM",
    },
    recommendedAction:
      "Auto-fill standard catalog values and republish channels.",
    primaryActionLabel: "Fix incomplete listings",
    secondaryActionLabel: "Review catalog mapping",
  },
  {
    id: "4",
    priority: "Medium",
    priorityColor: "#7661C8",
    bulletColor: "#BDBDBD",
    title: "Meesho connection has 2 synchronization issues",
    consequence: "Catalog updates may not reach Meesho until sync succeeds.",
    area: "Channels",
    impact: "Catalog sync",
    deadline: "Today",
    actionText: "Check connection →",
    actionHref: ROUTES.MARKETPLACE_HUB,
    categoryLabel: "Channels · Medium",
    statusText: "Sync warning · Retrying",
    whyItMatters:
      "API webhook timeout during inventory feed sync resulted in pending queue retries.",
    affectedHeading: "Affected connections",
    affectedItems: [
      { id: "CONN-MSH-01", label: "Meesho Main Seller Catalog API", href: "/marketplace-hub" },
      { id: "CONN-MSH-02", label: "Meesho Inventory Webhook Receiver", href: "/marketplace-hub" },
    ],
    deadlineCallout: {
      heading: "Next Retry Scheduled",
      value: "Today · 4:15 PM",
    },
    recommendedAction:
      "Verify marketplace API token validity and re-trigger sync pipeline.",
    primaryActionLabel: "Test connection & resync",
    secondaryActionLabel: "View sync logs",
  },
  {
    id: "5",
    priority: "Medium",
    priorityColor: "#7661C8",
    bulletColor: "#BDBDBD",
    title: "3 returns are waiting for approval",
    consequence: "Pending approvals delay the next step for customers.",
    area: "Returns",
    impact: "Customer resolution delay",
    deadline: "Tomorrow",
    actionText: "Review returns →",
    actionHref: ROUTES.RETURNS,
    categoryLabel: "Returns · Medium",
    statusText: "Pending merchant decision",
    whyItMatters:
      "Customer SLA requires acknowledgement within 24 hours to prevent marketplace penalties.",
    affectedHeading: "Pending RMA orders",
    affectedItems: [
      { id: "RET-2041", label: "RET-2041 · Damaged packaging", href: "/returns" },
      { id: "RET-2039", label: "RET-2039 · Wrong size delivered", href: "/returns" },
      { id: "RET-2033", label: "RET-2033 · Defective zipper", href: "/returns" },
    ],
    recommendedAction:
      "Inspect uploaded return photos and authorize replacement or refund.",
    primaryActionLabel: "Authorize pending returns",
    secondaryActionLabel: "Request more info",
  },
];

type PriorityTab = "all" | "critical" | "today" | "upcoming";
type ViewMode = "queue" | "history";
type HistoryFilter = "all" | "resolved" | "snoozed";

export default function NeedsAttentionPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("queue");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [activeTab, setActiveTab] = useState<PriorityTab>("all");
  const [selectedArea, setSelectedArea] = useState<string>("All");
  const [selectedPriority, setSelectedPriority] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("Open");
  const [selectedDue, setSelectedDue] = useState<string>("Any time");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [activeDrawerIssue, setActiveDrawerIssue] = useState<AttentionQueueItem | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState<boolean>(false);
  const [openDropdown, setOpenDropdown] = useState<"area" | "priority" | "status" | "due" | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resolvedNotice, setResolvedNotice] = useState<{
    heading: string;
    description: string;
  } | null>(null);
  const [resolvedIssueIds, setResolvedIssueIds] = useState<string[]>(["5"]);
  const [snoozedNotice, setSnoozedNotice] = useState<{
    heading: string;
    description: string;
  } | null>(null);
  const [snoozedIssueIds, setSnoozedIssueIds] = useState<string[]>(["1"]);

  const toggleSelectRow = (id: string) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const activeUnresolvedIssues = ALL_ISSUES.filter(
      (i) => !resolvedIssueIds.includes(i.id) && !snoozedIssueIds.includes(i.id)
    );
    if (selectedRows.length === activeUnresolvedIssues.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(activeUnresolvedIssues.map((i) => i.id));
    }
  };

  const handleMarkResolved = () => {
    if (selectedRows.length > 0) {
      const resolvingIds = [...selectedRows];
      setResolvedIssueIds((prev) => [...new Set([...prev, ...resolvingIds])]);
      setSnoozedNotice(null);

      const selectedItems = ALL_ISSUES.filter((i) => resolvingIds.includes(i.id));
      const firstItem = selectedItems[0];
      const heading =
        firstItem && firstItem.area === "Returns"
          ? "Returns issue marked resolved"
          : resolvingIds.length === 1
          ? "Issue marked resolved"
          : `${resolvingIds.length} issues marked resolved`;

      const description =
        firstItem && firstItem.area === "Returns"
          ? `${firstItem.title} has been removed from the active queue. It's available in history.`
          : `${selectedItems.map((i) => i.title).join(", ")} has been removed from the active queue. It's available in history.`;

      setResolvedNotice({
        heading,
        description,
      });
      setSelectedRows([]);
      setSnoozeOpen(false);
    }
  };

  const handleSnooze = (timeframe: string) => {
    if (selectedRows.length > 0) {
      const snoozingIds = [...selectedRows];
      setSnoozedIssueIds((prev) => [...new Set([...prev, ...snoozingIds])]);
      setResolvedNotice(null);

      const selectedItems = ALL_ISSUES.filter((i) => snoozingIds.includes(i.id));
      const firstItem = selectedItems[0];
      const timeframeText = timeframe.toLowerCase();

      const heading =
        firstItem && firstItem.area === "Orders"
          ? `Dispatch issue snoozed until ${timeframeText}`
          : snoozingIds.length === 1
          ? `Issue snoozed until ${timeframeText}`
          : `${snoozingIds.length} issues snoozed until ${timeframeText}`;

      const description = `The issue has temporarily left the active queue. It will return ${timeframeText}; you can find it in history now.`;

      setSnoozedNotice({
        heading,
        description,
      });
      setSelectedRows([]);
      setSnoozeOpen(false);
    }
  };

  const handleUnsnooze = (id: string) => {
    setSnoozedIssueIds((prev) => prev.filter((item) => item !== id));
  };

  const clearSelection = () => {
    setSelectedRows([]);
    setSnoozeOpen(false);
  };

  const clearFilters = () => {
    setSelectedArea("All");
    setSelectedPriority("All");
    setSelectedStatus("Open");
    setSelectedDue("Any time");
    setOpenDropdown(null);
  };

  const isFiltered =
    selectedArea !== "All" ||
    selectedPriority !== "All" ||
    selectedStatus !== "Open" ||
    selectedDue !== "Any time";

  const openDrawer = (issue: AttentionQueueItem) => {
    setActiveDrawerIssue(issue);
  };

  const closeDrawer = () => {
    setActiveDrawerIssue(null);
  };

  // Filter items
  const filteredIssues = useMemo(() => {
    return ALL_ISSUES.filter((item) => {
      // Exclude resolved items
      if (resolvedIssueIds.includes(item.id)) return false;

      // Exclude snoozed items (unless viewing snoozed)
      if (selectedStatus !== "Snoozed" && snoozedIssueIds.includes(item.id)) return false;

      // Status filter
      if (selectedStatus === "In progress") {
        if (!item.inProgressStatus) return false;
      } else if (selectedStatus === "Snoozed") {
        if (!snoozedIssueIds.includes(item.id)) return false;
      }

      // Tab filter
      if (activeTab === "critical" && item.priority !== "Critical") return false;
      if (activeTab === "today" && !item.deadline.includes("Today")) return false;
      if (activeTab === "upcoming" && item.deadline.includes("Today")) return false;

      // Area filter
      if (selectedArea !== "All" && item.area !== selectedArea) return false;

      // Priority filter
      if (selectedPriority !== "All" && item.priority !== selectedPriority) return false;

      // Due filter
      if (selectedDue === "Today" && !item.deadline.includes("Today")) return false;
      if (selectedDue === "Tomorrow" && !item.deadline.includes("Tomorrow")) return false;

      return true;
    });
  }, [activeTab, selectedArea, selectedPriority, selectedStatus, selectedDue, resolvedIssueIds, snoozedIssueIds]);

  const totalOpenCount = useMemo(() => {
    return ALL_ISSUES.length - resolvedIssueIds.length - snoozedIssueIds.length;
  }, [resolvedIssueIds, snoozedIssueIds]);

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* 1. Page Introduction */}
      <div className="flex flex-row justify-between items-center w-full">
        <div className="flex flex-col gap-1.5 flex-1">
          <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase tracking-normal">
            Operations
          </span>
          <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">
            Needs attention
          </h1>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            Resolve issues before they affect orders, inventory or sales.
          </p>
        </div>

        {/* Queue summary */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
            {isLoading
              ? "Loading issues..."
              : viewMode === "history"
              ? "16 open issues"
              : selectedStatus === "In progress"
              ? "18 active issues"
              : filteredIssues.length === 0
              ? "0 open issues"
              : resolvedNotice || snoozedNotice
              ? "17 open issues"
              : `${totalOpenCount} open issues`}
          </span>
          <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
            {isLoading ? "Checking for updates" : "Updated 2 min ago"}
          </span>
        </div>
      </div>

      {/* 2. Priority Navigation & Controls */}
      <div className="flex flex-col gap-4 w-full">
        {/* Navigation Tabs Bar */}
        {viewMode === "history" ? (
          /* History navigation bar: Open queue · 16 | History · 2 | Back to open queue */
          <div className="flex flex-row items-center border-b border-[#EAEAEA] h-[42px] w-full">
            <div className="flex flex-row items-center gap-7 h-full">
              {/* Open queue link */}
              <button
                type="button"
                onClick={() => setViewMode("queue")}
                className="flex items-center gap-1.5 h-full px-0.5 border-b-2 border-transparent text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer"
              >
                <span>Open queue · 16</span>
              </button>

              {/* History / Active */}
              <div className="flex items-center gap-1.5 h-full px-0.5 border-b-2 border-[#000000] text-[12px] font-semibold text-[#000000]">
                <span>History · 2</span>
              </div>
            </div>

            {/* Back to queue link */}
            <div className="flex-1 flex justify-end">
              <button
                type="button"
                onClick={() => setViewMode("queue")}
                className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer flex items-center gap-1.5"
              >
                <span>← Back to open queue</span>
              </button>
            </div>
          </div>
        ) : (
          /* Open queue navigation tabs */
          <div className="flex flex-row justify-between items-center border-b border-[#EAEAEA] h-[42px] w-full">
            {/* Tabs */}
            <div className="flex flex-row items-center gap-7 h-full">
              {/* All */}
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`flex items-center gap-2 h-full px-0.5 border-b-2 transition-colors ${
                  activeTab === "all"
                    ? "border-[#000000] font-semibold text-[#000000]"
                    : "border-transparent font-normal text-[#666666] hover:text-[#000000]"
                }`}
              >
                <span className="text-[12px] leading-[145%]">All</span>
                <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  {filteredIssues.length === 0 && (selectedArea !== "All" || selectedPriority !== "All" || selectedDue !== "Any time")
                    ? "0"
                    : resolvedNotice || snoozedNotice
                    ? "17"
                    : "18"}
                </span>
              </button>

              {/* Critical */}
              <button
                type="button"
                onClick={() => setActiveTab("critical")}
                className={`flex items-center gap-2 h-full px-0.5 border-b-2 transition-colors ${
                  activeTab === "critical"
                    ? "border-[#000000] font-semibold text-[#000000]"
                    : "border-transparent font-normal text-[#666666] hover:text-[#000000]"
                }`}
              >
                <span className="text-[12px] leading-[145%]">Critical</span>
                <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  {filteredIssues.length === 0 && (selectedArea !== "All" || selectedPriority !== "All" || selectedDue !== "Any time")
                    ? "0"
                    : snoozedNotice
                    ? "2"
                    : "3"}
                </span>
              </button>

              {/* Today */}
              <button
                type="button"
                onClick={() => setActiveTab("today")}
                className={`flex items-center gap-2 h-full px-0.5 border-b-2 transition-colors ${
                  activeTab === "today"
                    ? "border-[#000000] font-semibold text-[#000000]"
                    : "border-transparent font-normal text-[#666666] hover:text-[#000000]"
                }`}
              >
                <span className="text-[12px] leading-[145%]">Today</span>
                <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  {filteredIssues.length === 0 && (selectedArea !== "All" || selectedPriority !== "All" || selectedDue !== "Any time") ? "0" : "11"}
                </span>
              </button>

              {/* Upcoming */}
              <button
                type="button"
                onClick={() => setActiveTab("upcoming")}
                className={`flex items-center gap-2 h-full px-0.5 border-b-2 transition-colors ${
                  activeTab === "upcoming"
                    ? "border-[#000000] font-semibold text-[#000000]"
                    : "border-transparent font-normal text-[#666666] hover:text-[#000000]"
                }`}
              >
                <span className="text-[12px] leading-[145%]">Upcoming</span>
                <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  {filteredIssues.length === 0 && (selectedArea !== "All" || selectedPriority !== "All" || selectedDue !== "Any time")
                    ? "0"
                    : resolvedNotice
                    ? "3"
                    : "4"}
                </span>
              </button>
            </div>

            {/* History Link */}
            <button
              type="button"
              onClick={() => setViewMode("history")}
              className="flex items-center gap-1.5 text-[12px] font-medium text-[#000000] hover:underline cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-[#666666]" />
              <span>View history</span>
            </button>
          </div>
        )}

        {/* Filters Row: Area, Priority, Status, Due + Clear filters */}
        <div className="relative flex flex-col gap-1.5 w-full">
          {/* Backdrop when any filter dropdown is open */}
          {openDropdown && (
            <div
              className="fixed inset-0 z-30"
              onClick={() => setOpenDropdown(null)}
            />
          )}

          <div className="flex flex-row items-center gap-2 flex-wrap">
            {/* 1. Area Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenDropdown(openDropdown === "area" ? null : "area")
                }
                style={{ width: "142px" }}
                className={`flex items-center justify-between px-2.5 h-[34px] bg-white border rounded-[8px] text-[12px] transition-colors ${
                  openDropdown === "area"
                    ? "border-[#000000]"
                    : "border-[#BDBDBD] hover:border-[#666666]"
                }`}
              >
                <span className="font-normal text-[#666666]">Area</span>
                <span className="font-medium text-[#000000] truncate flex-1 text-left ml-1.5">
                  {selectedArea}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] shrink-0" />
              </button>

              {/* Area options menu */}
              {openDropdown === "area" && (
                <div
                  style={{
                    width: "142px",
                    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.051)",
                  }}
                  className="absolute left-0 top-[38px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
                >
                  {[
                    "All",
                    "Orders",
                    "Inventory",
                    "Listings",
                    "Channels",
                    "Returns",
                    "Shipping",
                  ].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSelectedArea(option);
                        setOpenDropdown(null);
                      }}
                      className={`flex items-center justify-between w-full h-8 px-2 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                        selectedArea === option
                          ? "bg-[#F5F5F5] text-[#000000] font-normal"
                          : "bg-white text-[#000000] font-normal hover:bg-neutral-50"
                      }`}
                    >
                      <span>{option}</span>
                      {selectedArea === option && (
                        <Check className="w-3 h-3 text-[#666666] shrink-0 stroke-[2]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Priority Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenDropdown(openDropdown === "priority" ? null : "priority")
                }
                style={{ width: "146px" }}
                className={`flex items-center justify-between px-2.5 h-[34px] bg-white border rounded-[8px] text-[12px] transition-colors ${
                  openDropdown === "priority"
                    ? "border-[#000000]"
                    : "border-[#BDBDBD] hover:border-[#666666]"
                }`}
              >
                <span className="font-normal text-[#666666]">Priority</span>
                <span className="font-medium text-[#000000] truncate flex-1 text-left ml-1.5">
                  {selectedPriority}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] shrink-0" />
              </button>

              {/* Priority options menu */}
              {openDropdown === "priority" && (
                <div
                  style={{
                    width: "146px",
                    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.051)",
                  }}
                  className="absolute left-0 top-[38px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
                >
                  {["All", "Critical", "High", "Medium"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSelectedPriority(option);
                        setOpenDropdown(null);
                      }}
                      className={`flex items-center justify-between w-full h-8 px-2 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                        selectedPriority === option
                          ? "bg-[#F5F5F5] text-[#000000] font-normal"
                          : "bg-white text-[#000000] font-normal hover:bg-neutral-50"
                      }`}
                    >
                      <span>{option}</span>
                      {selectedPriority === option && (
                        <Check className="w-3 h-3 text-[#666666] shrink-0 stroke-[2]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Status Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenDropdown(openDropdown === "status" ? null : "status")
                }
                style={{ width: selectedStatus === "In progress" ? "194px" : "160px" }}
                className={`flex items-center justify-between px-2.5 h-[34px] bg-white border rounded-[8px] text-[12px] transition-colors ${
                  openDropdown === "status" || selectedStatus === "In progress"
                    ? "border-[#000000]"
                    : "border-[#BDBDBD] hover:border-[#666666]"
                }`}
              >
                <span className="font-normal text-[#666666]">Status</span>
                <span className="font-medium text-[#000000] truncate flex-1 text-left ml-1.5">
                  {selectedStatus}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] shrink-0" />
              </button>

              {/* Status options menu */}
              {openDropdown === "status" && (
                <div
                  style={{
                    width: selectedStatus === "In progress" ? "194px" : "160px",
                    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.051)",
                  }}
                  className="absolute left-0 top-[38px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
                >
                  {["Open", "In progress", "Snoozed"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSelectedStatus(option);
                        setOpenDropdown(null);
                      }}
                      className={`flex items-center justify-between w-full h-8 px-2 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                        selectedStatus === option
                          ? "bg-[#F5F5F5] text-[#000000] font-normal"
                          : "bg-white text-[#000000] font-normal hover:bg-neutral-50"
                      }`}
                    >
                      <span>{option}</span>
                      {selectedStatus === option && (
                        <Check className="w-3 h-3 text-[#666666] shrink-0 stroke-[2]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Due Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenDropdown(openDropdown === "due" ? null : "due")
                }
                style={{ width: "158px" }}
                className={`flex items-center justify-between px-2.5 h-[34px] bg-white border rounded-[8px] text-[12px] transition-colors ${
                  openDropdown === "due"
                    ? "border-[#000000]"
                    : "border-[#BDBDBD] hover:border-[#666666]"
                }`}
              >
                <span className="font-normal text-[#666666]">Due</span>
                <span className="font-medium text-[#000000] truncate flex-1 text-left ml-1.5">
                  {selectedDue}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] shrink-0" />
              </button>

              {/* Due options menu */}
              {openDropdown === "due" && (
                <div
                  style={{
                    width: "158px",
                    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.051)",
                  }}
                  className="absolute left-0 top-[38px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
                >
                  {["Today", "Tomorrow", "This week"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSelectedDue(option);
                        setOpenDropdown(null);
                      }}
                      className={`flex items-center justify-between w-full h-8 px-2 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                        selectedDue === option
                          ? "bg-[#F5F5F5] text-[#000000] font-normal"
                          : "bg-white text-[#000000] font-normal hover:bg-neutral-50"
                      }`}
                    >
                      <span>{option}</span>
                      {selectedDue === option && (
                        <Check className="w-3 h-3 text-[#666666] shrink-0 stroke-[2]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clear filters action */}
            {isFiltered && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-2 text-[12px] font-medium text-[#000000] hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Filter result summary when filtered by Due/Area */}
          {selectedDue !== "Any time" && (
            <span className="text-[12px] font-normal leading-[145%] text-[#666666] pt-1">
              Due {selectedDue.toLowerCase()} · {filteredIssues.length} matching issues
            </span>
          )}
        </div>
      </div>

      {/* 3. Operations Priority Queue, Loading Skeleton, Empty Queue, or History View */}
      {viewMode === "history" ? (
        /* Screen 09 — Needs attention / Resolved and snoozed history */
        <div className="flex flex-col gap-4 w-full">
          {/* History introduction: Section heading + History status filter options */}
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-row justify-between items-center w-full h-[26px]">
              <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                Resolved & snoozed
              </h2>

              <div className="flex flex-row items-center gap-[18px] text-[12px] leading-[145%]">
                <button
                  type="button"
                  onClick={() => setHistoryFilter("all")}
                  className={`cursor-pointer ${
                    historyFilter === "all"
                      ? "font-semibold text-[#000000]"
                      : "font-normal text-[#666666] hover:text-[#000000]"
                  }`}
                >
                  All · 2
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter("resolved")}
                  className={`cursor-pointer ${
                    historyFilter === "resolved"
                      ? "font-semibold text-[#000000]"
                      : "font-normal text-[#666666] hover:text-[#000000]"
                  }`}
                >
                  Resolved · 1
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter("snoozed")}
                  className={`cursor-pointer ${
                    historyFilter === "snoozed"
                      ? "font-semibold text-[#000000]"
                      : "font-normal text-[#666666] hover:text-[#000000]"
                  }`}
                >
                  Snoozed · 1
                </button>
              </div>
            </div>

            <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
              Resolved issues stay here. Snoozed issues return to the active queue when their snooze ends.
            </p>
          </div>

          {/* History list */}
          <div className="flex flex-col gap-2 w-full">
            {/* History columns */}
            <div className="flex flex-row items-center px-4 h-10 gap-6 text-[11px] font-medium leading-[145%] text-[#666666]">
              <span className="flex-1 min-w-[280px]">Issue</span>
              <span className="w-[100px] shrink-0">Area</span>
              <span className="w-[112px] shrink-0">Status</span>
              <span className="w-[140px] shrink-0">Updated / Returns</span>
              <span className="w-[184px] shrink-0 text-right">Action</span>
            </div>

            {/* History Rows */}
            <div className="flex flex-col gap-2 w-full">
              {/* Row 1: Resolved - 3 returns are waiting for approval */}
              {(historyFilter === "all" || historyFilter === "resolved") && (
                <div
                  style={{
                    boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)",
                  }}
                  className="flex flex-row items-center p-4 gap-6 w-full bg-white border border-[#16816A] rounded-[12px] min-h-[102px]"
                >
                  {/* Issue details */}
                  <div className="flex flex-col gap-1 flex-1 min-w-[280px]">
                    <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                      3 returns are waiting for approval
                    </span>
                    <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                      Marked resolved by Abhishek
                    </span>
                  </div>

                  {/* Area */}
                  <span className="w-[100px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                    Returns
                  </span>

                  {/* Resolution status */}
                  <div className="flex flex-row items-center gap-1.5 w-[112px] shrink-0">
                    <Check className="w-3.5 h-3.5 text-[#16816A] stroke-[2]" />
                    <span className="text-[12px] font-medium text-[#16816A] leading-[145%]">
                      Resolved
                    </span>
                  </div>

                  {/* Timing */}
                  <span className="w-[140px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                    Just now
                  </span>

                  {/* Contextual Action */}
                  <div className="w-[184px] shrink-0 flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.RETURNS)}
                      className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer"
                    >
                      Review returns →
                    </button>
                  </div>
                </div>
              )}

              {/* Row 2: Snoozed - 7 orders are at risk of missing dispatch */}
              {(historyFilter === "all" || historyFilter === "snoozed") && (
                <div
                  style={{
                    boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)",
                  }}
                  className="flex flex-row items-center p-4 gap-6 w-full bg-white border border-[#7661C8] rounded-[12px] min-h-[102px]"
                >
                  {/* Issue details */}
                  <div className="flex flex-col gap-1 flex-1 min-w-[280px]">
                    <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                      7 orders are at risk of missing dispatch
                    </span>
                    <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                      Temporarily removed from the active queue
                    </span>
                  </div>

                  {/* Area */}
                  <span className="w-[100px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                    Orders
                  </span>

                  {/* Resolution status */}
                  <div className="flex flex-row items-center gap-1.5 w-[112px] shrink-0">
                    <Clock className="w-3.5 h-3.5 text-[#7661C8] stroke-[2]" />
                    <span className="text-[12px] font-medium text-[#7661C8] leading-[145%]">
                      Snoozed
                    </span>
                  </div>

                  {/* Timing */}
                  <span className="w-[140px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                    Until tomorrow
                  </span>

                  {/* Contextual Action & Unsnooze button */}
                  <div className="w-[184px] shrink-0 flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => openDrawer(ALL_ISSUES[0])}
                      className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer"
                    >
                      Review orders →
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnsnooze("1")}
                      className="h-[30px] w-[90px] rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center cursor-pointer"
                    >
                      Unsnooze
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pagination count */}
            <div className="pt-2 text-[12px] font-normal text-[#666666] leading-[145%]">
              Showing {historyFilter === "all" ? "2" : "1"} of 2
            </div>
          </div>
        </div>
      ) : isLoading ? (
        /* Loading issues state */
        <div className="flex flex-col gap-4 w-full animate-pulse">
          {/* Operations priority queue skeleton */}
          <div className="flex flex-col gap-2 w-full">
            {/* Queue columns */}
            <div className="flex flex-row items-center px-4 h-10 gap-3 text-[11px] font-medium leading-[145%] text-[#666666]">
              <div className="w-4 h-4 rounded-[3px] border border-[#BDBDBD] bg-white shrink-0" />
              <span className="w-[66px] shrink-0">Priority</span>
              <span className="flex-1 min-w-[280px]">Issue</span>
              <span className="w-[76px] shrink-0">Area</span>
              <span className="w-[138px] shrink-0">Impact</span>
              <span className="w-[102px] shrink-0">Due</span>
              <span className="w-[142px] shrink-0 text-right">Action</span>
            </div>

            {/* 5 Loading skeleton rows */}
            {[0, 1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                style={{
                  height: "80px",
                  boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)",
                }}
                className="w-full bg-white border-l-4 border-l-[#7661C8] border-t border-r border-b border-[#EAEAEA] rounded-[12px] flex flex-row items-center px-4 gap-3"
              >
                {/* Selection placeholder */}
                <div className="w-4 h-4 rounded-[3px] bg-[#F5F5F5] shrink-0" />

                {/* Priority placeholder */}
                <div className="w-[66px] shrink-0 flex items-center">
                  <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
                </div>

                {/* Issue details placeholder */}
                <div className="flex-1 min-w-[280px] flex flex-col gap-2 pr-4">
                  <div className="w-[276px] max-w-full h-2.5 rounded-[3px] bg-[#F5F5F5]" />
                  <div className="w-[326px] max-w-full h-2 rounded-[3px] bg-[#F5F5F5]" />
                </div>

                {/* Area placeholder */}
                <div className="w-[76px] shrink-0">
                  <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
                </div>

                {/* Impact placeholder */}
                <div className="w-[138px] shrink-0">
                  <div className="w-[108px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
                </div>

                {/* Due placeholder */}
                <div className="w-[102px] shrink-0">
                  <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
                </div>

                {/* Action placeholder */}
                <div className="w-[142px] shrink-0 flex justify-end">
                  <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
                </div>
              </div>
            ))}
          </div>

          {/* Queue pagination / loading status */}
          <div className="pt-1">
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Loading issues...
            </span>
          </div>
        </div>
      ) : filteredIssues.length === 0 ? (
        /* Empty queue / All caught up card */
        <div
          style={{
            height: "480px",
            boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)",
          }}
          className="w-full bg-white border border-[#E4E7EF] rounded-[18px] flex flex-col justify-center items-center gap-3.5 px-6 animate-in fade-in duration-150"
        >
          {/* Completion indicator */}
          <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
            <Check className="w-[18px] h-[18px] text-[#666666] stroke-[2]" />
          </div>

          {/* Empty heading */}
          <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] text-center max-w-[560px]">
            You’re all caught up.
          </h2>

          {/* Empty description */}
          <p className="text-[13px] font-normal leading-[145%] text-[#666666] text-center max-w-[560px]">
            There are no outstanding issues requiring your attention right now.
          </p>

          {/* Empty actions */}
          <div className="flex flex-row items-center gap-2 pt-2">
            {/* Primary Action: Go to dashboard */}
            <button
              type="button"
              onClick={() => navigate(ROUTES.DASHBOARD)}
              className="h-10 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors flex items-center justify-center shrink-0 min-w-[154px]"
            >
              Go to dashboard
            </button>

            {/* Secondary Action: View activity */}
            <button
              type="button"
              onClick={() => navigate(ROUTES.REPORTS)}
              className="h-10 px-4 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center shrink-0 min-w-[126px]"
            >
              View activity
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Operations Priority Queue Table */}
          <div className="flex flex-col gap-3 w-full relative">
            {/* Queue Notice banner when In progress filter is active */}
            {selectedStatus === "In progress" && (
              <div
                style={{
                  boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)",
                }}
                className="flex flex-row items-center p-4 gap-3 w-full bg-[#F0EDFC] border border-[#7661C8] rounded-[12px] animate-in fade-in duration-150"
              >
                <HelpCircle className="w-4 h-4 text-[#666666] shrink-0" />
                <div className="flex flex-col gap-[3px] flex-1">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    Dispatch review is in progress
                  </span>
                  <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                    You've started addressing this issue. It stays in the queue until the affected orders are ready to dispatch.
                  </span>
                </div>
              </div>
            )}

            {/* Queue Notice banner when an issue was marked resolved */}
            {resolvedNotice && selectedStatus !== "In progress" && (
              <div
                style={{
                  boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)",
                }}
                className="flex flex-row items-center p-4 gap-3 w-full bg-[#EDF9F5] border border-[#16816A] rounded-[12px] animate-in fade-in duration-150"
              >
                <HelpCircle className="w-4 h-4 text-[#666666] shrink-0" />
                <div className="flex flex-col gap-[3px] flex-1">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    {resolvedNotice.heading}
                  </span>
                  <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                    {resolvedNotice.description}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode("history")}
                  className="h-9 px-4 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center shrink-0 min-w-[124px] cursor-pointer"
                >
                  View history
                </button>
              </div>
            )}

            {/* Queue Notice banner when an issue was snoozed */}
            {snoozedNotice && selectedStatus !== "In progress" && (
              <div
                style={{
                  boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)",
                }}
                className="flex flex-row items-center p-4 gap-3 w-full bg-[#F0EDFC] border border-[#7661C8] rounded-[12px] animate-in fade-in duration-150"
              >
                <HelpCircle className="w-4 h-4 text-[#666666] shrink-0" />
                <div className="flex flex-col gap-[3px] flex-1">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    {snoozedNotice.heading}
                  </span>
                  <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                    {snoozedNotice.description}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode("history")}
                  className="h-9 px-4 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center shrink-0 min-w-[124px] cursor-pointer"
                >
                  View history
                </button>
              </div>
            )}

            {/* Bulk action toolbar (Appears when any item is selected) */}
            {selectedRows.length > 0 && (
              <div className="relative flex flex-row items-center px-3 h-11 gap-2 bg-[#EDE8FB] border border-[#DAD1F5] rounded-[12px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)] animate-in fade-in duration-150 z-20">
                {/* Selection count */}
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000] shrink-0 mr-1">
                  {selectedRows.length} selected
                </span>

                {/* Action 1: Mark resolved */}
                <button
                  type="button"
                  onClick={handleMarkResolved}
                  className="h-[30px] px-4 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center shrink-0"
                >
                  Mark resolved
                </button>

                {/* Action 2: Snooze dropdown trigger */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setSnoozeOpen(!snoozeOpen)}
                    className="h-[30px] px-3.5 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center gap-1.5"
                  >
                    <span>Snooze</span>
                    <ChevronDown className="w-3 h-3 text-[#666666]" />
                  </button>

                  {/* Snooze Popover Menu */}
                  {snoozeOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setSnoozeOpen(false)}
                      />
                      <div
                        style={{
                          boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.051)",
                        }}
                        className="absolute left-0 top-[36px] w-[172px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-30"
                      >
                        <button
                          type="button"
                          onClick={() => handleSnooze("later today")}
                          className="w-full h-8 px-2 flex items-center text-left text-[12px] font-normal leading-[145%] text-[#000000] rounded hover:bg-neutral-100 transition-colors"
                        >
                          Later today
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSnooze("tomorrow")}
                          className="w-full h-8 px-2 flex items-center text-left text-[12px] font-normal leading-[145%] text-[#000000] rounded hover:bg-neutral-100 transition-colors"
                        >
                          Tomorrow
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSnooze("this week")}
                          className="w-full h-8 px-2 flex items-center text-left text-[12px] font-normal leading-[145%] text-[#000000] rounded hover:bg-neutral-100 transition-colors"
                        >
                          This week
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Action 3: Assign */}
                <button
                  type="button"
                  className="h-[30px] px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-100 transition-colors flex items-center justify-center shrink-0"
                >
                  Assign
                </button>

                {/* Action 4: More */}
                <button
                  type="button"
                  className="h-[30px] px-3.5 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-100 transition-colors flex items-center gap-1 shrink-0"
                >
                  <span>More</span>
                  <ChevronDown className="w-3 h-3 text-[#666666]" />
                </button>

                {/* Selection reset (x icon on far right) */}
                <div className="flex-1 flex justify-end">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="w-5 h-5 flex items-center justify-center text-[#666666] hover:text-[#000000] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Table Columns Heading */}
            <div className="flex flex-row items-center px-4 h-10 gap-3 text-[11px] font-medium leading-[145%] text-[#666666]">
              {/* Select all checkbox */}
              <div
                onClick={toggleSelectAll}
                className={`w-4 h-4 rounded-[3px] border flex items-center justify-center cursor-pointer shrink-0 transition-colors ${
                  selectedRows.length === ALL_ISSUES.length && ALL_ISSUES.length > 0
                    ? "bg-[#000000] border-[#000000]"
                    : selectedRows.length > 0
                    ? "bg-[#000000] border-[#000000]"
                    : "bg-white border-[#BDBDBD]"
                }`}
              >
                {selectedRows.length === ALL_ISSUES.length && ALL_ISSUES.length > 0 ? (
                  <Check className="w-3 h-3 text-white stroke-[2.5]" />
                ) : selectedRows.length > 0 ? (
                  <Minus className="w-3 h-3 text-white stroke-[2.5]" />
                ) : null}
              </div>

              {/* Priority column */}
              <span className="w-[66px] shrink-0">Priority</span>

              {/* Issue column */}
              <span className="flex-1 min-w-[280px]">Issue</span>

              {/* Area column */}
              <span className="w-[76px] shrink-0">Area</span>

              {/* Impact column */}
              <span className="w-[138px] shrink-0">Impact</span>

              {/* Due column */}
              <span className="w-[102px] shrink-0">Due</span>

              {/* Action column */}
              <span className="w-[142px] shrink-0 text-right">Action</span>
            </div>

            {/* Issue Rows */}
            <div className="flex flex-col gap-2">
              {filteredIssues.map((item) => {
                const isChecked = selectedRows.includes(item.id);

                return (
                  <div
                    key={item.id}
                    style={{
                      borderColor: item.priorityColor,
                      backgroundColor: isChecked ? "#F3F0FF" : "#FFFFFF",
                    }}
                    className="flex flex-row items-center px-4 py-[18px] gap-3 border rounded-[12px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)] min-h-[88px] transition-all"
                  >
                    {/* Row Checkbox */}
                    <div
                      onClick={() => toggleSelectRow(item.id)}
                      className={`w-4 h-4 rounded-[3px] border flex items-center justify-center cursor-pointer shrink-0 transition-colors ${
                        isChecked
                          ? "bg-[#000000] border-[#000000]"
                          : "bg-white border-[#BDBDBD]"
                      }`}
                    >
                      {isChecked && (
                        <Check className="w-3 h-3 text-white stroke-[2.5]" />
                      )}
                    </div>

                    {/* Priority Label with bullet indicator */}
                    <div className="flex items-center gap-1.5 w-[66px] shrink-0">
                      <span
                        className="h-1 w-1 rounded-full shrink-0"
                        style={{ backgroundColor: item.bulletColor }}
                      />
                      <span
                        className="text-[12px] font-semibold leading-[145%]"
                        style={{ color: item.priorityColor }}
                      >
                        {item.priority}
                      </span>
                    </div>

                    {/* Issue Details: Title, Consequence & Optional In-Progress Status */}
                    <div className="flex flex-col gap-1 flex-1 min-w-[280px] pr-2">
                      <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                        {item.title}
                      </span>
                      <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                        {item.consequence}
                      </span>
                      {item.inProgressStatus && selectedStatus === "In progress" && (
                        <div className="flex flex-row items-center gap-1.5 pt-0.5">
                          <Clock className="w-3 h-3 text-[#666666] shrink-0" />
                          <span className="text-[11px] font-medium text-[#666666] leading-[145%]">
                            {item.inProgressStatus}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Area */}
                    <span className="w-[76px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                      {item.area}
                    </span>

                    {/* Impact */}
                    <span className="w-[138px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                      {item.impact}
                    </span>

                    {/* Due */}
                    <span
                      className={`w-[102px] shrink-0 text-[12px] leading-[145%] ${
                        item.deadlineBold
                          ? "font-medium text-[#000000]"
                          : "font-normal text-[#666666]"
                      }`}
                    >
                      {item.deadline}
                    </span>

                    {/* Contextual Action Link */}
                    <div className="w-[142px] shrink-0 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(item);
                        }}
                        className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer"
                      >
                        {item.actionText}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4. Queue Pagination Bar */}
            <div className="flex flex-row justify-between items-center pt-2 h-[30px] w-full text-[12px] text-[#666666]">
              <span className="font-normal leading-[145%]">
                {selectedStatus === "In progress"
                  ? "Showing 1 of 1"
                  : `Showing ${filteredIssues.length} of ${resolvedNotice || snoozedNotice ? "17" : "18"}`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  className="px-4 h-[30px] rounded-[8px] bg-[#F5F5F5] border border-[#EAEAEA] text-[12px] font-semibold text-[#666666] cursor-not-allowed flex items-center justify-center"
                >
                  Previous
                </button>
                <span className="px-2 text-[12px] font-normal text-[#666666]">
                  {selectedStatus === "In progress" ? "Page 1 of 1" : "Page 1 of 4"}
                </span>
                <button
                  type="button"
                  disabled={selectedStatus === "In progress"}
                  className={`px-4 h-[30px] rounded-[8px] border text-[12px] font-semibold flex items-center justify-center transition-colors ${
                    selectedStatus === "In progress"
                      ? "bg-[#F5F5F5] border-[#EAEAEA] text-[#666666] cursor-not-allowed"
                      : "bg-white border-[#666666] text-[#000000] hover:bg-neutral-50"
                  }`}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* 5. Recommended Action Bottom Banner (hidden when In progress filter is selected) */}
          {selectedStatus !== "In progress" && (
            <div className="flex flex-col sm:flex-row items-center justify-between p-[18px_20px] gap-6 bg-[#242D48] border border-[#384463] rounded-[14px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)] mt-2">
              {/* Rationale copy */}
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-[12px] font-semibold leading-[145%] text-[#C8BDFF]">
                  Recommended action
                </span>
                {resolvedNotice ? (
                  <>
                    <p className="text-[12px] font-normal leading-[145%] text-white">
                      12 of the 18 low-stock products have sold at least 3 units in the last 7 days.
                    </p>
                    <p className="text-[12px] font-normal leading-[145%] text-[#D8DEEB]">
                      Consider reviewing replenishment for these products first.
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] font-normal leading-[145%] text-white">
                    Start with the 7 critical orders at risk of missing dispatch. Resolving these protects delivery promises and seller fulfillment metrics across all channels.
                  </p>
                )}
              </div>

              {/* Primary action CTA button */}
              {resolvedNotice ? (
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.RECOMMENDATIONS)}
                  className="h-9 px-4 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-100 transition-colors flex items-center justify-center shrink-0 min-w-[190px]"
                >
                  Review recommendation
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openDrawer(ALL_ISSUES[0])}
                  className="h-10 px-4 rounded-[8px] bg-[#7661C8] text-[12px] font-semibold text-white hover:bg-[#6853B8] transition-colors flex items-center justify-center shrink-0 min-w-[140px]"
                >
                  Review critical orders
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* 6. Dispatch Issue Drawer / Overlay */}
      {activeDrawerIssue && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity"
            onClick={closeDrawer}
          />

          {/* Drawer container: 420px wide, 24px padding, white, border #E4E7EF, shadow */}
          <div
            style={{
              width: "420px",
              boxShadow: "-8px 0px 30px rgba(36, 45, 72, 0.12)",
            }}
            className="relative z-10 h-full bg-white border-l border-[#E4E7EF] flex flex-col justify-between p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
          >
            {/* Top Issue Detail Section */}
            <div className="flex flex-col items-start gap-6 w-full">
              {/* Drawer heading group */}
              <div className="flex flex-col items-start gap-3.5 w-full">
                {/* Issue Context: category label & close button */}
                <div className="flex flex-row justify-between items-center w-full h-7">
                  <span className="text-[11px] font-medium leading-[145%] text-[#666666]">
                    {activeDrawerIssue.categoryLabel}
                  </span>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-100 transition-colors"
                  >
                    <X className="w-4 h-4 text-[#666666]" />
                  </button>
                </div>

                {/* Issue Title */}
                <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000]">
                  {activeDrawerIssue.title}
                </h2>

                {/* Resolution Status */}
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  {activeDrawerIssue.statusText}
                </span>
              </div>

              {/* Detail Divider */}
              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section 1: Why this matters */}
              <div className="flex flex-col items-start gap-2 w-full">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  Why this matters
                </span>
                <p className="text-[13px] font-normal leading-[145%] text-[#666666]">
                  {activeDrawerIssue.whyItMatters}
                </p>
              </div>

              {/* Section 2: Affected items / orders */}
              <div className="flex flex-col items-start gap-2 w-full">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  {activeDrawerIssue.affectedHeading}
                </span>

                {/* Order List */}
                <div className="flex flex-col items-start w-full">
                  {activeDrawerIssue.affectedItems.map((order) => (
                    <div
                      key={order.id}
                      onClick={() => navigate(order.href)}
                      className="flex flex-row justify-between items-center w-full h-9 border-b border-[#EAEAEA] cursor-pointer hover:bg-neutral-50 px-1 rounded transition-colors"
                    >
                      <span className="text-[12px] font-medium leading-[145%] text-[#000000]">
                        {order.label}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#666666]" />
                    </div>
                  ))}

                  {/* Additional count indicator */}
                  {activeDrawerIssue.additionalCountText && (
                    <div className="h-[30px] flex items-end">
                      <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                        {activeDrawerIssue.additionalCountText}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Deadline Callout Pill */}
              {activeDrawerIssue.deadlineCallout && (
                <div className="flex flex-col justify-center items-start px-3 py-2.5 gap-2 w-full bg-[#FFF1F3] border border-[#F2CAD2] rounded-[12px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)]">
                  <span className="text-[12px] font-semibold leading-[145%] text-[#A33549]">
                    {activeDrawerIssue.deadlineCallout.heading}
                  </span>
                  <span className="text-[13px] font-semibold leading-[145%] text-[#A33549]">
                    {activeDrawerIssue.deadlineCallout.value}
                  </span>
                </div>
              )}

              {/* Section 4: Recommended Action Card */}
              <div className="flex flex-col items-start p-4 gap-2 w-full bg-[#242D48] border border-[#384463] rounded-[14px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)]">
                <span className="text-[12px] font-semibold leading-[145%] text-[#C8BDFF]">
                  Recommended action
                </span>
                <p className="text-[13px] font-normal leading-[145%] text-[#D8DEEB]">
                  {activeDrawerIssue.recommendedAction}
                </p>
              </div>
            </div>

            {/* Bottom Drawer Actions */}
            <div className="flex flex-col items-start pt-5 gap-3 w-full border-t border-[#EAEAEA] mt-6">
              {/* Primary Action Button */}
              <button
                type="button"
                onClick={() => {
                  closeDrawer();
                  navigate(activeDrawerIssue.actionHref);
                }}
                className="w-full h-10 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors flex items-center justify-center"
              >
                {activeDrawerIssue.primaryActionLabel}
              </button>

              {/* Secondary Action Button */}
              <button
                type="button"
                onClick={closeDrawer}
                className="w-full h-10 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center"
              >
                {activeDrawerIssue.secondaryActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

