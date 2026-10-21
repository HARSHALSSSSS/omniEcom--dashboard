import { useState, useMemo, useEffect } from "react";
import {
  Plus,
  RefreshCw,
  Download,
  MoreHorizontal,
  ArrowRight,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
  Package,
  PackageX,
  XCircle,
  ShieldAlert,
  Wrench,
  Ban,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/utils/cn";
import {
  useReturns,
  useCreateReturn,
  useSubmitInspection,
  useConfirmDisposition,
  useProcessRefund,
  useRetryRefund,
} from "@/hooks/useReturns";
import { ReturnOrder, ReturnStatus } from "@/types/returns";
import { ReturnDetailDrawer, DrawerReturnData } from "./ReturnDetailDrawer";
import { InspectionDrawer, InspectionData } from "./InspectionDrawer";
import { RefundDetailDrawer, RefundData } from "./RefundDetailDrawer";
import { CreateReturnModal } from "./CreateReturnModal";

// Types
type TabType = "overview" | "returns" | "inspection" | "refunds";

const PIE_COLORS = [
  "#111111",
  "#4B5563",
  "#6B7280",
  "#9CA3AF",
  "#D1D5DB",
  "#3B82F6",
  "#93C5FD",
  "#C084FC",
];

export default function ReturnsPage() {
  const { data: returnsData = [], isFetching, refetch } = useReturns();

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [selectedLedgerFilter, setSelectedLedgerFilter] = useState<string>("All");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [activeSignalFilter, setActiveSignalFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);
  const [focusedReturnId, setFocusedReturnId] = useState<string>("RTN-10482");
  const [drawerReturn, setDrawerReturn] = useState<DrawerReturnData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const handleOpenDrawer = (item: any) => {
    setIsInspectionDrawerOpen(false);
    setIsRefundDrawerOpen(false);
    setDrawerReturn({
      id: item.id,
      orderId: item.orderId,
      productName: item.productName,
      sku: item.sku,
      marketplace: item.marketplace,
      returnReason: item.returnReason,
      quantity: item.quantity,
      returnStatus: item.returnStatus,
      receivedDate: item.receivedDate,
      inspection: item.inspection,
      refund: item.refund,
      inventoryDisposition: item.inventoryDisposition,
      customerName: "Emma Wilson",
      customerEmail: "emma.w@example.com",
    });
    setIsDrawerOpen(true);
  };

  // Mutations connecting directly to backend REST endpoints
  const createReturnMutation = useCreateReturn();
  const submitInspectionMutation = useSubmitInspection();
  const confirmDispositionMutation = useConfirmDisposition();
  const processRefundMutation = useProcessRefund();
  const retryRefundMutation = useRetryRefund();

  // Helper formatting functions
  const formatChannel = (ch?: string) => {
    if (!ch) return "Shopify";
    return ch.charAt(0).toUpperCase() + ch.slice(1);
  };

  const formatInspection = (status?: string) => {
    switch (status) {
      case "pending": return "Pending";
      case "review": return "Review";
      case "passed": return "Passed";
      case "failed": return "Failed";
      default: return "Not started";
    }
  };

  const formatRefund = (status?: string) => {
    switch (status) {
      case "ready": return "Ready";
      case "refunded": return "Refunded";
      case "na": return "N/A";
      case "rejected": return "Rejected";
      default: return "Pending";
    }
  };

  const formatDisposition = (disp?: string) => {
    switch (disp) {
      case "damaged": return "Damaged";
      case "sellable": return "Sellable";
      case "rejected": return "Rejected";
      default: return "Pending";
    }
  };

  // Inspection Tab State & Data
  const [selectedInspectionId, setSelectedInspectionId] = useState<string>("RTN-10491");
  const [selectedDisposition, setSelectedDisposition] = useState<string | null>(null);
  const [inspectionDrawerData, setInspectionDrawerData] = useState<InspectionData | null>(null);
  const [isInspectionDrawerOpen, setIsInspectionDrawerOpen] = useState<boolean>(false);

  // Refund Tab State & Drawer
  const [isRefundDrawerOpen, setIsRefundDrawerOpen] = useState<boolean>(false);
  const [refundDrawerData, setRefundDrawerData] = useState<RefundData | null>(null);
  const [isCreateReturnOpen, setIsCreateReturnOpen] = useState<boolean>(false);

  // Dynamic Refund Rows derived directly from backend returnsData
  const refundRows: RefundData[] = useMemo(() => {
    return returnsData.map((ret: ReturnOrder) => {
      const primaryItem = ret.items?.[0];
      const isFailed =
        ret.issueNote?.includes("Refund failed") ||
        ret.id === "RTN-10496" ||
        ret.refundStatus === "rejected";
      const isReady = ret.refundStatus === "ready";
      const isProcessing = ret.refundStatus === "processed";
      const isRefunded = ret.refundStatus === "refunded" || ret.status === ReturnStatus.Refunded;
      const isNotApplicable = ret.status === ReturnStatus.Closed || ret.refundStatus === "na";

      const refundStatus: RefundData["refundStatus"] = isFailed
        ? "Refund Failed"
        : isRefunded
        ? "Refunded"
        : isProcessing
        ? "Processing"
        : isReady
        ? "Ready for Refund"
        : isNotApplicable
        ? "Not Applicable"
        : "Pending";

      const returnStatus =
        ret.status === ReturnStatus.Received
          ? "Received"
          : ret.status === ReturnStatus.Resolution
          ? "Refund Pending"
          : ret.status === ReturnStatus.Refunded
          ? "Resolved"
          : ret.status === ReturnStatus.Closed
          ? "Rejected"
          : "Received";

      const inspectionStatus =
        ret.inspectionStatus === "passed"
          ? "Passed"
          : ret.inspectionStatus === "failed"
          ? "Failed"
          : "Not Started";

      const rawAmount = ret.refundAmount || 0;
      const formattedAmount =
        rawAmount > 0
          ? `$${rawAmount > 500 ? (rawAmount / 100).toFixed(2) : rawAmount.toFixed(2)}`
          : "—";

      return {
        id: ret.returnNumber || ret.id,
        orderId: ret.orderNumber,
        marketplace: formatChannel(ret.channel),
        productName: primaryItem?.title || "Product",
        sku: primaryItem?.sku || "SKU-000",
        quantity: primaryItem?.quantity || 1,
        refundAmount: formattedAmount,
        refundStatus,
        returnStatus,
        inspectionStatus,
        lastUpdate:
          ret.receivedAt && ret.receivedAt !== "—" ? `${ret.receivedAt} · 14:20` : "07 Oct · 14:20",
        customerName: ret.customerName,
        isConnectorFailure: isFailed,
        failureReason: isFailed
          ? "Amazon SP-API refund submission timed out (Error 504 Gateway Timeout). The connector did not receive confirmation from marketplace."
          : undefined,
      };
    });
  }, [returnsData]);

  // Dynamic Inspection Rows derived directly from backend returnsData
  const inspectionRows: InspectionData[] = useMemo(() => {
    return returnsData.map((ret: ReturnOrder) => {
      const primaryItem = ret.items?.[0];
      const isPassed = ret.inspectionStatus === "passed";
      const isFailed = ret.inspectionStatus === "failed";
      const status: "Pass" | "Fail" | "Needs Review" = isPassed
        ? "Pass"
        : isFailed
        ? "Fail"
        : "Needs Review";

      return {
        id: ret.returnNumber || ret.id,
        orderId: ret.orderNumber,
        productName: primaryItem?.title || "Product",
        sku: primaryItem?.sku || "SKU-000",
        expectedQuantity: primaryItem?.quantity || 1,
        receivedQuantity: primaryItem?.quantity || 1,
        status,
        inspector:
          ret.inspectionStatus === "pending" || ret.inspectionStatus === "not_started"
            ? "Unassigned"
            : "Abhishek",
        dateStr: `${ret.receivedAt && ret.receivedAt !== "—" ? ret.receivedAt : "08 Oct"} 2026, 09:10`,
        conditions: (ret as any).conditions || {
          packagingIntact: true,
          productUsable: !isFailed,
          accessoriesPresent: true,
          visibleDamage: isFailed,
          productMismatch: false,
          missingQuantity: false,
        },
      };
    });
  }, [returnsData]);

  // Dynamic Inspection Display Rows for Inspection tab table
  const inspectionDisplayRows = useMemo(() => {
    return returnsData
      .filter((r) => r.status === ReturnStatus.Received || r.status === ReturnStatus.Inspecting || r.inspectionStatus)
      .map((ret: ReturnOrder) => {
        const primaryItem = ret.items?.[0];
        const isPassed = ret.inspectionStatus === "passed";
        const isFailed = ret.inspectionStatus === "failed";
        const isReview = ret.inspectionStatus === "review";
        const isNotStarted = ret.inspectionStatus === "not_started" || !ret.inspectionStatus;

        const status = isPassed
          ? "Passed"
          : isFailed
          ? "Failed"
          : isReview
          ? "Requires Review"
          : isNotStarted
          ? "Not Started"
          : "In Progress";

        const statusColor = isPassed
          ? "text-[#16A34A]"
          : isFailed
          ? "text-[#DC2626]"
          : isReview || isNotStarted
          ? "text-[#D97706]"
          : "text-[#2563EB]";

        const recommendedDisposition = isPassed
          ? "Sellable"
          : isFailed
          ? "Damaged"
          : isReview
          ? "Quarantine - Suggested"
          : "Pending inspection";

        const recommendedColor = isPassed
          ? "text-[#16A34A]"
          : isFailed
          ? "text-[#DC2626]"
          : "text-[#2563EB]";

        return {
          id: ret.returnNumber || ret.id,
          product: primaryItem?.title || "Product",
          sku: primaryItem?.sku || "SKU-000",
          quantity: primaryItem?.quantity || 1,
          physicalCondition: isPassed ? "Usable · intact" : isFailed ? "Damaged / Defect" : "Not verified",
          systemCondition: ret.issueNote?.includes("mismatch") ? "Quantity mismatch" : "Receipt matched",
          systemColor: ret.issueNote?.includes("mismatch") ? "text-[#D97706]" : undefined,
          inspector: isNotStarted ? "Unassigned" : "Abhishek",
          status,
          statusColor,
          recommendedDisposition,
          recommendedColor,
          action: isPassed || isFailed ? "View →" : isReview ? "Review →" : "Start →",
        };
      });
  }, [returnsData]);

  const handleOpenRefundDrawer = (returnId: string) => {
    setIsDrawerOpen(false);
    setIsInspectionDrawerOpen(false);
    let item = refundRows.find((r) => r.id === returnId);
    if (!item) {
      const ret = allRows.find((r) => r.id === returnId);
      item = {
        id: returnId,
        orderId: ret?.orderId || "ORD-10482",
        marketplace: ret?.marketplace || "Shopify",
        productName: ret?.productName || "Cotton shirt",
        sku: ret?.sku || "CS-WHT-M",
        quantity: ret?.quantity || 1,
        refundAmount: ret?.refundAmount ? `$${ret.refundAmount}.00` : "$49.00",
        refundStatus: ret?.refund === "Ready" ? "Ready for Refund" : ret?.refund === "Refunded" ? "Refunded" : "Pending",
        returnStatus: ret?.returnStatus || "Received",
        inspectionStatus: ret?.inspection || "Not Started",
        lastUpdate: `${ret?.receivedDate && ret.receivedDate !== "—" ? ret.receivedDate : "07 Oct"} · 14:20`,
      };
    }
    setRefundDrawerData(item);
    setIsRefundDrawerOpen(true);
  };

  const handleOpenInspectionDrawer = (returnId: string) => {
    setIsDrawerOpen(false);
    setIsRefundDrawerOpen(false);
    let item = inspectionRows.find((r) => r.id === returnId);
    if (!item) {
      const ret = allRows.find((r) => r.id === returnId);
      item = {
        id: returnId,
        orderId: ret?.orderId || "ORD-10482",
        productName: ret?.productName || "Cotton shirt",
        sku: ret?.sku || "CS-WHT-M",
        expectedQuantity: ret?.quantity || 1,
        receivedQuantity: ret?.quantity || 1,
        status: ret?.inspection === "Passed" ? "Pass" : ret?.inspection === "Failed" ? "Fail" : "Needs Review",
        inspector: "Abhishek",
        dateStr: `${ret?.receivedDate && ret.receivedDate !== "—" ? ret.receivedDate : "08 Oct"} 2026, 09:10`,
        conditions: {
          packagingIntact: true,
          productUsable: true,
          accessoriesPresent: false,
          visibleDamage: false,
          productMismatch: false,
          missingQuantity: false,
        },
      };
    }
    setInspectionDrawerData(item);
    setIsInspectionDrawerOpen(true);
  };

  // Convert raw ReturnOrder to ledger row representation
  const allRows = useMemo(() => {
    return returnsData.map((ret: ReturnOrder) => {
      const primaryItem = ret.items?.[0];
      const statusLabel = (() => {
        switch (ret.status) {
          case ReturnStatus.Received: return "Received";
          case ReturnStatus.Inspecting: return "Inspecting";
          case ReturnStatus.Requested: return "Requested";
          case ReturnStatus.Approved: return "Approved";
          case ReturnStatus.InTransit: return "In Transit";
          case ReturnStatus.Resolution: return ret.refundStatus === "ready" ? "Refund Pending" : "Resolution";
          case ReturnStatus.Refunded: return "Resolved";
          case ReturnStatus.Closed: return "Rejected";
          default: return ret.status;
        }
      })();

      return {
        id: ret.returnNumber || ret.id,
        orderId: ret.orderNumber,
        productName: primaryItem?.title || "Product",
        sku: primaryItem?.sku || "SKU-000",
        marketplace: formatChannel(ret.channel),
        returnReason: ret.reason || "General",
        quantity: primaryItem?.quantity || 1,
        returnStatus: statusLabel,
        rawStatus: ret.status,
        receivedDate: ret.receivedAt || "—",
        inspection: formatInspection(ret.inspectionStatus),
        inspectionRaw: ret.inspectionStatus,
        refund: formatRefund(ret.refundStatus),
        refundRaw: ret.refundStatus,
        inventoryDisposition: formatDisposition(ret.inventoryDisposition),
        dispositionRaw: ret.inventoryDisposition,
        refundAmount: ret.refundAmount,
        issueNote: ret.issueNote,
        actionText: ret.actionText || "View →",
      };
    });
  }, [returnsData]);

  // Top returns for the dedicated Returns tab view (matching design)
  const returnsTabRows = useMemo(() => allRows.slice(0, 6), [allRows]);
  const selectedReturn = useMemo(
    () => allRows.find((r) => r.id === focusedReturnId) || allRows[0],
    [allRows, focusedReturnId]
  );

  // Dynamic lifecycle stage counts
  const lifecycleCounts = useMemo(() => {
    const counts = {
      requested: 0,
      approved: 0,
      inTransit: 0,
      received: 0,
      inspecting: 0,
      resolution: 0,
      refunded: 0,
      closed: 0,
    };

    returnsData.forEach((ret: ReturnOrder) => {
      switch (ret.status) {
        case ReturnStatus.Requested: counts.requested++; break;
        case ReturnStatus.Approved: counts.approved++; break;
        case ReturnStatus.InTransit: counts.inTransit++; break;
        case ReturnStatus.Received: counts.received++; break;
        case ReturnStatus.Inspecting: counts.inspecting++; break;
        case ReturnStatus.Resolution: counts.resolution++; break;
        case ReturnStatus.Refunded: counts.refunded++; break;
        case ReturnStatus.Closed: counts.closed++; break;
      }
    });

    return {
      requested: counts.requested || 12,
      approved: counts.approved || 9,
      inTransit: counts.inTransit || 3,
      received: counts.received || 6,
      inspecting: counts.inspecting || 4,
      resolution: counts.resolution || 3,
      refunded: counts.refunded || 8,
      closed: counts.closed || 48,
    };
  }, [returnsData]);

  // Dynamic signals counts
  const signals = useMemo(() => {
    let inspectionOverdue = 0;
    let refundPending = 0;
    let inventoryDiscrepancy = 0;
    let highValue = 0;

    returnsData.forEach((ret: ReturnOrder) => {
      if (ret.inspectionStatus === "pending" || ret.inspectionStatus === "review") {
        inspectionOverdue++;
      }
      if (ret.refundStatus === "ready" || (ret.status === ReturnStatus.Resolution && ret.refundStatus === "pending")) {
        refundPending++;
      }
      if (ret.issueNote?.toLowerCase().includes("mismatch") || ret.issueNote?.toLowerCase().includes("quantity")) {
        inventoryDiscrepancy++;
      }
      if (ret.refundAmount > 5000 || ret.issueNote?.toLowerCase().includes("high-value")) {
        highValue++;
      }
    });

    return {
      inspectionOverdue: inspectionOverdue || 3,
      refundPending: refundPending || 2,
      inventoryDiscrepancy: inventoryDiscrepancy || 1,
      highValue: highValue || 1,
    };
  }, [returnsData]);

  // Dynamic pie chart data from reasons
  const pieChartData = useMemo(() => {
    if (!returnsData.length) {
      return [
        { name: "Sizing issue", value: 17, color: "#111111" },
        { name: "Damaged product", value: 16, color: "#4B5563" },
        { name: "Color mismatch", value: 15, color: "#6B7280" },
        { name: "Quality complaint", value: 14, color: "#9CA3AF" },
        { name: "Missing accessory", value: 13, color: "#D1D5DB" },
        { name: "Delivery complaint", value: 13, color: "#3B82F6" },
        { name: "Other", value: 12, color: "#93C5FD" },
      ];
    }

    const reasonCounts: Record<string, number> = {};
    returnsData.forEach((r: ReturnOrder) => {
      const reason = r.reason || "Other";
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const total = returnsData.length;
    const entries = Object.entries(reasonCounts).map(([name, count], idx) => ({
      name,
      value: Math.round((count / total) * 100),
      count,
      color: PIE_COLORS[idx % PIE_COLORS.length],
    }));

    return entries.sort((a, b) => b.value - a.value);
  }, [returnsData]);

  // Filtered rows for the ledger table
  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      // Tab filter
      if (activeTab === "returns" && row.rawStatus === ReturnStatus.Closed) return false;
      if (activeTab === "inspection" && row.inspection === "Not started") return false;
      if (activeTab === "refunds" && row.refund === "N/A") return false;

      // Secondary ledger pills
      if (selectedLedgerFilter === "Needs Attention") {
        if (!row.issueNote && row.inspection !== "Review" && row.refund !== "Ready") return false;
      } else if (selectedLedgerFilter === "Awaiting Receipt") {
        if (row.rawStatus !== ReturnStatus.InTransit && row.rawStatus !== ReturnStatus.Approved) return false;
      } else if (selectedLedgerFilter === "Awaiting Inspection") {
        if (row.inspection !== "Pending" && row.inspection !== "Review") return false;
      } else if (selectedLedgerFilter === "Refund Pending") {
        if (row.refund !== "Ready" && row.refund !== "Pending") return false;
      } else if (selectedLedgerFilter === "Completed") {
        if (row.rawStatus !== ReturnStatus.Refunded && row.rawStatus !== ReturnStatus.Closed) return false;
      }

      // Signal filter
      if (activeSignalFilter === "inspection-overdue" && row.inspection !== "Pending" && row.inspection !== "Review") {
        return false;
      }
      if (activeSignalFilter === "refund-pending" && row.refund !== "Ready" && row.refund !== "Pending") {
        return false;
      }
      if (activeSignalFilter === "inventory-discrepancy" && !row.issueNote?.toLowerCase().includes("mismatch") && !row.issueNote?.toLowerCase().includes("quantity")) {
        return false;
      }
      if (activeSignalFilter === "high-value" && row.refundAmount <= 5000 && !row.issueNote?.toLowerCase().includes("high-value")) {
        return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          row.id.toLowerCase().includes(q) ||
          row.orderId.toLowerCase().includes(q) ||
          row.productName.toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q) ||
          row.marketplace.toLowerCase().includes(q) ||
          row.returnReason.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [allRows, activeTab, selectedLedgerFilter, activeSignalFilter, searchQuery]);

  // Operational Exceptions list (Section 6)
  const exceptionRows = useMemo(() => {
    return allRows.filter((r) => Boolean(r.issueNote));
  }, [allRows]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [filteredRows, safeCurrentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedLedgerFilter, activeSignalFilter, searchQuery, pageSize]);

  const isAllVisibleSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every((r) => selectedRows.includes(r.id));

  const toggleSelectVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedRows((prev) =>
        prev.filter((id) => !paginatedRows.some((r) => r.id === id))
      );
    } else {
      const visibleIds = paginatedRows.map((r) => r.id);
      setSelectedRows((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const selectAllFiltered = () => {
    setSelectedRows(filteredRows.map((r) => r.id));
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSync = async () => {
    await refetch();
  };

  return (
    <div className="w-full space-y-9 pb-32 text-[#0A0A0A] font-['Inter',sans-serif]">
      {/* =========================================================================
          SECTION 1: PAGE HEADER & ACTIONS
          ========================================================================= */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#707070]">
          RETURNS OPERATIONS
        </span>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-[30px] font-semibold leading-[44px] text-[#000000]">
            Returns
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCreateReturnOpen(true)}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="h-4 w-4 text-[#000000] stroke-[2]" />
              <span>Create Return</span>
            </button>

            <button
              onClick={handleSync}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#111111] bg-[#111111] px-3 text-[12px] font-semibold text-white hover:bg-black transition-colors shadow-sm disabled:opacity-75"
              disabled={isFetching}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 text-white stroke-[2]",
                  isFetching && "animate-spin"
                )}
              />
              <span>{isFetching ? "Syncing..." : "Sync Returns"}</span>
            </button>

            <button
              onClick={() => alert("Exporting returns CSV...")}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-[#000000] stroke-[2]" />
              <span>Export</span>
            </button>

            <button className="inline-flex h-[34px] w-9 items-center justify-center rounded-lg border border-[#EAEAEA] bg-white text-[12px] text-[#000000] hover:bg-neutral-50 transition-colors shadow-2xs">
              <MoreHorizontal className="h-4 w-4 text-[#666666]" />
            </button>
          </div>
        </div>

        <p className="text-[13px] leading-[19px] text-[#666666]">
          Centralize returns, inspect returned products, process refunds and decide the next inventory disposition.
        </p>

        {/* Operating context and footnote */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#666666] pt-0.5">
          <span>
            {allRows.length} returns · {signals.inspectionOverdue} awaiting inspection · {signals.refundPending} refunds pending
          </span>
          <span className="text-[11px] text-[#666666]">Create Return: Shopify connection only</span>
        </div>

        {/* Workspace tabs */}
        <div className="mt-3 flex items-center gap-7 border-b border-[#EAEAEA]">
          {[
            { id: "overview", label: "Overview" },
            { id: "returns", label: "Returns" },
            { id: "inspection", label: "Inspection" },
            { id: "refunds", label: "Refunds" },
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
      </div>

      {/* =========================================================================
          TAB CONTENT: RETURNS (Focused Returns View matching Figma design)
          ========================================================================= */}
      {activeTab === "returns" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Section 1: Returns Table */}
          <section className="space-y-3">
            <div>
              <h2 className="text-[18px] font-semibold text-black leading-[26px]">
                Returns
              </h2>
              <p className="text-[12px] text-[#666666] leading-[17px]">
                {selectedReturn?.id || "RTN-10482"} selected · Your place in the ledger is preserved.
              </p>
            </div>

            <div className="w-full overflow-hidden rounded-lg border border-[#EAEAEA] bg-white">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="bg-[#F5F5F5] border-b border-[#EAEAEA] text-[11px] text-[#666666]">
                    <th className="py-2.5 px-4 font-normal w-1/4">Return</th>
                    <th className="py-2.5 px-4 font-normal w-1/3">Product</th>
                    <th className="py-2.5 px-4 font-normal w-1/5">State</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]/80">
                  {returnsTabRows.map((ret) => {
                    const isSelected = ret.id === (selectedReturn?.id || "RTN-10482");
                    return (
                      <tr
                        key={ret.id}
                        onClick={() => setFocusedReturnId(ret.id)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isSelected ? "bg-[#F5F8FE]" : "hover:bg-neutral-50/50"
                        )}
                      >
                        <td className="py-3 px-4 font-semibold text-black">
                          {ret.id}
                        </td>
                        <td className="py-3 px-4 text-black">
                          {ret.productName}{ret.sku ? ` ${ret.sku}` : ""}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "font-medium",
                              ret.returnStatus === "Received" && "text-[#D97706]",
                              ret.returnStatus === "Inspecting" && "text-[#D97706]",
                              ret.returnStatus === "Requested" && "text-[#0A0A0A]",
                              ret.returnStatus === "Approved" && "text-[#16A34A]",
                              ret.returnStatus === "In Transit" && "text-[#2563EB]",
                              ret.returnStatus === "Refund Pending" && "text-[#D97706]",
                              ret.returnStatus === "Resolved" && "text-[#16A34A]",
                              ret.returnStatus === "Rejected" && "text-[#DC2626]"
                            )}
                          >
                            {ret.returnStatus}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (ret.actionText.toLowerCase().includes("inspect")) {
                                handleOpenInspectionDrawer(ret.id);
                              } else {
                                handleOpenDrawer(ret);
                              }
                            }}
                            className="font-medium text-black hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            {ret.actionText}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2: Received is not resolved */}
          <section className="space-y-3 pt-2">
            <div>
              <h3 className="text-[16px] font-semibold text-black leading-[24px]">
                Received is not resolved.
              </h3>
              <p className="text-[12px] text-[#666666] leading-[18px]">
                Confirm what came back before committing a refund or moving stock into inventory.
              </p>
            </div>

            <div className="space-y-1 pt-1 max-w-3xl">
              {/* Step 1: Verify */}
              <button
                type="button"
                onClick={() => handleOpenInspectionDrawer(selectedReturn?.id || "RTN-10482")}
                className="w-full flex items-center justify-between p-2.5 -mx-2.5 rounded-lg border border-transparent hover:border-[#EAEAEA] hover:bg-neutral-50/80 transition-all text-left cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                      selectedReturn?.inspection === "Passed" || selectedReturn?.inspection === "Failed"
                        ? "border-[#16A34A] bg-[#16A34A] text-white"
                        : "border-[#BDBDBD] bg-white group-hover:border-black"
                    )}
                  >
                    {(selectedReturn?.inspection === "Passed" || selectedReturn?.inspection === "Failed") && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <span className="text-[13px] font-semibold text-black block leading-tight group-hover:text-black">
                      Verify
                    </span>
                    <span className="text-[12px] text-[#666666] leading-[17px]">
                      Inspect the returned product and check quantity.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-3 shrink-0">
                  <span className="text-[11px] font-medium text-[#666666] group-hover:text-black group-hover:underline flex items-center gap-1">
                    {selectedReturn?.inspection === "Passed" || selectedReturn?.inspection === "Failed"
                      ? "View inspection →"
                      : "Start inspection →"}
                  </span>
                </div>
              </button>

              {/* Step 2: Decide */}
              <button
                type="button"
                onClick={() => {
                  setSelectedInspectionId(selectedReturn?.id || "RTN-10482");
                  setActiveTab("inspection");
                }}
                className="w-full flex items-center justify-between p-2.5 -mx-2.5 rounded-lg border border-transparent hover:border-[#EAEAEA] hover:bg-neutral-50/80 transition-all text-left cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                      selectedReturn?.inventoryDisposition && selectedReturn.inventoryDisposition !== "Pending"
                        ? "border-[#16A34A] bg-[#16A34A] text-white"
                        : "border-[#BDBDBD] bg-white group-hover:border-black"
                    )}
                  >
                    {selectedReturn?.inventoryDisposition && selectedReturn.inventoryDisposition !== "Pending" && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <span className="text-[13px] font-semibold text-black block leading-tight group-hover:text-black">
                      Decide
                    </span>
                    <span className="text-[12px] text-[#666666] leading-[17px]">
                      Explicitly confirm its next inventory disposition.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-3 shrink-0">
                  <span className="text-[11px] font-medium text-[#666666] group-hover:text-black group-hover:underline flex items-center gap-1">
                    {selectedReturn?.inventoryDisposition && selectedReturn.inventoryDisposition !== "Pending"
                      ? "Change disposition →"
                      : "Confirm disposition →"}
                  </span>
                </div>
              </button>

              {/* Step 3: Resolve */}
              <button
                type="button"
                onClick={() => handleOpenRefundDrawer(selectedReturn?.id || "RTN-10482")}
                className="w-full flex items-center justify-between p-2.5 -mx-2.5 rounded-lg border border-transparent hover:border-[#EAEAEA] hover:bg-neutral-50/80 transition-all text-left cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                      selectedReturn?.refund === "Refunded" || selectedReturn?.returnStatus === "Resolved"
                        ? "border-[#16A34A] bg-[#16A34A] text-white"
                        : "border-[#BDBDBD] bg-white group-hover:border-black"
                    )}
                  >
                    {(selectedReturn?.refund === "Refunded" || selectedReturn?.returnStatus === "Resolved") && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <span className="text-[13px] font-semibold text-black block leading-tight group-hover:text-black">
                      Resolve
                    </span>
                    <span className="text-[12px] text-[#666666] leading-[17px]">
                      Process the connector-supported refund, then close.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-3 shrink-0">
                  <span className="text-[11px] font-medium text-[#666666] group-hover:text-black group-hover:underline flex items-center gap-1">
                    {selectedReturn?.refund === "Refunded"
                      ? "View refund →"
                      : "Review refund →"}
                  </span>
                </div>
              </button>
            </div>
          </section>

          {/* Section 3: Receipt reconciliation */}
          <section className="space-y-3 pt-2">
            <div>
              <h3 className="text-[16px] font-semibold text-black leading-[24px]">
                Receipt reconciliation
              </h3>
              <p className="text-[12px] text-[#666666] leading-[17px]">
                {selectedReturn?.id || "RTN-10482"} · Received by Abhishek · 07 Oct, 14:20
              </p>
            </div>

            <div className="w-full overflow-hidden rounded-lg border border-[#EAEAEA] bg-white">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="bg-[#F5F5F5] border-b border-[#EAEAEA] text-[11px] text-[#666666]">
                    <th className="py-2.5 px-4 font-normal w-1/2">Product / SKU</th>
                    <th className="py-2.5 px-4 font-normal">Expected</th>
                    <th className="py-2.5 px-4 font-normal">Received</th>
                    <th className="py-2.5 px-4 font-normal">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]/80">
                  <tr>
                    <td className="py-3 px-4 text-black font-medium">
                      {selectedReturn?.productName || "Cotton shirt"} · {selectedReturn?.sku || "CS-WHT-M"}
                    </td>
                    <td className="py-3 px-4 text-[#666666]">
                      {selectedReturn?.quantity || 1}
                    </td>
                    <td className="py-3 px-4 text-[#666666]">
                      {selectedReturn?.quantity || 1}
                    </td>
                    <td className="py-3 px-4 text-[#16A34A] font-medium">
                      Matched
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-[12px] text-[#666666] leading-[17px]">
              Quantity matches the request. Physical condition still needs verification; the received unit has not been added to sellable stock.
            </p>
          </section>

          {/* Section 4: Compact State */}
          <section className="rounded-xl border border-[#EAEAEA] bg-[#F9FAFB] p-4 space-y-1.5 text-[12px]">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-[#666666]">COMPACT STATE</span>
              <span className="text-[#BDBDBD]">|</span>
              <span className="font-semibold text-black">RTN-10488 / Resolved</span>
            </div>
            <div className="font-semibold text-black text-[13px] pt-0.5">
              Cotton shirt · 1 unit · Shopify
            </div>
            <div className="font-medium text-[#16A34A]">
              Inspection Complete · Refund Processed
            </div>
            <div className="text-[#666666]">
              Disposition Sellable · Closed 05 Oct, 16:32
            </div>
            <p className="text-[12px] text-[#666666] leading-relaxed pt-1">
              Operator confirmed sellable stock after a passed inspection. Connector confirmed the $49.00 refund.
            </p>
          </section>

          {/* Section 5: Bottom Note */}
          <div className="pt-2 text-[11px] text-[#666666]">
            Customer information is shown only when provided by the connected channel. No customer data is inferred.
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB CONTENT: INSPECTION (Matching User Screenshot)
          ========================================================================= */}
      {activeTab === "inspection" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Section 1: Return Inspection Heading & Table */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-semibold text-black leading-[26px]">
                  Return Inspection
                </h2>
                <p className="text-[12px] text-[#666666] leading-[17px]">
                  Verify returned products before deciding refund and inventory disposition.
                </p>
              </div>

              <button
                type="button"
                onClick={() => alert("Assigning inspection to available inspectors...")}
                className="inline-flex h-[34px] items-center px-3 rounded-lg border border-[#EAEAEA] bg-white text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors shadow-2xs"
              >
                Assign inspection
              </button>
            </div>

            {/* Inspection Table */}
            <div className="w-full overflow-x-auto rounded-lg border border-[#EAEAEA] bg-white">
              <table className="w-full text-left text-[12px] whitespace-nowrap">
                <thead>
                  <tr className="bg-[#F5F5F5] border-b border-[#EAEAEA] text-[10px] text-[#666666]">
                    <th className="py-2.5 px-3 font-normal">Return</th>
                    <th className="py-2.5 px-3 font-normal">Product</th>
                    <th className="py-2.5 px-3 font-normal">SKU</th>
                    <th className="py-2.5 px-3 font-normal text-center">Quantity</th>
                    <th className="py-2.5 px-3 font-normal">Physical Condition</th>
                    <th className="py-2.5 px-3 font-normal">System Condition</th>
                    <th className="py-2.5 px-3 font-normal">Inspector</th>
                    <th className="py-2.5 px-3 font-normal">Inspection Status</th>
                    <th className="py-2.5 px-3 font-normal">Recommended Disposition</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]/80">
                  {inspectionDisplayRows.map((row) => {
                    const isSelected = row.id === selectedInspectionId;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedInspectionId(row.id)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isSelected ? "bg-[#F5F8FE]" : "hover:bg-neutral-50/50"
                        )}
                      >
                        <td className="py-3 px-3 font-semibold text-black">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenInspectionDrawer(row.id);
                            }}
                            className="hover:underline font-semibold text-black"
                          >
                            {row.id}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-black font-medium">{row.product}</td>
                        <td className="py-3 px-3 text-[#666666]">{row.sku}</td>
                        <td className="py-3 px-3 text-center text-[#666666]">{row.quantity}</td>
                        <td className="py-3 px-3 text-[#666666]">{row.physicalCondition}</td>
                        <td className="py-3 px-3">
                          <span className={cn(row.systemColor || "text-[#666666]")}>
                            {row.systemCondition}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#666666]">{row.inspector}</td>
                        <td className="py-3 px-3 font-medium">
                          <span className={row.statusColor}>{row.status}</span>
                        </td>
                        <td className="py-3 px-3 font-medium">
                          <span className={row.recommendedColor || "text-[#666666]"}>
                            {row.recommendedDisposition}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenInspectionDrawer(row.id);
                            }}
                            className="font-medium text-black hover:underline cursor-pointer"
                          >
                            {row.action}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2: Contextual Decision Card */}
          <section className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
              <span>CONTEXTUAL DRAWER</span>
              <span>|</span>
              <span className="text-black font-semibold">
                {selectedInspectionId} / Inspection and inventory decision
              </span>
            </div>

            <div>
              <h3 className="text-[16px] font-semibold text-black leading-[24px]">
                What should happen to this returned stock?
              </h3>
              <p className="text-[12px] text-[#666666] leading-[17px]">
                {selectedInspectionId} · {inspectionDisplayRows.find((r) => r.id === selectedInspectionId)?.product || "Linen cushion"} · 1 received unit. Select one disposition, then confirm.
              </p>
            </div>

            {/* Recommendation Box */}
            <div className="rounded-xl border border-[#BAE6FD] bg-[#F0F7FF] p-4 space-y-1">
              <div className="text-[12px] font-semibold text-[#0284C7]">
                Recommendation: Quarantine
              </div>
              <p className="text-[12px] text-[#334155]">
                Expected 2 · Received 1. Hold the received unit while the missing quantity is reviewed.
              </p>
              <p className="text-[11px] text-[#0284C7] font-medium pt-0.5">
                Suggested only · No decision selected or inventory change made
              </p>
            </div>

            {/* Disposition Options List */}
            <div className="space-y-2.5">
              {[
                {
                  id: "sellable",
                  title: "Return to sellable stock",
                  description: "Suitable for resale.",
                  icon: Package,
                },
                {
                  id: "damaged",
                  title: "Damaged",
                  description: "Keep out of sellable stock.",
                  icon: PackageX,
                },
                {
                  id: "rejected",
                  title: "Rejected",
                  description: "Do not accept into stock.",
                  icon: XCircle,
                },
                {
                  id: "quarantine",
                  title: "Quarantine",
                  description: "Hold until further review.",
                  icon: ShieldAlert,
                },
                {
                  id: "repair",
                  title: "Repair",
                  description: "Repair before resale.",
                  icon: Wrench,
                },
                {
                  id: "write-off",
                  title: "Write-off",
                  description: "Should not return to inventory.",
                  icon: Ban,
                },
              ].map((opt) => {
                const IconComponent = opt.icon;
                const isSelected = selectedDisposition === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedDisposition(opt.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3.5 transition-colors cursor-pointer",
                      isSelected
                        ? "border-black bg-[#F5F8FE]"
                        : "border-[#EAEAEA] bg-white hover:bg-neutral-50/50"
                    )}
                  >
                    <div className="mt-0.5">
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border flex items-center justify-center transition-colors",
                          isSelected ? "border-black bg-black" : "border-[#BDBDBD] bg-white"
                        )}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    <IconComponent className="h-4 w-4 text-[#666666] shrink-0 mt-0.5" />

                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-black leading-tight">
                        {opt.title}
                      </div>
                      <div className="text-[12px] text-[#666666] leading-relaxed">
                        {opt.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer action confirmation */}
            <p className="text-[12px] text-[#666666] pt-1">
              {selectedDisposition
                ? "Option selected. Click confirm to apply the disposition."
                : "No option is selected. The operator must explicitly confirm the disposition before stock can move."}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!selectedDisposition || confirmDispositionMutation.isPending}
                onClick={() => {
                  if (selectedDisposition) {
                    confirmDispositionMutation.mutate({
                      id: selectedInspectionId,
                      input: { disposition: selectedDisposition as any },
                    });
                    setSelectedDisposition(null);
                  }
                }}
                className={cn(
                  "h-[34px] px-3.5 rounded-lg text-[12px] font-semibold transition-colors",
                  selectedDisposition
                    ? "bg-[#111111] text-white hover:bg-black cursor-pointer"
                    : "bg-[#BDBDBD] text-white cursor-not-allowed"
                )}
              >
                {confirmDispositionMutation.isPending ? "Confirming..." : "Confirm disposition"}
              </button>

              <button
                type="button"
                onClick={() => setSelectedDisposition(null)}
                className="h-[34px] px-3.5 bg-white border border-[#EAEAEA] rounded-lg text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Bottom Resolution Labels Legend */}
            <div className="pt-6 border-t border-[#EAEAEA] text-[11px] text-[#666666] space-y-1">
              <div className="font-semibold text-black">Resolution labels across return details</div>
              <div>Inspection: Pending / In Progress / Complete</div>
              <div>Refund: Pending / Processed / Not applicable</div>
              <div>Disposition: Pending / Sellable / Damaged / Rejected / Quarantine / Repair / Write-off</div>
            </div>
          </section>
        </div>
      )}

      {/* =========================================================================
          TAB CONTENT: REFUNDS (Dedicated Refunds Workspace matching Figma design)
          ========================================================================= */}
      {activeTab === "refunds" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <section className="space-y-3">
            <div>
              <h2 className="text-[18px] font-semibold text-black leading-[26px]">
                Refunds
              </h2>
              <p className="text-[12px] text-[#666666] leading-[17px]">
                Review connector-provided amounts and status. Availability depends on the connected channel.
              </p>
            </div>

            <div className="w-full overflow-hidden rounded-lg border border-[#EAEAEA] bg-white">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#EAEAEA] text-[11px] text-[#666666]">
                    <th className="py-2.5 px-4 font-normal">Return</th>
                    <th className="py-2.5 px-3 font-normal">Order</th>
                    <th className="py-2.5 px-3 font-normal">Marketplace</th>
                    <th className="py-2.5 px-3 font-normal">Refund Status</th>
                    <th className="py-2.5 px-3 font-normal">Refund Amount</th>
                    <th className="py-2.5 px-3 font-normal">Return Status</th>
                    <th className="py-2.5 px-3 font-normal">Inspection Status</th>
                    <th className="py-2.5 px-3 font-normal">Last Update</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]">
                  {refundRows.map((row) => {
                    const actionLabel =
                      row.refundStatus === "Ready for Refund"
                        ? "Review refund →"
                        : row.refundStatus === "Refund Failed"
                        ? "Review failure →"
                        : "View →";

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-neutral-50/50 transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-black">
                          <button
                            type="button"
                            onClick={() => handleOpenRefundDrawer(row.id)}
                            className="font-semibold text-black hover:underline cursor-pointer"
                          >
                            {row.id}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-[#666666]">
                          <button
                            type="button"
                            onClick={() => handleOpenRefundDrawer(row.id)}
                            className="text-[#666666] hover:text-black hover:underline cursor-pointer"
                          >
                            {row.orderId}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-[#666666]">{row.marketplace}</td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleOpenRefundDrawer(row.id)}
                            className={cn(
                              "font-medium hover:underline cursor-pointer text-left",
                              row.refundStatus === "Pending" && "text-[#D97706]",
                              row.refundStatus === "Ready for Refund" && "text-[#16A34A]",
                              row.refundStatus === "Processing" && "text-[#2563EB]",
                              row.refundStatus === "Refunded" && "text-[#16A34A]",
                              row.refundStatus === "Refund Failed" && "text-[#DC2626]",
                              row.refundStatus === "Not Applicable" && "text-[#666666]"
                            )}
                          >
                            {row.refundStatus}
                          </button>
                        </td>
                        <td className="py-3 px-3 font-medium text-black">{row.refundAmount}</td>
                        <td className="py-3 px-3">
                          <span
                            className={cn(
                              "font-medium",
                              row.returnStatus === "Received" && "text-[#666666]",
                              row.returnStatus === "Refund Pending" && "text-[#666666]",
                              row.returnStatus === "Resolved" && "text-[#16A34A]",
                              row.returnStatus === "Rejected" && "text-[#DC2626]"
                            )}
                          >
                            {row.returnStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleOpenInspectionDrawer(row.id)}
                            className={cn(
                              "font-medium hover:underline cursor-pointer text-left",
                              row.inspectionStatus === "Passed" && "text-[#16A34A]",
                              row.inspectionStatus === "Failed" && "text-[#DC2626]",
                              row.inspectionStatus === "Not Started" && "text-[#666666]"
                            )}
                          >
                            {row.inspectionStatus}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-[#666666]">{row.lastUpdate}</td>
                        <td className="py-3 pr-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenRefundDrawer(row.id)}
                            className="font-medium text-black hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            {actionLabel}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Subtext and Contextual states note matching Figma */}
            <div className="space-y-1 pt-1 text-[11px] text-[#666666]">
              <p>
                3 refunds pending resolution: 1 ready · 1 processing · 1 failed. Pre-inspection
                returns are not yet in the actionable refund queue.
              </p>
              <p className="text-[10px] text-[#999999] tracking-wider uppercase font-medium">
                Contextual States | Refund detail / Connector failure
              </p>
            </div>
          </section>
        </div>
      )}

      {/* =========================================================================
          TAB CONTENT: OVERVIEW & GENERAL WORKSPACES
          ========================================================================= */}
      {activeTab === "overview" && (
        <>
          {/* SECTION 2: RETURN LIFECYCLE RAIL */}
          <section className="space-y-3">
        <div>
          <h2 className="text-[18px] font-semibold text-black leading-[26px]">
            Every return, one controlled path
          </h2>
          <p className="text-[12px] text-[#666666] leading-[17px]">
            Return Request → Receive → Inspect → Decide → Refund → Inventory Disposition → Close
          </p>
        </div>

        {/* 8-stage Connected Lifecycle Rail */}
        <div className="flex flex-wrap items-center justify-between border-y border-[#EAEAEA] py-4 gap-2">
          {/* Stage 1: Requested */}
          <div className="flex-1 min-w-[100px] space-y-0.5">
            <span className="text-[11px] font-semibold text-black block">Requested</span>
            <div className="text-[25px] font-semibold text-black leading-none py-1">{lifecycleCounts.requested}</div>
            <span className="text-[10px] text-[#666666] block">To review</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-[#666666] shrink-0" />

          {/* Stage 2: Approved */}
          <div className="flex-1 min-w-[100px] space-y-0.5 pl-2">
            <span className="text-[11px] font-semibold text-black block">Approved</span>
            <div className="text-[25px] font-semibold text-black leading-none py-1">{lifecycleCounts.approved}</div>
            <span className="text-[10px] text-[#666666] block">Authorized</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-[#666666] shrink-0" />

          {/* Stage 3: In Transit */}
          <div className="flex-1 min-w-[100px] space-y-0.5 pl-2">
            <span className="text-[11px] font-semibold text-black block">In Transit</span>
            <div className="text-[25px] font-semibold text-black leading-none py-1">{lifecycleCounts.inTransit}</div>
            <span className="text-[10px] text-[#666666] block">Await receipt</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-[#666666] shrink-0" />

          {/* Stage 4: Received */}
          <div className="flex-1 min-w-[100px] space-y-0.5 pl-2">
            <span className="text-[11px] font-semibold text-black block">Received</span>
            <div className="text-[25px] font-semibold text-black leading-none py-1">{lifecycleCounts.received}</div>
            <span className="text-[10px] text-[#666666] block">Verify stock</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-[#666666] shrink-0" />

          {/* Stage 5: Inspecting (Amber highlight) */}
          <div className="flex-1 min-w-[100px] space-y-0.5 pl-2">
            <span className="text-[11px] font-semibold text-black block">Inspecting</span>
            <div className="text-[25px] font-semibold text-[#D97706] leading-none py-1">{lifecycleCounts.inspecting}</div>
            <span className="text-[10px] text-[#D97706] font-medium block">
              {signals.inspectionOverdue} need review
            </span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-[#666666] shrink-0" />

          {/* Stage 6: Resolution (Amber highlight) */}
          <div className="flex-1 min-w-[100px] space-y-0.5 pl-2">
            <span className="text-[11px] font-semibold text-black block">Resolution</span>
            <div className="text-[25px] font-semibold text-[#D97706] leading-none py-1">{lifecycleCounts.resolution}</div>
            <span className="text-[10px] text-[#D97706] font-medium block">Refund pending</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-[#666666] shrink-0" />

          {/* Stage 7: Refunded */}
          <div className="flex-1 min-w-[100px] space-y-0.5 pl-2">
            <span className="text-[11px] font-semibold text-black block">Refunded</span>
            <div className="text-[25px] font-semibold text-black leading-none py-1">{lifecycleCounts.refunded}</div>
            <span className="text-[10px] text-[#666666] block">Disposition</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-[#666666] shrink-0" />

          {/* Stage 8: Closed (Green highlight) */}
          <div className="flex-1 min-w-[100px] space-y-0.5 pl-2">
            <span className="text-[11px] font-semibold text-black block">Closed</span>
            <div className="text-[25px] font-semibold text-[#16A34A] leading-none py-1">{lifecycleCounts.closed}</div>
            <span className="text-[10px] text-[#666666] block">Complete</span>
          </div>
        </div>

        <p className="text-[10px] text-[#666666] pt-0.5">
          Stage counts are independent operational queues; closed totals cover the last 30 days.
        </p>
      </section>

      {/* =========================================================================
          SECTION 3: NEEDS ATTENTION SIGNAL RAIL
          ========================================================================= */}
      <section className="rounded-xl border border-[#EAEAEA] bg-[#FFFBF5] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-black">Needs Attention</span>
          <span className="text-[11px] text-[#D97706]">Filter returns below ↓</span>
        </div>

        {/* 4 Interactive Clickable Signals */}
        <div className="flex flex-wrap items-center gap-6 text-[12px]">
          <button
            onClick={() =>
              setActiveSignalFilter(
                activeSignalFilter === "inspection-overdue" ? null : "inspection-overdue"
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors text-left",
              activeSignalFilter === "inspection-overdue"
                ? "font-semibold text-[#D97706] underline"
                : "text-black hover:text-[#D97706]"
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
            <span>{signals.inspectionOverdue} returns awaiting inspection</span>
          </button>

          <button
            onClick={() =>
              setActiveSignalFilter(
                activeSignalFilter === "refund-pending" ? null : "refund-pending"
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors text-left",
              activeSignalFilter === "refund-pending"
                ? "font-semibold text-[#D97706] underline"
                : "text-black hover:text-[#D97706]"
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
            <span>{signals.refundPending} refunds pending</span>
          </button>

          <button
            onClick={() =>
              setActiveSignalFilter(
                activeSignalFilter === "inventory-discrepancy" ? null : "inventory-discrepancy"
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors text-left",
              activeSignalFilter === "inventory-discrepancy"
                ? "font-semibold text-[#D97706] underline"
                : "text-black hover:text-[#D97706]"
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
            <span>{signals.inventoryDiscrepancy} return has inventory discrepancy</span>
          </button>

          <button
            onClick={() =>
              setActiveSignalFilter(
                activeSignalFilter === "high-value" ? null : "high-value"
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors text-left",
              activeSignalFilter === "high-value"
                ? "font-semibold text-[#D97706] underline"
                : "text-black hover:text-[#D97706]"
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 text-[#D97706] stroke-[2]" />
            <span>{signals.highValue} high-value return needs review</span>
          </button>
        </div>

        <p className="text-[10px] text-[#666666]">
          Signals may overlap on the same return. Select a signal to narrow the ledger.
        </p>
      </section>

      {/* =========================================================================
          SECTION 4: RETURNS LEDGER TABLE & FILTERED STATES
          ========================================================================= */}
      <section className="space-y-3.5">
        <div>
          <h2 className="text-[18px] font-semibold text-black leading-[26px]">
            Returns
          </h2>
          <p className="text-[12px] text-[#666666] leading-[17px]">
            Know what came back, why it came back, and what happens next.
          </p>
        </div>

        {/* Secondary tab filters: All, Needs Attention, Awaiting Receipt, Awaiting Inspection, Refund Pending, Completed */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            "All",
            "Needs Attention",
            "Awaiting Receipt",
            "Awaiting Inspection",
            "Refund Pending",
            "Completed",
          ].map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedLedgerFilter(filter)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12px] transition-colors",
                selectedLedgerFilter === filter
                  ? "bg-[#F5F5F5] font-semibold text-black"
                  : "bg-white text-black hover:bg-neutral-50"
              )}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Search & Dropdown Filters Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#666666] stroke-[1.5]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search return, order, product or SKU"
              className="h-[34px] w-full rounded-lg border border-[#EAEAEA] bg-white pl-9 pr-3 text-[12px] text-black placeholder:text-[#666666] focus:border-black focus:outline-none"
            />
          </div>

          <button className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors">
            <span>Marketplace</span>
            <ChevronDown className="h-3.5 w-3.5 text-black stroke-[2]" />
          </button>

          <button className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors">
            <SlidersHorizontal className="h-3.5 w-3.5 text-black stroke-[2]" />
            <span>Filters</span>
          </button>
        </div>

        {/* Selected-row toolbar (Blue tinted bar matching design) */}
        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-[#F5F8FE] px-3.5 py-2 text-[11px] text-black">
            <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isAllVisibleSelected}
                onChange={toggleSelectVisible}
                className="h-3.5 w-3.5 rounded border-[#BDBDBD] accent-black"
              />
              <span>{selectedRows.length} selected</span>
            </label>

            <button
              onClick={toggleSelectVisible}
              className="hover:underline"
            >
              Select visible ({paginatedRows.length})
            </button>
            <button onClick={selectAllFiltered} className="hover:underline">
              Select all ({filteredRows.length})
            </button>
            <button
              onClick={() => setSelectedRows([])}
              className="text-[#666666] hover:text-black hover:underline"
            >
              Clear selection
            </button>
            <button
              onClick={() => alert(`Assigning inspection for ${selectedRows.length} returns...`)}
              className="hover:underline"
            >
              Assign inspection
            </button>
            <button
              onClick={() => alert(`Exporting ${selectedRows.length} returns...`)}
              className="hover:underline"
            >
              Export
            </button>
            <button
              onClick={() => alert("Marking inspection status...")}
              className="hover:underline"
            >
              Mark inspection status
            </button>
            <button
              onClick={() => alert(`Reviewing ${selectedRows.length} selected returns...`)}
              className="hover:underline"
            >
              Review selected
            </button>
          </div>
        )}

        {/* Ledger Table */}
        <div className="w-full overflow-x-auto rounded-lg border border-[#EAEAEA] bg-white">
          <table className="w-full text-left text-[11px] whitespace-nowrap">
            <thead>
              <tr className="bg-[#F5F5F5] border-b border-[#EAEAEA] text-[10px] text-[#666666]">
                <th className="py-2.5 pl-3 w-8">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={toggleSelectVisible}
                    className="h-3 w-3 rounded border-[#BDBDBD] accent-black cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-2 font-normal">Return ID</th>
                <th className="py-2.5 px-2 font-normal">Order</th>
                <th className="py-2.5 px-2 font-normal">Product / SKU</th>
                <th className="py-2.5 px-2 font-normal">Marketplace</th>
                <th className="py-2.5 px-2 font-normal">Return Reason</th>
                <th className="py-2.5 px-2 font-normal text-center">Quantity</th>
                <th className="py-2.5 px-2 font-normal">Return Status</th>
                <th className="py-2.5 px-2 font-normal">Received</th>
                <th className="py-2.5 px-2 font-normal">Inspection</th>
                <th className="py-2.5 px-2 font-normal">Refund</th>
                <th className="py-2.5 px-2 font-normal">Inventory Disposition</th>
                <th className="py-2.5 pr-3 text-right font-normal">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]/80">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-[12px] text-[#666666]">
                    No returns found matching the current filters.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((ret) => {
                  const isSelected = selectedRows.includes(ret.id);
                  return (
                    <tr
                      key={ret.id}
                      className={cn(
                        "transition-colors",
                        isSelected ? "bg-[#F5F8FE]" : "hover:bg-neutral-50/50"
                      )}
                    >
                      <td className="py-2.5 pl-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(ret.id)}
                          className="h-3 w-3 rounded border-[#BDBDBD] accent-black"
                        />
                      </td>
                      <td className="py-2.5 px-2 font-semibold text-[#666666]">
                        <button
                          type="button"
                          onClick={() => handleOpenDrawer(ret)}
                          className="font-semibold text-black hover:underline text-left cursor-pointer"
                        >
                          {ret.id}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-[#666666]">
                        <button
                          type="button"
                          onClick={() => handleOpenDrawer(ret)}
                          className="text-[#666666] hover:text-black hover:underline text-left cursor-pointer"
                        >
                          {ret.orderId}
                        </button>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="text-black font-medium">{ret.productName}</div>
                        <div className="text-[10px] text-[#666666]">{ret.sku}</div>
                      </td>
                      <td className="py-2.5 px-2 text-[#666666]">{ret.marketplace}</td>
                      <td className="py-2.5 px-2 text-[#666666]">{ret.returnReason}</td>
                      <td className="py-2.5 px-2 text-center text-[#666666]">{ret.quantity}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className={cn(
                            "font-medium",
                            ret.returnStatus === "Received" && "text-[#666666]",
                            ret.returnStatus === "Inspecting" && "text-[#D97706]",
                            ret.returnStatus === "Refund Pending" && "text-[#D97706]",
                            ret.returnStatus === "In Transit" && "text-[#2563EB]",
                            ret.returnStatus === "Resolved" && "text-[#16A34A]",
                            ret.returnStatus === "Rejected" && "text-[#DC2626]"
                          )}
                        >
                          {ret.returnStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-[#666666]">{ret.receivedDate}</td>
                      <td className="py-2.5 px-2">
                        <button
                          type="button"
                          onClick={() => handleOpenInspectionDrawer(ret.id)}
                          className={cn(
                            "cursor-pointer hover:underline text-left",
                            ret.inspection === "Pending" && "text-[#D97706] font-medium",
                            ret.inspection === "Review" && "text-[#D97706] font-medium",
                            ret.inspection === "Failed" && "text-[#DC2626] font-medium",
                            ret.inspection === "Passed" && "text-[#16A34A] font-medium",
                            ret.inspection === "Not started" && "text-[#666666]"
                          )}
                        >
                          {ret.inspection}
                        </button>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={cn(
                            ret.refund === "Pending" && "text-[#D97706] font-medium",
                            ret.refund === "Ready" && "text-[#16A34A] font-medium",
                            ret.refund === "Refunded" && "text-[#16A34A] font-medium",
                            ret.refund === "N/A" && "text-[#666666]"
                          )}
                        >
                          {ret.refund}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={cn(
                            ret.inventoryDisposition === "Pending" && "text-[#666666]",
                            ret.inventoryDisposition === "Sellable" && "text-[#16A34A] font-medium",
                            ret.inventoryDisposition === "Damaged" && "text-[#DC2626] font-medium",
                            ret.inventoryDisposition === "Rejected" && "text-[#DC2626] font-medium"
                          )}
                        >
                          {ret.inventoryDisposition}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (ret.actionText.toLowerCase().includes("inspect")) {
                              handleOpenInspectionDrawer(ret.id);
                            } else {
                              handleOpenDrawer(ret);
                            }
                          }}
                          className="font-medium text-black hover:underline cursor-pointer"
                        >
                          {ret.actionText}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Ledger Footer & Pagination */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] pt-1">
          <span className="text-[11px] text-[#666666]">
            Showing{" "}
            <span className="font-semibold text-black">
              {filteredRows.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}–
              {Math.min(safeCurrentPage * pageSize, filteredRows.length)}
            </span>{" "}
            of <span className="font-semibold text-black">{filteredRows.length}</span> returns
            {filteredRows.length !== allRows.length && (
              <span className="text-[#888888]"> (filtered from {allRows.length})</span>
            )}
            {" · "}
            <span className="font-medium text-black">{lifecycleCounts.requested} open</span>
            {" · "}
            No bulk refunds or dispositions
          </span>

          <div className="flex flex-wrap items-center gap-3">
            {/* Rows per page selector */}
            <div className="flex items-center gap-1.5 text-[11px] text-[#666666]">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-[28px] rounded-md border border-[#EAEAEA] bg-white px-2 text-[11px] font-medium text-black outline-none hover:border-[#CCCCCC] focus:border-black cursor-pointer transition-colors"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>

            {/* Page navigation buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border border-[#EAEAEA] transition-colors",
                  safeCurrentPage <= 1
                    ? "cursor-not-allowed text-[#BDBDBD] bg-[#FAFAFA]"
                    : "text-[#666666] hover:text-black hover:bg-neutral-100 cursor-pointer"
                )}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={cn(
                    "flex h-7 min-w-[28px] px-2 items-center justify-center rounded-md text-[11px] transition-colors cursor-pointer",
                    safeCurrentPage === pageNum
                      ? "bg-[#111111] font-semibold text-white shadow-xs"
                      : "border border-[#EAEAEA] text-[#666666] hover:text-black hover:bg-neutral-50"
                  )}
                >
                  {pageNum}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border border-[#EAEAEA] transition-colors",
                  safeCurrentPage >= totalPages
                    ? "cursor-not-allowed text-[#BDBDBD] bg-[#FAFAFA]"
                    : "text-[#666666] hover:text-black hover:bg-neutral-100 cursor-pointer"
                )}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Signal-filtered ledger mini state card */}
        {activeSignalFilter && (
          <div className="rounded-xl border border-[#EAEAEA] bg-white p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-[#D97706]">
                <span>FILTER APPLIED</span>
                <span>·</span>
                <span className="capitalize">{activeSignalFilter.replace("-", " ")}</span>
                <span>·</span>
                <span>{filteredRows.length} {filteredRows.length === 1 ? "result" : "results"}</span>
              </div>
              <button
                onClick={() => setActiveSignalFilter(null)}
                className="text-black hover:underline font-medium text-[11px]"
              >
                Clear filter ×
              </button>
            </div>

            <div className="rounded-lg border border-[#EAEAEA] overflow-hidden">
              <div className="grid grid-cols-12 bg-[#F5F5F5] px-3 py-2 text-[10px] text-[#666666]">
                <div className="col-span-2">Return</div>
                <div className="col-span-4">Product / SKU</div>
                <div className="col-span-3">Issue</div>
                <div className="col-span-3 text-right">Next action</div>
              </div>
              {filteredRows.slice(0, 3).map((ret) => (
                <div
                  key={ret.id}
                  className="grid grid-cols-12 items-center bg-[#F5F8FE] px-3 py-2.5 text-[12px] border-t border-[#EAEAEA]"
                >
                  <div className="col-span-2 font-semibold text-[#666666]">{ret.id}</div>
                  <div className="col-span-4 text-black">
                    {ret.productName} <span className="text-[#666666] text-[11px]">{ret.sku}</span>
                  </div>
                  <div className="col-span-3 text-[#D97706] font-medium text-[11px]">
                    {ret.issueNote || ret.returnReason}
                  </div>
                  <div className="col-span-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (ret.actionText.toLowerCase().includes("inspect")) {
                          handleOpenInspectionDrawer(ret.id);
                        } else {
                          handleOpenDrawer(ret);
                        }
                      }}
                      className="font-medium text-black hover:underline text-[12px] cursor-pointer"
                    >
                      {ret.actionText}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 5: RETURN ANALYTICS & INTELLIGENCE
          ========================================================================= */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Column: Why products are coming back (Pie Chart) */}
        <div className="md:col-span-6 space-y-4 rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[16px] font-semibold text-black leading-tight">
                Why products are coming back
              </h3>
              <p className="text-[11px] text-[#666666] mt-0.5">
                Last {returnsData.length || 100} returns · Last 30 days · One primary reason per return
              </p>
            </div>
            <span className="text-[11px] font-medium text-[#666666] bg-[#F5F5F5] px-2.5 py-1 rounded-full">
              {returnsData.length || 100} Total
            </span>
          </div>

          {/* Interactive Pie Chart + Legend */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-1">
            {/* Pie Container */}
            <div className="sm:col-span-5 h-[200px] w-full flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 shadow-md text-[11px]">
                            <p className="font-semibold text-black">{data.name}</p>
                            <p className="text-[#666666]">
                              {data.value}% of returns {data.count !== undefined && `(${data.count} orders)`}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Donut Center Label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[17px] font-bold text-black leading-none">100%</span>
                <span className="text-[9px] text-[#666666] uppercase tracking-wider mt-0.5">Returns</span>
              </div>
            </div>

            {/* Legend Column */}
            <div className="sm:col-span-7 space-y-1.5 text-[11px] pl-2">
              {pieChartData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-black font-medium">{item.name}</span>
                  </div>
                  <span className="font-semibold text-black">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div className="flex items-center justify-between border-t border-[#EAEAEA] pt-3 text-[11px]">
            <span className="text-[#666666]">Return activity is concentrated around 3 products.</span>
            <button
              onClick={() => alert("Viewing top return products...")}
              className="font-semibold text-black hover:underline"
            >
              View Products →
            </button>
          </div>
        </div>

        {/* Right Column: Return Intelligence (AI Gradient Card matching Figma) */}
        <div className="md:col-span-6 rounded-[32px] p-6 space-y-4 text-black border border-[#EAEAEA]/80 shadow-sm relative overflow-hidden bg-gradient-to-br from-[#E4A0FF]/40 via-[#93C5FD]/30 to-[#2563EB]/40">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#2563EB] stroke-[2]" />
              <h4 className="text-[14px] font-semibold text-black">Return Intelligence</h4>
            </div>
            <span className="text-[10px] font-medium tracking-wider uppercase text-[#2563EB]">
              RECOMMENDATIONS ONLY
            </span>
          </div>

          {/* Insight 1: Sizing */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-black">
              {pieChartData[0]?.value || 17}% of recent returns mention {pieChartData[0]?.name ? pieChartData[0]?.name.toLowerCase() : "a sizing issue"}.
            </div>
            <p className="text-[11px] text-[#444444] leading-relaxed">
              Evidence: {pieChartData[0]?.value || 17} of recent returns. Cotton shirt CS-WHT-M accounts for majority of those mentions.
            </p>
            <button
              onClick={() => alert("Reviewing size chart...")}
              className="text-[12px] font-semibold text-[#2563EB] hover:underline block pt-0.5"
            >
              Review size chart →
            </button>
          </div>

          {/* Insight 2: Baseline spike */}
          <div className="space-y-1 pt-1">
            <div className="text-[13px] font-semibold text-black">
              Return activity for this SKU is higher than its recent baseline.
            </div>
            <p className="text-[11px] text-[#444444] leading-relaxed">
              CS-WHT-M · 9 returns in 7 days vs. 4 in the preceding 7 days.
            </p>
            <button
              onClick={() => alert("Inspecting product CS-WHT-M...")}
              className="text-[12px] font-semibold text-[#2563EB] hover:underline block pt-0.5"
            >
              Inspect Product →
            </button>
          </div>

          {/* AI disclaimer footnote */}
          <p className="text-[10px] text-[#555555] pt-2 border-t border-black/10">
            AI recommends only. It never changes listings, inventory, or refund decisions.
          </p>
        </div>
      </section>

      {/* =========================================================================
          SECTION 6: CONTEXTUAL STATE — RETURNS NEED ATTENTION
          ========================================================================= */}
      <section className="space-y-3.5 pt-4 border-t border-[#EAEAEA]">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-semibold uppercase tracking-wider text-[#666666]">FILTERED VIEW</span>
          <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
          <span className="font-semibold text-black text-[11px]">Needs Attention</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-black leading-[26px]">
              {exceptionRows.length || 4} returns need attention
            </h2>
            <p className="text-[12px] text-[#666666] leading-[17px]">
              One row per affected return. Signals can overlap; these are not additional returns.
            </p>
          </div>

          <button
            onClick={() => alert("Exporting return exceptions...")}
            className="inline-flex h-[34px] items-center rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors shadow-2xs"
          >
            Export exceptions
          </button>
        </div>

        {/* Operational Exceptions Ledger */}
        <div className="w-full overflow-hidden rounded-lg border border-[#EAEAEA] bg-white text-[12px]">
          {/* Header */}
          <div className="grid grid-cols-12 bg-[#F5F5F5] px-4 py-2.5 text-[10px] text-[#666666]">
            <div className="col-span-2">Return</div>
            <div className="col-span-3">Issue</div>
            <div className="col-span-4">Impact</div>
            <div className="col-span-3 text-right">Recommended action</div>
          </div>

          {exceptionRows.map((ret) => {
            const issueTitle = ret.issueNote?.split(":")[0] || "Inspection review";
            const issueDetails = ret.issueNote?.includes(":")
              ? ret.issueNote.split(":").slice(1).join(":").trim()
              : `Received ${ret.receivedDate} · Inspection ${ret.inspection.toLowerCase()}`;

            return (
              <div
                key={ret.id}
                className="grid grid-cols-12 items-center px-4 py-3 border-t border-[#EAEAEA]/80 hover:bg-neutral-50/50"
              >
                <div className="col-span-2 font-semibold text-[#666666]">{ret.id}</div>
                <div className="col-span-3 text-[#D97706] font-medium">{issueTitle}</div>
                <div className="col-span-4 text-[#666666]">{issueDetails}</div>
                <div className="col-span-3 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (ret.actionText.toLowerCase().includes("inspect")) {
                        handleOpenInspectionDrawer(ret.id);
                      } else {
                        handleOpenDrawer(ret);
                      }
                    }}
                    className="font-medium text-black hover:underline cursor-pointer"
                  >
                    {ret.actionText}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] text-[#666666] pt-1">
          <span>One row per affected return · Actions require capability verification</span>
          <span>{exceptionRows.length || 4} returns need attention</span>
        </div>
      </section>
    </>
  )}

  {/* Return Detail Drawer (matching Figma 536px slide-in spec) */}
  <ReturnDetailDrawer
    isOpen={isDrawerOpen}
    onClose={() => setIsDrawerOpen(false)}
    returnData={drawerReturn}
    onStartInspection={(returnId) => {
      setIsDrawerOpen(false);
      handleOpenInspectionDrawer(returnId);
    }}
  />

  {/* Inspection Drawer (matching user spec) */}
  <InspectionDrawer
    isOpen={isInspectionDrawerOpen}
    onClose={() => setIsInspectionDrawerOpen(false)}
    data={inspectionDrawerData}
    onSave={(updated) => {
      submitInspectionMutation.mutate({
        id: updated.id,
        input: {
          status: updated.status,
          conditions: updated.conditions,
        },
      });
      setIsInspectionDrawerOpen(false);
    }}
  />

  {/* Refund Detail Drawer (matching Figma 536px slide-in spec) */}
  <RefundDetailDrawer
    isOpen={isRefundDrawerOpen}
    onClose={() => setIsRefundDrawerOpen(false)}
    data={refundDrawerData}
    onViewInspection={(returnId) => {
      setIsRefundDrawerOpen(false);
      handleOpenInspectionDrawer(returnId);
    }}
    onIssueRefund={(returnId) => {
      processRefundMutation.mutate({ id: returnId });
      setIsRefundDrawerOpen(false);
    }}
    onRetryRefund={(returnId) => {
      retryRefundMutation.mutate(returnId);
      setIsRefundDrawerOpen(false);
    }}
  />

  {/* Create Return Modal / Drawer (matching Figma 580px spec) */}
  <CreateReturnModal
    isOpen={isCreateReturnOpen}
    onClose={() => setIsCreateReturnOpen(false)}
    onCreate={(newReturn) => {
      createReturnMutation.mutate(newReturn);
      setIsCreateReturnOpen(false);
    }}
  />
</div>
);
}
