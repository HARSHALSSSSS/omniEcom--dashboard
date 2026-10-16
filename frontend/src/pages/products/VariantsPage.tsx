import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ChevronsUpDown,
  Plus,
  Upload,
} from "lucide-react";
import { useProduct } from "@/hooks/useProducts";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/useToast";

export default function VariantsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: product } = useProduct(id || "");

  // Tab filter states matching Figma
  const [activeTab, setActiveTab] = useState<
    "all" | "active" | "low_stock" | "out_of_stock" | "draft" | "archived"
  >("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  // Filter dropdown toggles (simulated/interactive)
  const [activeFilterDropdown, setActiveFilterDropdown] = useState<string | null>(null);
  const [colorFilter, setColorFilter] = useState<string>("All");
  const [sizeFilter, setSizeFilter] = useState<string>("All");
  const [channelFilter, setChannelFilter] = useState<string>("All");
  const [inventoryFilter, setInventoryFilter] = useState<string>("All");

  // More menu state in top action buttons
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Fallback product info
  const productTitle = product?.title || "Premium Travel Bag";
  const productSku = product?.sku || "TRV-1042";
  const primaryImage =
    product?.media?.[0]?.url ||
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=400&q=80";

  // Exact 4 variants from Screen 14 specification
  const initialVariants = [
    {
      id: "var-1",
      variantName: "Black / Cabin",
      subtitle: "Color: Black · Size: Cabin",
      sku: "TRV-1042-B-C",
      color: "Black",
      size: "Cabin",
      inventory: 48,
      channels: "Amazon · Shopify · Meesho",
      channelList: ["Amazon", "Shopify", "Meesho"],
      status: "In stock",
      lifecycle: "Active",
    },
    {
      id: "var-2",
      variantName: "Black / Large",
      subtitle: "Color: Black · Size: Large",
      sku: "TRV-1042-B-L",
      color: "Black",
      size: "Large",
      inventory: 32,
      channels: "Amazon · Shopify · Meesho",
      channelList: ["Amazon", "Shopify", "Meesho"],
      status: "In stock",
      lifecycle: "Active",
    },
    {
      id: "var-3",
      variantName: "Navy / Cabin",
      subtitle: "Color: Navy · Size: Cabin",
      sku: "TRV-1042-N-C",
      color: "Navy",
      size: "Cabin",
      inventory: 28,
      channels: "Amazon · Shopify · Meesho",
      channelList: ["Amazon", "Shopify", "Meesho"],
      status: "In stock",
      lifecycle: "Active",
    },
    {
      id: "var-4",
      variantName: "Navy / Large",
      subtitle: "Color: Navy · Size: Large",
      sku: "TRV-1042-N-L",
      color: "Navy",
      size: "Large",
      inventory: 16,
      channels: "Amazon · Shopify · Meesho",
      channelList: ["Amazon", "Shopify", "Meesho"],
      status: "Low stock",
      lifecycle: "Active",
    },
  ];

  const [variantList] = useState(initialVariants);

  // Filtering
  const filteredVariants = variantList.filter((v) => {
    // Tab filter
    if (activeTab === "active" && v.lifecycle !== "Active") return false;
    if (activeTab === "low_stock" && v.status !== "Low stock") return false;
    if (activeTab === "out_of_stock" && v.status !== "Out of stock") return false;
    if (activeTab === "draft" && v.lifecycle !== "Draft") return false;
    if (activeTab === "archived" && v.lifecycle !== "Archived") return false;

    // Search query
    if (
      searchQuery &&
      !v.variantName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !v.sku.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Dropdown filters
    if (colorFilter !== "All" && v.color !== colorFilter) return false;
    if (sizeFilter !== "All" && v.size !== sizeFilter) return false;
    if (channelFilter !== "All" && !v.channelList.includes(channelFilter)) return false;
    if (inventoryFilter === "In stock" && v.status !== "In stock") return false;
    if (inventoryFilter === "Low stock" && v.status !== "Low stock") return false;

    return true;
  });

  const allSelected =
    filteredVariants.length > 0 &&
    filteredVariants.every((v) => selectedVariants.includes(v.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedVariants([]);
    } else {
      setSelectedVariants(filteredVariants.map((v) => v.id));
    }
  };

  const toggleSelectVariant = (vId: string) => {
    if (selectedVariants.includes(vId)) {
      setSelectedVariants(selectedVariants.filter((id) => id !== vId));
    } else {
      setSelectedVariants([...selectedVariants, vId]);
    }
  };

  const tabsConfig = [
    { id: "all", label: "All variants", count: 4 },
    { id: "active", label: "Active", count: 4 },
    { id: "low_stock", label: "Low stock", count: 1 },
    { id: "out_of_stock", label: "Out of stock" },
    { id: "draft", label: "Draft" },
    { id: "archived", label: "Archived" },
  ];

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* =======================================================================
       * 1. Master Product Identity Header
       * ======================================================================= */}
      <div className="w-full flex flex-col gap-5">
        {/* Local Breadcrumb */}
        <div className="flex flex-row items-center gap-1.5 text-[12px] leading-[17px] text-[#666666]">
          <button
            onClick={() => navigate(ROUTES.PRODUCTS)}
            className="hover:text-[#000000] transition-colors cursor-pointer"
          >
            Products
          </button>
          <span>/</span>
          <button
            onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}`)}
            className="hover:text-[#000000] transition-colors cursor-pointer"
          >
            {productTitle}
          </button>
          <span>/</span>
          <span className="text-[#000000] font-medium">Variants</span>
        </div>

        {/* Product Introduction & Actions */}
        <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          {/* Left: Media + Titles */}
          <div className="flex flex-row items-center gap-5">
            {/* 100x100 product thumbnail */}
            <div className="w-[100px] h-[100px] rounded-[4px] overflow-hidden bg-[#F5F5F5] border border-[#EAEAEA] shrink-0">
              <img
                src={primaryImage}
                alt={productTitle}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex flex-col items-start gap-1">
              <div className="flex flex-row items-center gap-3">
                <span className="text-[11px] font-normal leading-[16px] uppercase tracking-wider text-[#666666]">
                  MASTER PRODUCT
                </span>
                <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
                  Variants
                </h1>
              </div>
              <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Manage the sellable configurations and SKUs within this product.
              </p>
            </div>
          </div>

          {/* Right: Primary Action Buttons */}
          <div className="relative flex flex-row items-center gap-2 self-end md:self-auto shrink-0">
            {/* Add variant */}
            <button
              onClick={() => {
                toast({
                  title: "Add Variant",
                  description: "Opening new variant creator modal...",
                });
              }}
              className="box-border flex flex-row justify-center items-center px-4 h-9 gap-2 bg-[#000000] hover:bg-[#222222] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold leading-[17px] transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-[#FFFFFF]" />
              <span>Add variant</span>
            </button>

            {/* Import variants */}
            <button
              onClick={() => {
                toast({
                  title: "Import Variants",
                  description: "Opening CSV / spreadsheet variant import tool...",
                });
              }}
              className="box-border flex flex-row justify-center items-center px-4 h-9 gap-2 bg-[#FFFFFF] border border-[#666666] hover:bg-[#F5F5F5] text-[#000000] rounded-[8px] text-[12px] font-semibold leading-[17px] transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-[#000000]" />
              <span>Import variants</span>
            </button>

            {/* More */}
            <div className="relative">
              <button
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className="box-border flex flex-row justify-center items-center px-4 h-9 gap-1.5 bg-[#FFFFFF] border border-[#666666] hover:bg-[#F5F5F5] text-[#000000] rounded-[8px] text-[12px] font-semibold leading-[17px] transition-colors cursor-pointer"
              >
                <span>More</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#000000]" />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 top-11 z-30 w-48 rounded-lg border border-[#EAEAEA] bg-white p-1 shadow-lg text-[12px]">
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      toast({
                        title: "Export Matrix",
                        description: "Exporting all 4 SKU variant rows to CSV...",
                      });
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[#F5F5F5] text-[#000000]"
                  >
                    Export variants CSV
                  </button>
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      toast({
                        title: "Barcode Generation",
                        description: "Generating EAN/UPC barcodes for variants...",
                      });
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[#F5F5F5] text-[#000000]"
                  >
                    Generate barcodes
                  </button>
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}`);
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[#F5F5F5] text-[#666666]"
                  >
                    Return to product details
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =======================================================================
       * 2. Variant Context Strip (Figma Component)
       * ======================================================================= */}
      <div className="w-full box-border flex flex-col md:flex-row items-center justify-between p-4 bg-[#F5F5F5] rounded-[8px] gap-4">
        {/* Product summary */}
        <div className="flex flex-row items-center gap-4 flex-1">
          <div className="w-[100px] h-[100px] rounded-[4px] overflow-hidden bg-white border border-[#EAEAEA] shrink-0">
            <img
              src={primaryImage}
              alt={productTitle}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col items-start gap-1">
            <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
              {productTitle}
            </h3>
            <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
              {productSku}
            </span>
          </div>
        </div>

        {/* Metadata badges strip & View product button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-row items-center gap-3">
            {/* 4 variants */}
            <div className="box-border flex flex-row items-start px-2 py-1 bg-[#FFFFFF] rounded-[4px]">
              <span className="text-[11px] font-normal leading-[16px] text-[#000000]">
                4 variants
              </span>
            </div>
            <div className="w-[1px] h-4 bg-[#EAEAEA]" />

            {/* 3 channels */}
            <div className="box-border flex flex-row items-start px-2 py-1 bg-[#FFFFFF] rounded-[4px]">
              <span className="text-[11px] font-normal leading-[16px] text-[#000000]">
                3 channels
              </span>
            </div>
            <div className="w-[1px] h-4 bg-[#EAEAEA]" />

            {/* 124 available */}
            <div className="box-border flex flex-row items-start px-2 py-1 bg-[#FFFFFF] rounded-[4px]">
              <span className="text-[11px] font-normal leading-[16px] text-[#000000]">
                124 available
              </span>
            </div>
            <div className="w-[1px] h-4 bg-[#EAEAEA]" />

            {/* 1 low stock */}
            <div className="box-border flex flex-row items-start px-2 py-1 bg-[#FFFFFF] rounded-[4px]">
              <span className="text-[11px] font-normal leading-[16px] text-[#000000]">
                1 low stock
              </span>
            </div>
          </div>

          {/* View product Button */}
          <button
            onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}`)}
            className="box-border flex flex-row justify-center items-center px-4 h-9 ml-2 bg-[#FFFFFF] border border-[#666666] hover:bg-[#F5F5F5] rounded-[8px] text-[12px] font-semibold leading-[17px] text-[#000000] transition-colors cursor-pointer"
          >
            View product
          </button>
        </div>
      </div>

      {/* =======================================================================
       * 3. Variant List Controls: Tabs, Search & Filters
       * ======================================================================= */}
      <div className="w-full flex flex-col items-start gap-3">
        {/* Variant Tabs */}
        <div className="w-full flex flex-row items-start gap-7 border-b border-[#EAEAEA] h-[42px] overflow-x-auto">
          {tabsConfig.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() =>
                  setActiveTab(
                    tab.id as
                      | "all"
                      | "active"
                      | "low_stock"
                      | "out_of_stock"
                      | "draft"
                      | "archived"
                  )
                }
                className={`flex flex-row items-center gap-1.5 px-0.5 h-[42px] transition-all text-[12px] cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-b-2 border-[#000000] font-semibold text-[#000000]"
                    : "border-b-0 text-[#666666] hover:text-[#000000] font-normal"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[11px] ${
                      isActive ? "text-[#666666]" : "text-[#666666]"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Row */}
        <div className="w-full flex flex-col sm:flex-row items-center gap-2">
          {/* Search by variant input */}
          <div className="flex-1 w-full box-border flex flex-row items-center px-3 h-9 bg-[#F5F5F5] rounded-[8px] gap-2">
            <Search className="h-4 w-4 text-[#666666] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by variant, SKU, barcode…"
              className="flex-1 bg-transparent border-0 outline-none text-[12px] leading-[17px] text-[#000000] placeholder-[#666666]"
            />
            <span className="text-[11px] font-normal leading-[16px] text-[#666666] shrink-0">
              ⌘ K
            </span>
          </div>

          {/* Bulk actions */}
          <button
            onClick={() => {
              if (selectedVariants.length === 0) {
                toast({
                  title: "Select Variants",
                  description: "Please select variants to perform bulk operations.",
                });
              } else {
                toast({
                  title: "Bulk Actions",
                  description: `Bulk actions available for ${selectedVariants.length} selected SKU(s).`,
                });
              }
            }}
            className="box-border flex flex-row justify-center items-center px-4 h-9 bg-[#FFFFFF] border border-[#666666] hover:bg-[#F5F5F5] rounded-[8px] text-[12px] font-semibold leading-[17px] text-[#000000] transition-colors cursor-pointer shrink-0"
          >
            Bulk actions
          </button>
        </div>

        {/* Filters Row */}
        <div className="w-full flex flex-row flex-wrap items-center gap-2">
          {/* Color filter */}
          <div className="relative">
            <button
              onClick={() =>
                setActiveFilterDropdown(
                  activeFilterDropdown === "color" ? null : "color"
                )
              }
              className={`box-border flex flex-row items-center px-2.5 h-[34px] gap-2 bg-[#FFFFFF] border rounded-[8px] text-[12px] font-medium transition-colors cursor-pointer ${
                colorFilter !== "All"
                  ? "border-[#000000] text-[#000000]"
                  : "border-[#BDBDBD] text-[#000000]"
              }`}
            >
              <span>Color{colorFilter !== "All" ? `: ${colorFilter}` : ""}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-[#666666]" />
            </button>
            {activeFilterDropdown === "color" && (
              <div className="absolute left-0 top-10 z-20 w-36 bg-white border border-[#EAEAEA] rounded-lg shadow-md p-1 text-[12px]">
                {["All", "Black", "Navy"].map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColorFilter(c);
                      setActiveFilterDropdown(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#F5F5F5] text-[#000000]"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Size filter */}
          <div className="relative">
            <button
              onClick={() =>
                setActiveFilterDropdown(
                  activeFilterDropdown === "size" ? null : "size"
                )
              }
              className={`box-border flex flex-row items-center px-2.5 h-[34px] gap-2 bg-[#FFFFFF] border rounded-[8px] text-[12px] font-medium transition-colors cursor-pointer ${
                sizeFilter !== "All"
                  ? "border-[#000000] text-[#000000]"
                  : "border-[#BDBDBD] text-[#000000]"
              }`}
            >
              <span>Size{sizeFilter !== "All" ? `: ${sizeFilter}` : ""}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-[#666666]" />
            </button>
            {activeFilterDropdown === "size" && (
              <div className="absolute left-0 top-10 z-20 w-36 bg-white border border-[#EAEAEA] rounded-lg shadow-md p-1 text-[12px]">
                {["All", "Cabin", "Large"].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSizeFilter(s);
                      setActiveFilterDropdown(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#F5F5F5] text-[#000000]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Channel filter */}
          <div className="relative">
            <button
              onClick={() =>
                setActiveFilterDropdown(
                  activeFilterDropdown === "channel" ? null : "channel"
                )
              }
              className={`box-border flex flex-row items-center px-2.5 h-[34px] gap-2 bg-[#FFFFFF] border rounded-[8px] text-[12px] font-medium transition-colors cursor-pointer ${
                channelFilter !== "All"
                  ? "border-[#000000] text-[#000000]"
                  : "border-[#BDBDBD] text-[#000000]"
              }`}
            >
              <span>
                Channel{channelFilter !== "All" ? `: ${channelFilter}` : ""}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-[#666666]" />
            </button>
            {activeFilterDropdown === "channel" && (
              <div className="absolute left-0 top-10 z-20 w-36 bg-white border border-[#EAEAEA] rounded-lg shadow-md p-1 text-[12px]">
                {["All", "Amazon", "Shopify", "Meesho"].map((ch) => (
                  <button
                    key={ch}
                    onClick={() => {
                      setChannelFilter(ch);
                      setActiveFilterDropdown(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#F5F5F5] text-[#000000]"
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Inventory filter */}
          <div className="relative">
            <button
              onClick={() =>
                setActiveFilterDropdown(
                  activeFilterDropdown === "inventory" ? null : "inventory"
                )
              }
              className={`box-border flex flex-row items-center px-2.5 h-[34px] gap-2 bg-[#FFFFFF] border rounded-[8px] text-[12px] font-medium transition-colors cursor-pointer ${
                inventoryFilter !== "All"
                  ? "border-[#000000] text-[#000000]"
                  : "border-[#BDBDBD] text-[#000000]"
              }`}
            >
              <span>
                Inventory{inventoryFilter !== "All" ? `: ${inventoryFilter}` : ""}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-[#666666]" />
            </button>
            {activeFilterDropdown === "inventory" && (
              <div className="absolute left-0 top-10 z-20 w-36 bg-white border border-[#EAEAEA] rounded-lg shadow-md p-1 text-[12px]">
                {["All", "In stock", "Low stock"].map((inv) => (
                  <button
                    key={inv}
                    onClick={() => {
                      setInventoryFilter(inv);
                      setActiveFilterDropdown(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#F5F5F5] text-[#000000]"
                  >
                    {inv}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =======================================================================
       * 4. Variant Table
       * ======================================================================= */}
      <div className="w-full box-border flex flex-col items-start border border-[#EAEAEA] rounded-[12px] overflow-hidden bg-white">
        {/* Table Header Columns */}
        <div className="w-full box-border flex flex-row items-center px-4 h-10 bg-[#F5F5F5] border-b border-[#EAEAEA] text-[11px] font-medium leading-[16px] text-[#666666] gap-3">
          {/* Checkbox */}
          <div className="w-4 flex justify-center items-center shrink-0">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded-[3px] border-[#BDBDBD] cursor-pointer"
            />
          </div>

          {/* Variant */}
          <div className="flex-1 min-w-[200px]">Variant</div>

          {/* SKU */}
          <div className="w-[100px] shrink-0">SKU</div>

          {/* Inventory */}
          <div className="w-[100px] shrink-0">Inventory</div>

          {/* Channels */}
          <div className="w-[100px] shrink-0">Channels</div>

          {/* Status */}
          <div className="w-[112px] shrink-0">Status</div>

          {/* Lifecycle */}
          <div className="w-[112px] shrink-0">Lifecycle</div>

          {/* Actions */}
          <div className="w-[72px] shrink-0 text-right">Actions</div>
        </div>

        {/* Table Rows */}
        <div className="w-full divide-y divide-[#EAEAEA]">
          {filteredVariants.map((item) => {
            const isChecked = selectedVariants.includes(item.id);
            return (
              <div
                key={item.id}
                className="w-full box-border flex flex-row items-center px-4 py-3 bg-[#FFFFFF] gap-3 hover:bg-[#FAFAFA] transition-colors text-[12px] leading-[17px]"
              >
                {/* Checkbox */}
                <div className="w-4 flex justify-center items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelectVariant(item.id)}
                    className="w-4 h-4 rounded-[3px] border-[#BDBDBD] cursor-pointer"
                  />
                </div>

                {/* Variant Identity */}
                <div className="flex-1 min-w-[200px] flex flex-row items-center gap-3">
                  <div className="w-8 h-8 rounded-[4px] bg-[#F5F5F5] border border-[#EAEAEA] overflow-hidden shrink-0">
                    <img
                      src={primaryImage}
                      alt={item.variantName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium text-[#000000]">
                      {item.variantName}
                    </span>
                    <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
                      {item.subtitle}
                    </span>
                  </div>
                </div>

                {/* SKU */}
                <div className="w-[100px] shrink-0 font-normal text-[#666666]">
                  {item.sku}
                </div>

                {/* Inventory */}
                <div className="w-[100px] shrink-0 font-medium text-[#000000]">
                  {item.inventory}
                </div>

                {/* Channels */}
                <div className="w-[100px] shrink-0 font-normal text-[#666666]">
                  {item.channels}
                </div>

                {/* Status Badge */}
                <div className="w-[112px] shrink-0 flex items-center">
                  <span className="box-border px-2 py-1 bg-[#F5F5F5] rounded-[4px] text-[11px] font-normal leading-[16px] text-[#000000]">
                    {item.status}
                  </span>
                </div>

                {/* Lifecycle Badge */}
                <div className="w-[112px] shrink-0 flex items-center">
                  <span className="box-border px-2 py-1 bg-[#F5F5F5] rounded-[4px] text-[11px] font-normal leading-[16px] text-[#000000]">
                    {item.lifecycle}
                  </span>
                </div>

                {/* Edit Action Button */}
                <div className="w-[72px] shrink-0 flex justify-end">
                  <button
                    onClick={() => {
                      toast({
                        title: "Edit Variant",
                        description: `Editing variant ${item.variantName} (${item.sku})`,
                      });
                    }}
                    className="box-border flex flex-row items-center px-2.5 h-[34px] gap-2 bg-[#FFFFFF] border border-[#BDBDBD] hover:bg-[#F5F5F5] rounded-[8px] text-[12px] font-medium text-[#000000] transition-colors cursor-pointer"
                  >
                    <span>Edit</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-[#666666]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Variant Table Footer */}
        <div className="w-full box-border flex flex-row justify-between items-center px-4 py-3 border-t border-[#EAEAEA] bg-white text-[12px]">
          <span className="text-[#666666]">
            Showing 1–{filteredVariants.length} of {variantList.length} variants
          </span>

          {/* Page Controls */}
          <div className="flex flex-row items-center gap-2">
            <button
              disabled
              className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#F5F5F5] border border-[#EAEAEA] rounded-[8px] text-[12px] font-semibold text-[#666666] cursor-not-allowed opacity-60"
            >
              Previous
            </button>
            <div className="flex flex-row justify-center items-center w-7 h-7 bg-[#F5F5F5] rounded-[4px] text-[11px] font-medium text-[#000000]">
              1
            </div>
            <button
              disabled
              className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] cursor-pointer hover:bg-[#F5F5F5]"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
