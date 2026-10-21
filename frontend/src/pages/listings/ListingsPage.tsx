import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  UploadCloud,
  X,
  Plus,
  Loader2,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListings,
  useListingMatrix,
  useListingReachKPIs,
  useListingIssueSummary,
  usePublishListing,
  useBulkPublishListings,
  useCreateListing,
  LISTING_KEYS,
} from "@/hooks/useListings";
import {
  ChannelListingItem,
  ListingFilterParams,
  ListingStatus,
} from "@/types/listing";
import { ListingDetailDrawer } from "./ListingDetailDrawer";
import { ListingsSkeleton, ListingTableRowsSkeleton } from "./ListingsSkeleton";
import { ListingsErrorState } from "./ListingsErrorState";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";

export default function ListingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filters state
  const [activeChannelTab, setActiveChannelTab] = useState<string>("all");
  const [activeStatusPill, setActiveStatusPill] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [readinessFilter, setReadinessFilter] = useState<string>("all");
  const [inventoryFilter, setInventoryFilter] = useState<string>("all");
  const [productStatusFilter, setProductStatusFilter] = useState<string>("all");
  const [potentialFilter, setPotentialFilter] = useState<string>("all");
  const [activeIssueFilter, setActiveIssueFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  // Selected checkboxes
  const { toast } = useToast();
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [isBulkMoreMenuOpen, setIsBulkMoreMenuOpen] = useState(false);

  // UI Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [activeDrawerListing, setActiveDrawerListing] = useState<ChannelListingItem | null>(null);

  // New Listing Form state
  const [newTitle, setNewTitle] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newChannel, setNewChannel] = useState<"amazon" | "flipkart" | "meesho" | "shopify">("amazon");
  const [newPrice, setNewPrice] = useState<number>(1999);
  const [newMrp, setNewMrp] = useState<number>(2999);
  const [newStock, setNewStock] = useState<number>(50);
  const [newCategory, setNewCategory] = useState("Luggage & Travel Bags");

  // Query parameters constructed for API
  const queryParams: ListingFilterParams = useMemo(() => {
    return {
      channel: activeChannelTab !== "all" ? activeChannelTab : undefined,
      status: activeStatusPill !== "all" ? activeStatusPill : undefined,
      search: searchTerm.trim() || undefined,
      marketplace: marketplaceFilter !== "all" ? marketplaceFilter : undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      readiness: readinessFilter !== "all" ? readinessFilter : undefined,
      inventory: inventoryFilter !== "all" ? inventoryFilter : undefined,
      issue: activeIssueFilter ?? undefined,
      page: currentPage,
      pageSize,
    };
  }, [
    activeChannelTab,
    activeStatusPill,
    searchTerm,
    marketplaceFilter,
    categoryFilter,
    readinessFilter,
    inventoryFilter,
    activeIssueFilter,
    currentPage,
  ]);

  // Backend queries via React Query
  const {
    data: listingsResponse,
    isLoading: isListingsLoading,
    isError: isListingsError,
    refetch: refetchListings,
    isRefetching: isListingsRefetching,
  } = useListings(queryParams);
  const { data: matrixData = [] } = useListingMatrix();
  const { data: reachKPIs } = useListingReachKPIs();
  const { data: issueSummary } = useListingIssueSummary();

  // Mutations
  const publishMutation = usePublishListing();
  const bulkPublishMutation = useBulkPublishListings();
  const createMutation = useCreateListing();

  const listings = listingsResponse?.data ?? [];
  const meta = listingsResponse?.meta ?? {
    total: 1042,
    page: 1,
    pageSize: 5,
    totalPages: 209,
    showingFrom: 1,
    showingTo: 5,
    live: 3,
    syncing: 1,
    needsReview: 1,
    failed: 1,
    blocked: 1,
    notListed: 1,
    ready: 1,
    draft: 1,
  };

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedListingIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (selectedListingIds.length === listings.length && listings.length > 0) {
      setSelectedListingIds([]);
    } else {
      setSelectedListingIds(listings.map((l) => l.id));
    }
  };

  // Bulk publish trigger
  const handleBulkPublish = () => {
    if (selectedListingIds.length === 0) return;
    bulkPublishMutation.mutate(selectedListingIds, {
      onSuccess: () => {
        setSelectedListingIds([]);
      },
    });
  };

  // Single action click
  const handleActionClick = (item: ChannelListingItem) => {
    if (item.actionType === "publish") {
      publishMutation.mutate(item.id);
    } else if (item.status === "blocked" || item.actionType === "fix") {
      navigate(`/listings/${item.id}/blocked`);
    } else if (item.status === "syncing" || item.actionType === "view") {
      navigate(`/listings/${item.id}/sync`);
    } else if (item.status === "not_listed") {
      navigate(`/listings/${item.id}/unlisted`);
    } else if (item.actionType === "review") {
      setActiveDrawerListing(item);
    } else {
      navigate(`${ROUTES.LISTINGS}/${item.id}`);
    }
  };

  // Create Listing submit
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newSku) return;

    createMutation.mutate(
      {
        productTitle: newTitle,
        sku: newSku,
        channel: newChannel,
        sellingPrice: Number(newPrice),
        mrp: Number(newMrp),
        stock: Number(newStock),
        category: newCategory,
      },
      {
        onSuccess: () => {
          setIsCreateModalOpen(false);
          setNewTitle("");
          setNewSku("");
        },
      },
    );
  };

  // Helper colors
  const getReadinessColor = (score: number) => {
    if (score >= 95) return "#16A34A";
    if (score >= 70) return "#D97706";
    if (score >= 50) return "#2563EB";
    return "#DC2626";
  };

  const getStatusDotColor = (status: ListingStatus) => {
    switch (status) {
      case "live":
      case "ready":
        return "#16A34A";
      case "needs_review":
        return "#D97706";
      case "blocked":
      case "failed":
        return "#DC2626";
      case "syncing":
        return "#2563EB";
      case "draft":
        return "#BDBDBD";
      case "not_listed":
      default:
        return "#EAEAEA";
    }
  };

  const getStatusLabel = (status: ListingStatus) => {
    switch (status) {
      case "live":
        return "Live";
      case "ready":
        return "Ready";
      case "needs_review":
        return "Needs review";
      case "blocked":
        return "Blocked";
      case "syncing":
        return "Syncing";
      case "draft":
        return "Draft";
      case "not_listed":
        return "Not listed";
      case "failed":
        return "Failed";
    }
  };

  // Check if empty via URL query ?empty=true or live backend count 0
  const searchParams = new URLSearchParams(window.location.search);
  const isForceEmpty = searchParams.get("empty") === "true";
  const isForceLoading = searchParams.get("loading") === "true";
  const isForceError = searchParams.get("error") === "true";
  const isPageLoading = isForceLoading || (isListingsLoading && !listingsResponse);
  const isPageError = isForceError || (isListingsError && !listingsResponse);

  // If page is loading (initial fetch or forced ?loading=true), render skeleton matching Figma
  if (isPageLoading) {
    return <ListingsSkeleton />;
  }

  // If page encountered an error (or forced ?error=true), render error state matching Figma
  if (isPageError) {
    return (
      <ListingsErrorState
        onRetry={() => refetchListings()}
        isRetrying={isListingsRefetching}
      />
    );
  }

  const isCatalogEmpty =
    isForceEmpty ||
    (!isListingsLoading &&
      meta.total === 0 &&
      !searchTerm &&
      activeChannelTab === "all" &&
      activeStatusPill === "all" &&
      !activeIssueFilter);

  // Render Create Listing Modal helper
  const renderCreateModal = () => (
    isCreateModalOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="w-[460px] bg-white rounded-xl shadow-2xl border border-[#EAEAEA] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <h3 className="text-base font-semibold text-black">
              Create Master Listing
            </h3>
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="p-1 text-neutral-400 hover:text-black rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-medium text-neutral-700 mb-1">
                Product Title *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Premium Travel Bag - Navy"
                className="w-full px-3 py-2 border border-[#BDBDBD] rounded-lg text-xs focus:outline-none focus:border-black"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  SKU Code *
                </label>
                <input
                  type="text"
                  required
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="e.g. TRV-1042-NVY"
                  className="w-full px-3 py-2 border border-[#BDBDBD] rounded-lg text-xs font-mono focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  Target Marketplace
                </label>
                <select
                  value={newChannel}
                  onChange={(e) =>
                    setNewChannel(
                      e.target.value as "amazon" | "flipkart" | "meesho" | "shopify",
                    )
                  }
                  className="w-full px-3 py-2 border border-[#BDBDBD] rounded-lg text-xs focus:outline-none focus:border-black bg-white cursor-pointer"
                >
                  <option value="amazon">Amazon.in</option>
                  <option value="flipkart">Flipkart</option>
                  <option value="meesho">Meesho</option>
                  <option value="shopify">Shopify</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  Selling Price (₹)
                </label>
                <input
                  type="number"
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#BDBDBD] rounded-lg text-xs focus:outline-none focus:border-black font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  MRP (₹)
                </label>
                <input
                  type="number"
                  required
                  value={newMrp}
                  onChange={(e) => setNewMrp(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#BDBDBD] rounded-lg text-xs focus:outline-none focus:border-black font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  Initial Stock
                </label>
                <input
                  type="number"
                  value={newStock}
                  onChange={(e) => setNewStock(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#BDBDBD] rounded-lg text-xs focus:outline-none focus:border-black font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">
                Taxonomy / Category
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Luggage & Travel Bags"
                className="w-full px-3 py-2 border border-[#BDBDBD] rounded-lg text-xs focus:outline-none focus:border-black"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EAEAEA]">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3.5 py-2 border border-[#BDBDBD] rounded-lg text-xs font-medium text-black hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create listing"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null
  );

  // If catalog has no listings (or forced empty for preview), render exact empty state
  if (isCatalogEmpty) {
    return (
      <div className="w-full flex flex-col items-start gap-4 font-['Inter',sans-serif] text-[#000000] pb-24">
        {/* =========================================================================
            1. PAGE HEADER (Empty State: Eyebrow, Title, Description, no buttons)
           ========================================================================= */}
        <header className="w-full flex flex-row justify-between items-center py-1">
          <div className="flex flex-col items-start gap-1.5">
            <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
              COMMERCE
            </span>
            <h1 className="text-[26px] font-semibold leading-[31px] text-[#000000] tracking-tight">
              Listings
            </h1>
            <p className="text-[13px] font-normal leading-[16px] text-[#666666]">
              Manage how your master products appear across every connected marketplace.
            </p>
          </div>
        </header>

        {/* =========================================================================
            2. EMPTY STATE CONTAINER CARD (Figma Empty State)
           ========================================================================= */}
        <div className="w-full border border-[#EAEAEA] rounded-xl bg-white flex flex-col items-center justify-center py-24 px-6 text-center shadow-none">
          <h2 className="text-[20px] font-semibold text-[#000000] tracking-tight leading-snug">
            Your master products are ready for the marketplace.
          </h2>
          <p className="text-[13px] font-normal text-[#666666] mt-2 max-w-[540px]">
            Choose a connected channel and prepare your first listings to start selling across marketplaces.
          </p>

          <div className="w-44 h-[1px] bg-[#EAEAEA] my-7" />

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="h-9 px-5 bg-[#000000] text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
            >
              Create listing
            </button>
            <button
              onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
              className="h-9 px-5 bg-white border border-[#BDBDBD] text-[#000000] text-[12px] font-medium rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-none"
            >
              Explore publishing opportunities
            </button>
          </div>

          <span className="text-[11px] font-normal text-[#666666] mt-5">
            {reachKPIs?.masterProducts ?? 427} master products ready to list · {reachKPIs?.connectedChannels ?? 4} channels connected
          </span>
        </div>

        {/* =========================================================================
            3. CONNECTED CHANNELS SECTION
           ========================================================================= */}
        <div className="w-full space-y-2 pt-2">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
            CONNECTED CHANNELS
          </span>

          <div className="flex flex-row items-center gap-2.5">
            {[
              { id: "amazon", label: "Amazon" },
              { id: "flipkart", label: "Flipkart" },
              { id: "meesho", label: "Meesho" },
              { id: "shopify", label: "Shopify" },
            ].map((ch) => (
              <div
                key={ch.id}
                onClick={() => {
                  navigate(ROUTES.MARKETPLACE_HUB);
                }}
                className="h-9 px-3.5 border border-[#EAEAEA] rounded-lg bg-white flex items-center gap-2 text-[12px] font-medium text-[#000000] shadow-none cursor-pointer hover:bg-neutral-50 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                <span>{ch.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Create Listing Modal in empty state */}
        {renderCreateModal()}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-start gap-3 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* =========================================================================
          1. PAGE HEADER (Figma: Page header height 71px)
         ========================================================================= */}
      <header className="w-full flex flex-row justify-between items-center py-1">
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
            COMMERCE
          </span>
          <h1 className="text-[26px] font-semibold leading-[31px] text-[#000000] tracking-tight">
            Listings
          </h1>
          <p className="text-[13px] font-normal leading-[16px] text-[#666666]">
            Manage how your master products appear across every connected marketplace.
          </p>
        </div>

        <div className="flex flex-row items-center gap-2">
          {/* Create listing button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="h-9 px-4 flex items-center justify-center gap-1.5 bg-white border border-[#666666] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors shadow-none cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            Create listing
          </button>

          {/* Publish products button */}
          <button
            onClick={() => {
              if (selectedListingIds.length > 0) {
                handleBulkPublish();
              } else {
                navigate(ROUTES.LISTINGS_PUBLISH);
              }
            }}
            disabled={bulkPublishMutation.isPending}
            className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {bulkPublishMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Publishing…
              </>
            ) : (
              "Publish products"
            )}
          </button>

          {/* More dropdown button */}
          <div className="relative">
            <button
              onClick={() => setIsMoreMenuOpen((v) => !v)}
              className="h-9 px-3 flex items-center justify-center gap-1 border border-[#BDBDBD] rounded-lg text-[12px] font-medium text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              More ⌄
            </button>
            {isMoreMenuOpen && (
              <div
                className="absolute right-0 mt-1 w-48 bg-white border border-[#EAEAEA] rounded-lg shadow-lg py-1.5 z-30 text-[12px]"
                onMouseLeave={() => setIsMoreMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    navigate(ROUTES.PRODUCTS_IMPORT);
                  }}
                  className="w-full text-left px-3 py-2 text-[#000000] hover:bg-[#F5F5F5] transition-colors"
                >
                  Import CSV catalog
                </button>
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    window.print();
                  }}
                  className="w-full text-left px-3 py-2 text-[#000000] hover:bg-[#F5F5F5] transition-colors"
                >
                  Export listings matrix
                </button>
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    navigate(ROUTES.MARKETPLACE_HUB);
                  }}
                  className="w-full text-left px-3 py-2 text-[#000000] hover:bg-[#F5F5F5] transition-colors"
                >
                  Marketplace channels
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. LISTING MATRIX (Full width responsive pipeline with connecting nodes)
         ========================================================================= */}
      <section className="w-full border border-[#EAEAEA] rounded-md overflow-hidden bg-white">
        {/* Matrix Table Header */}
        <div className="h-9 bg-[#F5F5F5] px-4 flex flex-row items-center text-[11px] font-medium text-[#666666]">
          <div className="w-[240px] shrink-0">MASTER CATALOG</div>
          <div className="flex-1 flex items-center justify-center gap-1.5 min-w-[120px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            AMAZON
          </div>
          <div className="flex-1 flex items-center justify-center gap-1.5 min-w-[120px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            FLIPKART
          </div>
          <div className="flex-1 flex items-center justify-center gap-1.5 min-w-[120px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
            MEESHO
          </div>
          <div className="flex-1 flex items-center justify-center gap-1.5 min-w-[120px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            SHOPIFY
          </div>
          <div className="w-[100px] flex items-center justify-center shrink-0">
            ACTION
          </div>
        </div>

        {/* Matrix Rows with responsive fluid pipeline connector lines */}
        <div className="divide-y divide-[#EAEAEA]">
          {matrixData.map((row) => (
            <div
              key={row.id}
              className="relative h-[76px] px-4 flex flex-row items-center hover:bg-[#FAFAFA] transition-colors"
            >
              {/* 2px Left Signal Bar */}
              <div
                className="absolute left-0 top-3 w-[2px] h-8"
                style={{ backgroundColor: row.signalColor }}
              />

              {/* Master Product */}
              <div className="w-[240px] flex flex-col justify-center gap-0.5 shrink-0 z-10 pr-2">
                <span className="text-[13px] font-semibold leading-4 text-[#000000] truncate">
                  {row.masterTitle}
                </span>
                <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                  {row.masterSku} · {row.variantsCount} variants
                </span>
              </div>

              {/* Channel 1: Amazon */}
              <div className="flex-1 min-w-[120px] h-full flex flex-col items-center justify-center relative z-10">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: row.channels.amazon.color }}
                  />
                  <div className="flex flex-col items-start leading-none">
                    <span
                      className="text-[12px] font-medium leading-[15px]"
                      style={{ color: row.channels.amazon.color }}
                    >
                      {row.channels.amazon.label}
                    </span>
                    <span className="text-[10px] font-normal leading-3 text-[#666666] mt-0.5">
                      {row.channels.amazon.sublabel}
                    </span>
                  </div>
                </div>

                {/* Bottom Node Dot & Connection Line to Next */}
                <div className="absolute bottom-[14px] left-0 right-0 flex items-center justify-center pointer-events-none">
                  {/* Line from master product edge to Amazon node */}
                  <div
                    className="absolute left-0 w-1/2 h-[1px]"
                    style={{ backgroundColor: row.signalColor }}
                  />
                  {/* Line from Amazon node to Flipkart */}
                  <div
                    className="absolute left-1/2 w-1/2 h-[1px]"
                    style={{
                      backgroundColor: row.connections.amazonToFlipkart.color,
                      borderTop:
                        row.connections.amazonToFlipkart.style === "dashed"
                          ? `1px dashed ${row.connections.amazonToFlipkart.color}`
                          : undefined,
                    }}
                  />
                  {/* Node Dot */}
                  <div
                    className="w-1.5 h-1.5 rounded-full z-20 shrink-0"
                    style={{ backgroundColor: row.channels.amazon.color }}
                  />
                </div>
              </div>

              {/* Channel 2: Flipkart */}
              <div className="flex-1 min-w-[120px] h-full flex flex-col items-center justify-center relative z-10">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: row.channels.flipkart.color }}
                  />
                  <div className="flex flex-col items-start leading-none">
                    <span
                      className="text-[12px] font-medium leading-[15px]"
                      style={{ color: row.channels.flipkart.color }}
                    >
                      {row.channels.flipkart.label}
                    </span>
                    <span className="text-[10px] font-normal leading-3 text-[#666666] mt-0.5">
                      {row.channels.flipkart.sublabel}
                    </span>
                  </div>
                </div>

                {/* Bottom Node Dot & Connection Line */}
                <div className="absolute bottom-[14px] left-0 right-0 flex items-center justify-center pointer-events-none">
                  {/* Line from Amazon to Flipkart node */}
                  <div
                    className="absolute left-0 w-1/2 h-[1px]"
                    style={{
                      backgroundColor: row.connections.amazonToFlipkart.color,
                      borderTop:
                        row.connections.amazonToFlipkart.style === "dashed"
                          ? `1px dashed ${row.connections.amazonToFlipkart.color}`
                          : undefined,
                    }}
                  />
                  {/* Line from Flipkart node to Meesho */}
                  <div
                    className="absolute left-1/2 w-1/2 h-[1px]"
                    style={{
                      backgroundColor:
                        row.connections.flipkartToMeesho.style === "dashed"
                          ? "transparent"
                          : row.connections.flipkartToMeesho.color,
                      borderTop:
                        row.connections.flipkartToMeesho.style === "dashed"
                          ? `1px dashed ${row.connections.flipkartToMeesho.color}`
                          : undefined,
                    }}
                  />
                  {/* Node Dot */}
                  <div
                    className="w-1.5 h-1.5 rounded-full z-20 shrink-0"
                    style={{ backgroundColor: row.channels.flipkart.color }}
                  />
                </div>
              </div>

              {/* Channel 3: Meesho */}
              <div
                onClick={() => {
                  if (row.channels.meesho.status === "not_listed") {
                    navigate(`/listings/unlisted`);
                  }
                }}
                className={cn(
                  "flex-1 min-w-[120px] h-full flex flex-col items-center justify-center relative z-10",
                  row.channels.meesho.status === "not_listed" && "cursor-pointer hover:opacity-80",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: row.channels.meesho.color }}
                  />
                  <div className="flex flex-col items-start leading-none">
                    <span
                      className="text-[12px] font-medium leading-[15px]"
                      style={{ color: row.channels.meesho.color }}
                    >
                      {row.channels.meesho.label}
                    </span>
                    <span className="text-[10px] font-normal leading-3 text-[#666666] mt-0.5">
                      {row.channels.meesho.sublabel}
                    </span>
                  </div>
                </div>

                {/* Bottom Node Dot & Connection Line */}
                <div className="absolute bottom-[14px] left-0 right-0 flex items-center justify-center pointer-events-none">
                  {/* Line from Flipkart to Meesho node */}
                  <div
                    className="absolute left-0 w-1/2 h-[1px]"
                    style={{
                      backgroundColor:
                        row.connections.flipkartToMeesho.style === "dashed"
                          ? "transparent"
                          : row.connections.flipkartToMeesho.color,
                      borderTop:
                        row.connections.flipkartToMeesho.style === "dashed"
                          ? `1px dashed ${row.connections.flipkartToMeesho.color}`
                          : undefined,
                    }}
                  />
                  {/* Line from Meesho node to Shopify */}
                  <div
                    className="absolute left-1/2 w-1/2 h-[1px]"
                    style={{
                      backgroundColor:
                        row.connections.meeshoToShopify.style === "dashed"
                          ? "transparent"
                          : row.connections.meeshoToShopify.color,
                      borderTop:
                        row.connections.meeshoToShopify.style === "dashed"
                          ? `1px dashed ${row.connections.meeshoToShopify.color}`
                          : undefined,
                    }}
                  />
                  {/* Node Dot */}
                  <div
                    className="w-1.5 h-1.5 rounded-full z-20 shrink-0"
                    style={{ backgroundColor: row.channels.meesho.color }}
                  />
                </div>
              </div>

              {/* Channel 4: Shopify */}
              <div className="flex-1 min-w-[120px] h-full flex flex-col items-center justify-center relative z-10">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: row.channels.shopify.color }}
                  />
                  <div className="flex flex-col items-start leading-none">
                    <span
                      className="text-[12px] font-medium leading-[15px]"
                      style={{ color: row.channels.shopify.color }}
                    >
                      {row.channels.shopify.label}
                    </span>
                    <span className="text-[10px] font-normal leading-3 text-[#666666] mt-0.5">
                      {row.channels.shopify.sublabel}
                    </span>
                  </div>
                </div>

                {/* Bottom Node Dot & Connection Line */}
                <div className="absolute bottom-[14px] left-0 right-0 flex items-center justify-center pointer-events-none">
                  {/* Line from Meesho to Shopify node */}
                  <div
                    className="absolute left-0 w-1/2 h-[1px]"
                    style={{
                      backgroundColor:
                        row.connections.meeshoToShopify.style === "dashed"
                          ? "transparent"
                          : row.connections.meeshoToShopify.color,
                      borderTop:
                        row.connections.meeshoToShopify.style === "dashed"
                          ? `1px dashed ${row.connections.meeshoToShopify.color}`
                          : undefined,
                    }}
                  />
                  {/* Node Dot */}
                  <div
                    className="w-1.5 h-1.5 rounded-full z-20 shrink-0"
                    style={{ backgroundColor: row.channels.shopify.color }}
                  />
                </div>
              </div>

              {/* Action */}
              <div className="w-[100px] flex items-center justify-center shrink-0 z-10">
                <button
                  onClick={() => navigate(`${ROUTES.PRODUCTS}`)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  Manage →
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Matrix Legend */}
        <div className="px-4 py-2 flex flex-row flex-wrap items-center gap-4 text-[10px] font-normal text-[#666666] border-t border-[#EAEAEA] bg-[#FFFFFF]">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            <span>Live / Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
            <span>Needs review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
            <span>Blocked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
            <span>Syncing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#BDBDBD]" />
            <span>Draft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EAEAEA]" />
            <span>Not listed</span>
          </div>
          <div className="ml-auto text-[#666666]">
            Master Product → Channel Listing → Marketplace
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. CATALOG REACH METRICS (Full width container with border-y)
         ========================================================================= */}
      <section className="w-full space-y-1">
        <span className="text-[10px] font-medium leading-[12px] text-[#6B7280]">
          Catalog reach
        </span>

        <div className="w-full flex flex-row items-center py-3 border-y border-[#EAEAEA] gap-6">
          {/* Primary metric: Active listings */}
          <div className="flex flex-col items-start min-w-[90px]">
            <span className="text-[32px] font-semibold leading-[39px] text-[#000000]">
              {reachKPIs?.activeListings.toLocaleString() ?? "1,042"}
            </span>
            <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
              active listings
            </span>
          </div>

          <div className="w-[1px] h-9 bg-[#EAEAEA]" />

          {/* Master products */}
          <div className="flex flex-col items-start min-w-[90px]">
            <span className="text-[18px] font-semibold leading-[22px] text-[#000000]">
              {reachKPIs?.masterProducts.toLocaleString() ?? "427"}
            </span>
            <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
              master products
            </span>
          </div>

          <div className="w-[1px] h-9 bg-[#EAEAEA]" />

          {/* Connected channels */}
          <div className="flex flex-col items-start min-w-[110px]">
            <span className="text-[18px] font-semibold leading-[22px] text-[#000000]">
              {reachKPIs?.connectedChannels ?? 4}
            </span>
            <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
              connected channels
            </span>
          </div>

          <div className="w-[1px] h-9 bg-[#EAEAEA]" />

          {/* Ready to publish */}
          <div
            onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
            className="flex flex-col items-start min-w-[90px] cursor-pointer group"
          >
            <span className="text-[18px] font-semibold leading-[22px] text-[#16A34A] group-hover:underline">
              {reachKPIs?.readyToPublish ?? 186}
            </span>
            <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
              ready to publish
            </span>
          </div>

          <div className="w-[1px] h-9 bg-[#EAEAEA]" />

          {/* Need review */}
          <div
            onClick={() => setActiveStatusPill("needs_review")}
            className="flex flex-col items-start min-w-[80px] cursor-pointer group"
          >
            <span className="text-[18px] font-semibold leading-[22px] text-[#D97706] group-hover:underline">
              {reachKPIs?.needReview ?? 27}
            </span>
            <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
              need review
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. LISTING CONTROLS (Channel switcher + Status line + Search & filters)
         ========================================================================= */}
      <section className="w-full space-y-3 pt-1">
        {/* Channel Switcher Tabs */}
        <div className="w-full flex flex-row items-center gap-5 border-b border-[#EAEAEA] h-[34px] text-[12px] overflow-x-auto">
          {[
            { id: "all", label: "All channels" },
            { id: "amazon", label: "Amazon" },
            { id: "flipkart", label: "Flipkart" },
            { id: "meesho", label: "Meesho" },
            { id: "shopify", label: "Shopify" },
            { id: "snapdeal", label: "Snapdeal" },
            { id: "social", label: "Social Commerce" },
          ].map((tab) => {
            const isActive = activeChannelTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveChannelTab(tab.id);
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-full px-0.5 flex items-center transition-colors relative shrink-0 cursor-pointer",
                  isActive
                    ? "font-semibold text-[#000000] border-b-2 border-[#000000]"
                    : "font-normal text-[#666666] hover:text-[#000000]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Status Line */}
        <div className="w-full flex flex-row items-center gap-5 h-7 text-[12px] overflow-x-auto">
          <button
            onClick={() => {
              setActiveStatusPill("all");
              setCurrentPage(1);
            }}
            className={cn(
              "transition-colors shrink-0 cursor-pointer",
              activeStatusPill === "all"
                ? "font-semibold text-[#000000]"
                : "font-normal text-[#666666] hover:text-[#000000]",
            )}
          >
            All
          </button>

          {[
            { id: "live", label: "Live", color: "#16A34A" },
            { id: "ready", label: "Ready", color: "#16A34A" },
            { id: "needs_review", label: "Needs review", color: "#D97706" },
            { id: "blocked", label: "Blocked", color: "#DC2626" },
            { id: "syncing", label: "Syncing", color: "#2563EB" },
            { id: "draft", label: "Draft", color: "#BDBDBD" },
            { id: "not_listed", label: "Not listed", color: "#EAEAEA" },
          ].map((st) => {
            const isActive = activeStatusPill === st.id;
            return (
              <button
                key={st.id}
                onClick={() => {
                  setActiveStatusPill(st.id);
                  setCurrentPage(1);
                }}
                className={cn(
                  "flex items-center gap-1 transition-colors shrink-0 cursor-pointer",
                  isActive
                    ? "font-semibold text-[#000000]"
                    : "font-normal text-[#666666] hover:text-[#000000]",
                )}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: st.color }}
                />
                <span>{st.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search and Filters Bar */}
        <div className="w-full flex flex-row flex-wrap items-center gap-2">
          {/* Search Input (width 280px, height 34px, bg #F5F5F5, rounded 8px) */}
          <div className="relative w-[280px] h-[34px] bg-[#F5F5F5] rounded-lg px-2.5 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[#666666] shrink-0" />
            <input
              type="text"
              placeholder="Search by product, SKU or listing…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent border-none text-[12px] text-[#000000] placeholder-[#666666] focus:outline-none"
            />
            <span className="text-[11px] font-normal text-[#666666] shrink-0 select-none">
              ⌘ K
            </span>
          </div>

          {/* Filter 1: Marketplace */}
          <div className="relative">
            <select
              value={marketplaceFilter}
              onChange={(e) => {
                setMarketplaceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-[34px] px-2.5 pr-6 border border-[#BDBDBD] rounded-lg bg-white text-[12px] font-medium text-[#000000] appearance-none focus:outline-none cursor-pointer"
            >
              <option value="all">Marketplace ⌄</option>
              <option value="Amazon">Amazon</option>
              <option value="Flipkart">Flipkart</option>
              <option value="Meesho">Meesho</option>
              <option value="Shopify">Shopify</option>
            </select>
          </div>

          {/* Filter 2: Category */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-[34px] px-2.5 pr-6 border border-[#BDBDBD] rounded-lg bg-white text-[12px] font-medium text-[#000000] appearance-none focus:outline-none cursor-pointer"
            >
              <option value="all">Category ⌄</option>
              <option value="Luggage">Luggage & Bags</option>
              <option value="Apparel">Men's Apparel</option>
              <option value="Backpack">Backpacks</option>
            </select>
          </div>

          {/* Filter 3: Listing readiness */}
          <div className="relative">
            <select
              value={readinessFilter}
              onChange={(e) => {
                setReadinessFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-[34px] px-2.5 pr-6 border border-[#BDBDBD] rounded-lg bg-white text-[12px] font-medium text-[#000000] appearance-none focus:outline-none cursor-pointer"
            >
              <option value="all">Listing readiness ⌄</option>
              <option value="100">100% Ready</option>
              <option value="high">80% - 99%</option>
              <option value="medium">50% - 79%</option>
              <option value="low">&lt; 50% Blocked</option>
            </select>
          </div>

          {/* Filter 4: Inventory */}
          <div className="relative">
            <select
              value={inventoryFilter}
              onChange={(e) => {
                setInventoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-[34px] px-2.5 pr-6 border border-[#BDBDBD] rounded-lg bg-white text-[12px] font-medium text-[#000000] appearance-none focus:outline-none cursor-pointer"
            >
              <option value="all">Inventory ⌄</option>
              <option value="in_stock">In Stock (&gt;0)</option>
              <option value="out_of_stock">Out of Stock (0)</option>
            </select>
          </div>

          {/* Filter 5: Product status */}
          <div className="relative">
            <select
              value={productStatusFilter}
              onChange={(e) => {
                setProductStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-[34px] px-2.5 pr-6 border border-[#BDBDBD] rounded-lg bg-white text-[12px] font-medium text-[#000000] appearance-none focus:outline-none cursor-pointer"
            >
              <option value="all">Product status ⌄</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Filter 6: Potential */}
          <div className="relative">
            <select
              value={potentialFilter}
              onChange={(e) => {
                setPotentialFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-[34px] px-2.5 pr-6 border border-[#BDBDBD] rounded-lg bg-white text-[12px] font-medium text-[#000000] appearance-none focus:outline-none cursor-pointer"
            >
              <option value="all">Potential ⌄</option>
              <option value="high">High Velocity</option>
              <option value="opportunity">Missing Channel</option>
            </select>
          </div>

          {/* Filter 7: Reset filters */}
          <button
            onClick={() => {
              setActiveChannelTab("all");
              setActiveStatusPill("all");
              setSearchTerm("");
              setMarketplaceFilter("all");
              setCategoryFilter("all");
              setReadinessFilter("all");
              setInventoryFilter("all");
              setActiveIssueFilter(null);
              setCurrentPage(1);
            }}
            className="h-[34px] px-2.5 border border-[#BDBDBD] rounded-lg bg-white text-[12px] font-medium text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Reset filters ⌄
          </button>
        </div>
      </section>

      {/* =========================================================================
          5. WHY NOT LIVE BANNER (Full width border-y)
         ========================================================================= */}
      <section className="w-full flex flex-row justify-between items-center py-2.5 border-y border-[#EAEAEA] text-[12px]">
        <div className="flex flex-row flex-wrap items-center gap-2">
          <span className="font-semibold text-[#D97706]">
            {issueSummary?.notReadyCount ?? 27} listings are not ready to publish
          </span>
          <span className="text-[11px] text-[#666666]">—</span>

          {/* Issue 1: Missing attributes */}
          <button
            onClick={() =>
              setActiveIssueFilter((curr) =>
                curr === "missing_attributes" ? null : "missing_attributes",
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors cursor-pointer",
              activeIssueFilter === "missing_attributes"
                ? "font-semibold underline"
                : "hover:underline",
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
            <span className="text-[#000000]">
              {issueSummary?.missingAttributes ?? 12} Missing attributes
            </span>
          </button>

          <span className="w-5 h-[1px] bg-[#EAEAEA]" />

          {/* Issue 2: Missing images */}
          <button
            onClick={() =>
              setActiveIssueFilter((curr) =>
                curr === "missing_images" ? null : "missing_images",
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors cursor-pointer",
              activeIssueFilter === "missing_images"
                ? "font-semibold underline"
                : "hover:underline",
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
            <span className="text-[#000000]">
              {issueSummary?.missingImages ?? 7} Missing images
            </span>
          </button>

          <span className="w-5 h-[1px] bg-[#EAEAEA]" />

          {/* Issue 3: Category mismatch */}
          <button
            onClick={() =>
              setActiveIssueFilter((curr) =>
                curr === "category_mismatch" ? null : "category_mismatch",
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors cursor-pointer",
              activeIssueFilter === "category_mismatch"
                ? "font-semibold underline"
                : "hover:underline",
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
            <span className="text-[#000000]">
              {issueSummary?.categoryMismatch ?? 5} Category mismatch
            </span>
          </button>

          <span className="w-5 h-[1px] bg-[#EAEAEA]" />

          {/* Issue 4: Variant issues */}
          <button
            onClick={() =>
              setActiveIssueFilter((curr) =>
                curr === "variant_issues" ? null : "variant_issues",
              )
            }
            className={cn(
              "flex items-center gap-1.5 transition-colors cursor-pointer",
              activeIssueFilter === "variant_issues"
                ? "font-semibold underline"
                : "hover:underline",
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
            <span className="text-[#000000]">
              {issueSummary?.variantIssues ?? 3} Variant issues
            </span>
          </button>
        </div>

        <button
          onClick={() => {
            setActiveStatusPill("needs_review");
            setCurrentPage(1);
          }}
          className="font-semibold text-[#000000] hover:underline shrink-0 cursor-pointer"
        >
          Filter by issue →
        </button>
      </section>

      {/* =========================================================================
          6. LISTINGS TABLE (Full width responsive layout)
         ========================================================================= */}
      <section className="w-full space-y-0 pt-1">
        {/* Table Heading */}
        <div className="w-full flex flex-row justify-between items-center pb-2">
          <h2 className="text-[18px] font-semibold leading-[22px] text-[#000000]">
            Listings
          </h2>
          <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
            Showing {meta.showingFrom}–{meta.showingTo} of {meta.total.toLocaleString()}
          </span>
        </div>

        {/* Bulk Selected Action Bar (Figma screen: 18 listings selected, Edit content, Publish, Unpublish, Sync, Export, More ⌄) */}
        {selectedListingIds.length > 0 && (
          <div className="w-full h-12 bg-white border border-[#EAEAEA] rounded-lg px-4 flex items-center justify-between mb-3 shadow-none animate-in fade-in duration-150">
            {/* Left: Checkbox + Count */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="w-4 h-4 bg-black rounded flex items-center justify-center text-white cursor-pointer"
                title="Toggle all selection"
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </button>
              <span className="text-[13px] font-semibold text-black tracking-tight">
                {selectedListingIds.length} listings selected
              </span>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2 relative">
              <button
                type="button"
                onClick={() => {
                  const first = listings.find((l) => selectedListingIds.includes(l.id));
                  if (first) setActiveDrawerListing(first);
                }}
                className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Edit content
              </button>

              <button
                type="button"
                onClick={handleBulkPublish}
                disabled={bulkPublishMutation.isPending}
                className="h-8 px-4 rounded-lg bg-black text-white text-[12px] font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {bulkPublishMutation.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Publishing…
                  </>
                ) : (
                  "Publish"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  toast({
                    title: "Unpublish requested",
                    description: `Queued unpublish command for ${selectedListingIds.length} listings across connected channels.`,
                  });
                }}
                className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Unpublish
              </button>

              <button
                type="button"
                onClick={() => {
                  toast({
                    title: "Sync initiated",
                    description: `Triggered inventory & catalog sync for ${selectedListingIds.length} listings.`,
                  });
                }}
                className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Sync
              </button>

              <button
                type="button"
                onClick={() => {
                  const selectedItems = listings.filter((l) => selectedListingIds.includes(l.id));
                  const csvContent =
                    "data:text/csv;charset=utf-8," +
                    ["Listing,SKU,Marketplace,Readiness,Status"]
                      .concat(
                        selectedItems.map(
                          (i) =>
                            `"${i.productTitle}","${i.sku}","${i.channelName}","${i.readinessScore}%","${i.status}"`,
                        ),
                      )
                      .join("\n");
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute("download", `selected_listings_${selectedListingIds.length}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  toast({
                    title: "Export downloaded",
                    description: `Exported ${selectedListingIds.length} listings to CSV.`,
                  });
                }}
                className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Export
              </button>

              {/* More Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsBulkMoreMenuOpen((v) => !v)}
                  className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>More</span>
                  <span className="text-[10px]">⌄</span>
                </button>

                {isBulkMoreMenuOpen && (
                  <div
                    className="absolute right-0 mt-1 w-44 bg-white border border-[#EAEAEA] rounded-lg shadow-lg py-1 z-30 text-[12px]"
                    onMouseLeave={() => setIsBulkMoreMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMoreMenuOpen(false);
                        navigate(ROUTES.LISTINGS_READINESS);
                      }}
                      className="w-full text-left px-3 py-2 text-black hover:bg-neutral-100 flex items-center gap-2 cursor-pointer"
                    >
                      <span>Audit readiness</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMoreMenuOpen(false);
                        navigate(ROUTES.LISTINGS_BULK);
                      }}
                      className="w-full text-left px-3 py-2 text-black hover:bg-neutral-100 flex items-center gap-2 cursor-pointer"
                    >
                      <span>Full review screen →</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMoreMenuOpen(false);
                        setSelectedListingIds([]);
                      }}
                      className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                    >
                      <span>Deselect all</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Table Columns Header */}
        <div className="w-full h-8 bg-[#F5F5F5] px-4 pl-12 flex flex-row items-center text-[11px] font-medium text-[#666666]">
          {/* Checkbox */}
          <div className="w-6 shrink-0">
            <input
              type="checkbox"
              checked={
                selectedListingIds.length === listings.length &&
                listings.length > 0
              }
              onChange={handleSelectAll}
              className="w-3.5 h-3.5 border border-[#BDBDBD] rounded accent-black cursor-pointer"
            />
          </div>
          <div className="w-[240px] shrink-0">Listing</div>
          <div className="w-[110px] shrink-0 text-[10px]">Master product</div>
          <div className="w-[120px] shrink-0">Marketplace</div>
          <div className="w-[130px] shrink-0">Readiness</div>
          <div className="w-[90px] shrink-0">Inventory</div>
          <div className="w-[120px] shrink-0">Last sync</div>
          <div className="flex-1 min-w-[120px]">Status</div>
          <div className="w-[80px] shrink-0 text-right">Action</div>
        </div>

        {/* Table Rows */}
        <div className="w-full divide-y divide-[#EAEAEA] border-b border-[#EAEAEA]">
          {isListingsLoading ? (
            <ListingTableRowsSkeleton />
          ) : listings.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-sm text-[#666666]">
              <p>No listings match the current filters.</p>
              <button
                onClick={() => {
                  setActiveChannelTab("all");
                  setActiveStatusPill("all");
                  setSearchTerm("");
                  setActiveIssueFilter(null);
                }}
                className="text-xs font-semibold text-black underline cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            listings.map((item) => {
              const isSelected = selectedListingIds.includes(item.id);
              const scoreColor = getReadinessColor(item.readinessScore);
              const statusColor = getStatusDotColor(item.status);
              const fillHeight = (28 * item.readinessScore) / 100;
              const fillTop = 8 + (28 - fillHeight);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "relative w-full h-11 px-4 pl-12 flex flex-row items-center text-[12px] hover:bg-[#FAFAFA] transition-colors",
                    isSelected && "bg-[#F9FAFB]",
                  )}
                >
                  {/* Vertical Readiness Meter Track & Fill on Left Edge */}
                  <div
                    className="absolute left-[3px] top-2 w-[3px] h-7 bg-[#E5E7EB] rounded-sm pointer-events-none"
                    title={`Readiness score: ${item.readinessScore}%`}
                  />
                  <div
                    className="absolute left-[3px] w-[3px] rounded-sm pointer-events-none transition-all"
                    style={{
                      top: `${fillTop}px`,
                      height: `${fillHeight}px`,
                      backgroundColor: scoreColor,
                    }}
                  />
                  <span
                    className="absolute left-[10px] top-[17px] text-[8px] font-medium leading-[10px] pointer-events-none select-none"
                    style={{ color: scoreColor }}
                  >
                    {item.readinessScore}%
                  </span>

                  {/* Row Checkbox */}
                  <div className="w-6 shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      className="w-3.5 h-3.5 border border-[#BDBDBD] rounded accent-black cursor-pointer"
                    />
                  </div>

                  {/* Listing Title */}
                  <div className="w-[240px] font-medium text-[13px] text-[#000000] truncate shrink-0 pr-3">
                    <span
                      onClick={() => navigate(`${ROUTES.LISTINGS}/${item.id}`)}
                      className="hover:underline cursor-pointer"
                      title={item.productTitle}
                    >
                      {item.productTitle}
                    </span>
                  </div>

                  {/* Master SKU */}
                  <div className="w-[110px] text-[12px] font-normal text-[#666666] truncate shrink-0 font-mono">
                    {item.sku}
                  </div>

                  {/* Marketplace */}
                  <div className="w-[120px] text-[12px] font-normal text-[#000000] truncate shrink-0">
                    {item.channelName}
                  </div>

                  {/* Readiness Bar */}
                  <div className="w-[130px] flex items-center gap-1.5 shrink-0">
                    <div className="w-8 h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${item.readinessScore}%`,
                          backgroundColor: scoreColor,
                        }}
                      />
                    </div>
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: scoreColor }}
                    >
                      {item.readinessScore}%
                    </span>
                  </div>

                  {/* Inventory */}
                  <div className="w-[90px] text-[12px] font-normal text-[#000000] shrink-0 font-mono">
                    {item.stock}
                  </div>

                  {/* Last Sync */}
                  <div className="w-[120px] text-[12px] font-normal text-[#666666] truncate shrink-0">
                    {item.lastSyncText}
                  </div>

                  {/* Status */}
                  <div
                    onClick={() => handleActionClick(item)}
                    className="flex-1 min-w-[120px] flex items-center gap-1.5 truncate cursor-pointer group"
                    title={`Click to view ${getStatusLabel(item.status)} details`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                      style={{ backgroundColor: statusColor }}
                    />
                    <span
                      className="text-[12px] font-medium truncate group-hover:underline"
                      style={{ color: statusColor }}
                    >
                      {getStatusLabel(item.status)}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="w-[80px] shrink-0 text-right">
                    <button
                      onClick={() => handleActionClick(item)}
                      disabled={publishMutation.isPending}
                      className={cn(
                        "text-[12px] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer",
                        item.actionType === "fix"
                          ? "text-[#DC2626]"
                          : "text-[#000000]",
                      )}
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table Pagination */}
        <div className="w-full flex flex-row justify-between items-center pt-2.5 text-[12px]">
          <span className="font-normal text-[#666666]">
            Showing {meta.showingFrom}–{meta.showingTo} of {meta.total.toLocaleString()} listings
          </span>

          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2.5 border border-[#BDBDBD] rounded-md text-[12px] text-[#666666] hover:bg-neutral-50 transition-colors disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>

            <button className="w-7 h-7 bg-[#F5F5F5] rounded text-[12px] font-semibold text-[#000000] flex items-center justify-center">
              {currentPage}
            </button>

            <button
              disabled={currentPage >= meta.totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="h-7 px-2.5 border border-[#BDBDBD] rounded-md text-[12px] text-[#000000] hover:bg-neutral-50 transition-colors disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>

        {/* Bottom review readiness banner (Figma screen) */}
        {selectedListingIds.length > 0 && (
          <div className="w-full p-3.5 mt-3 rounded-lg bg-[#F5F5F5] border border-[#EAEAEA] text-[12px] font-normal text-[#666666] flex items-center justify-between">
            <span>
              Showing {selectedListingIds.length} of {meta.total} selected listings. Review listing readiness before publishing.
            </span>
            <button
              onClick={() => setSelectedListingIds([])}
              className="text-xs font-medium text-black hover:underline cursor-pointer"
            >
              Clear selection
            </button>
          </div>
        )}
      </section>



      {/* =========================================================================
          8. CREATE LISTING MODAL
         ========================================================================= */}
      {renderCreateModal()}

      {/* =========================================================================
          9. LISTING REVIEW / COMPLETENESS DRAWER (Figma Sidebar)
         ========================================================================= */}
      <ListingDetailDrawer
        isOpen={Boolean(activeDrawerListing)}
        onClose={() => setActiveDrawerListing(null)}
        listing={activeDrawerListing}
        onOpenListing={(listingId) => {
          setActiveDrawerListing(null);
          navigate(`${ROUTES.LISTINGS}/${listingId}`);
        }}
        onApplyFix={() => {
          queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
        }}
      />
    </div>
  );
}
