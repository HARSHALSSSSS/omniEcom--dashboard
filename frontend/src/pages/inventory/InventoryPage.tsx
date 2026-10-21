import { useState } from "react";
import {
  RefreshCw,
  SlidersHorizontal,
  ArrowRightLeft,
  Search,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Activity,
  ArrowUpRight,
  Database,
  Bookmark,
  MoreHorizontal,
  Box,
  ShoppingBag,
  Undo2,
  X,
  History,
  ShieldCheck,
  Home,
  Upload,
  Plus,
} from "lucide-react";
import {
  useSyncInventoryChannels,
  useInventorySummary,
  useAdjustStock,
} from "@/hooks/useInventory";

export default function InventoryPage() {
  const syncMutation = useSyncInventoryChannels();
  const adjustMutation = useAdjustStock();
  const { data: inventorySummary } = useInventorySummary();
  const [activeLedgerTab, setActiveLedgerTab] = useState<"all" | "recommended" | "custom" | "all_matching">("custom");
  const [tableSearch, setTableSearch] = useState("");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({
    "TS-BLK-042": false,
    "RS-BLU-211": false,
    "LW-BRN-018": false,
    "TD-GRY-091": false,
  });
  const [drawerProductSku, setDrawerProductSku] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"context" | "adjust">("context");
  const [showSyncAlert, setShowSyncAlert] = useState<boolean>(false);
  const [selectedSyncChannel, setSelectedSyncChannel] = useState<"Amazon" | "Flipkart" | "Meesho" | "Shopify">("Amazon");
  const [isInventoryEmpty, setIsInventoryEmpty] = useState<boolean>(false);

  // State for Adjust stock sidebar form
  const [adjustProductSku, setAdjustProductSku] = useState<string>("TS-BLK-042");
  const [adjustLocation, setAdjustLocation] = useState<string>("Mumbai");
  const [adjustType, setAdjustType] = useState<"Damage" | "Return" | "Correction" | "Manual adjustment" | "Other">("Damage");
  const [adjustQuantity, setAdjustQuantity] = useState<string>("6");
  const [adjustReason, setAdjustReason] = useState<string>("Damaged units");
  const [adjustNote, setAdjustNote] = useState<string>("");

  const productContexts: Record<
    string,
    {
      title: string;
      fullName: string;
      sku: string;
      thumb: string;
      available: number;
      reserved: number;
      incoming: number;
      locations: { name: string; qty: number }[];
      channels: { name: string; qty: number }[];
      healthStatus: string;
      healthReason: string;
      movementTime: string;
      movementAction: string;
      movementDetail: string;
    }
  > = {
    "TS-BLK-042": {
      title: "Black T-Shirt",
      fullName: "Classic Black T-Shirt",
      sku: "TS-BLK-042",
      thumb: "/products/black-tshirt.jpg",
      available: 42,
      reserved: 8,
      incoming: 100,
      locations: [
        { name: "Mumbai", qty: 42 },
        { name: "Delhi", qty: 0 },
        { name: "Bangalore", qty: 0 },
      ],
      channels: [
        { name: "Amazon", qty: 42 },
        { name: "Flipkart", qty: 42 },
        { name: "Meesho", qty: 40 },
        { name: "Shopify", qty: 42 },
      ],
      healthStatus: "Attention",
      healthReason: "Estimated coverage is 7 days while lead time is 10 days.",
      movementTime: "11:58",
      movementAction: "Manual stock adjustment",
      movementDetail: "Black T-Shirt +12",
    },
    "RS-BLU-211": {
      title: "Running Shoes",
      fullName: "Running Shoes — Blue",
      sku: "RS-BLU-211",
      thumb: "/products/running-shoes.jpg",
      available: 184,
      reserved: 21,
      incoming: 60,
      locations: [
        { name: "Mumbai", qty: 94 },
        { name: "Pune", qty: 90 },
        { name: "Delhi", qty: 0 },
      ],
      channels: [
        { name: "Amazon", qty: 184 },
        { name: "Flipkart", qty: 184 },
        { name: "Meesho", qty: 184 },
        { name: "Shopify", qty: 184 },
      ],
      healthStatus: "Healthy",
      healthReason: "Coverage is 31 days. Stock levels match replenishment targets.",
      movementTime: "10:44",
      movementAction: "Inventory sync completed",
      movementDetail: "Across 4 channels",
    },
    "LW-BRN-018": {
      title: "Leather Wallet",
      fullName: "Leather Wallet — Brown",
      sku: "LW-BRN-018",
      thumb: "/products/leather-wallet.jpg",
      available: 0,
      reserved: 4,
      incoming: 0,
      locations: [
        { name: "Delhi", qty: 0 },
        { name: "Mumbai", qty: 0 },
        { name: "Bangalore", qty: 0 },
      ],
      channels: [
        { name: "Amazon", qty: 0 },
        { name: "Flipkart", qty: 0 },
        { name: "Meesho", qty: 0 },
        { name: "Shopify", qty: 0 },
      ],
      healthStatus: "Critical",
      healthReason: "Zero stock available with incoming order reservations.",
      movementTime: "09:30",
      movementAction: "Stock depletion alert",
      movementDetail: "Leather Wallet 0 units",
    },
    "TD-GRY-091": {
      title: "Travel Duffel",
      fullName: "Travel Duffel — Charcoal",
      sku: "TD-GRY-091",
      thumb: "/products/travel-duffel.jpg",
      available: 28,
      reserved: 9,
      incoming: 0,
      locations: [
        { name: "Bangalore", qty: 28 },
        { name: "Mumbai", qty: 0 },
        { name: "Delhi", qty: 0 },
      ],
      channels: [
        { name: "Amazon", qty: 28 },
        { name: "Flipkart", qty: 28 },
        { name: "Meesho", qty: 26 },
        { name: "Shopify", qty: 28 },
      ],
      healthStatus: "Critical",
      healthReason: "Coverage is 4 days while replenishment lead time is 8 days.",
      movementTime: "11:20",
      movementAction: "Return inspection completed",
      movementDetail: "Returned stock update +4",
    },
  };

  // Stock Horizon products data matching Screen 26 exactly
  const stockHorizonItems = [
    {
      id: "prod-1",
      name: "Classic Black T-Shirt",
      sku: "TS-BLK-042",
      thumb: "/products/black-tshirt.jpg",
      stock: 42,
      avgDailySales: "6",
      coverageText: "7 days",
      coverageColor: "#D97706",
      fillWidthPct: 35, // 7 days out of 20d
      leadTime: "10d",
      status: "Attention",
      statusColor: "#D97706",
      statusIcon: AlertTriangle,
      action: "Reorder attention required",
      thresholdPct: 50, // 10d lead threshold at midpoint
      thresholdLabel: "10d lead",
      maxLabel: "20d",
      currentLabel: "7d",
    },
    {
      id: "prod-2",
      name: "Running Shoes — Blue",
      sku: "RS-BLU-211",
      thumb: "/products/running-shoes.jpg",
      stock: 184,
      avgDailySales: "—",
      coverageText: "31 days",
      coverageColor: "#16A34A",
      fillWidthPct: 77.5, // 31 days out of 40d
      leadTime: "—",
      status: "Healthy",
      statusColor: "#16A34A",
      statusIcon: CheckCircle2,
      action: "View product →",
      thresholdPct: null,
      thresholdLabel: null,
      maxLabel: "40d",
      currentLabel: null,
    },
    {
      id: "prod-3",
      name: "Leather Wallet",
      sku: "LW-BRN-018",
      thumb: "/products/leather-wallet.jpg",
      stock: 0,
      avgDailySales: "—",
      coverageText: "0 days",
      coverageColor: "#DC2626",
      fillWidthPct: 0,
      leadTime: "—",
      status: "Stockout",
      statusColor: "#DC2626",
      statusIcon: XCircle,
      action: "Review stock →",
      thresholdPct: null,
      thresholdLabel: null,
      maxLabel: "20d",
      currentLabel: null,
    },
    {
      id: "prod-4",
      name: "Travel Duffel",
      sku: "TD-GRY-091",
      thumb: "/products/travel-duffel.jpg",
      stock: 28,
      avgDailySales: "—",
      coverageText: "4 days",
      coverageColor: "#DC2626",
      fillWidthPct: 20, // 4 days out of 20d
      leadTime: "8d",
      status: "Critical",
      statusColor: "#DC2626",
      statusIcon: XCircle,
      action: "Review replenishment →",
      thresholdPct: 40, // 8d lead threshold
      thresholdLabel: "8d lead",
      maxLabel: "20d",
      currentLabel: "4d",
    },
  ];

  // Inventory signals diagnostic rail (matching screenshot counts, sparklines, icons)
  const signals = [
    { count: 12, label: "Low stock", color: "#D97706", icon: Activity, spark: "M0,6 L6,6 L8,2 L11,9 L14,4 L17,7 L24,6" },
    { count: 4, label: "Stockout risk", color: "#DC2626", icon: AlertTriangle, spark: "M0,7 L6,7 L9,1 L12,10 L15,5 L18,7 L24,7" },
    { count: 7, label: "Inventory mismatches", color: "#D97706", icon: Activity, spark: "M0,6 L6,6 L9,3 L12,8 L15,4 L18,7 L24,6" },
    { count: 16, label: "Slow-moving", color: "#737373", icon: Activity, spark: "M0,7 L7,7 L10,3 L13,8 L16,5 L19,7 L24,7" },
    { count: 9, label: "High velocity", color: "#16A34A", icon: TrendingUp, spark: "M0,8 L6,8 L10,2 L14,7 L18,1 L24,1" },
    { count: 3, label: "Aging inventory", color: "#D97706", icon: Activity, spark: "M0,7 L6,7 L9,4 L12,8 L15,3 L18,7 L24,7" },
    { count: 2, label: "Warehouse imbalance", color: "#D97706", icon: Activity, spark: "M0,7 L7,7 L10,4 L13,9 L16,4 L19,7 L24,7" },
  ];

  // Product table inventory rows matching screenshot
  const ledgerRows = [
    {
      sku: "TS-BLK-042",
      name: "Black T-Shirt",
      thumb: "/products/black-tshirt.jpg",
      railColor: "#D97706",
      available: 42,
      reserved: 8,
      incoming: 100,
      coverage: "7d",
      coverageColor: "#D97706",
      warehouse: "Mumbai",
      channelSync: "Healthy",
      channelSyncColor: "#16A34A",
      channelSyncIcon: CheckCircle2,
      health: "Attention",
      healthColor: "#D97706",
      healthIcon: AlertTriangle,
      lastMovement: "—",
    },
    {
      sku: "RS-BLU-211",
      name: "Running Shoes",
      thumb: "/products/running-shoes.jpg",
      railColor: "#16A34A",
      available: 184,
      reserved: 21,
      incoming: 60,
      coverage: "31d",
      coverageColor: "#16A34A",
      warehouse: "Pune",
      channelSync: "Healthy",
      channelSyncColor: "#16A34A",
      channelSyncIcon: CheckCircle2,
      health: "Healthy",
      healthColor: "#16A34A",
      healthIcon: CheckCircle2,
      lastMovement: "—",
    },
    {
      sku: "LW-BRN-018",
      name: "Leather Wallet",
      thumb: "/products/leather-wallet.jpg",
      railColor: "#DC2626",
      available: 0,
      reserved: 4,
      incoming: 0,
      coverage: "0d",
      coverageColor: "#DC2626",
      warehouse: "Delhi",
      channelSync: "Failed",
      channelSyncColor: "#DC2626",
      channelSyncIcon: XCircle,
      health: "Critical",
      healthColor: "#DC2626",
      healthIcon: XCircle,
      lastMovement: "—",
    },
    {
      sku: "TD-GRY-091",
      name: "Travel Duffel",
      thumb: "/products/travel-duffel.jpg",
      railColor: "#DC2626",
      available: 28,
      reserved: 9,
      incoming: 0,
      coverage: "4d",
      coverageColor: "#DC2626",
      warehouse: "Bangalore",
      channelSync: "Attention",
      channelSyncColor: "#D97706",
      channelSyncIcon: AlertTriangle,
      health: "Stockout Risk",
      healthColor: "#DC2626",
      healthIcon: XCircle,
      lastMovement: "—",
    },
  ];

  const allSelected = Object.values(selectedRows).every(Boolean);
  const selectedCount = Object.values(selectedRows).filter(Boolean).length;
  const toggleSelectAll = () => {
    const next = !allSelected;
    setSelectedRows({
      "TS-BLK-042": next,
      "RS-BLU-211": next,
      "LW-BRN-018": next,
      "TD-GRY-091": next,
    });
  };

  const toggleRow = (sku: string) => {
    setSelectedRows((prev) => ({ ...prev, [sku]: !prev[sku] }));
  };

  return (
    <div className="w-full flex flex-col items-start gap-7 font-['Inter',sans-serif] select-none text-[#000000]">
      {/* ========================================================
          1. WORKSPACE INTRODUCTION (Heading & Actions)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-2">
        <div className="w-full flex flex-row justify-between items-center h-[53px]">
          {/* Title group */}
          <div className="flex flex-col items-start gap-[3px]">
            <span className="text-[10px] font-medium leading-[12px] uppercase tracking-wider text-[#707070]">
              INVENTORY WORKSPACE
            </span>
            <h1 className="text-[26px] font-semibold leading-[145%] text-[#000000] m-0 p-0">
              Inventory Control Room
            </h1>
          </div>

          {/* Workspace actions */}
          <div className="flex flex-row items-center gap-2 h-[34px]">
            {/* Sync all */}
            <button
              type="button"
              onClick={() => {
                setShowSyncAlert((prev) => !prev);
                syncMutation.mutate();
              }}
              disabled={syncMutation.isPending}
              className={`box-border flex flex-row items-center px-3 py-0 gap-[7px] h-[34px] border rounded-lg transition-colors cursor-pointer ${
                showSyncAlert
                  ? "bg-neutral-100 border-[#BDBDBD] text-black"
                  : "bg-white border-[#EAEAEA] text-[#000000] hover:bg-neutral-50"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#666666] stroke-[1.5px] ${syncMutation.isPending ? "animate-spin" : ""}`} />
              <span className="text-[12px] font-normal leading-[145%]">
                {showSyncAlert ? "Syncing (viewing issues)" : "Sync all"}
              </span>
            </button>

            {/* Adjust stock (Primary Black) */}
            <button
              type="button"
              onClick={() => {
                setDrawerMode("adjust");
                setDrawerProductSku("TS-BLK-042");
              }}
              className="box-border flex flex-row items-center px-3 py-0 gap-[7px] h-[34px] bg-[#000000] border border-[#000000] rounded-lg hover:bg-neutral-900 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-white stroke-[1.5px]" />
              <span className="text-[12px] font-semibold leading-[145%] text-white">
                Adjust stock
              </span>
            </button>

            {/* Transfer stock */}
            <button
              type="button"
              className="box-border flex flex-row items-center px-3 py-0 gap-[7px] h-[34px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px]" />
              <span className="text-[12px] font-normal leading-[145%] text-[#000000]">
                Transfer stock
              </span>
            </button>

            {/* More action (toggles empty state preview) */}
            <button
              type="button"
              onClick={() => setIsInventoryEmpty((prev) => !prev)}
              title="Toggle empty onboarding state"
              className={`box-border flex flex-row items-center justify-center w-[34px] h-[34px] border rounded-lg transition-colors cursor-pointer ${
                isInventoryEmpty ? "bg-black text-white border-black" : "bg-white border-[#EAEAEA] text-[#000000] hover:bg-neutral-50"
              }`}
            >
              <span className="text-[14px] font-normal leading-none">···</span>
            </button>
          </div>
        </div>

        {/* Source of truth subhead */}
        <p className="w-full text-[12px] font-normal leading-[145%] text-[#666666] m-0">
          Master inventory as the source of truth with real-time operations across all channels.
        </p>
      </div>

      {isInventoryEmpty ? (
        /* ========================================================
           EMPTY STATE / INVENTORY ONBOARDING (Exact Figma Specs)
           ======================================================== */
        <div className="w-full max-w-[1152px] flex flex-col items-start gap-7">
          {/* Home Inventory banner */}
          <div className="box-border w-full h-[83px] py-5 px-0 flex flex-row items-center gap-3 border-y border-[#EAEAEA]">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <Home className="w-5 h-5 text-[#666666] stroke-[1.5px]" />
            </div>
            <div className="flex flex-col items-start gap-1">
              <span className="text-[15px] font-semibold leading-[145%] text-[#000000]">
                Home Inventory
              </span>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                All stock is managed from one location.
              </span>
            </div>
          </div>

          {/* Empty inventory ledger container */}
          <div className="w-full flex flex-col items-start gap-4">
            {/* Section heading */}
            <div className="w-full flex flex-row justify-between items-center h-[26px]">
              <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] m-0">
                Inventory ledger
              </h2>
            </div>

            {/* Empty column headings row */}
            <div className="w-full h-10 px-4 bg-[#F5F5F5] rounded-[6px] flex flex-row items-center justify-between text-[11px] font-normal text-[#666666] leading-[145%]">
              <span className="w-[120px]">Product</span>
              <span className="w-[100px]">SKU</span>
              <span className="w-[90px]">Available</span>
              <span className="w-[90px]">Reserved</span>
              <span className="w-[90px]">Incoming</span>
              <span className="w-[100px] text-right">Last movement</span>
            </div>

            {/* Inventory onboarding center box */}
            <div className="w-full min-h-[420px] flex flex-col justify-center items-center py-10 gap-4.5 text-center">
              {/* Empty inventory symbol box */}
              <div className="w-[74px] h-[74px] rounded-xl bg-[#F5F5F5] flex items-center justify-center">
                <Box className="w-9 h-9 text-[#000000] stroke-[1.5px]" />
              </div>

              {/* Empty state heading */}
              <h3 className="text-[26px] font-semibold leading-[145%] text-[#000000] m-0">
                Your inventory starts here
              </h3>

              {/* Empty state description */}
              <p className="max-w-[510px] text-[13px] font-normal leading-[145%] text-[#666666] m-0">
                Import products or add your first product to begin tracking stock.
              </p>

              {/* Onboarding actions */}
              <div className="flex flex-row items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsInventoryEmpty(false)}
                  className="box-border h-[34px] px-3 bg-[#000000] border border-[#000000] rounded-lg flex flex-row items-center justify-center gap-[7px] text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 stroke-[1.5px]" />
                  <span className="text-[12px] font-semibold leading-[145%]">
                    Import products
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsInventoryEmpty(false)}
                  className="box-border h-[34px] px-3 bg-[#FFFFFF] border border-[#EAEAEA] rounded-lg flex flex-row items-center justify-center gap-[7px] text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px]" />
                  <span className="text-[12px] font-normal leading-[145%]">
                    Add product
                  </span>
                </button>
              </div>

              {/* Import help caption */}
              <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                Start with a product catalog, or add one product at a time.
              </span>
            </div>

            {/* Divider */}
            <div className="w-full h-[1px] bg-[#EAEAEA] my-2" />

            {/* First steps guided walkthrough row */}
            <div className="w-full flex flex-col md:flex-row items-start gap-7 pt-2">
              {/* Step 1: Add your products */}
              <div className="flex-1 flex flex-row items-start gap-3">
                <div className="w-[17px] h-[17px] flex items-center justify-center shrink-0 mt-0.5">
                  <Box className="w-[17px] h-[17px] text-[#666666] stroke-[1.5px]" />
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                    Add your products
                  </span>
                  <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                    Keep each product&apos;s SKU and stock in one place.
                  </span>
                </div>
              </div>

              {/* Step 2: Set your available stock */}
              <div className="flex-1 flex flex-row items-start gap-3">
                <div className="w-[17px] h-[17px] flex items-center justify-center shrink-0 mt-0.5">
                  <Home className="w-[17px] h-[17px] text-[#666666] stroke-[1.5px]" />
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                    Set your available stock
                  </span>
                  <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                    Begin with the units in Home Inventory.
                  </span>
                </div>
              </div>

              {/* Step 3: Track every movement */}
              <div className="flex-1 flex flex-row items-start gap-3">
                <div className="w-[17px] h-[17px] flex items-center justify-center shrink-0 mt-0.5">
                  <History className="w-[17px] h-[17px] text-[#666666] stroke-[1.5px]" />
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                    Track every movement
                  </span>
                  <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                    Review adjustments and orders in your audit trail.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ========================================================
              2. THE STOCK PULSE (Screen 26)
              ======================================================== */}
          <div className="w-full flex flex-col items-start gap-[14px]">
        {/* Section heading */}
        <div className="w-full flex flex-row justify-between items-center h-[26px]">
          <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] m-0">
            The stock pulse
          </h2>
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
            Master stock: 9,784
          </span>
        </div>

        {/* Stock quantities summary row */}
        <div className="w-full flex flex-row justify-between items-start h-[37px]">
          {/* Available */}
          <div className="flex flex-col items-start gap-[3px]">
            <div className="flex flex-row items-center gap-1.5 h-[17px]">
              <span className="w-[5px] h-[5px] bg-[#242424] inline-block rounded-full" />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Available</span>
            </div>
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">8,462</span>
          </div>

          {/* Reserved */}
          <div className="flex flex-col items-start gap-[3px]">
            <div className="flex flex-row items-center gap-1.5 h-[17px]">
              <span className="w-[5px] h-[5px] bg-[#737373] inline-block rounded-full" />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Reserved</span>
            </div>
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">1,184</span>
          </div>

          {/* Incoming */}
          <div className="flex flex-col items-start gap-[3px]">
            <div className="flex flex-row items-center gap-1.5 h-[17px]">
              <span className="w-[5px] h-[5px] bg-[#0C41D1] inline-block rounded-full" />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Incoming</span>
            </div>
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">2,540</span>
          </div>

          {/* Returned */}
          <div className="flex flex-col items-start gap-[3px]">
            <div className="flex flex-row items-center gap-1.5 h-[17px]">
              <span className="w-[5px] h-[5px] bg-[#D4D4D4] inline-block rounded-full" />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Returned</span>
            </div>
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">184</span>
          </div>

          {/* Damaged */}
          <div className="flex flex-col items-start gap-[3px]">
            <div className="flex flex-row items-center gap-1.5 h-[17px]">
              <span className="w-[5px] h-[5px] bg-[#DC2626] inline-block rounded-full" />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Damaged</span>
            </div>
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">76</span>
          </div>

          {/* Quarantined */}
          <div className="flex flex-col items-start gap-[3px]">
            <div className="flex flex-row items-center gap-1.5 h-[17px]">
              <span className="w-[5px] h-[5px] bg-[#D97706] inline-block rounded-full" />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Quarantined</span>
            </div>
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">32</span>
          </div>
        </div>

        {/* Proportional stock composition bar */}
        <div className="w-full h-[14px] flex flex-row items-start gap-[2px] rounded-[3px] overflow-hidden">
          <div style={{ flex: "8462" }} className="h-[14px] bg-[#16A34A]" title="Available: 8,462" />
          <div style={{ flex: "1184" }} className="h-[14px] bg-[#D9BD06]" title="Reserved: 1,184" />
          <div style={{ flex: "2540" }} className="h-[14px] bg-[#0C41D1]" title="Incoming: 2,540" />
          <div style={{ flex: "184" }} className="h-[14px] bg-[#D4D4D4]" title="Returned: 184" />
          <div style={{ flex: "76" }} className="h-[14px] bg-[#DC2626]" title="Damaged: 76" />
          <div style={{ flex: "32" }} className="h-[14px] bg-[#D97706]" title="Quarantined: 32" />
        </div>

        {/* Stock composition captions */}
        <div className="w-full flex flex-row justify-between items-start h-[17px]">
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
            Available units are actively synced across live marketplace connections.
          </span>
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
            Reserved + Damaged + Quarantined withheld automatically.
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-[#EAEAEA]" />

      {/* ========================================================
          3. RISK INSTRUMENTS: Stock Horizon & Inventory Signals
          ======================================================== */}
      <div className="w-full flex flex-row items-start gap-10">
        {/* Stock Horizon */}
        <div className="flex-1 flex flex-col items-start">
          {/* Horizon Section Heading */}
          <div className="w-full flex flex-row justify-between items-baseline mb-4">
            <h2 className="text-[20px] font-semibold text-[#111111] tracking-tight m-0">
              Stock Horizon
            </h2>
            <span className="text-[12px] font-normal text-[#737373]">
              Coverage against replenishment lead time
            </span>
          </div>

          {/* Table Header Labels */}
          <div className="w-full grid grid-cols-[minmax(240px,1.4fr)_80px_90px_minmax(280px,2fr)_80px_minmax(180px,1.2fr)] items-center text-[11px] uppercase font-medium tracking-wider text-[#737373] pb-2.5 pt-1 border-b border-[#EAEAEA]">
            <span>PRODUCT / SKU</span>
            <span>STOCK</span>
            <span>AVG / DAY</span>
            <span>COVERAGE</span>
            <span>LEAD</span>
            <span>HEALTH / ACTION</span>
          </div>

          {/* Stock Bands Container */}
          <div className="w-full flex flex-col items-start divide-y divide-[#EAEAEA]">
            {stockHorizonItems.map((item) => {
              const StatusIcon = item.statusIcon;
              return (
                <div
                  key={item.id}
                  className="w-full py-4 grid grid-cols-[minmax(240px,1.4fr)_80px_90px_minmax(280px,2fr)_80px_minmax(180px,1.2fr)] items-center"
                >
                  {/* Product Identity */}
                  <div className="flex flex-row items-center gap-3 pr-4">
                    <img
                      src={item.thumb}
                      alt={item.name}
                      className="w-10 h-10 rounded-lg object-cover border border-[#EAEAEA] bg-neutral-100 shrink-0 shadow-sm"
                    />
                    <div className="flex flex-col items-start min-w-0">
                      <span className="text-[13px] font-semibold text-[#111111] leading-snug truncate">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-[#737373] mt-0.5">
                        {item.sku}
                      </span>
                    </div>
                  </div>

                  {/* Stock */}
                  <span className="text-[13px] font-semibold text-[#111111]">
                    {item.stock}
                  </span>

                  {/* Avg Daily Sales */}
                  <span className="text-[13px] font-normal text-[#111111]">
                    {item.avgDailySales}
                  </span>

                  {/* Coverage Runway */}
                  <div className="w-full max-w-[320px] pr-8 flex flex-col items-start">
                    <span
                      style={{ color: item.coverageColor }}
                      className="text-[12px] font-semibold mb-1"
                    >
                      {item.coverageText}
                    </span>

                    {/* Stock runway bar */}
                    <div className="relative w-full h-[22px]">
                      {/* Track background */}
                      <div className="absolute left-0 top-[2px] w-full h-[2.5px] bg-[#F2F2F2] rounded-full" />

                      {/* Covered duration fill */}
                      {item.fillWidthPct > 0 && (
                        <div
                          style={{
                            width: `${item.fillWidthPct}%`,
                            backgroundColor: item.coverageColor,
                          }}
                          className="absolute left-0 top-[2px] h-[2.5px] rounded-full"
                        />
                      )}

                      {/* Coverage endpoint tick */}
                      <div
                        style={{
                          left: item.fillWidthPct === 0 ? "0px" : `calc(${item.fillWidthPct}% - 1px)`,
                          backgroundColor: item.coverageColor,
                        }}
                        className="absolute top-0 w-[2px] h-[7px] rounded-sm"
                      />

                      {/* Lead time threshold marker if present */}
                      {item.thresholdPct !== null && (
                        <div
                          style={{ left: `calc(${item.thresholdPct}% - 0.75px)` }}
                          className="absolute top-0 w-[1.5px] h-[9px] bg-[#555555]"
                          title={item.thresholdLabel || ""}
                        />
                      )}

                      {/* Scale labels */}
                      <div className="absolute left-0 top-[10px] w-full flex flex-row items-center text-[10px] text-[#888888]">
                        <span>0</span>
                        {item.currentLabel && (
                          <span
                            style={{
                              position: "absolute",
                              left: `${item.fillWidthPct}%`,
                              transform: "translateX(-50%)",
                            }}
                          >
                            {item.currentLabel}
                          </span>
                        )}
                        {item.thresholdLabel && (
                          <span
                            style={{
                              position: "absolute",
                              left: `${item.thresholdPct}%`,
                              transform: "translateX(6px)",
                            }}
                            className="text-[#555555]"
                          >
                            {item.thresholdLabel}
                          </span>
                        )}
                        <span className="ml-auto">{item.maxLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Lead Time */}
                  <span className="text-[13px] font-normal text-[#111111]">
                    {item.leadTime}
                  </span>

                  {/* Health & Action */}
                  <div className="flex flex-col items-start gap-0.5">
                    <div className="flex flex-row items-center gap-1.5">
                      <StatusIcon
                        style={{ color: item.statusColor }}
                        className="w-3.5 h-3.5 stroke-[2px]"
                      />
                      <span
                        style={{ color: item.statusColor }}
                        className="text-[12px] font-medium"
                      >
                        {item.status}
                      </span>
                    </div>
                    {item.action === "Reorder attention required" ? (
                      <span
                        onClick={() => setDrawerProductSku(item.sku)}
                        className="text-[12px] text-[#444444] mt-0.5 hover:underline cursor-pointer"
                      >
                        {item.action}
                      </span>
                    ) : (
                      <span
                        onClick={() => setDrawerProductSku(item.sku)}
                        className="text-[12px] text-[#111111] hover:underline cursor-pointer flex flex-row items-center gap-1 mt-0.5"
                      >
                        {item.action}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inventory Signals Diagnostic Rail */}
        <div className="w-[300px] flex flex-col items-start pl-8 border-l border-[#EAEAEA]">
          {/* Signals Heading */}
          <div className="w-full flex flex-row justify-between items-baseline mb-4">
            <h2 className="text-[20px] font-semibold text-[#111111] tracking-tight m-0">
              Inventory signals
            </h2>
          </div>

          {/* Diagnostic Rail list */}
          <div className="w-full flex flex-col items-start divide-y divide-[#F0F0F0]">
            {signals.map((sig, idx) => {
              const SigIcon = sig.icon;
              return (
                <div
                  key={idx}
                  className="w-full py-3 flex flex-row items-center gap-2.5 hover:bg-neutral-50/70 transition-colors cursor-pointer group"
                >
                  <span className="w-5 text-[13px] font-semibold text-[#111111] shrink-0">
                    {sig.count}
                  </span>
                  <SigIcon className="w-3.5 h-3.5 text-[#555555] stroke-[1.75px] shrink-0" />
                  <span className="flex-1 text-[13px] text-[#111111] truncate font-normal">
                    {sig.label}
                  </span>

                  {/* Pulse waveform SVG */}
                  <svg className="w-7 h-3.5 shrink-0" viewBox="0 0 28 14" fill="none">
                    <path
                      d={sig.spark}
                      stroke={sig.color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  {/* Vertical bar severity indicator */}
                  <span
                    style={{ backgroundColor: sig.color }}
                    className="w-[2.5px] h-3.5 rounded-full shrink-0 mx-0.5"
                  />

                  {/* Chevron Right */}
                  <span className="text-[13px] text-[#888888] leading-none shrink-0 group-hover:text-black transition-colors">
                    ›
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================
          4. INVENTORY INTELLIGENCE BANNER (Screen 26 AI Gradient)
          ======================================================== */}
      <div
        style={{
          background:
            "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)",
        }}
        className="w-full rounded-[24px] px-8 py-6 flex flex-row items-start gap-16"
      >
        {/* Advisory analysis column */}
        <div className="w-[340px] shrink-0 flex flex-col items-start gap-2">
          <div className="flex flex-row items-center gap-2">
            <span className="text-[14px] text-[#222222] leading-none">✦</span>
            <span className="text-[13px] font-semibold text-[#111111]">
              Inventory intelligence
            </span>
            <span className="text-[12px] font-normal text-[#666666] tracking-wide ml-0.5">
              ADVISORY
            </span>
          </div>

          <span className="text-[13px] font-semibold text-[#D97706] mt-0.5">
            Reorder attention
          </span>

          <p className="text-[12px] font-normal leading-relaxed text-[#555555] m-0">
            7 products approach stockout before their respective replenishment lead time.
          </p>

          <span className="text-[12px] font-normal text-[#666666] mt-1">
            Recommendation category: Safety buffer depletion
          </span>
        </div>

        {/* Recommendations list column - takes all remaining width naturally */}
        <div className="flex-1 min-w-0 flex flex-col items-start gap-2.5 pt-0.5">
          {/* Rec 1 */}
          <div
            onClick={() => setDrawerProductSku("TS-BLK-042")}
            className="w-full flex flex-row items-center gap-3 py-0.5 group cursor-pointer"
          >
            <span className="w-[3px] h-3.5 bg-[#D97706] rounded-full shrink-0" />
            <span className="w-[130px] text-[13px] font-semibold text-[#111111] shrink-0">
              Black T-Shirt
            </span>
            <span className="flex-1 text-[12px] text-[#555555] truncate">
              42 units · 7 days coverage · 10-day lead time
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px] shrink-0 group-hover:text-black transition-colors ml-4" />
          </div>

          {/* Rec 2 */}
          <div
            onClick={() => setDrawerProductSku("TD-GRY-091")}
            className="w-full flex flex-row items-center gap-3 py-0.5 group cursor-pointer"
          >
            <span className="w-[3px] h-3.5 bg-[#D97706] rounded-full shrink-0" />
            <span className="w-[130px] text-[13px] font-semibold text-[#111111] shrink-0">
              Travel Duffel
            </span>
            <span className="flex-1 text-[12px] text-[#555555] truncate">
              28 units · 4 days coverage · 6-day lead time
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px] shrink-0 group-hover:text-black transition-colors ml-4" />
          </div>

          {/* Rec 3 */}
          <div
            onClick={() => setDrawerProductSku("RS-BLU-211")}
            className="w-full flex flex-row items-center gap-3 py-0.5 group cursor-pointer"
          >
            <span className="w-[3px] h-3.5 bg-[#D97706] rounded-full shrink-0" />
            <span className="w-[130px] text-[13px] font-semibold text-[#111111] shrink-0">
              Canvas Shoes
            </span>
            <span className="flex-1 text-[12px] text-[#555555] truncate">
              18 units · 3 days coverage · 8-day lead time
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px] shrink-0 group-hover:text-black transition-colors ml-4" />
          </div>

          {/* Action link */}
          <button
            type="button"
            onClick={() => setDrawerProductSku("TS-BLK-042")}
            className="text-[13px] font-semibold text-[#111111] hover:underline pt-1.5 cursor-pointer bg-transparent border-none p-0 flex items-center gap-1"
          >
            Review recommendations →
          </button>
        </div>
      </div>

      {/* ========================================================
          5. INVENTORY SYNCHRONIZATION (Channel Constellation)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-4">
        {/* Section Heading */}
        <div className="w-full flex flex-row justify-between items-baseline">
          <h2 className="text-[20px] font-semibold text-[#111111] tracking-tight m-0">
            Inventory synchronization
          </h2>
          <span className="text-[12px] font-normal text-[#737373]">
            Last master inventory update: 12:42:18 PM
          </span>
        </div>

        {/* Channel constellation node tree */}
        <div className="relative w-full flex flex-row items-start justify-between isolate pt-1">
          {/* Connecting horizontal line passing behind nodes */}
          <div className="absolute left-[170px] right-[20px] top-[18px] h-[1px] bg-[#E5E5E5] z-0" />

          {/* Node 1: Master Inventory */}
          <div className="w-[180px] shrink-0 flex flex-col items-start gap-1 z-10 bg-transparent pr-4">
            <div className="flex flex-row items-center gap-2 mb-0.5">
              <Database className="w-4 h-4 text-[#444444] stroke-[1.75px]" />
              <span className="text-[13px] font-semibold text-[#111111]">
                Master Inventory
              </span>
            </div>
            <span className="text-[14px] font-semibold text-[#111111] leading-none mb-1">
              {inventorySummary?.totalUnitsAvailable ? inventorySummary.totalUnitsAvailable.toLocaleString("en-IN") : "8,462"}
            </span>
            <span className="text-[12px] text-[#737373]">
              Available units · Source of truth
            </span>
            <span className="text-[12px] text-[#737373]">
              One master, four connected channels
            </span>
          </div>

          {/* Node 2: Amazon */}
          <div
            onClick={() => {
              if (showSyncAlert && selectedSyncChannel === "Amazon") {
                setShowSyncAlert(false);
              } else {
                setSelectedSyncChannel("Amazon");
                setShowSyncAlert(true);
              }
            }}
            className={`flex-1 min-w-[160px] flex flex-col items-start gap-1 z-10 px-3 cursor-pointer rounded-lg p-2 transition-all ${
              showSyncAlert && selectedSyncChannel === "Amazon"
                ? "bg-red-50/60 ring-1 ring-red-300 shadow-2xs"
                : "hover:bg-white hover:shadow-2xs"
            }`}
          >
            <div className="flex flex-row items-center gap-2 mb-2 bg-[#FAFAFA] pr-2">
              <div className="w-7 h-7 border border-[#EAEAEA] rounded-[6px] flex items-center justify-center bg-white shadow-2xs">
                <span className="text-[12px] font-semibold text-[#111111]">a</span>
              </div>
              <span className="text-[13px] font-semibold text-[#111111]">
                Amazon
              </span>
            </div>

            <div className="w-full flex flex-row items-center justify-between text-[12px] mb-1">
              <span className="text-[#666666]">Stock</span>
              <span className="text-[#111111] font-medium">—</span>
            </div>

            {showSyncAlert && selectedSyncChannel === "Amazon" ? (
              <>
                <div className="flex flex-row items-center gap-1.5 mb-1">
                  <XCircle className="w-3.5 h-3.5 text-[#DC2626] stroke-[2px]" />
                  <span className="text-[12px] font-medium text-[#DC2626]">Attention Required</span>
                </div>
                <span className="text-[12px] text-[#737373]">
                  Last sync: Not reported
                </span>
                <span className="text-[12px] font-medium text-[#DC2626] mt-0.5">
                  7 products affected
                </span>
              </>
            ) : (
              <>
                <div className="flex flex-row items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] stroke-[2px]" />
                  <span className="text-[12px] font-medium text-[#16A34A]">Healthy</span>
                </div>
                <span className="text-[12px] text-[#737373]">
                  Last sync: 2 min ago
                </span>
              </>
            )}
          </div>

          {/* Node 3: Flipkart */}
          <div
            onClick={() => {
              if (showSyncAlert && selectedSyncChannel === "Flipkart") {
                setShowSyncAlert(false);
              } else {
                setSelectedSyncChannel("Flipkart");
                setShowSyncAlert(true);
              }
            }}
            className={`flex-1 min-w-[160px] flex flex-col items-start gap-1 z-10 px-3 cursor-pointer rounded-lg p-2 transition-all ${
              showSyncAlert && selectedSyncChannel === "Flipkart"
                ? "bg-blue-50/60 ring-1 ring-blue-300 shadow-2xs"
                : "hover:bg-white hover:shadow-2xs"
            }`}
          >
            <div className="flex flex-row items-center gap-2 mb-2 bg-[#FAFAFA] pr-2">
              <div className="w-7 h-7 border border-[#EAEAEA] rounded-[6px] flex items-center justify-center bg-white shadow-2xs">
                <span className="text-[12px] font-semibold text-[#111111]">F</span>
              </div>
              <span className="text-[13px] font-semibold text-[#111111]">
                Flipkart
              </span>
            </div>

            <div className="w-full flex flex-row items-center justify-between text-[12px] mb-1">
              <span className="text-[#666666]">Stock</span>
              <span className="text-[#111111] font-medium">—</span>
            </div>

            <div className="flex flex-row items-center gap-1.5 mb-1">
              <RefreshCw className="w-3.5 h-3.5 text-[#2563EB] stroke-[2px]" />
              <span className="text-[12px] font-medium text-[#2563EB]">Syncing</span>
            </div>

            <span className="text-[12px] text-[#737373]">
              Last sync: 18 sec ago
            </span>
          </div>

          {/* Node 4: Meesho (Attention) */}
          <div
            onClick={() => {
              if (showSyncAlert && selectedSyncChannel === "Meesho") {
                setShowSyncAlert(false);
              } else {
                setSelectedSyncChannel("Meesho");
                setShowSyncAlert(true);
              }
            }}
            className={`flex-1 min-w-[160px] flex flex-col items-start gap-1 z-10 px-3 cursor-pointer rounded-lg p-2 transition-all ${
              showSyncAlert && selectedSyncChannel === "Meesho"
                ? "bg-amber-50/60 ring-1 ring-amber-300 shadow-2xs"
                : "hover:bg-white hover:shadow-2xs"
            }`}
          >
            <div className="flex flex-row items-center gap-2 mb-2 bg-[#FAFAFA] pr-2">
              <div className="w-7 h-7 border border-[#EAEAEA] rounded-[6px] flex items-center justify-center bg-white shadow-2xs">
                <span className="text-[12px] font-semibold text-[#111111]">m</span>
              </div>
              <span className="text-[13px] font-semibold text-[#111111]">
                Meesho
              </span>
            </div>

            <div className="w-full flex flex-row items-center justify-between text-[12px] mb-1">
              <span className="text-[#666666]">Stock</span>
              <span className="text-[#111111] font-medium">—</span>
            </div>

            <div className="flex flex-row items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] stroke-[2px]" />
              <span className="text-[12px] font-medium text-[#D97706]">Attention Required</span>
            </div>

            <span className="text-[12px] text-[#737373]">
              Last sync: Not reported
            </span>

            <span className="text-[12px] font-medium text-[#D97706] mt-0.5">
              7 SKUs affected
            </span>
          </div>

          {/* Node 5: Shopify */}
          <div
            onClick={() => {
              if (showSyncAlert && selectedSyncChannel === "Shopify") {
                setShowSyncAlert(false);
              } else {
                setSelectedSyncChannel("Shopify");
                setShowSyncAlert(true);
              }
            }}
            className={`flex-1 min-w-[160px] flex flex-col items-start gap-1 z-10 px-3 cursor-pointer rounded-lg p-2 transition-all ${
              showSyncAlert && selectedSyncChannel === "Shopify"
                ? "bg-emerald-50/60 ring-1 ring-emerald-300 shadow-2xs"
                : "hover:bg-white hover:shadow-2xs"
            }`}
          >
            <div className="flex flex-row items-center gap-2 mb-2 bg-[#FAFAFA] pr-2">
              <div className="w-7 h-7 border border-[#EAEAEA] rounded-[6px] flex items-center justify-center bg-white shadow-2xs">
                <span className="text-[12px] font-semibold text-[#111111]">S</span>
              </div>
              <span className="text-[13px] font-semibold text-[#111111]">
                Shopify
              </span>
            </div>

            <div className="w-full flex flex-row items-center justify-between text-[12px] mb-1">
              <span className="text-[#666666]">Stock</span>
              <span className="text-[#111111] font-medium">—</span>
            </div>

            <div className="flex flex-row items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] stroke-[2px]" />
              <span className="text-[12px] font-medium text-[#16A34A]">Healthy</span>
            </div>

            <span className="text-[12px] text-[#737373]">
              Last sync: 1 min ago
            </span>
          </div>
        </div>

        {/* ========================================================
            SYNC INCIDENT ALERT BANNER & OPERATIONAL STATES
            (Screen: Channel Sync Incident & Diagnostic Drill-Down)
            ======================================================== */}
        {showSyncAlert && (
          <div className="w-full flex flex-col items-start gap-5 pt-2 animate-in fade-in duration-300">
            {/* Channel Inventory Sync Alert Banner */}
            <div className="w-full bg-[#FFFBFB] border border-[#FCA5A5] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
              <div className="flex flex-col items-start gap-1.5 max-w-[650px]">
                {/* Header row with icon & badge */}
                <div className="flex flex-row items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#DC2626] flex items-center justify-center shrink-0">
                    <X className="w-2.5 h-2.5 text-white stroke-[3px]" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#111111] m-0">
                    {selectedSyncChannel} inventory sync needs attention
                  </h3>
                  <span className="text-[12px] font-medium text-[#DC2626]">
                    7 products affected
                  </span>
                </div>

                {/* Reason description */}
                <div className="flex flex-col items-start gap-0.5 pt-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                    REASON
                  </span>
                  <p className="text-[13px] font-normal text-[#111111] m-0">
                    {selectedSyncChannel} marketplace API returned inventory update rejection
                  </p>
                </div>

                <p className="text-[12px] text-[#737373] m-0 pt-0.5">
                  Review affected listings and retry synchronization
                </p>
              </div>

              {/* Right column: timestamps, counts & actions */}
              <div className="flex flex-col items-end gap-3 shrink-0">
                <span className="text-[11px] text-[#737373]">
                  Last failed 12:31 PM
                </span>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                    AFFECTED
                  </span>
                  <span className="text-[14px] font-semibold text-[#111111]">
                    7 SKUs / 14 variants
                  </span>
                </div>

                <div className="flex flex-row items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTableSearch("Amazon");
                    }}
                    className="h-[34px] px-3.5 bg-white border border-[#E5E5E5] rounded-lg text-[12px] font-medium text-[#111111] hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    View affected items
                  </button>
                  <button
                    type="button"
                    onClick={() => syncMutation.mutate()}
                    className="h-[34px] px-3.5 bg-black border border-black rounded-lg text-[12px] font-semibold text-white flex flex-row items-center gap-1.5 hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 stroke-[2px] ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    <span>Retry sync</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sync Operational States header & cards */}
            <div className="w-full flex flex-col items-start gap-2.5">
              <div className="w-full flex flex-row justify-between items-baseline">
                <h3 className="text-[14px] font-semibold text-[#111111] m-0">
                  Sync operational states
                </h3>
                <span className="text-[11px] text-[#737373]">
                  Independent status examples · Not the active Amazon incident
                </span>
              </div>

              {/* 4 Diagnostic cards */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* State 1: Syncing */}
                <div className="p-3.5 bg-white border border-[#EAEAEA] rounded-xl flex flex-col items-start justify-between min-h-[76px] shadow-2xs">
                  <div className="flex flex-row items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-[#2563EB] stroke-[2px] animate-spin" />
                    <span className="text-[12px] font-medium text-[#2563EB]">
                      Syncing 124 SKUs...
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-[#111111] hover:underline pt-2 cursor-pointer bg-transparent border-none p-0 flex items-center gap-1"
                  >
                    View progress →
                  </button>
                </div>

                {/* State 2: Synced */}
                <div className="p-3.5 bg-white border border-[#EAEAEA] rounded-xl flex flex-col items-start justify-between min-h-[76px] shadow-2xs">
                  <div className="flex flex-row items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] stroke-[2px]" />
                    <span className="text-[12px] font-medium text-[#16A34A]">
                      Inventory synced · 2 min ago
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-[#111111] hover:underline pt-2 cursor-pointer bg-transparent border-none p-0 flex items-center gap-1"
                  >
                    View sync history →
                  </button>
                </div>

                {/* State 3: Require review */}
                <div className="p-3.5 bg-white border border-[#EAEAEA] rounded-xl flex flex-col items-start justify-between min-h-[76px] shadow-2xs">
                  <div className="flex flex-row items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] stroke-[2px]" />
                    <span className="text-[12px] font-medium text-[#D97706]">
                      7 SKUs require review
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-[#111111] hover:underline pt-2 cursor-pointer bg-transparent border-none p-0 flex items-center gap-1"
                  >
                    Review SKUs →
                  </button>
                </div>

                {/* State 4: Failed to sync */}
                <div className="p-3.5 bg-white border border-[#EAEAEA] rounded-xl flex flex-col items-start justify-between min-h-[76px] shadow-2xs">
                  <div className="flex flex-row items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-[#DC2626] stroke-[2px]" />
                    <span className="text-[12px] font-medium text-[#DC2626]">
                      3 products failed to sync
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-[#111111] hover:underline pt-2 cursor-pointer bg-transparent border-none p-0 flex items-center gap-1"
                  >
                    View failures →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          6. STOCK DISTRIBUTION (Warehouse Balance Field)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-3">
        {/* Section Heading */}
        <div className="w-full flex flex-row justify-between items-center h-[26px]">
          <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] m-0">
            Stock distribution
          </h2>
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
            Distribution across warehouse locations · Available units
          </span>
        </div>

        {/* Warehouse Balance Field */}
        <div className="w-full h-[112px] flex flex-row items-start gap-8">
          {/* Warehouse points cluster */}
          <div className="relative flex-1 h-[112px] flex flex-row items-center gap-6 isolate">
            {/* Connecting line */}
            <div className="absolute left-0 right-0 top-[56px] h-[1px] bg-[#BDBDBD] z-0" />

            {/* Warehouse 1: Mumbai (51%) */}
            <div className="flex-1 max-w-[338px] h-[70px] flex flex-row items-center gap-3 z-10">
              <div className="box-border w-[70px] h-[70px] rounded-full bg-white border border-[#BDBDBD] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  51%
                </span>
              </div>
              <div className="w-[72px] h-[47px] bg-white p-1 flex flex-col items-start gap-[5px]">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  Mumbai
                </span>
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  4,315 units
                </span>
              </div>
            </div>

            {/* Warehouse 2: Delhi (28%) */}
            <div className="flex-1 max-w-[220px] h-[52px] flex flex-row items-center gap-3 z-10">
              <div className="box-border w-[52px] h-[52px] rounded-full bg-white border border-[#BDBDBD] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  28%
                </span>
              </div>
              <div className="w-[71px] h-[47px] bg-white p-1 flex flex-col items-start gap-[5px]">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  Delhi
                </span>
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  2,369 units
                </span>
              </div>
            </div>

            {/* Warehouse 3: Bangalore (21%) */}
            <div className="flex-1 max-w-[180px] h-[47px] flex flex-row items-center gap-3 z-10">
              <div className="box-border w-[44px] h-[44px] rounded-full bg-white border border-[#BDBDBD] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  21%
                </span>
              </div>
              <div className="w-[69px] h-[47px] bg-white p-1 flex flex-col items-start gap-[5px]">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  Bangalore
                </span>
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  1,778 units
                </span>
              </div>
            </div>
          </div>

          {/* Balance Annotation Box (300px, border-l) */}
          <div className="box-border w-[300px] h-[90px] border-l border-[#EAEAEA] pl-5 pt-3.5 flex flex-col items-start gap-2 shrink-0">
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
              Mumbai currently holds 28% more inventory than demand patterns suggest.
            </span>
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Advisory: verify Delhi and Bangalore replenishments.
            </span>
          </div>
        </div>

        {/* Warehouse scope caption */}
        <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
          Distribution is unified across master inventory. Real-time ledger updates as shipments move between facilities.
        </span>

        {/* Divider */}
        <div className="w-full h-[1px] bg-[#EAEAEA] mt-1" />
      </div>

      {/* ========================================================
          7. INVENTORY LEDGER (Screen 26 Table & Filters)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-3">
        {/* Ledger heading */}
        <div className="w-full flex flex-row justify-between items-center">
          <h2 className="text-[20px] font-semibold text-[#111111] tracking-tight m-0">
            Inventory ledger
          </h2>
          <button
            type="button"
            className="flex flex-row items-center px-3 py-1.5 gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer text-[#111111] shadow-2xs"
          >
            <Bookmark className="w-3.5 h-3.5 text-[#555555] stroke-[1.75px]" />
            <span className="text-[13px] font-medium">
              Save view
            </span>
          </button>
        </div>

        {/* Filter summary sentence */}
        <div className="w-full flex flex-row justify-between items-center text-[12px] text-[#737373]">
          <span>All products · All warehouses · All channels · Any health</span>
          <span>4 visible product examples</span>
        </div>

        {/* Ledger filters dropdown row */}
        <div className="w-full flex flex-row items-center gap-2.5">
          {/* Product search box */}
          <div className="flex-1 max-w-[380px] h-[36px] border border-[#EAEAEA] rounded-lg flex flex-row items-center px-3 gap-2.5 bg-white shadow-2xs">
            <Search className="w-3.5 h-3.5 text-[#888888] stroke-[1.75px]" />
            <input
              type="text"
              placeholder="Search SKU/product/barcode"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full text-[13px] text-[#111111] placeholder-[#888888] outline-none border-none bg-transparent"
            />
          </div>

          {/* Warehouse filter */}
          <button
            type="button"
            className="h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] stroke-[1.75px]" />
            <span className="text-[13px] text-[#111111]">Warehouse</span>
          </button>

          {/* Channel filter */}
          <button
            type="button"
            className="h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] stroke-[1.75px]" />
            <span className="text-[13px] text-[#111111]">Channel</span>
          </button>

          {/* Inventory health filter */}
          <button
            type="button"
            className="h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] stroke-[1.75px]" />
            <span className="text-[13px] text-[#111111]">Inventory health</span>
          </button>

          {/* Stock range filter */}
          <button
            type="button"
            className="h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] stroke-[1.75px]" />
            <span className="text-[13px] text-[#111111]">Stock range</span>
          </button>

          {/* Movement filter */}
          <button
            type="button"
            className="h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] stroke-[1.75px]" />
            <span className="text-[13px] text-[#111111]">Movement</span>
          </button>

          {/* Saved filters */}
          <button
            type="button"
            className="h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] stroke-[1.75px]" />
            <span className="text-[13px] text-[#111111]">Saved filters</span>
          </button>
        </div>

        {/* Product selection engine bar */}
        <div className="w-full flex flex-row items-center gap-3 pt-1">
          <span className="text-[12px] text-[#737373]">
            Select products:
          </span>

          <button
            type="button"
            onClick={() => setActiveLedgerTab("recommended")}
            className={`px-3 py-1 rounded-md text-[13px] cursor-pointer transition-colors ${
              activeLedgerTab === "recommended"
                ? "bg-[#F0F0F0] font-semibold text-[#111111]"
                : "bg-transparent text-[#555555] hover:text-[#111111]"
            }`}
          >
            Recommended
          </button>

          <button
            type="button"
            onClick={() => setActiveLedgerTab("custom")}
            className={`px-3 py-1 rounded-md text-[13px] cursor-pointer transition-colors ${
              activeLedgerTab === "custom"
                ? "bg-[#F0F0F0] font-semibold text-[#111111]"
                : "bg-transparent text-[#555555] hover:text-[#111111]"
            }`}
          >
            Custom
          </button>

          <button
            type="button"
            onClick={() => setActiveLedgerTab("all_matching")}
            className={`px-3 py-1 rounded-md text-[13px] cursor-pointer transition-colors ${
              activeLedgerTab === "all_matching"
                ? "bg-[#F0F0F0] font-semibold text-[#111111]"
                : "bg-transparent text-[#555555] hover:text-[#111111]"
            }`}
          >
            All matching
          </button>

          <span className="text-[12px] text-[#737373] ml-2">
            Select rows to reveal stock operations
          </span>
        </div>

        {/* Product table box */}
        <div className="w-full border border-[#EAEAEA] rounded-xl flex flex-col items-start overflow-hidden bg-white shadow-2xs">
          {/* Column headings */}
          <div className="w-full h-11 bg-[#F9F9F9] border-b border-[#EAEAEA] grid grid-cols-[40px_minmax(180px,1.6fr)_minmax(110px,1fr)_75px_75px_75px_75px_minmax(100px,0.9fr)_minmax(130px,1.1fr)_minmax(130px,1.1fr)_minmax(110px,0.9fr)_44px] items-center px-4 text-[12px] font-medium text-[#737373]">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded-[4px] border border-[#BDBDBD] text-black focus:ring-0 cursor-pointer"
              />
            </div>
            <span>Product</span>
            <span>SKU</span>
            <span className="text-right pr-2">Available</span>
            <span className="text-right pr-2">Reserved</span>
            <span className="text-right pr-2">Incoming</span>
            <span className="text-right pr-2">Coverage</span>
            <span className="pl-3">Warehouse</span>
            <span className="pl-2">Channel sync</span>
            <span className="pl-2">Health</span>
            <span className="text-center">Last movement</span>
            <span className="text-right pr-2">More</span>
          </div>

          {/* Table rows */}
          {ledgerRows.map((row) => {
            const SyncIcon = row.channelSyncIcon;
            const HealthIcon = row.healthIcon;
            const isChecked = Boolean(selectedRows[row.sku]);

            return (
              <div
                key={row.sku}
                className="relative w-full h-[64px] bg-white border-b border-[#F0F0F0] last:border-b-0 grid grid-cols-[40px_minmax(180px,1.6fr)_minmax(110px,1fr)_75px_75px_75px_75px_minmax(100px,0.9fr)_minmax(130px,1.1fr)_minmax(130px,1.1fr)_minmax(110px,0.9fr)_44px] items-center px-4 hover:bg-neutral-50/70 transition-colors"
              >
                {/* Product health vertical rail (3px) */}
                <div
                  style={{ backgroundColor: row.railColor }}
                  className="absolute left-0 top-[12px] bottom-[12px] w-[3px] rounded-r-sm"
                />

                {/* Row checkbox */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleRow(row.sku)}
                    className="w-4 h-4 rounded-[4px] border border-[#BDBDBD] text-black focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Product identity */}
                <div
                  onClick={() => {
                    setDrawerMode("context");
                    setDrawerProductSku(row.sku);
                  }}
                  className="flex flex-row items-center gap-3 pr-2 min-w-0 cursor-pointer group"
                >
                  <img
                    src={row.thumb}
                    alt={row.name}
                    className="w-9 h-9 rounded-lg object-cover border border-[#EAEAEA] bg-neutral-100 shrink-0 shadow-2xs group-hover:border-black transition-colors"
                  />
                  <span className="text-[13px] font-semibold text-[#111111] truncate group-hover:underline">
                    {row.name}
                  </span>
                </div>

                {/* SKU */}
                <span className="text-[12px] text-[#737373] truncate pr-2">
                  {row.sku}
                </span>

                {/* Available */}
                <span className="text-right pr-2 text-[13px] font-semibold text-[#111111]">
                  {row.available}
                </span>

                {/* Reserved */}
                <span className="text-right pr-2 text-[13px] font-normal text-[#111111]">
                  {row.reserved}
                </span>

                {/* Incoming */}
                <span className="text-right pr-2 text-[13px] font-normal text-[#111111]">
                  {row.incoming}
                </span>

                {/* Coverage */}
                <span
                  style={{ color: row.coverageColor }}
                  className="text-right pr-2 text-[13px] font-medium"
                >
                  {row.coverage}
                </span>

                {/* Warehouse */}
                <span className="pl-3 text-[13px] font-normal text-[#111111] truncate">
                  {row.warehouse}
                </span>

                {/* Channel sync */}
                <div className="pl-2 flex flex-row items-center gap-1.5 min-w-0">
                  <SyncIcon
                    style={{ color: row.channelSyncColor }}
                    className="w-3.5 h-3.5 stroke-[2px] shrink-0"
                  />
                  <span
                    style={{ color: row.channelSyncColor }}
                    className="text-[12px] font-medium truncate"
                  >
                    {row.channelSync}
                  </span>
                </div>

                {/* Health */}
                <div className="pl-2 flex flex-row items-center gap-1.5 min-w-0">
                  <HealthIcon
                    style={{ color: row.healthColor }}
                    className="w-3.5 h-3.5 stroke-[2px] shrink-0"
                  />
                  <span
                    style={{ color: row.healthColor }}
                    className="text-[12px] font-medium truncate"
                  >
                    {row.health}
                  </span>
                </div>

                {/* Last movement */}
                <span className="text-center text-[13px] text-[#737373]">
                  {row.lastMovement}
                </span>

                {/* More actions */}
                <div className="flex items-center justify-end pr-1 cursor-pointer text-[#737373] hover:text-[#111111]">
                  <MoreHorizontal className="w-4 h-4 stroke-[1.75px]" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Ledger scope caption */}
        <span className="text-[12px] text-[#737373]">
          Channel sync reflects each product. Product-level issues can exist while a channel is healthy.
        </span>

        {/* Floating / inline selection action bar (Bulk stock operations) */}
        {selectedCount > 0 && (
          <div className="w-full flex justify-center pt-2">
            <div
              style={{
                width: "609px",
                maxWidth: "100%",
                height: "54px",
                padding: "10px 16px",
                gap: "8px",
                background: "#FFFFFF",
                border: "1px solid #BDBDBD",
                boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.0509804)",
                borderRadius: "10px",
              }}
              className="box-border flex flex-row items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              {/* Checkbox icon and count */}
              <div className="flex flex-row items-center gap-2.5 pr-3 border-r border-[#EAEAEA] shrink-0">
                <div className="w-4 h-4 rounded-[3px] border border-[#737373] bg-white flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-[#111111] stroke-[2.5px]" />
                </div>
                <span className="text-[13px] font-semibold text-[#000000] tracking-tight whitespace-nowrap">
                  {selectedCount === 4 ? "24 products selected" : `${selectedCount} product${selectedCount > 1 ? "s" : ""} selected`}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-row items-center gap-4 text-[13px] font-normal text-[#000000] shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const firstSelectedSku = Object.entries(selectedRows).find(([, selected]) => selected)?.[0] || "TS-BLK-042";
                    setAdjustProductSku(firstSelectedSku);
                    setDrawerMode("adjust");
                    setDrawerProductSku(firstSelectedSku);
                  }}
                  className="hover:underline cursor-pointer bg-transparent border-none p-0 text-[#000000] whitespace-nowrap"
                >
                  Adjust stock
                </button>
                <button
                  type="button"
                  className="hover:underline cursor-pointer bg-transparent border-none p-0 text-[#000000] whitespace-nowrap"
                >
                  Transfer
                </button>
                <button
                  type="button"
                  className="hover:underline cursor-pointer bg-transparent border-none p-0 text-[#000000] whitespace-nowrap"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => syncMutation.mutate()}
                  className="hover:underline cursor-pointer bg-transparent border-none p-0 text-[#000000] whitespace-nowrap"
                >
                  Sync
                </button>
                <button
                  type="button"
                  className="hover:underline cursor-pointer bg-transparent border-none p-0 text-[#000000] whitespace-nowrap"
                >
                  Add to saved group
                </button>
              </div>

              {/* Dismiss / clear button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedRows({
                    "TS-BLK-042": false,
                    "RS-BLU-211": false,
                    "LW-BRN-018": false,
                    "TD-GRY-091": false,
                  });
                }}
                className="pl-2 text-[#737373] hover:text-[#000000] cursor-pointer bg-transparent border-none p-0 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4 stroke-[1.5px]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          8. RECENT MOVEMENTS (Timeline Stream)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-4">
        {/* Section Heading */}
        <div className="w-full flex flex-row justify-between items-baseline">
          <h2 className="text-[20px] font-semibold text-[#111111] tracking-tight m-0">
            Recent movements
          </h2>
          <span className="text-[12px] font-normal text-[#737373] hover:text-black cursor-pointer transition-colors">
            Inventory audit trail →
          </span>
        </div>

        {/* Movement timeline container */}
        <div className="relative w-full flex flex-row items-start justify-between isolate pt-1">
          {/* Timeline connection line */}
          <div className="absolute left-[8px] right-[40px] top-[9px] h-[1px] bg-[#EAEAEA] z-0" />

          {/* Event 1: Shopping bag */}
          <div className="flex-1 pr-6 flex flex-col items-start z-10">
            <div className="w-4 h-4 bg-[#FAFAFA] flex items-center justify-center mb-2">
              <ShoppingBag className="w-3.5 h-3.5 text-[#555555] stroke-[1.5px]" />
            </div>
            <span className="text-[12px] text-[#737373] mb-1">
              12:42
            </span>
            <span className="text-[13px] text-[#111111] leading-snug mb-2 max-w-[200px]">
              Amazon order reduced master inventory
            </span>
            <span className="text-[13px] font-semibold text-[#111111]">
              72 → 68
            </span>
          </div>

          {/* Event 2: Box */}
          <div className="flex-1 pr-6 flex flex-col items-start z-10">
            <div className="w-4 h-4 bg-[#FAFAFA] flex items-center justify-center mb-2">
              <Box className="w-3.5 h-3.5 text-[#555555] stroke-[1.5px]" />
            </div>
            <span className="text-[12px] text-[#737373] mb-1">
              12:31
            </span>
            <span className="text-[13px] text-[#111111] leading-snug max-w-[200px]">
              8 units received into Mumbai warehouse
            </span>
          </div>

          {/* Event 3: Sliders horizontal */}
          <div className="flex-1 pr-6 flex flex-col items-start z-10">
            <div className="w-4 h-4 bg-[#FAFAFA] flex items-center justify-center mb-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#555555] stroke-[1.5px]" />
            </div>
            <span className="text-[12px] text-[#737373] mb-1">
              11:58
            </span>
            <span className="text-[13px] text-[#111111] leading-snug mb-1 max-w-[200px]">
              Manual stock adjustment
            </span>
            <span className="text-[13px] font-semibold text-[#111111]">
              Black T-Shirt +12
            </span>
          </div>

          {/* Event 4: Undo */}
          <div className="flex-1 pr-6 flex flex-col items-start z-10">
            <div className="w-4 h-4 bg-[#FAFAFA] flex items-center justify-center mb-2">
              <Undo2 className="w-3.5 h-3.5 text-[#555555] stroke-[1.5px]" />
            </div>
            <span className="text-[12px] text-[#737373] mb-1">
              11:20
            </span>
            <span className="text-[13px] text-[#111111] leading-snug max-w-[210px]">
              4 returned units moved to Returned stock
            </span>
          </div>

          {/* Event 5: Refresh cw */}
          <div className="flex-1 flex flex-col items-start z-10">
            <div className="w-4 h-4 bg-[#FAFAFA] flex items-center justify-center mb-2">
              <RefreshCw className="w-3.5 h-3.5 text-[#555555] stroke-[1.5px]" />
            </div>
            <span className="text-[12px] text-[#737373] mb-1">
              10:44
            </span>
            <span className="text-[13px] text-[#111111] leading-snug max-w-[220px]">
              Inventory sync completed across 4 channels
            </span>
          </div>
        </div>
      </div>
      </>
      )}

      {/* ========================================================
          9. CONTEXTUAL DRAWER & ADJUST STOCK SIDEBAR
          ======================================================== */}
      {(() => {
        const activeSku = drawerMode === "adjust" ? adjustProductSku : (drawerProductSku || "TS-BLK-042");
        const prod = productContexts[activeSku] || productContexts["TS-BLK-042"];
        const isOpen = Boolean(drawerProductSku);

        // Adjust stock calculations
        const currentAvail = prod ? prod.available : 42;
        const qtyNum = parseInt(adjustQuantity || "0", 10) || 0;
        // In the screenshot: type Damage with quantity 6 => Adjustment: -6, New available: 36 (or positive if return)
        const isDecrease = adjustType === "Damage";
        const adjDelta = isDecrease ? -qtyNum : qtyNum;
        const newAvail = Math.max(0, currentAvail + adjDelta);

        return (
          <>
            {/* Backdrop overlay for smooth dismissal */}
            <div
              onClick={() => setDrawerProductSku(null)}
              className={`fixed inset-0 top-[72px] bg-black/5 z-40 transition-opacity duration-300 ease-in-out ${
                isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
            />

            {/* Slide-out Drawer */}
            <div
              style={{
                boxShadow: "-6px 0px 20px rgba(0, 0, 0, 0.0313726)",
              }}
              className={`fixed right-0 top-[72px] bottom-0 w-[420px] max-w-full bg-white border-l border-[#EAEAEA] z-50 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out will-change-transform ${
                isOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              {drawerMode === "adjust" ? (
                /* ========================================================
                   ADJUST STOCK SIDEBAR (User Reference Screenshot)
                   ======================================================== */
                <>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-start w-full">
                    {/* Header */}
                    <div className="box-border w-full px-5 py-3 border-b border-[#EAEAEA] flex flex-col items-start gap-0.5 shrink-0">
                      <div className="w-full flex flex-row justify-between items-center">
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-[#737373]">
                          INVENTORY / STOCK ADJUSTMENT
                        </span>
                        <button
                          type="button"
                          onClick={() => setDrawerProductSku(null)}
                          className="w-5 h-5 flex items-center justify-center text-[#666666] hover:text-[#000000] cursor-pointer bg-transparent border-none p-0"
                        >
                          <X className="w-4 h-4 stroke-[1.5px]" />
                        </button>
                      </div>
                      <h2 className="text-[20px] font-bold leading-tight text-[#000000] m-0">
                        Adjust stock
                      </h2>
                    </div>

                    {/* Form Body */}
                    <div className="box-border w-full px-5 py-3 flex flex-col items-start gap-2.5">
                      {/* Product selector */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <label className="text-[11px] font-semibold text-[#111111]">
                          Product
                        </label>
                        <div className="relative w-full">
                          <select
                            value={adjustProductSku}
                            onChange={(e) => setAdjustProductSku(e.target.value)}
                            className="w-full h-8 px-2.5 pr-8 border border-[#E5E5E5] rounded-lg bg-white text-[12px] font-normal text-[#111111] appearance-none focus:outline-none focus:border-black cursor-pointer"
                          >
                            <option value="TS-BLK-042">Black T-Shirt</option>
                            <option value="RS-BLU-211">Running Shoes</option>
                            <option value="LW-BRN-018">Leather Wallet</option>
                            <option value="TD-GRY-091">Travel Duffel</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373] pointer-events-none stroke-[1.5px]" />
                        </div>
                      </div>

                      {/* SKU (Read-only / matching field) */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <label className="text-[11px] font-semibold text-[#111111]">
                          SKU
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={prod.sku}
                          className="w-full h-8 px-2.5 border border-[#E5E5E5] rounded-lg bg-[#FAFAFA] text-[12px] font-normal text-[#111111] focus:outline-none"
                        />
                      </div>

                      {/* Location selector */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <label className="text-[11px] font-semibold text-[#111111]">
                          Location
                        </label>
                        <div className="relative w-full">
                          <select
                            value={adjustLocation}
                            onChange={(e) => setAdjustLocation(e.target.value)}
                            className="w-full h-8 px-2.5 pr-8 border border-[#E5E5E5] rounded-lg bg-white text-[12px] font-normal text-[#111111] appearance-none focus:outline-none focus:border-black cursor-pointer"
                          >
                            <option value="Mumbai">Mumbai</option>
                            <option value="Delhi">Delhi</option>
                            <option value="Bangalore">Bangalore</option>
                            <option value="Pune">Pune</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373] pointer-events-none stroke-[1.5px]" />
                        </div>
                      </div>

                      {/* Adjustment type pills */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <label className="text-[11px] font-semibold text-[#111111]">
                          Adjustment type
                        </label>
                        <div className="w-full flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              "Damage",
                              "Return",
                              "Correction",
                              "Manual adjustment",
                              "Other",
                            ] as const
                          ).map((type) => {
                            const isSelected = adjustType === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => {
                                  setAdjustType(type);
                                  if (type === "Damage") setAdjustReason("Damaged units");
                                  else if (type === "Return") setAdjustReason("Customer return");
                                  else if (type === "Correction") setAdjustReason("Cycle count correction");
                                  else if (type === "Manual adjustment") setAdjustReason("Manual adjustment");
                                }}
                                className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                                  isSelected
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-[#555555] border-[#E5E5E5] hover:border-[#CCCCCC] hover:text-black"
                                }`}
                              >
                                {type}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <label className="text-[11px] font-semibold text-[#111111]">
                          Quantity
                        </label>
                        <input
                          type="number"
                          value={adjustQuantity}
                          onChange={(e) => setAdjustQuantity(e.target.value)}
                          className="w-full h-8 px-2.5 border border-[#E5E5E5] rounded-lg bg-white text-[12px] font-normal text-[#111111] focus:outline-none focus:border-black"
                          placeholder="6"
                        />
                      </div>

                      {/* Reason */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <label className="text-[11px] font-semibold text-[#111111]">
                          Reason
                        </label>
                        <input
                          type="text"
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          className="w-full h-8 px-2.5 border border-[#E5E5E5] rounded-lg bg-white text-[12px] font-normal text-[#111111] focus:outline-none focus:border-black"
                          placeholder="Damaged units"
                        />
                      </div>

                      {/* Optional note */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <label className="text-[11px] font-semibold text-[#111111]">
                          Optional note
                        </label>
                        <input
                          type="text"
                          value={adjustNote}
                          onChange={(e) => setAdjustNote(e.target.value)}
                          className="w-full h-8 px-2.5 border border-[#E5E5E5] rounded-lg bg-white text-[12px] font-normal text-[#111111] focus:outline-none focus:border-black"
                          placeholder="Add a note (optional)"
                        />
                      </div>

                      {/* Stock adjustment preview card */}
                      <div className="w-full mt-1 p-3 rounded-xl bg-[#F8F8F8] border border-[#F0F0F0] flex flex-col items-start gap-1.5">
                        <span className="text-[12px] font-semibold text-[#000000]">
                          {prod.title} stock adjustment preview
                        </span>
                        <div className="w-full flex flex-col gap-1.5 pt-0.5">
                          <div className="w-full flex flex-row justify-between items-center text-[11px]">
                            <span className="font-normal text-[#666666]">
                              Current available:
                            </span>
                            <span className="font-semibold text-[#000000]">
                              {currentAvail}
                            </span>
                          </div>
                          <div className="w-full flex flex-row justify-between items-center text-[11px]">
                            <span className="font-normal text-[#666666]">
                              Adjustment:
                            </span>
                            <span className="font-semibold text-[#000000]">
                              {isDecrease ? `-${qtyNum}` : `+${qtyNum}`}
                            </span>
                          </div>
                          <div className="w-full h-[1px] bg-[#EAEAEA] my-0.5" />
                          <div className="w-full flex flex-row justify-between items-center text-[11px]">
                            <span className="font-normal text-[#666666]">
                              New available:
                            </span>
                            <span className="font-semibold text-[#000000]">
                              {newAvail}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pinned Footer */}
                  <div className="box-border w-full px-5 pt-3 pb-5 border-t border-[#EAEAEA] bg-white flex flex-col items-start gap-3 shrink-0">
                    <div className="flex flex-row items-center gap-2 text-[11px] text-[#737373]">
                      <ShieldCheck className="w-4 h-4 text-[#737373] stroke-[1.5px] shrink-0" />
                      <span>This action will be recorded in the inventory audit trail.</span>
                    </div>

                    <div className="w-full flex flex-row items-center gap-2.5">
                      <button
                        type="button"
                        disabled={adjustMutation.isPending}
                        onClick={() => {
                          const delta = isDecrease ? -qtyNum : qtyNum;
                          adjustMutation.mutate({
                            sku: adjustProductSku,
                            warehouseId: "wh-delhi-01",
                            reason: isDecrease ? "damaged" : "manual_addition",
                            quantityDelta: delta,
                            notes: adjustNote || adjustReason,
                          }, {
                            onSuccess: () => {
                              setDrawerProductSku(null);
                            },
                          });
                        }}
                        className="h-10 px-5 bg-black border border-black rounded-lg text-white text-[12px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        {adjustMutation.isPending ? "Updating..." : "Confirm adjustment"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerMode("context");
                        }}
                        className="h-10 px-5 bg-white border border-[#E5E5E5] rounded-lg text-[#111111] text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* ========================================================
                   CONTEXTUAL PRODUCT DRAWER (Screen 26)
                   ======================================================== */
                <>
                  {/* Drawer scrollable content */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-start w-full">
                    {/* Drawer header */}
                    <div className="box-border w-full px-5 py-4 border-b border-[#EAEAEA] flex flex-col items-start gap-1 shrink-0">
                      <div className="w-full flex flex-row justify-between items-center">
                        <span className="text-[10px] uppercase font-normal tracking-wide text-[#666666]">
                          INVENTORY / PRODUCT CONTEXT
                        </span>
                        <button
                          type="button"
                          onClick={() => setDrawerProductSku(null)}
                          className="w-5 h-5 flex items-center justify-center text-[#666666] hover:text-[#000000] cursor-pointer bg-transparent border-none p-0"
                        >
                          <X className="w-4 h-4 stroke-[1.5px]" />
                        </button>
                      </div>
                      <h2 className="text-[22px] font-semibold leading-tight text-[#000000] m-0 truncate w-full">
                        {prod.title}
                      </h2>
                    </div>

                    {/* Drawer body */}
                    <div className="box-border w-full px-5 py-4 flex flex-col items-start gap-4">
                      {/* Product identity */}
                      <div className="w-full flex flex-row items-center gap-3">
                        <img
                          src={prod.thumb}
                          alt={prod.fullName}
                          className="w-12 h-12 rounded-[6px] object-cover border border-[#EAEAEA] bg-neutral-100 shrink-0"
                        />
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-[13px] font-semibold leading-snug text-[#000000] truncate w-full">
                            {prod.fullName}
                          </span>
                          <span className="text-[11px] font-normal text-[#666666] mt-0.5">
                            {prod.sku}
                          </span>
                        </div>
                      </div>

                      {/* Stock snapshot */}
                      <div className="w-full flex flex-col items-start gap-2">
                        <span className="text-[13px] font-semibold text-[#000000]">
                          Stock snapshot
                        </span>
                        <div className="w-full grid grid-cols-3 gap-2">
                          <div className="flex flex-col items-start">
                            <span className="text-[11px] font-normal text-[#666666]">
                              Available
                            </span>
                            <span className="text-[22px] font-semibold text-[#000000] leading-tight">
                              {prod.available}
                            </span>
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="text-[11px] font-normal text-[#666666]">
                              Reserved
                            </span>
                            <span className="text-[22px] font-semibold text-[#000000] leading-tight">
                              {prod.reserved}
                            </span>
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="text-[11px] font-normal text-[#666666]">
                              Incoming
                            </span>
                            <span className="text-[22px] font-semibold text-[#000000] leading-tight">
                              {prod.incoming}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="w-full h-[1px] bg-[#EAEAEA]" />

                      {/* Inventory by location */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <span className="text-[13px] font-semibold text-[#000000] mb-0.5">
                          Inventory by location
                        </span>
                        {prod.locations.map((loc, idx) => (
                          <div
                            key={idx}
                            className="w-full h-6 flex flex-row justify-between items-center text-[12px]"
                          >
                            <span className="font-normal text-[#666666]">
                              {loc.name}
                            </span>
                            <span className="font-semibold text-[#000000]">
                              {loc.qty}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Divider */}
                      <div className="w-full h-[1px] bg-[#EAEAEA]" />

                      {/* Channel availability */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <span className="text-[13px] font-semibold text-[#000000] mb-0.5">
                          Channel availability
                        </span>
                        {prod.channels.map((ch, idx) => (
                          <div
                            key={idx}
                            className="w-full h-6 flex flex-row justify-between items-center text-[12px]"
                          >
                            <span className="font-normal text-[#666666]">
                              {ch.name}
                            </span>
                            <span className="font-semibold text-[#000000]">
                              {ch.qty}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Divider */}
                      <div className="w-full h-[1px] bg-[#EAEAEA]" />

                      {/* Product health */}
                      <div className="w-full flex flex-col items-start gap-1">
                        <div className="w-full flex flex-row justify-between items-center">
                          <span className="text-[13px] font-semibold text-[#000000]">
                            Health
                          </span>
                          <div className="flex flex-row items-center gap-1.5">
                            {prod.healthStatus === "Attention" && (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] stroke-[2px]" />
                                <span className="text-[11px] font-normal text-[#D97706]">
                                   Attention
                                </span>
                              </>
                            )}
                            {prod.healthStatus === "Healthy" && (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] stroke-[2px]" />
                                <span className="text-[11px] font-normal text-[#16A34A]">
                                  Healthy
                                </span>
                              </>
                            )}
                            {prod.healthStatus === "Critical" && (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-[#DC2626] stroke-[2px]" />
                                <span className="text-[11px] font-normal text-[#DC2626]">
                                  Critical
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="text-[12px] font-normal text-[#444444] leading-snug">
                          {prod.healthReason}
                        </span>
                      </div>

                      {/* Divider */}
                      <div className="w-full h-[1px] bg-[#EAEAEA]" />

                      {/* Recent product movements */}
                      <div className="w-full flex flex-col items-start gap-2">
                        <span className="text-[13px] font-semibold text-[#000000]">
                          Recent movements
                        </span>
                        <div className="w-full flex flex-row items-start gap-2.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px] mt-0.5 shrink-0" />
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-[10px] font-normal text-[#737373]">
                              {prod.movementTime}
                            </span>
                            <span className="text-[12px] font-normal text-[#111111]">
                              {prod.movementAction}
                            </span>
                            <span className="text-[12px] font-semibold text-[#111111]">
                              {prod.movementDetail}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Drawer actions pinned at bottom */}
                  <div className="box-border w-full px-5 pt-3.5 pb-6 border-t border-[#EAEAEA] bg-white flex flex-col items-start gap-3 shrink-0">
                    {/* Stock actions buttons */}
                    <div className="w-full flex flex-row items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustProductSku(prod.sku);
                          setDrawerMode("adjust");
                        }}
                        className="flex-1 h-[38px] px-3 bg-[#000000] border border-[#000000] rounded-lg flex flex-row items-center justify-center gap-2 text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.5px]" />
                        <span className="text-[12px] font-semibold">
                          Adjust stock
                        </span>
                      </button>
                      <button
                        type="button"
                        className="flex-1 h-[38px] px-3 bg-[#FFFFFF] border border-[#EAEAEA] rounded-lg flex flex-row items-center justify-center gap-2 text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px]" />
                        <span className="text-[12px] font-normal">
                          Transfer
                        </span>
                      </button>
                    </div>

                    {/* Product links */}
                    <div className="w-full flex flex-row items-center justify-between text-[12px] pt-1">
                      <button
                        type="button"
                        className="flex flex-row items-center gap-1.5 text-[#000000] hover:underline cursor-pointer bg-transparent border-none p-0"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px]" />
                        <span>View product</span>
                      </button>
                      <button
                        type="button"
                        className="flex flex-row items-center gap-1.5 text-[#000000] hover:underline cursor-pointer bg-transparent border-none p-0"
                      >
                        <History className="w-3.5 h-3.5 text-[#666666] stroke-[1.5px]" />
                        <span>View sync history</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
