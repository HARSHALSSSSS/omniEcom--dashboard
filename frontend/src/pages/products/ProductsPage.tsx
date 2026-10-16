import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  CheckCircle2,
  Minus,
  Check,
  X,
} from "lucide-react";
import { useProducts, useBulkProducts } from "@/hooks/useProducts";
import { ROUTES } from "@/constants/routes";
import { toast } from "@/hooks/useToast";

interface ProductCommandCardItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  channel: string;
  variantsCount: number;
  status: "Active" | "Low stock" | "Out of stock" | "Draft";
  statusVariant: "healthy" | "warning" | "critical" | "draft";
  image?: string;
  initials?: string;
  stateValue: string | number;
  stateLabel: string;
  channelDetail: string;
  operationalContext: string;
  primaryActionLabel: string;
  primaryActionPath: string;
}

export default function ProductsPage() {
  const navigate = useNavigate();

  // Navigation tab states
  const [activeTab, setActiveTab] = useState<
    "all" | "active" | "draft" | "archived" | "needs_attention"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filters State
  const [selectedCategory, setSelectedCategory] = useState<string>("All categories");
  const [selectedStatus, setSelectedStatus] = useState<string>("All statuses");
  const [selectedChannel, setSelectedChannel] = useState<string>("All channels");
  const [selectedInventory, setSelectedInventory] = useState<string>("Any inventory");
  const [selectedProductType, setSelectedProductType] = useState<string>("All types");
  const [selectedSort, setSelectedSort] = useState<string>("Last updated");

  // Open dropdown tracker
  const [openDropdown, setOpenDropdown] = useState<
    "category" | "status" | "channel" | "inventory" | "productType" | "sort" | "savedViews" | "importMenu" | null
  >(null);

  // Save current view modal state
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [savedViewName, setSavedViewName] = useState("Draft out-of-stock products");

  // Bulk selection state (Figma Screen 10 Bulk selection and edit)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const bulkProductsMutation = useBulkProducts();

  const handleToggleSelectProduct = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (items: ProductCommandCardItem[]) => {
    if (selectedProductIds.length === items.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(items.map((p) => p.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedProductIds([]);
  };

  const handleBulkAction = (action: "archive" | "activate" | "delete", label: string) => {
    if (selectedProductIds.length === 0) return;
    bulkProductsMutation.mutate(
      { productIds: selectedProductIds, action },
      {
        onSuccess: () => {
          toast({
            title: `Bulk ${label} successful`,
            description: `Applied ${label.toLowerCase()} to ${selectedProductIds.length} products.`,
            variant: "default",
          });
          setSelectedProductIds([]);
        },
        onError: () => {
          toast({
            title: `Bulk ${label} failed`,
            description: "An error occurred while processing bulk operation.",
            variant: "destructive",
          });
        },
      }
    );
  };

  // Click outside to close menus
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Connect to live TanStack Query hook
  const { data } = useProducts({
    search: searchQuery,
    status: activeTab === "all" ? undefined : activeTab,
  });

  // Product command cards dataset matching Figma Screen 10
  const productsList: ProductCommandCardItem[] = [
    {
      id: "prod-1",
      name: "Premium Travel Bag",
      sku: "TRV-1042",
      category: "Bags & Luggage",
      channel: "Amazon",
      variantsCount: 4,
      status: "Active",
      statusVariant: "healthy",
      image:
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=400&q=80",
      stateValue: "124",
      stateLabel: "Available units",
      channelDetail: "Amazon / Shopify / Meesho",
      operationalContext: "1 listing needs attention",
      primaryActionLabel: "Open product",
      primaryActionPath: `${ROUTES.PRODUCTS}/prod-1`,
    },
    {
      id: "prod-2",
      name: "Classic Backpack",
      sku: "BP-1021",
      category: "Bags & Luggage",
      channel: "Amazon",
      variantsCount: 6,
      status: "Low stock",
      statusVariant: "warning",
      image:
        "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=400&q=80",
      stateValue: "8",
      stateLabel: "Available units",
      channelDetail: "Amazon / Flipkart",
      operationalContext: "Stock coverage: 2 days",
      primaryActionLabel: "Review inventory",
      primaryActionPath: `${ROUTES.PRODUCTS}/prod-1`,
    },
    {
      id: "prod-3",
      name: "Cotton Overshirt",
      sku: "OS-2048",
      category: "Apparel & Fashion",
      channel: "Shopify",
      variantsCount: 8,
      status: "Out of stock",
      statusVariant: "critical",
      image:
        "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=400&q=80",
      stateValue: "0",
      stateLabel: "Available units",
      channelDetail: "Shopify · Amazon",
      operationalContext: "Potential lost sales",
      primaryActionLabel: "Update inventory",
      primaryActionPath: `${ROUTES.PRODUCTS}/prod-1/edit`,
    },
    {
      id: "prod-4",
      name: "Travel Organizer Set",
      sku: "ORG-3102",
      category: "Bags & Luggage",
      channel: "Amazon",
      variantsCount: 3,
      status: "Draft",
      statusVariant: "draft",
      initials: "TRV",
      stateValue: "68%",
      stateLabel: "Publish readiness",
      channelDetail: "Amazon · Not published",
      operationalContext: "Images and description missing",
      primaryActionLabel: "Continue editing",
      primaryActionPath: `${ROUTES.PRODUCTS}/prod-5`,
    },
  ];

  // Tab counts
  const tabCounts = {
    all: data?.meta?.total ?? 427,
    active: data?.meta?.kpis?.activeListings ?? 1042,
    draft: 18,
    archived: 0,
    needs_attention: data?.meta?.kpis?.lowStockCount ?? 7,
  };

  // Filter products by search, tab, and active dropdown filters
  const filteredProducts = productsList.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (activeTab === "active" && item.status !== "Active") return false;
    if (activeTab === "draft" && item.status !== "Draft") return false;
    if (
      activeTab === "needs_attention" &&
      item.status !== "Low stock" &&
      item.status !== "Out of stock"
    )
      return false;

    // Category filter
    if (selectedCategory !== "All categories" && item.category !== selectedCategory) return false;

    // Status filter
    if (selectedStatus !== "All statuses" && item.status !== selectedStatus) return false;

    // Channel filter
    if (selectedChannel !== "All channels" && !item.channelDetail.includes(selectedChannel))
      return false;

    // Inventory filter
    if (selectedInventory === "Healthy" && item.status !== "Active") return false;
    if (selectedInventory === "Low stock" && item.status !== "Low stock") return false;
    if (selectedInventory === "Out of stock" && item.status !== "Out of stock") return false;

    return true;
  });

  // Active filter chip helpers
  const activeChips: { key: string; label: string; onClear: () => void }[] = [];
  if (selectedInventory !== "Any inventory") {
    activeChips.push({
      key: "inv",
      label: `Inventory: ${selectedInventory}`,
      onClear: () => setSelectedInventory("Any inventory"),
    });
  }
  if (selectedStatus !== "All statuses") {
    activeChips.push({
      key: "status",
      label: `Status: ${selectedStatus}`,
      onClear: () => setSelectedStatus("All statuses"),
    });
  }
  if (selectedCategory !== "All categories") {
    activeChips.push({
      key: "cat",
      label: `Category: ${selectedCategory}`,
      onClear: () => setSelectedCategory("All categories"),
    });
  }
  if (selectedChannel !== "All channels") {
    activeChips.push({
      key: "ch",
      label: `Channel: ${selectedChannel}`,
      onClear: () => setSelectedChannel("All channels"),
    });
  }

  const handleClearAllFilters = () => {
    setSelectedCategory("All categories");
    setSelectedStatus("All statuses");
    setSelectedChannel("All channels");
    setSelectedInventory("Any inventory");
    setSelectedProductType("All types");
    setSearchQuery("");
  };

  const hasActiveFilters = activeChips.length > 0;
  const isNoMatches = filteredProducts.length === 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000]"
    >
      {/* 1. Catalog Introduction Header */}
      <div className="w-full flex flex-col items-start gap-6">
        <div className="w-full flex flex-row items-center justify-between">
          <div className="flex-1 flex flex-col items-start gap-1.5">
            <span className="text-[10px] font-medium leading-[12px] uppercase text-[#707070]">
              Catalog
            </span>
            <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
              Products
            </h1>
            <p className="text-[13px] font-normal leading-[19px] text-[#666666]">
              Manage your master catalog, variants and product information from one place.
            </p>
          </div>

          <div className="flex flex-row items-center gap-2">
            {/* Import Button with Dropdown matching user screenshot */}
            <div className="relative">
              <button
                onClick={() =>
                  setOpenDropdown(openDropdown === "importMenu" ? null : "importMenu")
                }
                className="box-border flex flex-row justify-center items-center px-4 h-[36px] w-[86px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors"
              >
                Import
              </button>

              {openDropdown === "importMenu" && (
                <div className="absolute right-0 top-[42px] z-50 w-[240px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_16px_rgba(0,0,0,0.08)] p-2 flex flex-col gap-1 text-left font-['Inter',sans-serif]">
                  <div className="px-3 pt-1.5 pb-2 text-[10px] font-medium leading-[14px] uppercase text-[#666666] tracking-wider">
                    IMPORT PRODUCTS
                  </div>

                  <button
                    onClick={() => {
                      setOpenDropdown(null);
                      navigate(`${ROUTES.PRODUCTS_IMPORT}?source=marketplace`);
                    }}
                    className="w-full px-3 py-2 text-[13px] font-normal leading-[19px] text-[#000000] rounded-[6px] hover:bg-[#F5F5F5] text-left transition-colors cursor-pointer"
                  >
                    Marketplace catalog import
                  </button>

                  <button
                    onClick={() => {
                      setOpenDropdown(null);
                      navigate(`${ROUTES.PRODUCTS_IMPORT}?source=csv`);
                    }}
                    className="w-full px-3 py-2 text-[13px] font-normal leading-[19px] text-[#000000] rounded-[6px] hover:bg-[#F5F5F5] text-left transition-colors cursor-pointer"
                  >
                    CSV / Excel import
                  </button>

                  <button
                    onClick={() => {
                      setOpenDropdown(null);
                      navigate(`${ROUTES.PRODUCTS_IMPORT}?source=custom`);
                    }}
                    className="w-full px-3 py-2 text-[13px] font-normal leading-[19px] text-[#000000] rounded-[6px] hover:bg-[#F5F5F5] text-left transition-colors cursor-pointer"
                  >
                    Other connected source
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate(ROUTES.PRODUCTS_NEW)}
              className="flex flex-row justify-center items-center px-4 h-[36px] bg-[#000000] rounded-[8px] text-[12px] font-semibold text-[#FFFFFF] hover:bg-[#1A1A1A] transition-colors"
            >
              + Create product
            </button>
          </div>
        </div>

        {/* 2. Catalog KPI Summary Strip */}
        <div className="w-full flex flex-row items-start py-1 gap-6">
          {/* Total Products */}
          <div className="flex-1 flex flex-col items-start gap-1">
            <span className="text-[26px] font-semibold leading-[38px] text-[#000000]">
              427
            </span>
            <span className="text-[12px] font-normal leading-[17px] text-[#9F06FE]">
              Products
            </span>
          </div>

          {/* Variants */}
          <div className="flex-1 flex flex-col items-start gap-1 pl-6 border-l border-[#EAEAEA]">
            <span className="text-[26px] font-semibold leading-[38px] text-[#000000]">
              1,286
            </span>
            <span className="text-[12px] font-normal leading-[17px] text-[#008FE1]">
              Variants
            </span>
          </div>

          {/* Active */}
          <div className="flex-1 flex flex-col items-start gap-1 pl-6 border-l border-[#EAEAEA]">
            <span className="text-[26px] font-semibold leading-[38px] text-[#000000]">
              1,042
            </span>
            <span className="text-[12px] font-normal leading-[17px] text-[#509F06]">
              Active
            </span>
          </div>

          {/* Draft */}
          <div className="flex-1 flex flex-col items-start gap-1 pl-6 border-l border-[#EAEAEA]">
            <span className="text-[26px] font-semibold leading-[38px] text-[#000000]">
              18
            </span>
            <span className="text-[12px] font-normal leading-[17px] text-[#FF7300]">
              Draft
            </span>
          </div>

          {/* Need Attention */}
          <div className="flex-1 flex flex-col items-start gap-1 pl-6 border-l border-[#EAEAEA]">
            <span className="text-[26px] font-semibold leading-[38px] text-[#000000]">
              7
            </span>
            <span className="text-[12px] font-normal leading-[17px] text-[#FC090D]">
              Need attention
            </span>
          </div>
        </div>
      </div>

      {/* 3. Catalog Controls */}
      <div className="w-full flex flex-col items-start gap-4">
        {/* View Switcher Tabs */}
        <div className="w-full flex flex-row items-start gap-7 border-b border-[#EAEAEA] h-[42px]">
          {/* All products */}
          <button
            onClick={() => setActiveTab("all")}
            className={`flex flex-row items-center px-0.5 gap-2 h-[42px] transition-all ${
              activeTab === "all"
                ? "border-b-2 border-[#000000]"
                : "text-[#666666] hover:text-[#000000]"
            }`}
          >
            <span
              className={`text-[12px] ${
                activeTab === "all" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              All products
            </span>
            <span className="text-[11px] font-normal text-[#666666]">
              {tabCounts.all}
            </span>
          </button>

          {/* Active */}
          <button
            onClick={() => setActiveTab("active")}
            className={`flex flex-row items-center px-0.5 gap-2 h-[42px] transition-all ${
              activeTab === "active"
                ? "border-b-2 border-[#000000]"
                : "text-[#666666] hover:text-[#000000]"
            }`}
          >
            <span
              className={`text-[12px] ${
                activeTab === "active" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              Active
            </span>
          </button>

          {/* Draft */}
          <button
            onClick={() => setActiveTab("draft")}
            className={`flex flex-row items-center px-0.5 gap-2 h-[42px] transition-all ${
              activeTab === "draft"
                ? "border-b-2 border-[#000000]"
                : "text-[#666666] hover:text-[#000000]"
            }`}
          >
            <span
              className={`text-[12px] ${
                activeTab === "draft" ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              Draft
            </span>
            <span className="text-[11px] font-normal text-[#666666]">
              {tabCounts.draft}
            </span>
          </button>

          {/* Archived */}
          <button
            onClick={() => setActiveTab("archived")}
            className={`flex flex-row items-center px-0.5 gap-2 h-[42px] transition-all ${
              activeTab === "archived"
                ? "border-b-2 border-[#000000]"
                : "text-[#666666] hover:text-[#000000]"
            }`}
          >
            <span
              className={`text-[12px] ${
                activeTab === "archived"
                  ? "font-semibold text-[#000000]"
                  : "font-normal text-[#666666]"
              }`}
            >
              Archived
            </span>
          </button>

          {/* Needs attention */}
          <button
            onClick={() => setActiveTab("needs_attention")}
            className={`flex flex-row items-center px-0.5 gap-2 h-[42px] transition-all ${
              activeTab === "needs_attention"
                ? "border-b-2 border-[#000000]"
                : "text-[#666666] hover:text-[#000000]"
            }`}
          >
            <span
              className={`text-[12px] ${
                activeTab === "needs_attention"
                  ? "font-semibold text-[#000000]"
                  : "font-normal text-[#666666]"
              }`}
            >
              Needs attention
            </span>
            <span className="text-[11px] font-normal text-[#666666]">
              {tabCounts.needs_attention}
            </span>
          </button>
        </div>

        {/* Product Search Input (with Clear search and ⌘K badge) */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 box-border flex flex-row items-center px-3 h-[40px] bg-[#FFFFFF] border border-[#BDBDBD] rounded-[8px] gap-2.5 transition-all focus-within:border-[#000000] focus-within:ring-1 focus-within:ring-[#000000]/10">
            <div className="h-4 w-4 rounded-full border border-[#666666] flex items-center justify-center shrink-0">
              <div className="h-1.5 w-1.5 rounded-full border border-[#666666]" />
            </div>
            <input
              type="text"
              placeholder="Search by product name, SKU, barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-[13px] leading-[19px] text-[#000000] placeholder-[#666666] border-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 shadow-none"
            />
            {!searchQuery && (
              <span className="text-[11px] font-normal text-[#666666] tracking-tight shrink-0">
                ⌘ K
              </span>
            )}
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer shrink-0 transition-colors"
            >
              Clear search
            </button>
          )}
        </div>

        {/* Filter Dropdowns + View Actions */}
        <div className="w-full flex flex-row justify-between items-center h-[34px] relative">
          {/* Left: Filter Buttons */}
          <div className="flex flex-row items-center gap-2">
            {/* Category Dropdown */}
            <div className="relative">
              <button
                onClick={() =>
                  setOpenDropdown(openDropdown === "category" ? null : "category")
                }
                className={`box-border flex flex-row items-center justify-between px-2.5 h-[34px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-medium transition-colors ${
                  selectedCategory !== "All categories"
                    ? "border border-[#000000] text-[#000000]"
                    : "border border-[#BDBDBD] text-[#000000] hover:border-[#666666]"
                }`}
              >
                <span>
                  {selectedCategory !== "All categories"
                    ? `Category · ${selectedCategory}`
                    : "Category"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] ml-2" />
              </button>

              {openDropdown === "category" && (
                <div className="absolute left-0 top-[40px] z-50 w-[216px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-xs">
                  <div className="px-2 py-1 text-[11px] font-medium text-[#666666] uppercase">
                    Category
                  </div>
                  {["All categories", "Bags & Luggage", "Apparel & Fashion", "Electronics", "Home & Kitchen"].map(
                    (cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedCategory(cat);
                          setOpenDropdown(null);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] hover:bg-[#F5F5F5] text-left ${
                          selectedCategory === cat ? "bg-[#F5F5F5] font-medium" : ""
                        }`}
                      >
                        <span>{cat}</span>
                        {selectedCategory === cat && <Check className="h-3.5 w-3.5 text-[#666666]" />}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Status Dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
                className={`box-border flex flex-row items-center justify-between px-2.5 h-[34px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-medium transition-colors ${
                  selectedStatus !== "All statuses"
                    ? "border border-[#000000] text-[#000000]"
                    : "border border-[#BDBDBD] text-[#000000] hover:border-[#666666]"
                }`}
              >
                <span>
                  {selectedStatus !== "All statuses" ? `Status · ${selectedStatus}` : "Status"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] ml-2" />
              </button>

              {openDropdown === "status" && (
                <div className="absolute left-0 top-[40px] z-50 w-[196px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-xs">
                  <div className="px-2 py-1 text-[11px] font-medium text-[#666666] uppercase">
                    Status
                  </div>
                  {["All statuses", "Active", "Draft", "Low stock", "Out of stock"].map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        setSelectedStatus(st);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] hover:bg-[#F5F5F5] text-left ${
                        selectedStatus === st ? "bg-[#F5F5F5] font-medium" : ""
                      }`}
                    >
                      <span>{st}</span>
                      {selectedStatus === st && <Check className="h-3.5 w-3.5 text-[#666666]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Channel Dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === "channel" ? null : "channel")}
                className={`box-border flex flex-row items-center justify-between px-2.5 h-[34px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-medium transition-colors ${
                  selectedChannel !== "All channels"
                    ? "border border-[#000000] text-[#000000]"
                    : "border border-[#BDBDBD] text-[#000000] hover:border-[#666666]"
                }`}
              >
                <span>
                  {selectedChannel !== "All channels" ? `Channel · ${selectedChannel}` : "Channel"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] ml-2" />
              </button>

              {openDropdown === "channel" && (
                <div className="absolute left-0 top-[40px] z-50 w-[196px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-xs">
                  <div className="px-2 py-1 text-[11px] font-medium text-[#666666] uppercase">
                    Channels
                  </div>
                  {["All channels", "Amazon", "Flipkart", "Shopify", "Meesho"].map((ch) => (
                    <button
                      key={ch}
                      onClick={() => {
                        setSelectedChannel(ch);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] hover:bg-[#F5F5F5] text-left ${
                        selectedChannel === ch ? "bg-[#F5F5F5] font-medium" : ""
                      }`}
                    >
                      <span>{ch}</span>
                      {selectedChannel === ch && <Check className="h-3.5 w-3.5 text-[#666666]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Inventory Dropdown (exact Screen 10 context menu spec) */}
            <div className="relative">
              <button
                onClick={() =>
                  setOpenDropdown(openDropdown === "inventory" ? null : "inventory")
                }
                className={`box-border flex flex-row items-center justify-between px-2.5 h-[34px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-medium transition-colors ${
                  selectedInventory !== "Any inventory"
                    ? "border border-[#000000] text-[#000000]"
                    : "border border-[#BDBDBD] text-[#000000] hover:border-[#666666]"
                }`}
              >
                <span>
                  {selectedInventory !== "Any inventory"
                    ? `Inventory · ${selectedInventory}`
                    : "Inventory"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#666666] ml-2" />
              </button>

              {/* Exact Figma Context Menu for Inventory */}
              {openDropdown === "inventory" && (
                <div className="absolute left-0 top-[40px] z-50 w-[224px] bg-[#FFFFFF] border border-[#EAEAEA] shadow-[0px_4px_12px_rgba(0,0,0,0.051)] rounded-[8px] p-1 flex flex-col gap-0.5">
                  <div className="px-2 py-1 text-[11px] font-medium leading-[16px] text-[#666666] uppercase">
                    INVENTORY
                  </div>

                  {[
                    { id: "Any inventory", label: "Any inventory" },
                    { id: "Healthy", label: "Healthy" },
                    { id: "Low stock", label: "Low stock" },
                    { id: "Out of stock", label: "Out of stock" },
                  ].map((opt) => {
                    const isSelected = selectedInventory === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setSelectedInventory(opt.id);
                          setOpenDropdown(null);
                        }}
                        className={`w-full h-[34px] flex items-center justify-between px-2 rounded-[4px] text-[12px] text-[#000000] transition-colors ${
                          isSelected ? "bg-[#F5F5F5]" : "hover:bg-[#F5F5F5]"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-[#666666]" />}
                      </button>
                    );
                  })}

                  <div className="h-[1px] bg-[#EAEAEA] my-1" />

                  <button
                    onClick={() => {
                      setOpenDropdown(null);
                      navigate(ROUTES.INVENTORY);
                    }}
                    className="w-full h-[34px] flex items-center justify-between px-2 rounded-[4px] text-[12px] text-[#000000] hover:bg-[#F5F5F5]"
                  >
                    <span>Advanced inventory filters</span>
                    <span className="text-[12px] text-[#666666]">→</span>
                  </button>
                </div>
              )}
            </div>

            {/* Product Type Dropdown */}
            <div className="relative">
              <button
                onClick={() =>
                  setOpenDropdown(openDropdown === "productType" ? null : "productType")
                }
                className="box-border flex flex-row items-center justify-between px-2.5 h-[34px] w-[115px] bg-[#FFFFFF] border border-[#BDBDBD] rounded-[8px] text-[12px] font-medium text-[#000000] hover:border-[#666666] transition-colors"
              >
                <span>Product type</span>
                <ChevronDown className="h-3 w-3 text-[#666666]" />
              </button>

              {openDropdown === "productType" && (
                <div className="absolute left-0 top-[40px] z-50 w-[196px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-xs">
                  <div className="px-2 py-1 text-[11px] font-medium text-[#666666] uppercase">
                    Product Type
                  </div>
                  {["All types", "Simple Product", "Variable (Matrix)", "Bundle"].map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setSelectedProductType(t);
                        setOpenDropdown(null);
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] hover:bg-[#F5F5F5] text-left"
                    >
                      <span>{t}</span>
                      {selectedProductType === t && <Check className="h-3.5 w-3.5 text-[#666666]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right: Saved views & Sort with Figma Dropdowns */}
          <div className="flex flex-row items-center gap-4 text-[12px] font-medium text-[#000000]">
            {/* Saved Views Button */}
            <button
              onClick={() => setIsSaveViewOpen(!isSaveViewOpen)}
              className="hover:text-[#666666] transition-colors cursor-pointer"
            >
              Saved views
            </button>

            {/* Sort Menu Trigger (Figma Screen 10 Sort Context Menu) */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === "sort" ? null : "sort")}
                className="flex items-center gap-1 hover:text-[#666666] transition-colors cursor-pointer"
              >
                <span>{selectedSort}</span>
                <span className="text-[11px]">↓</span>
              </button>

              {/* Exact Figma Sort Context Menu */}
              {openDropdown === "sort" && (
                <div className="absolute right-0 top-[35px] z-50 w-[204px] bg-[#FFFFFF] border border-[#EAEAEA] shadow-[0px_4px_12px_rgba(0,0,0,0.051)] rounded-[8px] p-1 flex flex-col gap-0.5">
                  <div className="px-2 py-1 text-[11px] font-medium leading-[16px] text-[#666666] uppercase">
                    SORT BY
                  </div>

                  {["Last updated", "Product name", "Inventory", "SKU"].map((item) => {
                    const isSelected = selectedSort === item;
                    return (
                      <button
                        key={item}
                        onClick={() => {
                          setSelectedSort(item);
                          setOpenDropdown(null);
                        }}
                        className={`w-full h-[34px] flex items-center justify-between px-2 rounded-[4px] text-[12px] text-[#000000] transition-colors ${
                          isSelected ? "bg-[#F5F5F5]" : "hover:bg-[#F5F5F5]"
                        }`}
                      >
                        <span>{item}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-[#666666]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3b. Active Filter Chips Strip (Screen 10 Filters & No Matches) */}
        {hasActiveFilters && (
          <div className="w-full flex flex-row items-center gap-3 h-[26px]">
            {activeChips.map((chip) => (
              <div
                key={chip.key}
                className="flex flex-row items-center px-2 py-1 gap-2 bg-[#F5F5F5] rounded-[4px] text-[11px] font-medium text-[#000000]"
              >
                <span>{chip.label}</span>
                <button
                  onClick={chip.onClear}
                  className="hover:opacity-70 transition-opacity"
                >
                  <X className="h-3 w-3 text-[#666666]" />
                </button>
              </div>
            ))}

            <button
              onClick={handleClearAllFilters}
              className="text-[12px] font-medium text-[#000000] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* 4. Master Catalog Architecture Strip & Quick Selection */}
      <div className="w-full flex flex-col items-start gap-1">
        <div className="w-full flex flex-row justify-between items-center text-[12px]">
          <div className="flex items-center gap-3">
            <span className="font-medium text-[#000000]">
              Master products are your single source of truth.
            </span>
            <button
              onClick={() => handleSelectAll(filteredProducts)}
              className="text-[11px] font-medium text-[#666666] hover:text-[#000000] underline cursor-pointer"
            >
              {selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0
                ? "Deselect all"
                : `Select all (${filteredProducts.length})`}
            </button>
          </div>
          <span className="text-[11px] font-normal text-[#666666]">
            Master Product → Variants → Channel Listings
          </span>
        </div>
        <div className="text-[11px] font-normal text-[#666666]">
          Channel listings inherit core product information while allowing marketplace-specific content.
        </div>
      </div>

      {/* =========================================================================
       * State 1: No Matches Filter Empty State (Figma Screen 10 Filters, No Matches)
       * ========================================================================= */}
      {isNoMatches ? (
        <div className="w-full box-border flex flex-col justify-center items-center h-[400px] border border-[#EAEAEA] rounded-[12px] bg-[#FFFFFF] gap-3.5 my-2">
          {/* Empty indicator circle */}
          <div className="flex flex-row justify-center items-center w-[36px] h-[36px] bg-[#F5F5F5] rounded-full">
            <div className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[#666666]" />
          </div>

          {/* Empty heading */}
          <h2 className="w-[560px] text-[18px] font-semibold leading-[26px] text-center text-[#000000]">
            No products match these filters.
          </h2>

          {/* Empty description */}
          <p className="w-[560px] text-[13px] font-normal leading-[19px] text-center text-[#666666]">
            Try a different filter combination to find the products you need.
          </p>

          {/* Clear filters button */}
          <div className="flex flex-row items-center pt-2">
            <button
              onClick={handleClearAllFilters}
              className="box-border flex flex-row justify-center items-center px-4 h-[36px] bg-[#FFFFFF] border border-[#666666] text-[#000000] rounded-[8px] text-[12px] font-semibold hover:bg-[#F5F5F5] transition-colors"
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        /* =========================================================================
         * State 2: Normal Filtered Catalog Grid with Figma Screen 10 Bulk Selection Toolbar
         * ========================================================================= */
        <>
          {/* Bulk Action Toolbar matching Figma Screen 10 */}
          {selectedProductIds.length > 0 && (
            <div className="w-full flex flex-col items-start gap-1">
              <div className="w-full box-border flex flex-row items-center px-3 h-[44px] bg-[#F5F5F5] rounded-[8px] gap-2 transition-all">
                {/* Selection Count */}
                <span className="text-[12px] font-semibold text-[#000000] min-w-[140px]">
                  {selectedProductIds.length} {selectedProductIds.length === 1 ? "product" : "products"} selected
                </span>

                {/* Edit Button */}
                <button
                  onClick={() => {
                    if (selectedProductIds.length === 1) {
                      navigate(`${ROUTES.PRODUCTS}/${selectedProductIds[0]}/edit`);
                    } else {
                      toast({
                        title: "Bulk Edit",
                        description: `Editing ${selectedProductIds.length} products.`,
                      });
                    }
                  }}
                  className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#EAEAEA] transition-colors cursor-pointer"
                >
                  Edit
                </button>

                {/* Publish Button */}
                <button
                  onClick={() => handleBulkAction("activate", "Publish")}
                  className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#EAEAEA] transition-colors cursor-pointer"
                >
                  Publish
                </button>

                {/* Inventory Button */}
                <button
                  onClick={() => {
                    toast({
                      title: "Bulk Inventory",
                      description: `Adjusting stock for ${selectedProductIds.length} products.`,
                    });
                  }}
                  className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#EAEAEA] transition-colors cursor-pointer"
                >
                  Inventory
                </button>

                {/* Export Button */}
                <button
                  onClick={() => {
                    toast({
                      title: "Export Started",
                      description: `Exporting CSV for ${selectedProductIds.length} products.`,
                    });
                  }}
                  className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#EAEAEA] transition-colors cursor-pointer"
                >
                  Export
                </button>

                {/* Archive Button */}
                <button
                  onClick={() => handleBulkAction("archive", "Archive")}
                  className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#EAEAEA] transition-colors cursor-pointer"
                >
                  Archive
                </button>

                {/* Selection Reset (X) */}
                <div className="flex-1 flex justify-end">
                  <button
                    onClick={handleClearSelection}
                    className="p-1 hover:bg-[#EAEAEA] rounded text-[#666666] hover:text-[#000000] transition-colors cursor-pointer"
                    title="Clear selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Selection Scope note */}
              <div className="w-full text-right text-[11px] font-normal leading-[16px] text-[#666666] pr-1">
                {selectedProductIds.length} selected products shown in this excerpt
              </div>
            </div>
          )}

          <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredProducts.map((p) => {
              const isSelected = selectedProductIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  onClick={(e) => handleToggleSelectProduct(p.id, e)}
                  className={`group relative box-border flex flex-col justify-between p-4 h-[262px] bg-[#FFFFFF] rounded-[12px] transition-all cursor-pointer ${
                    isSelected
                      ? "border-2 border-[#000000] shadow-[0px_2px_8px_rgba(0,0,0,0.06)]"
                      : "border border-[#EAEAEA] hover:border-[#BDBDBD]"
                  }`}
                >
                  {/* Selection Checkbox (always visible when selected, visible on card hover) */}
                  <div
                    onClick={(e) => handleToggleSelectProduct(p.id, e)}
                    className={`absolute top-3 left-3 z-10 w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#000000] border-[#000000] text-[#FFFFFF]"
                        : "border-[#BDBDBD] bg-[#FFFFFF] opacity-0 group-hover:opacity-100 hover:border-[#000000]"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>

                  {/* Product Details Section */}
                  <div className="w-full flex flex-col gap-6">
                    {/* Header: Name + Metadata + Status Pill */}
                    <div className="w-full flex flex-row items-start justify-between">
                      <div className={`flex flex-col gap-1 max-w-[220px] transition-all ${isSelected ? "pl-5" : "group-hover:pl-5"}`}>
                        <span className="text-[14px] font-semibold leading-[20px] text-[#000000] truncate">
                          {p.name}
                        </span>
                        <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                          {p.sku} · {p.variantsCount} variants
                        </span>
                      </div>

                      {/* Status Pill */}
                      <div
                        className={`box-border flex flex-row items-center px-2 py-0.5 gap-1.5 h-[26px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[4px] text-[11px] font-medium ${
                          p.statusVariant === "healthy"
                            ? "text-[#166534]"
                            : p.statusVariant === "warning"
                            ? "text-[#B45309]"
                            : p.statusVariant === "critical"
                            ? "text-[#B42318]"
                            : "text-[#6941C6]"
                        }`}
                      >
                        {p.statusVariant === "healthy" && (
                          <CheckCircle2 className="h-3 w-3 text-[#166534]" />
                        )}
                        {p.statusVariant === "warning" && (
                          <div className="h-3 w-3 rounded-full border border-dashed border-[#B45309]" />
                        )}
                        {p.statusVariant === "critical" && (
                          <Minus className="h-3 w-3 text-[#B42318]" />
                        )}
                        {p.statusVariant === "draft" && (
                          <div className="h-3 w-3 rounded-full border border-dashed border-[#6941C6]" />
                        )}
                        <span>{p.status}</span>
                      </div>
                    </div>

                    {/* Essential Info: Image + Operational State */}
                    <div className="w-full flex flex-row items-center gap-4">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-[88px] h-[88px] rounded-[8px] object-cover bg-[#F5F5F5] shrink-0 border border-[#EAEAEA]"
                        />
                      ) : (
                        <div className="w-[88px] h-[88px] rounded-[8px] bg-[#F5F5F5] flex flex-col items-center justify-center gap-1 shrink-0">
                          <span className="text-[22px] font-medium leading-[28px] text-[#666666]">
                            {p.initials}
                          </span>
                          <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
                            Image required
                          </span>
                        </div>
                      )}

                      <div className="flex-1 flex flex-col items-start gap-1">
                        <span className="text-[26px] font-semibold leading-[32px] tracking-tight text-[#000000]">
                          {p.stateValue}
                        </span>
                        <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                          {p.stateLabel}
                        </span>
                        <span className="text-[11px] font-normal leading-[16px] text-[#666666] truncate max-w-[200px]">
                          {p.channelDetail}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Context note */}
                  <div className="text-[12px] font-normal leading-[17px] text-[#333333] -mt-2">
                    {p.operationalContext}
                  </div>

                  {/* Primary Action Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(p.primaryActionPath);
                    }}
                    className="w-full h-[32px] flex flex-row justify-center items-center gap-2 bg-[#000000] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold hover:bg-[#1A1A1A] transition-colors"
                  >
                    <span>{p.primaryActionLabel}</span>
                    <span className="text-[13px]">→</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Catalog Pagination */}
          <div className="w-full flex flex-row justify-between items-center h-[34px] pt-2">
            <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
              Showing 1–{filteredProducts.length} of {filteredProducts.length} products
            </span>

            <div className="flex flex-row items-center gap-2">
              <button
                disabled
                className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#F5F5F5] border border-[#EAEAEA] rounded-[8px] text-[12px] font-semibold text-[#666666] cursor-not-allowed"
              >
                Previous
              </button>

              <div className="flex flex-row justify-center items-center w-[28px] h-[28px] bg-[#F5F5F5] rounded-[4px] text-[12px] font-semibold text-[#000000]">
                1
              </div>

              <button className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors">
                Next
              </button>

              <button className="box-border flex flex-row items-center justify-between px-2.5 h-[34px] w-[88px] bg-[#FFFFFF] border border-[#BDBDBD] rounded-[8px] text-[12px] font-medium text-[#000000]">
                <span>4 / page</span>
                <ChevronDown className="h-3 w-3 text-[#666666]" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* =========================================================================
       * Save View Modal / Configuration Box (Figma Screen 10 Bottom Right Popover)
       * ========================================================================= */}
      {isSaveViewOpen && (
        <div className="fixed bottom-8 right-8 z-50 w-[338px] bg-[#FFFFFF] border border-[#EAEAEA] shadow-[0px_4px_16px_rgba(0,0,0,0.12)] rounded-[8px] p-4 flex flex-col gap-4 text-xs animate-in fade-in slide-in-from-bottom-2">
          {/* Popover Heading */}
          <div className="w-full flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[#000000]">Save current view</h3>
            <button
              onClick={() => setIsSaveViewOpen(false)}
              className="text-[#666666] hover:text-[#000000]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* View Name Field */}
          <div className="w-full flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#000000]">View name</label>
            <input
              type="text"
              value={savedViewName}
              onChange={(e) => setSavedViewName(e.target.value)}
              className="w-full h-[40px] px-3 bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[13px] text-[#000000] outline-none"
            />
          </div>

          {/* Saved Configuration info */}
          <div className="w-full flex flex-col gap-1 text-[11px] text-[#666666]">
            <div>Filters · Inventory: {selectedInventory} · Status: {selectedStatus}</div>
            <div>Sort · {selectedSort}, newest first</div>
            <div>Available in this workspace</div>
          </div>

          {/* Save Actions */}
          <div className="w-full flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setIsSaveViewOpen(false)}
              className="px-4 h-[32px] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setIsSaveViewOpen(false);
              }}
              className="px-4 h-[32px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-[#1A1A1A] rounded-[8px]"
            >
              Save view
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
