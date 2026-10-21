import { useState, useMemo } from "react";
import {
  RotateCw,
  Download,
  ChevronDown,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  X,
  Check,
} from "lucide-react";
import { formatINR } from "@/utils/format";
import { useOrders, useOrdersSummary } from "@/hooks/useOrders";
import { Order } from "@/types/orders";

interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  available: number;
  price: number;
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  marketplace: string;
  customer: string;
  itemsCount: number;
  itemsSummary: string;
  value: number;
  paymentStatus: "Paid" | "Pending" | "Failed";
  fulfillmentStatus: "Picking" | "Ready to Dispatch" | "Inventory Issue" | "Packed" | "Dispatched" | "Delivered";
  slaText: string;
  slaSeverity: "orange" | "green" | "red" | "neutral";
  status: string;
  createdTime: string;
  railColor: string; // #D97706, #16A34A, #DC2626, etc.
  hasIssueBanner?: boolean;
  issueDetails?: {
    title: string;
    reason: string;
    item: string;
    stockComparison: string;
    recommendationLabel: string;
    recommendationAction: string;
  };
  items: OrderItem[];
}

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<Record<string, boolean>>({});
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  const [selectedOrderForDrawer, setSelectedOrderForDrawer] = useState<OrderRecord | null>(null);

  // Connect to live orders API via React Query
  const { data: ordersResponse, isFetching, refetch } = useOrders({ search: searchTerm || undefined });
  const { data: ordersSummary } = useOrdersSummary();

  // Baseline Orders matching Figma Screen 28 exactly
  const baselineOrdersList: OrderRecord[] = [
    {
      id: "ord-1",
      orderNumber: "ORD-10291",
      marketplace: "Amazon",
      customer: "Rahul Mehta",
      itemsCount: 3,
      itemsSummary: "3 items",
      value: 4280,
      paymentStatus: "Paid",
      fulfillmentStatus: "Picking",
      slaText: "Due in 42 min",
      slaSeverity: "orange",
      status: "Confirmed",
      createdTime: "12:04 PM",
      railColor: "#D97706",
      items: [
        { sku: "TS-BLK-042", name: "Classic Black T-Shirt", qty: 2, available: 42, price: 1799 },
        { sku: "RS-BLU-211", name: "Running Shoes — Blue", qty: 1, available: 18, price: 2481 },
      ],
    },
    {
      id: "ord-2",
      orderNumber: "ORD-10290",
      marketplace: "Flipkart",
      customer: "Priya Sharma",
      itemsCount: 1,
      itemsSummary: "1 item",
      value: 899,
      paymentStatus: "Paid",
      fulfillmentStatus: "Ready to Dispatch",
      slaText: "Healthy",
      slaSeverity: "green",
      status: "Ready to Dispatch",
      createdTime: "11:58 AM",
      railColor: "#16A34A",
      items: [
        { sku: "LW-BRN-018", name: "Leather Wallet — Brown", qty: 1, available: 12, price: 899 },
      ],
    },
    {
      id: "ord-3",
      orderNumber: "ORD-10289",
      marketplace: "Meesho",
      customer: "Amit Patil",
      itemsCount: 4,
      itemsSummary: "4 items",
      value: 2140,
      paymentStatus: "Pending",
      fulfillmentStatus: "Inventory Issue",
      slaText: "Attention",
      slaSeverity: "orange",
      status: "Confirmed",
      createdTime: "11:42 AM",
      railColor: "#DC2626",
      hasIssueBanner: true,
      issueDetails: {
        title: "Inventory issue",
        reason: "1 item cannot currently be fulfilled.",
        item: "Black T-Shirt",
        stockComparison: "Required: 2 · Available: 1",
        recommendationLabel: "Recommended next step",
        recommendationAction: "Review inventory →",
      },
      items: [
        { sku: "TS-BLK-042", name: "Black T-Shirt", qty: 2, available: 1, price: 1200 },
        { sku: "AC-SC-012", name: "Cotton Socks Pair", qty: 2, available: 15, price: 940 },
      ],
    },
    {
      id: "ord-4",
      orderNumber: "ORD-10288",
      marketplace: "Shopify",
      customer: "Neha Kulkarni",
      itemsCount: 2,
      itemsSummary: "2 items",
      value: 1760,
      paymentStatus: "Paid",
      fulfillmentStatus: "Packed",
      slaText: "Healthy",
      slaSeverity: "green",
      status: "Packed",
      createdTime: "11:37 AM",
      railColor: "#16A34A",
      items: [
        { sku: "TD-GRY-091", name: "Travel Duffel — Charcoal", qty: 1, available: 28, price: 1260 },
        { sku: "LW-BRN-018", name: "Leather Card Holder", qty: 1, available: 35, price: 500 },
      ],
    },
    {
      id: "ord-5",
      orderNumber: "ORD-10287",
      marketplace: "Amazon",
      customer: "Vikram Rathore",
      itemsCount: 1,
      itemsSummary: "1 item",
      value: 1499,
      paymentStatus: "Paid",
      fulfillmentStatus: "Picking",
      slaText: "Due in 1h 10m",
      slaSeverity: "orange",
      status: "New",
      createdTime: "11:20 AM",
      railColor: "#2563EB",
      items: [
        { sku: "TS-BLK-042", name: "Classic Black T-Shirt", qty: 1, available: 42, price: 1499 },
      ],
    },
    {
      id: "ord-6",
      orderNumber: "ORD-10286",
      marketplace: "Flipkart",
      customer: "Ananya Deshmukh",
      itemsCount: 2,
      itemsSummary: "2 items",
      value: 3299,
      paymentStatus: "Paid",
      fulfillmentStatus: "Dispatched",
      slaText: "Healthy",
      slaSeverity: "green",
      status: "Dispatched",
      createdTime: "10:45 AM",
      railColor: "#16A34A",
      items: [
        { sku: "RS-BLU-211", name: "Running Shoes — Blue", qty: 1, available: 18, price: 3299 },
      ],
    },
    {
      id: "ord-7",
      orderNumber: "ORD-10285",
      marketplace: "Shopify",
      customer: "Karan Johar",
      itemsCount: 1,
      itemsSummary: "1 item",
      value: 899,
      paymentStatus: "Paid",
      fulfillmentStatus: "Delivered",
      slaText: "Delivered",
      slaSeverity: "green",
      status: "Delivered",
      createdTime: "Yesterday",
      railColor: "#16A34A",
      items: [
        { sku: "LW-BRN-018", name: "Leather Wallet — Brown", qty: 1, available: 12, price: 899 },
      ],
    },
    {
      id: "ord-8",
      orderNumber: "ORD-10279",
      marketplace: "Amazon",
      customer: "Sneha Nair",
      itemsCount: 1,
      itemsSummary: "1 item",
      value: 2199,
      paymentStatus: "Paid",
      fulfillmentStatus: "Inventory Issue",
      slaText: "Return Requested",
      slaSeverity: "orange",
      status: "Return in Transit",
      createdTime: "12:25 PM",
      railColor: "#D97706",
      items: [
        { sku: "TD-GRY-091", name: "Travel Duffel — Charcoal", qty: 1, available: 28, price: 2199 },
      ],
    },
  ];

  // Convert API orders to OrderRecord format or fallback to baseline Figma orders
  const ordersList: OrderRecord[] = useMemo(() => {
    if (ordersResponse?.data && ordersResponse.data.length > 0) {
      return ordersResponse.data.map((o: Order): OrderRecord => {
        const firstItem = o.items[0];
        const itemsSummary = o.items.length === 1 ? "1 item" : `${o.items.length} items`;
        
        let fulfillmentStatus: OrderRecord["fulfillmentStatus"] = "Ready to Dispatch";
        if (o.status === "new" || o.status === "confirmed") fulfillmentStatus = "Picking";
        else if (o.status === "picking") fulfillmentStatus = "Picking";
        else if (o.status === "packing") fulfillmentStatus = "Packed";
        else if (o.status === "dispatched") fulfillmentStatus = "Dispatched";
        else if (o.status === "delivered") fulfillmentStatus = "Delivered";

        let slaSeverity: OrderRecord["slaSeverity"] = "green";
        let slaText = "Healthy";
        if (o.slaState === "at_risk" || o.slaState === "breached") {
          slaSeverity = "red";
          slaText = "At Risk";
        } else if (o.slaState === "approaching") {
          slaSeverity = "orange";
          slaText = "Due soon";
        }

        let railColor = "#16A34A";
        if (slaSeverity === "orange") railColor = "#D97706";
        if (slaSeverity === "red") railColor = "#DC2626";

        const paymentStatus = o.paymentStatus === "paid" ? "Paid" : o.paymentStatus === "failed" ? "Failed" : "Pending";
        const channelName = o.channel.charAt(0).toUpperCase() + o.channel.slice(1);

        return {
          id: o.id,
          orderNumber: o.orderNumber,
          marketplace: channelName,
          customer: o.customer.name,
          itemsCount: o.items.length,
          itemsSummary,
          value: o.totalAmount,
          paymentStatus,
          fulfillmentStatus,
          slaText,
          slaSeverity,
          status: o.status.charAt(0).toUpperCase() + o.status.slice(1),
          createdTime: new Date(o.orderedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          railColor,
          items: o.items.map((i) => ({
            sku: i.sku,
            name: i.title,
            qty: i.quantity,
            available: 24,
            price: i.unitPrice,
          })),
          hasIssueBanner: slaSeverity === "red" || o.paymentStatus === "failed",
          issueDetails: slaSeverity === "red" ? {
            title: "SLA critical",
            reason: "Order SLA approaching breach limit.",
            item: firstItem?.title || "Item",
            stockComparison: `Required: ${firstItem?.quantity || 1} · Allocated: ${firstItem?.quantity || 1}`,
            recommendationLabel: "Recommended next step",
            recommendationAction: "Expedite packing & dispatch →",
          } : undefined,
        };
      });
    }
    return baselineOrdersList;
  }, [ordersResponse?.data]);

  const allSelected = ordersList.length > 0 && ordersList.every((o) => selectedOrders[o.id]);
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedOrders({});
    } else {
      const next: Record<string, boolean> = {};
      ordersList.forEach((o) => {
        next[o.id] = true;
      });
      setSelectedOrders(next);
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered orders list based on active tab, search, and quick filters
  const filteredOrders = ordersList.filter((ord) => {
    // 1. Tab filter
    if (activeTab === "attention") {
      const isAttention =
        ord.slaSeverity === "orange" ||
        ord.slaSeverity === "red" ||
        ord.fulfillmentStatus === "Inventory Issue" ||
        ord.paymentStatus === "Pending";
      if (!isAttention) return false;
    } else if (activeTab === "new") {
      if (ord.status !== "New") return false;
    } else if (activeTab === "processing") {
      const isProcessing =
        ord.status === "Confirmed" ||
        ord.fulfillmentStatus === "Picking" ||
        ord.fulfillmentStatus === "Packed";
      if (!isProcessing) return false;
    } else if (activeTab === "shipped") {
      const isShipped =
        ord.status === "Ready to Dispatch" ||
        ord.status === "Dispatched" ||
        ord.fulfillmentStatus === "Ready to Dispatch" ||
        ord.fulfillmentStatus === "Dispatched";
      if (!isShipped) return false;
    } else if (activeTab === "delivered") {
      if (ord.status !== "Delivered") return false;
    } else if (activeTab === "returns") {
      const isReturn =
        ord.status.toLowerCase().includes("return") ||
        ord.slaText.toLowerCase().includes("return");
      if (!isReturn) return false;
    }

    // 2. Search query filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchNum = ord.orderNumber.toLowerCase().includes(q);
      const matchCust = ord.customer.toLowerCase().includes(q);
      const matchMarket = ord.marketplace.toLowerCase().includes(q);
      if (!matchNum && !matchCust && !matchMarket) return false;
    }

    // 3. Quick chip filter
    if (activeQuickFilter === "SLA Risk" && ord.slaSeverity !== "orange" && ord.slaSeverity !== "red") return false;
    if (activeQuickFilter === "Inventory Issue" && ord.fulfillmentStatus !== "Inventory Issue") return false;
    if (activeQuickFilter === "Unprocessed" && ord.status !== "New" && ord.status !== "Confirmed") return false;
    if (activeQuickFilter === "Payment Issue" && ord.paymentStatus !== "Pending") return false;
    if (activeQuickFilter === "Returns" && !ord.status.toLowerCase().includes("return")) return false;

    return true;
  });

  return (
    <div className="w-full flex flex-col items-start gap-3 font-['Inter',sans-serif] text-[#000000] select-none">
      {/* ========================================================
          1. ORDERS HEADER (Page header & Actions)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-[10px]">
        <div className="w-full flex flex-row justify-between items-center h-[73px]">
          {/* Introduction */}
          <div className="flex flex-col items-start gap-[2px]">
            <span className="text-[10px] font-medium leading-[12px] uppercase text-[#707070]">
              ORDER OPERATIONS
            </span>
            <h1 className="text-[26px] font-semibold leading-[145%] text-[#000000] m-0 p-0">
              Orders
            </h1>
            <p className="text-[13px] font-normal leading-[145%] text-[#666666] m-0">
              All connected orders, unified into one operational workflow.
            </p>
          </div>

          {/* Header actions */}
          <div className="flex flex-row items-center gap-3 h-[32px]">
            {/* Refresh */}
            <button
              type="button"
              onClick={() => refetch()}
              className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <RotateCw className={`w-[14px] h-[14px] text-[#666666] stroke-[1.5px] ${isFetching ? "animate-spin" : ""}`} />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                Refresh
              </span>
            </button>

            {/* Export */}
            <button
              type="button"
              className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <Download className="w-[14px] h-[14px] text-[#666666] stroke-[1.5px]" />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                Export
              </span>
            </button>

            {/* More */}
            <button
              type="button"
              className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                More
              </span>
              <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
            </button>
          </div>
        </div>

        {/* ========================================================
            2. ORDER VIEWS (Tabs with count badges)
            ======================================================== */}
        <div className="w-full flex flex-row items-start gap-6 h-[34px] border-b border-[#EAEAEA]">
          {/* Selected tab: All Orders (128) */}
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 transition-colors cursor-pointer ${
              activeTab === "all" ? "border-b-2 border-[#000000]" : ""
            }`}
          >
            <span
              className={`text-[12px] leading-[145%] ${
                activeTab === "all" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              All Orders
            </span>
            <div
              className={`flex flex-row items-center px-[5px] py-[1px] h-[15px] rounded ${
                activeTab === "all" ? "bg-[#000000] text-white" : "bg-[#F5F5F5] text-[#666666]"
              }`}
            >
              <span className="text-[10px] font-semibold leading-[12px]">
                128
              </span>
            </div>
          </button>

          {/* Needs Attention tab with badge 17 */}
          <button
            type="button"
            onClick={() => setActiveTab("attention")}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 transition-colors cursor-pointer ${
              activeTab === "attention" ? "border-b-2 border-[#D97706]" : ""
            }`}
          >
            <span className="text-[12px] font-semibold leading-[145%] text-[#D97706]">
              Needs Attention
            </span>
            <div className="flex flex-row items-center px-[5px] py-[1px] h-[15px] bg-[#FFFBF5] border border-[#FDE68A]/60 rounded">
              <span className="text-[10px] font-semibold leading-[12px] text-[#D97706]">
                17
              </span>
            </div>
          </button>

          {/* New (18) */}
          <button
            type="button"
            onClick={() => setActiveTab("new")}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 transition-colors cursor-pointer ${
              activeTab === "new" ? "border-b-2 border-[#000000]" : ""
            }`}
          >
            <span
              className={`text-[12px] leading-[145%] ${
                activeTab === "new" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              New
            </span>
            <div
              className={`flex flex-row items-center px-[5px] py-[1px] h-[15px] rounded ${
                activeTab === "new" ? "bg-[#000000] text-white" : "bg-[#F5F5F5] text-[#666666]"
              }`}
            >
              <span className="text-[10px] font-semibold leading-[12px]">
                18
              </span>
            </div>
          </button>

          {/* Processing (61: 24 Confirmed + 16 Picking + 21 Packed) */}
          <button
            type="button"
            onClick={() => setActiveTab("processing")}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 transition-colors cursor-pointer ${
              activeTab === "processing" ? "border-b-2 border-[#000000]" : ""
            }`}
          >
            <span
              className={`text-[12px] leading-[145%] ${
                activeTab === "processing" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              Processing
            </span>
            <div
              className={`flex flex-row items-center px-[5px] py-[1px] h-[15px] rounded ${
                activeTab === "processing" ? "bg-[#000000] text-white" : "bg-[#F5F5F5] text-[#666666]"
              }`}
            >
              <span className="text-[10px] font-semibold leading-[12px]">
                61
              </span>
            </div>
          </button>

          {/* Shipped (49: 12 Ready to Dispatch + 22 Dispatched + 15 In Transit) */}
          <button
            type="button"
            onClick={() => setActiveTab("shipped")}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 transition-colors cursor-pointer ${
              activeTab === "shipped" ? "border-b-2 border-[#000000]" : ""
            }`}
          >
            <span
              className={`text-[12px] leading-[145%] ${
                activeTab === "shipped" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              Shipped
            </span>
            <div
              className={`flex flex-row items-center px-[5px] py-[1px] h-[15px] rounded ${
                activeTab === "shipped" ? "bg-[#000000] text-white" : "bg-[#F5F5F5] text-[#666666]"
              }`}
            >
              <span className="text-[10px] font-semibold leading-[12px]">
                49
              </span>
            </div>
          </button>

          {/* Delivered (78) */}
          <button
            type="button"
            onClick={() => setActiveTab("delivered")}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 transition-colors cursor-pointer ${
              activeTab === "delivered" ? "border-b-2 border-[#000000]" : ""
            }`}
          >
            <span
              className={`text-[12px] leading-[145%] ${
                activeTab === "delivered" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              Delivered
            </span>
            <div
              className={`flex flex-row items-center px-[5px] py-[1px] h-[15px] rounded ${
                activeTab === "delivered" ? "bg-[#000000] text-white" : "bg-[#F5F5F5] text-[#666666]"
              }`}
            >
              <span className="text-[10px] font-semibold leading-[12px]">
                78
              </span>
            </div>
          </button>

          {/* Returns / Disputes (2) */}
          <button
            type="button"
            onClick={() => setActiveTab("returns")}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 transition-colors cursor-pointer ${
              activeTab === "returns" ? "border-b-2 border-[#000000]" : ""
            }`}
          >
            <span
              className={`text-[12px] leading-[145%] ${
                activeTab === "returns" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              Returns / Disputes
            </span>
            <div
              className={`flex flex-row items-center px-[5px] py-[1px] h-[15px] rounded ${
                activeTab === "returns" ? "bg-[#000000] text-white" : "bg-[#F5F5F5] text-[#666666]"
              }`}
            >
              <span className="text-[10px] font-semibold leading-[12px]">
                2
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================
          3. ORDER INTELLIGENCE (Pulse, Needs Attention strip, Sources & SLA)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-3">
        {/* Order Pulse */}
        <div className="w-full flex flex-col items-start gap-2 h-[48px]">
          {/* Flow caption */}
          <div className="w-full flex flex-row justify-between items-start h-[16px]">
            <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
              Order Pulse
            </span>
            <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
              Today · Live operational flow
            </span>
          </div>

          {/* Lifecycle flow */}
          <div className="w-full flex flex-row items-center gap-2 h-[24px]">
            {/* Flow segment: Today orders */}
            <div className="flex flex-row items-center gap-2 shrink-0">
              <div className="flex flex-row items-center justify-center px-2 h-[24px] bg-[#000000] rounded-full">
                <span className="text-[11px] font-semibold leading-[13px] text-white">
                  {ordersSummary?.totalOrdersToday ?? 128}
                </span>
              </div>
              <span className="text-[12px] font-semibold leading-[145%] text-[#666666]">
                Today orders
              </span>
            </div>

            {/* Segment: 18 New */}
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className="flex flex-row items-center justify-center w-[24px] h-[24px] bg-[#F5F5F5] rounded-full shrink-0">
                <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                  18
                </span>
              </div>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666] whitespace-nowrap">
                New
              </span>
            </div>

            {/* Segment: 24 Confirmed */}
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className="flex flex-row items-center justify-center w-[24px] h-[24px] bg-[#F5F5F5] rounded-full shrink-0">
                <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                  24
                </span>
              </div>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666] whitespace-nowrap">
                Confirmed
              </span>
            </div>

            {/* Segment: 16 Picking */}
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className="flex flex-row items-center justify-center w-[24px] h-[24px] bg-[#F5F5F5] rounded-full shrink-0">
                <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                  16
                </span>
              </div>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666] whitespace-nowrap">
                Picking
              </span>
            </div>

            {/* Segment: 21 Packed */}
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className="flex flex-row items-center justify-center w-[24px] h-[24px] bg-[#F5F5F5] rounded-full shrink-0">
                <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                  21
                </span>
              </div>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666] whitespace-nowrap">
                Packed
              </span>
            </div>

            {/* Segment: 12 Ready to Dispatch */}
            <div className="flex flex-row items-center gap-2 shrink-0">
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className="flex flex-row items-center justify-center w-[24px] h-[24px] bg-[#F5F5F5] rounded-full shrink-0">
                <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                  12
                </span>
              </div>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666] whitespace-nowrap">
                Ready to Dispatch
              </span>
            </div>

            {/* Segment: 22 Dispatched */}
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className="flex flex-row items-center justify-center w-[24px] h-[24px] bg-[#F5F5F5] rounded-full shrink-0">
                <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                  22
                </span>
              </div>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666] whitespace-nowrap">
                Dispatched
              </span>
            </div>

            {/* Segment: 15 In Transit */}
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className="flex flex-row items-center justify-center w-[24px] h-[24px] bg-[#F5F5F5] rounded-full shrink-0">
                <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                  15
                </span>
              </div>
              <span className="text-[12px] font-normal leading-[145%] text-[#666666] whitespace-nowrap">
                In Transit
              </span>
            </div>
          </div>
        </div>

        {/* Needs attention filters strip (Figma Specs: #FFFBF5, h-40px, border-y #EAEAEA) */}
        <div className="box-border w-full h-[40px] px-3 flex flex-row justify-between items-center bg-[#FFFBF5] border-y border-[#EAEAEA]">
          {/* Strip title */}
          <div className="flex flex-row items-center gap-2">
            <div className="w-[3px] h-[18px] bg-[#D97706] rounded-[2px]" />
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
              Needs Attention
            </span>
          </div>

          {/* Attention filter 1: 3 SLA risk › */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter((prev) => (prev === "SLA Risk" ? null : "SLA Risk"))}
            className="flex flex-row items-center gap-[5px] hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-[12px] font-semibold leading-[145%] text-[#D97706]">
              3
            </span>
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              SLA risk
            </span>
            <span className="text-[10px] leading-[12px] text-[#666666]">›</span>
          </button>

          {/* Attention filter 2: 5 Unprocessed › */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter((prev) => (prev === "Unprocessed" ? null : "Unprocessed"))}
            className="flex flex-row items-center gap-[5px] hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-[12px] font-semibold leading-[145%] text-[#666666]">
              5
            </span>
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Unprocessed
            </span>
            <span className="text-[10px] leading-[12px] text-[#666666]">›</span>
          </button>

          {/* Attention filter 3: 2 Inventory issue › */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter((prev) => (prev === "Inventory Issue" ? null : "Inventory Issue"))}
            className="flex flex-row items-center gap-[5px] hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-[12px] font-semibold leading-[145%] text-[#DC2626]">
              2
            </span>
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Inventory issue
            </span>
            <span className="text-[10px] leading-[12px] text-[#666666]">›</span>
          </button>

          {/* Attention filter 4: 1 Payment issue › */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter((prev) => (prev === "Payment Issue" ? null : "Payment Issue"))}
            className="flex flex-row items-center gap-[5px] hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-[12px] font-semibold leading-[145%] text-[#D97706]">
              1
            </span>
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Payment issue
            </span>
            <span className="text-[10px] leading-[12px] text-[#666666]">›</span>
          </button>

          {/* Attention filter 5: 4 Cancellation risk › */}
          <button
            type="button"
            className="flex flex-row items-center gap-[5px] hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-[12px] font-semibold leading-[145%] text-[#D97706]">
              4
            </span>
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Cancellation risk
            </span>
            <span className="text-[10px] leading-[12px] text-[#666666]">›</span>
          </button>

          {/* Attention filter 6: 2 Returns › */}
          <button
            type="button"
            onClick={() => setActiveTab("returns")}
            className="flex flex-row items-center gap-[5px] hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-[12px] font-semibold leading-[145%] text-[#666666]">
              2
            </span>
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Returns
            </span>
            <span className="text-[10px] leading-[12px] text-[#666666]">›</span>
          </button>
        </div>

        {/* Sources and deadline intelligence (2 columns: left 372px, right flex-1) */}
        <div className="w-full flex flex-row items-start gap-7 min-h-[104px]">
          {/* Column 1: Order sources (372px) */}
          <div className="box-border flex flex-col items-start pr-5 gap-[10px] w-[372px] shrink-0 border-r border-[#EAEAEA]">
            {/* Sources heading */}
            <div className="w-full flex flex-row justify-between items-center h-[17px]">
              <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                Order sources
              </span>
              <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                47 recent orders
              </span>
            </div>

            {/* Weighted distribution bar (352px × 8px) */}
            <div className="w-full flex flex-row items-start gap-[3px] h-[8px]">
              <div className="w-[38%] h-[8px] bg-[#525252] rounded-l-[2px]" title="Amazon: 38%" />
              <div className="w-[25%] h-[8px] bg-[#888888]" title="Flipkart: 25%" />
              <div className="w-[19%] h-[8px] bg-[#BDBDBD]" title="Meesho: 19%" />
              <div className="w-[18%] h-[8px] bg-[#DDDDDD] rounded-r-[2px]" title="Shopify: 17%" />
            </div>

            {/* Source legend (Amazon, Flipkart, Meesho, Shopify) */}
            <div className="w-full flex flex-row items-start gap-[10px] h-[35px]">
              {/* Amazon */}
              <div className="flex-1 flex flex-col items-start gap-1">
                <div className="flex flex-row items-center gap-1 h-[14px]">
                  <div className="flex items-center justify-center w-[14px] h-[14px] bg-[#F5F5F5] rounded-[3px]">
                    <span className="text-[9px] font-semibold text-[#000000] leading-none">
                      a
                    </span>
                  </div>
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                    Amazon
                  </span>
                </div>
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  18 · 38%
                </span>
              </div>

              {/* Flipkart */}
              <div className="flex-1 flex flex-col items-start gap-1">
                <div className="flex flex-row items-center gap-1 h-[14px]">
                  <div className="flex items-center justify-center w-[14px] h-[14px] bg-[#F5F5F5] rounded-[3px]">
                    <span className="text-[9px] font-semibold text-[#000000] leading-none">
                      F
                    </span>
                  </div>
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                    Flipkart
                  </span>
                </div>
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  12 · 25%
                </span>
              </div>

              {/* Meesho */}
              <div className="flex-1 flex flex-col items-start gap-1">
                <div className="flex flex-row items-center gap-1 h-[14px]">
                  <div className="flex items-center justify-center w-[14px] h-[14px] bg-[#F5F5F5] rounded-[3px]">
                    <span className="text-[9px] font-semibold text-[#000000] leading-none">
                      m
                    </span>
                  </div>
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                    Meesho
                  </span>
                </div>
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  9 · 19%
                </span>
              </div>

              {/* Shopify */}
              <div className="flex-1 flex flex-col items-start gap-1">
                <div className="flex flex-row items-center gap-1 h-[14px]">
                  <div className="flex items-center justify-center w-[14px] h-[14px] bg-[#F5F5F5] rounded-[3px]">
                    <span className="text-[9px] font-semibold text-[#000000] leading-none">
                      S
                    </span>
                  </div>
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                    Shopify
                  </span>
                </div>
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  8 · 17%
                </span>
              </div>
            </div>
          </div>

          {/* Column 2: SLA Pressure (736px / flex-1) */}
          <div className="flex-1 flex flex-col items-start gap-[6px]">
            {/* Deadline heading */}
            <div className="w-full flex flex-row justify-between items-start h-[17px]">
              <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                SLA Pressure
              </span>
              <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                Time remaining → Dispatch deadline → Overdue
              </span>
            </div>

            {/* Deadline bands (Safe, Approaching, At risk, Breached) */}
            <div className="w-full flex flex-row items-start gap-3 h-[39px]">
              {/* Safe band */}
              <div className="box-border flex-1 flex flex-col items-start px-2 py-[3px] gap-[1px] h-[39px] bg-[#F5F5F5] border-b-2 border-[#666666] rounded-t-[2px]">
                <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                  Safe
                </span>
                <span className="text-[11px] font-semibold leading-[13px] text-[#666666]">
                  78 orders
                </span>
              </div>

              {/* Approaching deadline band */}
              <div className="box-border flex-1 flex flex-col items-start px-2 py-[3px] gap-[1px] h-[39px] bg-[#FFFBF5] border-b-2 border-[#D97706] rounded-t-[2px]">
                <span className="text-[11px] font-normal leading-[13px] text-[#D97706]">
                  Approaching deadline
                </span>
                <span className="text-[11px] font-semibold leading-[13px] text-[#D97706]">
                  32 orders
                </span>
              </div>

              {/* At risk band */}
              <div className="box-border flex-[0.7] flex flex-col items-start px-2 py-[3px] gap-[1px] h-[39px] bg-[#FFFBF5] border-b-2 border-[#D97706] rounded-t-[2px]">
                <span className="text-[11px] font-normal leading-[13px] text-[#D97706]">
                  At risk
                </span>
                <span className="text-[11px] font-semibold leading-[13px] text-[#D97706]">
                  12 orders
                </span>
              </div>

              {/* Breached band */}
              <div className="box-border flex-[0.6] flex flex-col items-start px-2 py-[3px] gap-[1px] h-[39px] bg-[#FEF2F2] border-b-2 border-[#DC2626] rounded-t-[2px]">
                <span className="text-[11px] font-normal leading-[13px] text-[#DC2626]">
                  Breached
                </span>
                <span className="text-[11px] font-semibold leading-[13px] text-[#DC2626]">
                  6 orders
                </span>
              </div>
            </div>

            {/* Threshold labels */}
            <div className="w-full flex flex-row items-start gap-3 h-[12px]">
              <span className="flex-1 text-[10px] font-normal leading-[12px] text-[#666666]">
                More than 4 h
              </span>
              <span className="flex-1 text-[10px] font-normal leading-[12px] text-[#666666]">
                4 h → 90 min
              </span>
              <span className="flex-[0.7] text-[10px] font-normal leading-[12px] text-[#D97706]">
                90 min → 0 min
              </span>
              <span className="flex-[0.6] text-[10px] font-normal leading-[12px] text-[#DC2626]">
                Past deadline
              </span>
            </div>

            {/* SLA recommendation footnote */}
            <div className="w-full flex flex-row justify-between items-center h-[13px] pt-1">
              <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                3 orders may breach dispatch SLA within the next 90 minutes.
              </span>
              <button
                type="button"
                onClick={() => setActiveQuickFilter("SLA Risk")}
                className="text-[11px] font-semibold leading-[13px] text-[#D97706] hover:underline cursor-pointer"
              >
                Review at-risk orders →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. OPERATIONAL WORKSPACE (Order Ledger & Activity)
          ======================================================== */}
      <div className="w-full flex flex-col items-start gap-4">
        {/* Order Ledger section */}
        <div className="w-full flex flex-col items-start gap-1">
          {/* Ledger introduction */}
          <div className="w-full flex flex-row justify-between items-center h-[43px]">
            <div className="flex flex-col items-start gap-[1px]">
              <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] m-0 p-0">
                Order Ledger
              </h2>
              <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                All orders · All marketplaces · Any status
              </span>
            </div>
            <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
              128 orders
            </span>
          </div>

          {/* Ledger controls */}
          <div className="w-full flex flex-col items-start gap-[6px]">
            {/* Search and filters row 1 */}
            <div className="w-full flex flex-row items-center gap-[6px] h-[32px]">
              {/* Order search input (w: 712px/flex-1) */}
              <div className="box-border flex-1 flex flex-row items-center px-[10px] gap-[6px] h-[30px] border border-[#EAEAEA] rounded-lg bg-white">
                <Search className="w-[14px] h-[14px] text-[#666666] stroke-[1.5px] shrink-0" />
                <input
                  type="text"
                  placeholder="Search order / customer / SKU"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-[11px] font-normal leading-[145%] text-[#000000] placeholder-[#666666]"
                />
              </div>

              {/* Marketplace dropdown */}
              <button
                type="button"
                className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              >
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Marketplace
                </span>
                <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
              </button>

              {/* Order status dropdown */}
              <button
                type="button"
                className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              >
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Order status
                </span>
                <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
              </button>

              {/* SLA state dropdown */}
              <button
                type="button"
                className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              >
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  SLA state
                </span>
                <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
              </button>

              {/* Payment dropdown */}
              <button
                type="button"
                className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              >
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Payment
                </span>
                <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
              </button>
            </div>

            {/* Additional filters row 2 */}
            <div className="w-full flex flex-row items-center gap-[6px] h-[32px]">
              {/* Fulfillment dropdown */}
              <button
                type="button"
                className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              >
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Fulfillment
                </span>
                <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
              </button>

              {/* Date dropdown */}
              <button
                type="button"
                className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              >
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Date
                </span>
                <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
              </button>

              {/* Saved views dropdown */}
              <button
                type="button"
                className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              >
                <Bookmark className="w-[14px] h-[14px] text-[#666666] stroke-[1.5px]" />
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Saved views
                </span>
                <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" />
              </button>

              {/* Filter scope indication */}
              <div className="flex-1 text-right">
                <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
                  {activeQuickFilter ? `Filtered by ${activeQuickFilter}` : "No filters applied"}
                </span>
              </div>
            </div>

            {/* Quick filters row 3 */}
            <div className="w-full flex flex-row items-center gap-4 h-[22px]">
              {/* SLA Risk */}
              <button
                type="button"
                onClick={() => setActiveQuickFilter((prev) => (prev === "SLA Risk" ? null : "SLA Risk"))}
                className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="w-[3px] h-[10px] bg-[#D97706] rounded-[1px]" />
                <span
                  className={`text-[11px] leading-[13px] ${
                    activeQuickFilter === "SLA Risk" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
                  }`}
                >
                  SLA Risk
                </span>
              </button>

              {/* Unprocessed */}
              <button
                type="button"
                onClick={() => setActiveQuickFilter((prev) => (prev === "Unprocessed" ? null : "Unprocessed"))}
                className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span
                  className={`text-[11px] leading-[13px] ${
                    activeQuickFilter === "Unprocessed" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
                  }`}
                >
                  Unprocessed
                </span>
              </button>

              {/* Inventory Issue */}
              <button
                type="button"
                onClick={() => setActiveQuickFilter((prev) => (prev === "Inventory Issue" ? null : "Inventory Issue"))}
                className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="w-[3px] h-[10px] bg-[#DC2626] rounded-[1px]" />
                <span
                  className={`text-[11px] leading-[13px] ${
                    activeQuickFilter === "Inventory Issue" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
                  }`}
                >
                  Inventory Issue
                </span>
              </button>

              {/* Payment Issue */}
              <button
                type="button"
                onClick={() => setActiveQuickFilter((prev) => (prev === "Payment Issue" ? null : "Payment Issue"))}
                className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span
                  className={`text-[11px] leading-[13px] ${
                    activeQuickFilter === "Payment Issue" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
                  }`}
                >
                  Payment Issue
                </span>
              </button>

              {/* Delayed */}
              <button
                type="button"
                onClick={() => setActiveQuickFilter((prev) => (prev === "Delayed" ? null : "Delayed"))}
                className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span
                  className={`text-[11px] leading-[13px] ${
                    activeQuickFilter === "Delayed" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
                  }`}
                >
                  Delayed
                </span>
              </button>

              {/* Returns */}
              <button
                type="button"
                onClick={() => setActiveQuickFilter((prev) => (prev === "Returns" ? null : "Returns"))}
                className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span
                  className={`text-[11px] leading-[13px] ${
                    activeQuickFilter === "Returns" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
                  }`}
                >
                  Returns
                </span>
              </button>

              {/* Disputes */}
              <button
                type="button"
                onClick={() => setActiveQuickFilter((prev) => (prev === "Disputes" ? null : "Disputes"))}
                className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span
                  className={`text-[11px] leading-[13px] ${
                    activeQuickFilter === "Disputes" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
                  }`}
                >
                  Disputes
                </span>
              </button>
            </div>
          </div>

          {/* ========================================================
              ORDER TABLE (Figma Specs: Columns, Semantic rail, Diagnostic banner)
              ======================================================== */}
          <div className="box-border w-full flex flex-col items-start border-t border-[#EAEAEA] mt-1">
            {/* Table Header Row */}
            <div className="w-full grid grid-cols-[40px_1.2fr_1fr_1.2fr_0.8fr_0.9fr_0.8fr_1.3fr_1fr_1.1fr_0.9fr_60px] items-center h-[32px] bg-[#F5F5F5] text-[11px] font-medium leading-[14px] text-[#666666] px-1">
              {/* Checkbox column */}
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded-[2px] border border-[#BDBDBD] text-black focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Order */}
              <div className="px-2">
                <span>Order</span>
              </div>

              {/* Marketplace */}
              <div className="px-2">
                <span>Marketplace</span>
              </div>

              {/* Customer */}
              <div className="px-2">
                <span>Customer</span>
              </div>

              {/* Items */}
              <div className="px-2">
                <span>Items</span>
              </div>

              {/* Value */}
              <div className="px-2">
                <span>Value</span>
              </div>

              {/* Payment */}
              <div className="px-2">
                <span>Payment</span>
              </div>

              {/* Fulfillment */}
              <div className="px-2">
                <span>Fulfillment</span>
              </div>

              {/* SLA */}
              <div className="px-2">
                <span>SLA</span>
              </div>

              {/* Status */}
              <div className="px-2">
                <span>Status</span>
              </div>

              {/* Created */}
              <div className="px-2">
                <span>Created</span>
              </div>

              {/* Action */}
              <div className="px-2 text-center">
                <span>Action</span>
              </div>
            </div>

            {/* Table Entries */}
            {filteredOrders.map((ord) => {
              const isChecked = Boolean(selectedOrders[ord.id]);
              return (
                <div key={ord.id} className="w-full flex flex-col items-start">
                  {/* Order Row */}
                  <div className="relative w-full grid grid-cols-[40px_1.2fr_1fr_1.2fr_0.8fr_0.9fr_0.8fr_1.3fr_1fr_1.1fr_0.9fr_60px] items-center min-h-[44px] py-1 border-b border-[#EAEAEA] bg-white hover:bg-neutral-50/70 transition-colors px-1">
                    {/* Semantic left rail */}
                    <div
                      className="absolute left-0 top-[6px] w-[3px] h-[32px]"
                      style={{ backgroundColor: ord.railColor }}
                    />

                    {/* Checkbox cell */}
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectOrder(ord.id)}
                        className="w-3.5 h-3.5 rounded-[2px] border border-[#BDBDBD] text-black focus:ring-0 cursor-pointer"
                      />
                    </div>

                    {/* Order */}
                    <div className="px-2">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDrawer(ord)}
                        className="text-[12px] font-semibold leading-[140%] text-[#000000] hover:underline text-left cursor-pointer"
                      >
                        {ord.orderNumber}
                      </button>
                    </div>

                    {/* Marketplace */}
                    <div className="px-2">
                      <span className="text-[12px] font-normal leading-[140%] text-[#000000]">
                        {ord.marketplace}
                      </span>
                    </div>

                    {/* Customer */}
                    <div className="px-2">
                      <span className="text-[12px] font-normal leading-[140%] text-[#000000] truncate block">
                        {ord.customer}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="px-2">
                      <span className="text-[12px] font-normal leading-[140%] text-[#000000]">
                        {ord.itemsSummary}
                      </span>
                    </div>

                    {/* Value */}
                    <div className="px-2">
                      <span className="text-[12px] font-semibold leading-[140%] text-[#000000]">
                        {formatINR(ord.value)}
                      </span>
                    </div>

                    {/* Payment */}
                    <div className="px-2">
                      <span
                        className={`text-[12px] font-normal leading-[140%] ${
                          ord.paymentStatus === "Paid"
                            ? "text-[#16A34A]"
                            : ord.paymentStatus === "Pending"
                            ? "text-[#D97706]"
                            : "text-[#DC2626]"
                        }`}
                      >
                        {ord.paymentStatus}
                      </span>
                    </div>

                    {/* Fulfillment */}
                    <div className="px-2">
                      <span
                        className={`text-[12px] font-normal leading-[140%] ${
                          ord.fulfillmentStatus === "Inventory Issue"
                            ? "text-[#DC2626]"
                            : "text-[#2563EB]"
                        }`}
                      >
                        {ord.fulfillmentStatus}
                      </span>
                    </div>

                    {/* SLA */}
                    <div className="px-2">
                      <span
                        className={`text-[12px] font-normal leading-[140%] ${
                          ord.slaSeverity === "orange"
                            ? "text-[#D97706]"
                            : ord.slaSeverity === "green"
                            ? "text-[#16A34A]"
                            : "text-[#DC2626]"
                        }`}
                      >
                        {ord.slaText}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="px-2">
                      <span className="text-[12px] font-normal leading-[140%] text-[#000000]">
                        {ord.status}
                      </span>
                    </div>

                    {/* Created */}
                    <div className="px-2">
                      <span className="text-[12px] font-normal leading-[140%] text-[#000000]">
                        {ord.createdTime}
                      </span>
                    </div>

                    {/* Open drawer affordance */}
                    <div className="px-2 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDrawer(ord)}
                        title="Open order drawer"
                        className="flex items-center justify-center w-[28px] h-[28px] rounded-[5px] bg-[#F5F5F5] hover:bg-neutral-200 text-[#666666] transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 stroke-[1.5px]" />
                      </button>
                    </div>
                  </div>

                  {/* Inline diagnostic row for ORD-10289 (Inventory issue diagnostic) */}
                  {ord.hasIssueBanner && ord.issueDetails && (
                    <div className="box-border w-full flex flex-row items-center py-1 pl-[28px] pr-[10px] gap-[18px] min-h-[45px] bg-white border-b border-[#EAEAEA]">
                      {/* Diagnostic label & reason */}
                      <div className="flex flex-col items-start gap-[2px] w-[266px] shrink-0">
                        <span className="text-[11px] font-semibold leading-[13px] text-[#DC2626]">
                          {ord.issueDetails.title}
                        </span>
                        <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                          {ord.issueDetails.reason}
                        </span>
                      </div>

                      {/* Affected item & stock comparison */}
                      <div className="flex-1 flex flex-col items-start gap-[2px]">
                        <span className="text-[11px] font-normal leading-[13px] text-[#000000]">
                          {ord.issueDetails.item}
                        </span>
                        <span className="text-[10px] font-normal leading-[12px] text-[#666666]">
                          {ord.issueDetails.stockComparison}
                        </span>
                      </div>

                      {/* Recommendation */}
                      <div className="flex flex-col items-end gap-[2px] shrink-0">
                        <span className="text-[9px] font-normal leading-[11px] text-[#666666]">
                          {ord.issueDetails.recommendationLabel}
                        </span>
                        <a
                          href="/inventory"
                          className="text-[11px] font-medium leading-[13px] text-[#000000] hover:underline cursor-pointer"
                        >
                          {ord.issueDetails.recommendationAction}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ledger footer (Visible range & pagination) */}
          <div className="w-full flex flex-row justify-between items-center h-[16px] pt-1">
            <span className="text-[10px] font-normal leading-[12px] text-[#666666]">
              Showing 1–4 of 128 orders
            </span>
            <div className="flex flex-row items-center gap-[10px]">
              <button
                type="button"
                disabled
                className="text-[11px] font-normal leading-[13px] text-[#BDBDBD] cursor-not-allowed"
              >
                <ChevronLeft className="w-3 h-3 inline" />
              </button>
              <span className="text-[11px] font-semibold leading-[13px] text-[#000000]">
                1
              </span>
              <button
                type="button"
                className="text-[11px] font-normal leading-[13px] text-[#666666] hover:text-[#000000] cursor-pointer"
              >
                <ChevronRight className="w-3 h-3 inline" />
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================
            5. RECENT ORDER ACTIVITY (Vertical Timeline)
            ======================================================== */}
        <div className="box-border w-full flex flex-col items-start pt-[10px] gap-[6px] border-t border-[#EAEAEA]">
          {/* Activity heading */}
          <div className="w-full flex flex-row justify-between items-start h-[17px]">
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
              Recent Order Activity
            </span>
            <span className="text-[10px] font-normal leading-[12px] text-[#666666]">
              Across all connected marketplaces
            </span>
          </div>

          {/* Vertical timeline */}
          <div className="relative w-full flex flex-col items-start min-h-[95px] pl-1">
            {/* Timeline line */}
            <div className="absolute left-[3px] top-[8px] w-[1px] h-[76px] bg-[#EAEAEA]" />

            {/* Event 1 */}
            <div className="relative z-10 w-full flex flex-row items-center gap-[10px] h-[19px]">
              <div className="w-[7px] h-[7px] rounded-full bg-[#16A34A] shrink-0" />
              <span className="w-[34px] text-[10px] font-normal leading-[12px] text-[#666666] shrink-0">
                12:40
              </span>
              <span className="w-[77px] text-[11px] font-medium leading-[13px] text-[#000000] shrink-0">
                ORD-10287
              </span>
              <span className="flex-1 text-[11px] font-normal leading-[13px] text-[#666666]">
                Payment confirmed
              </span>
            </div>

            {/* Event 2 */}
            <div className="relative z-10 w-full flex flex-row items-center gap-[10px] h-[19px]">
              <div className="w-[7px] h-[7px] rounded-full bg-[#2563EB] shrink-0" />
              <span className="w-[34px] text-[10px] font-normal leading-[12px] text-[#666666] shrink-0">
                12:36
              </span>
              <span className="w-[77px] text-[11px] font-medium leading-[13px] text-[#000000] shrink-0">
                ORD-10286
              </span>
              <span className="flex-1 text-[11px] font-normal leading-[13px] text-[#666666]">
                Moved to Ready to Dispatch
              </span>
            </div>

            {/* Event 3 */}
            <div className="relative z-10 w-full flex flex-row items-center gap-[10px] h-[19px]">
              <div className="w-[7px] h-[7px] rounded-full bg-[#2563EB] shrink-0" />
              <span className="w-[34px] text-[10px] font-normal leading-[12px] text-[#666666] shrink-0">
                12:32
              </span>
              <span className="w-[77px] text-[11px] font-medium leading-[13px] text-[#000000] shrink-0">
                ORD-10291
              </span>
              <span className="flex-1 text-[11px] font-normal leading-[13px] text-[#666666]">
                Picking started
              </span>
            </div>

            {/* Event 4 */}
            <div className="relative z-10 w-full flex flex-row items-center gap-[10px] h-[19px]">
              <div className="w-[7px] h-[7px] rounded-full bg-[#D97706] shrink-0" />
              <span className="w-[34px] text-[10px] font-normal leading-[12px] text-[#666666] shrink-0">
                12:31
              </span>
              <span className="w-[77px] text-[11px] font-medium leading-[13px] text-[#000000] shrink-0">
                ORD-10282
              </span>
              <span className="flex-1 text-[11px] font-normal leading-[13px] text-[#666666]">
                SLA risk detected
              </span>
            </div>

            {/* Event 5 */}
            <div className="relative z-10 w-full flex flex-row items-center gap-[10px] h-[19px]">
              <div className="w-[7px] h-[7px] rounded-full bg-[#666666] shrink-0" />
              <span className="w-[34px] text-[10px] font-normal leading-[12px] text-[#666666] shrink-0">
                12:25
              </span>
              <span className="w-[77px] text-[11px] font-medium leading-[13px] text-[#000000] shrink-0">
                ORD-10279
              </span>
              <span className="flex-1 text-[11px] font-normal leading-[13px] text-[#666666]">
                Return request received
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
      {/* ========================================================
          6. EXACT FIGMA ORDER CONTEXT DRAWER
          ======================================================== */}
      {/* Backdrop overlay */}
      <div
        onClick={() => setSelectedOrderForDrawer(null)}
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${
          selectedOrderForDrawer ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer Panel: full vertical height anchored to the right, w-[360px] */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 h-screen flex flex-col transition-transform duration-300 ease-out ${
          selectedOrderForDrawer ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedOrderForDrawer && (
          <div className="box-border flex flex-col justify-between p-5 w-[360px] sm:w-[380px] h-full bg-white border-l border-y border-[#EAEAEA] rounded-l-[20px] shadow-2xl overflow-y-auto select-none font-['Inter',sans-serif]">
            {/* Top & Middle Content Stack */}
            <div className="w-full flex flex-col items-start gap-6">
              {/* Drawer header */}
              <div className="w-full flex flex-col items-start gap-1">
                {/* Context heading */}
                <div className="w-full flex flex-row justify-between items-center h-5">
                  <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                    Order details
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedOrderForDrawer(null)}
                    className="flex items-center justify-center w-5 h-5 text-[#666666] hover:text-[#000000] cursor-pointer"
                  >
                    <X className="w-4 h-4 stroke-[1.5px]" />
                  </button>
                </div>

                {/* Order heading */}
                <div className="w-full flex flex-row justify-between items-center min-h-[30px] pt-1">
                  <h3 className="text-[20px] font-semibold leading-[145%] text-[#000000] m-0 p-0">
                    {selectedOrderForDrawer.orderNumber}
                  </h3>
                  {/* Current fulfillment pill */}
                  <div className="flex flex-row items-center gap-1.5 px-2 py-0.5 bg-blue-50/60 rounded">
                    <div className="w-[3px] h-[12px] bg-[#2563EB]" />
                    <span className="text-[12px] font-semibold leading-[14px] text-[#2563EB]">
                      {selectedOrderForDrawer.fulfillmentStatus === "Picking" ? "Picking" : selectedOrderForDrawer.fulfillmentStatus}
                    </span>
                  </div>
                </div>

                {/* Marketplace and created time */}
                <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
                  {selectedOrderForDrawer.marketplace} · Created 23 oct {selectedOrderForDrawer.createdTime}
                </span>
              </div>

              {/* Dispatch SLA countdown */}
              <div className="w-full flex flex-col items-start gap-1.5">
                {/* SLA heading */}
                <div className="w-full flex flex-row justify-between items-start">
                  <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                    Dispatch SLA
                  </span>
                  <span className="text-[13px] font-semibold leading-[16px] text-[#D97706]">
                    42 minutes remaining
                  </span>
                </div>

                {/* Countdown track */}
                <div className="relative w-full h-[6px] bg-[#F5F5F5] rounded-full overflow-visible">
                  {/* Remaining time fill */}
                  <div className="w-[40%] h-[6px] bg-[#D97706] rounded-full" />
                  {/* Deadline threshold red tick mark */}
                  <div className="absolute right-0 top-[-2px] w-[2px] h-[10px] bg-[#DC2626] rounded-sm" />
                </div>

                {/* Time thresholds */}
                <div className="w-full flex flex-row justify-between items-start pt-0.5">
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                    Now · Picking in progress
                  </span>
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                    Dispatch deadline
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Customer and payment */}
              <div className="w-full flex flex-col items-start gap-3">
                {/* Customer */}
                <div className="w-full flex flex-col items-start gap-[3px]">
                  <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                    Customer
                  </span>
                  <span className="text-[14px] font-semibold leading-[18px] text-[#000000]">
                    {selectedOrderForDrawer.customer}
                  </span>
                  <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
                    Mumbai, Maharashtra
                  </span>
                </div>

                {/* Order value */}
                <div className="w-full flex flex-row justify-between items-center pt-1 border-t border-[#EAEAEA]">
                  <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                    Order Value
                  </span>
                  <div className="flex flex-row items-center gap-2.5">
                    <span className="text-[15px] font-semibold leading-[18px] text-[#000000]">
                      {formatINR(selectedOrderForDrawer.value)}
                    </span>
                    <div className="flex flex-row items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded">
                      <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2px]" />
                      <span className="text-[12px] font-medium leading-[14px] text-[#16A34A]">
                        Paid
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order items */}
              <div className="box-border w-full flex flex-col items-start pt-3 gap-2 border-t border-[#EAEAEA]">
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Items · 3 units
                </span>

                {/* Item 1 */}
                <div className="w-full flex flex-row justify-between items-center">
                  <span className="text-[13px] font-medium leading-[16px] text-[#000000]">
                    Black T-Shirt
                  </span>
                  <span className="text-[13px] font-normal leading-[16px] text-[#666666]">
                    × 2
                  </span>
                </div>

                {/* Item 2 */}
                <div className="w-full flex flex-row justify-between items-center">
                  <span className="text-[13px] font-medium leading-[16px] text-[#000000]">
                    Running Shoes
                  </span>
                  <span className="text-[13px] font-normal leading-[16px] text-[#666666]">
                    × 1
                  </span>
                </div>
              </div>

              {/* Fulfillment */}
              <div className="w-full flex flex-col items-start gap-2 border-t border-[#EAEAEA] pt-3">
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Fulfillment
                </span>
                <div className="w-full flex flex-row justify-between items-center">
                  <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
                    Warehouse
                  </span>
                  <span className="text-[13px] font-medium leading-[15px] text-[#000000]">
                    Mumbai Hub
                  </span>
                </div>
                <div className="w-full flex flex-row justify-between items-center">
                  <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
                    Picking
                  </span>
                  <span className="text-[12px] font-semibold leading-[15px] text-[#2563EB]">
                    In progress
                  </span>
                </div>
              </div>

              {/* Marketplace status */}
              <div className="box-border w-full flex flex-row justify-between items-center pt-3 border-t border-[#EAEAEA]">
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Marketplace status
                </span>
                <span className="text-[12px] font-normal leading-[14px] text-[#666666]">
                  Amazon: Pending shipment
                </span>
              </div>

              {/* Order activity timeline */}
              <div className="w-full flex flex-col items-start gap-2 border-t border-[#EAEAEA] pt-3">
                <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
                  Activity
                </span>

                {/* Activity event 1 */}
                <div className="w-full flex flex-row items-center gap-2.5">
                  <div className="w-[7px] h-[7px] rounded-full bg-[#BDBDBD] shrink-0" />
                  <span className="w-10 text-[11px] font-normal leading-[14px] text-[#666666] shrink-0">
                    12:04
                  </span>
                  <span className="flex-1 text-[12px] font-normal leading-[15px] text-[#666666]">
                    Order received
                  </span>
                </div>

                {/* Activity event 2 */}
                <div className="w-full flex flex-row items-center gap-2.5">
                  <div className="w-[7px] h-[7px] rounded-full bg-[#BDBDBD] shrink-0" />
                  <span className="w-10 text-[11px] font-normal leading-[14px] text-[#666666] shrink-0">
                    12:08
                  </span>
                  <span className="flex-1 text-[12px] font-normal leading-[15px] text-[#666666]">
                    Inventory reserved
                  </span>
                </div>

                {/* Activity event 3 */}
                <div className="w-full flex flex-row items-center gap-2.5">
                  <div className="w-[7px] h-[7px] rounded-full bg-[#BDBDBD] shrink-0" />
                  <span className="w-10 text-[11px] font-normal leading-[14px] text-[#666666] shrink-0">
                    12:18
                  </span>
                  <span className="flex-1 text-[12px] font-normal leading-[15px] text-[#666666]">
                    Order confirmed
                  </span>
                </div>

                {/* Activity event 4 (active) */}
                <div className="w-full flex flex-row items-center gap-2.5">
                  <div className="w-[7px] h-[7px] rounded-full bg-[#2563EB] shrink-0" />
                  <span className="w-10 text-[11px] font-normal leading-[14px] text-[#666666] shrink-0">
                    12:32
                  </span>
                  <span className="flex-1 text-[12px] font-semibold leading-[15px] text-[#000000]">
                    Picking started
                  </span>
                </div>
              </div>
            </div>

            {/* Pinned Bottom Drawer Actions */}
            <div className="w-full flex flex-row items-center gap-2.5 h-[42px] pt-4 border-t border-[#EAEAEA] mt-4">
              {/* Primary action: Open fulfillment */}
              <button
                type="button"
                onClick={() => setSelectedOrderForDrawer(null)}
                className="flex-1 flex flex-row justify-center items-center h-[38px] px-3 bg-[#000000] border border-[#000000] rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <span className="text-[13px] font-medium leading-[145%] text-[#FFFFFF]">
                  Open fulfillment
                </span>
              </button>

              {/* Secondary action: Cancel order */}
              <button
                type="button"
                onClick={() => setSelectedOrderForDrawer(null)}
                className="flex-1 flex flex-row justify-center items-center h-[38px] px-3 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <span className="text-[13px] font-medium leading-[145%] text-[#DC2626] text-center">
                  Cancel order
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
