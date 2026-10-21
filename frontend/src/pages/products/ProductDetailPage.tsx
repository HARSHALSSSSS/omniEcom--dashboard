import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  AlertCircle,
  ChevronDown,
  RefreshCw,
  FilePenLine,
  PackagePlus,
} from "lucide-react";
import { useProduct } from "@/hooks/useProducts";
import { ROUTES } from "@/constants/routes";
import { toast } from "@/hooks/useToast";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "overview" | "variants" | "inventory" | "listings" | "content" | "activity"
  >("overview");
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Incomplete / unpublished state can be toggled via ?state=incomplete or product data or UI toggle
  const isDraftState =
    searchParams.get("state") === "incomplete" ||
    searchParams.get("state") === "draft" ||
    id === "draft" ||
    id === "incomplete";

  const toggleDraftState = () => {
    const next = new URLSearchParams(searchParams);
    if (isDraftState) {
      next.delete("state");
    } else {
      next.set("state", "incomplete");
    }
    setSearchParams(next);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: product, isLoading } = useProduct(id || "prod-1");

  // Derive product fields dynamically based on the current product
  const productTitle = product?.title || (id === "prod-2" ? "Classic Backpack" : id === "prod-3" ? "Cotton Overshirt" : id === "prod-4" ? "Travel Organizer Set" : "Premium Travel Bag");
  const productSku = product?.sku || (id === "prod-2" ? "BP-1021" : id === "prod-3" ? "OS-2048" : id === "prod-4" ? "ORG-3102" : "TRV-1042");
  const productCategory = product?.category || (id === "prod-3" ? "Apparel & Fashion" : "Bags & Luggage");
  const productBrand = product?.brand || "Nova Living";
  const productDescription = product?.description || (id === "prod-2" ? "Everyday minimalist classic backpack featuring padded straps, dual water bottle holders, and durable canvas build." : "A durable premium travel bag designed for short business trips and weekend travel.");
  const productStatus = isDraftState || product?.status === "incomplete" ? "Draft" : product?.status === "active" ? "Active" : "Active";
  const productVariantsCount = product?.variants?.length ?? (id === "prod-2" ? 6 : id === "prod-3" ? 8 : 4);
  const productChannelsCount = isDraftState ? 0 : (product?.channels?.length ?? 3);
  const lastUpdatedText = "Last updated 2 hours ago";

  // Gallery image thumbnails matching product media or defaults
  const productMediaList = product?.media && product.media.length > 0
    ? product.media.map((m, idx) => ({
        id: m.id || `img-${idx}`,
        url: m.url,
        isPrimary: m.isPrimary ?? idx === 0,
        label: m.isPrimary ? "Primary image" : undefined,
      }))
    : [
        {
          id: "img-1",
          url: id === "prod-2"
            ? "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=400&q=80"
            : id === "prod-3"
            ? "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=400&q=80"
            : "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=400&q=80",
          isPrimary: true,
          label: "Primary image",
        },
      ];

  const galleryImages = productMediaList;

  // Variants list dynamically mapped or fallback matching Screen 11 Table
  const variantsData = product?.variants && product.variants.length > 0
    ? product.variants.map((v) => ({
        variant: v.title,
        sku: v.sku,
        size: v.options?.Size || v.options?.Capacity || "Standard",
        color: v.options?.Color || "Default",
        inventory: String(v.inventory ?? 0),
        status: v.status === "active" ? "Active" : "Inactive",
      }))
    : [
        {
          variant: "Black / Cabin",
          sku: `${productSku}-B-C`,
          size: "Cabin",
          color: "Black",
          inventory: "48",
          status: "Active",
        },
        {
          variant: "Black / Large",
          sku: `${productSku}-B-L`,
          size: "Large",
          color: "Black",
          inventory: "32",
          status: "Active",
        },
      ];

  // Sales Channels data matching Screen 11
  const channelsData = [
    {
      channel: "Amazon",
      listingStatus: "Listing Active",
      lastSync: "18 min ago",
      action: "View listing →",
      isActionMuted: false,
    },
    {
      channel: "Shopify",
      listingStatus: "Listing Active",
      lastSync: "32 min ago",
      action: "View listing →",
      isActionMuted: false,
    },
    {
      channel: "Meesho",
      listingStatus: "Listing Needs attention",
      lastSync: "1 hr ago",
      action: "Review →",
      isActionMuted: false,
    },
  ];

  // Content readiness rows matching Screen 11
  const readinessRows = [
    { label: "Title", status: "Complete" },
    { label: "Description", status: "Complete" },
    { label: "Images", status: "Complete" },
    { label: "Attributes", status: "Complete" },
    { label: "Marketplace content", status: "1 channel needs review" },
  ];

  // Activity log items matching Screen 11
  const activityLogs = [
    { time: "2h ago", event: "Inventory updated from Amazon" },
    { time: "5h ago", event: "Product content edited" },
    { time: "Yesterday", event: "Meesho listing synchronization failed" },
    { time: "Yesterday", event: "Variant added" },
  ];

  if (isLoading && !product) {
    return (
      <div className="flex h-96 items-center justify-center font-['Inter',sans-serif]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#EAEAEA] border-t-[#000000]" />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* Breadcrumb Path & State Switcher */}
      <div className="w-full flex items-center justify-between text-[12px] font-normal leading-[17px]">
        <div className="flex items-center gap-2 text-[#666666]">
          <button
            onClick={() => navigate(ROUTES.PRODUCTS)}
            className="hover:text-[#000000] transition-colors cursor-pointer"
          >
            Products
          </button>
          <span className="text-[#BDBDBD]">/</span>
          <span className="text-[#000000] font-medium">{productTitle}</span>
        </div>
        <button
          onClick={toggleDraftState}
          className="text-[11px] font-medium px-2 py-0.5 rounded border border-[#EAEAEA] bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#000000] transition-colors cursor-pointer"
          title="Toggle between Published (Active) and Incomplete / Unpublished (Draft) Figma states"
        >
          {isDraftState ? "View Published state" : "View Incomplete / Unpublished state"}
        </button>
      </div>

      {/* 1. Master Product Identity Header */}
      <div className="w-full flex flex-col md:flex-row items-start justify-between gap-6 pb-2">
        <div className="flex flex-row items-center gap-5">
          {/* Product Media Avatar */}
          <img
            src={galleryImages[0].url}
            alt={productTitle}
            className="w-[100px] h-[100px] rounded-[8px] object-cover bg-[#F5F5F5] border border-[#EAEAEA] shrink-0"
          />

          <div className="flex flex-col items-start gap-1">
            {/* Step Eyebrow / Category */}
            <span className="text-[10px] font-medium leading-[12px] uppercase text-[#707070]">
              {productCategory}
            </span>

            {/* Product Name */}
            <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
              {productTitle}
            </h1>

            {/* SKU and Status pill */}
            <div className="flex flex-row items-center gap-3 text-[12px] leading-[17px]">
              <span className="text-[#666666]">SKU family: {productSku}</span>
              <span className="box-border px-2 py-0.5 border border-[#EAEAEA] rounded-[4px] text-[11px] font-medium text-[#000000]">
                {productStatus}
              </span>
              <span className="text-[#666666]">{productCategory}</span>
            </div>

            {/* Sub-copy metrics */}
            <div className="text-[12px] font-normal leading-[17px] text-[#666666]">
              {productVariantsCount} variants · {productChannelsCount} sales channels · {lastUpdatedText}
            </div>
          </div>
        </div>

        {/* Header Right Action Buttons */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex flex-row items-center gap-2">
            <button
              onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
              className="px-4 h-[36px] bg-[#000000] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold hover:bg-[#1A1A1A] transition-colors"
            >
              Edit product
            </button>
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className="px-4 h-[36px] bg-[#FFFFFF] border border-[#666666] text-[#000000] rounded-[8px] text-[12px] font-semibold hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>More</span>
                <ChevronDown className="h-3 w-3 text-[#666666]" />
              </button>
              {isMoreMenuOpen && (
                <div className="absolute right-0 top-[42px] z-50 w-[172px] bg-[#FFFFFF] border border-[#EAEAEA] shadow-[0px_4px_16px_rgba(0,0,0,0.08)] rounded-[10px] p-1.5 flex flex-col font-['Inter',sans-serif]">
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      toast({
                        title: "Product Duplicated",
                        description: `Created duplicate draft of ${productTitle}.`,
                      });
                    }}
                    className="w-full text-left px-3 py-2 text-[14px] leading-[20px] font-normal text-[#000000] hover:bg-[#F5F5F5] rounded-[6px] transition-colors cursor-pointer"
                  >
                    Duplicate
                  </button>

                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      toast({
                        title: "Product Archived",
                        description: `${productTitle} has been archived.`,
                      });
                    }}
                    className="w-full text-left px-3 py-2 text-[14px] leading-[20px] font-normal text-[#000000] hover:bg-[#F5F5F5] rounded-[6px] transition-colors cursor-pointer"
                  >
                    Archive
                  </button>

                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      toast({
                        title: "Export Started",
                        description: `Exporting catalog data for ${productSku}.`,
                      });
                    }}
                    className="w-full text-left px-3 py-2 text-[14px] leading-[20px] font-normal text-[#000000] hover:bg-[#F5F5F5] rounded-[6px] transition-colors cursor-pointer"
                  >
                    Export
                  </button>

                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setActiveTab("activity");
                    }}
                    className="w-full text-left px-3 py-2 text-[14px] leading-[20px] font-normal text-[#000000] hover:bg-[#F5F5F5] rounded-[6px] transition-colors cursor-pointer"
                  >
                    View activity
                  </button>
                </div>
              )}
            </div>
          </div>
          {isDraftState ? (
            <button
              onClick={() => {
                toast({
                  title: "Product Incomplete",
                  description: "Complete all missing attributes before publishing.",
                });
              }}
              className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
            >
              Publish product
            </button>
          ) : (
            <button
              onClick={() => setActiveTab("listings")}
              className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
            >
              Manage listings
            </button>
          )}
        </div>
      </div>

      {/* 2. Operational Health Metric Strip (border top & bottom) */}
      <div className="w-full flex flex-col md:flex-row items-stretch py-5 border-y border-[#EAEAEA] gap-6">
        {/* Master Product Health */}
        <div className="flex-1 max-w-[480px] flex flex-col items-start gap-1">
          <div className="flex flex-row items-center gap-3.5 text-[12px]">
            <span className="text-[#666666]">Product health</span>
            <span className="font-semibold text-[#000000]">
              {isDraftState ? "Incomplete" : "Ready"}
            </span>
          </div>
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
            {isDraftState
              ? "Add missing attributes to improve listing readiness."
              : "Core information is complete and this product is available across connected channels."}
          </p>
        </div>

        {/* Health Metric 1: Inventory */}
        <div className="flex-1 flex flex-col items-start gap-1 pl-6 border-l border-[#EAEAEA]">
          <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
            Inventory
          </span>
          <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
            124 units
          </span>
          <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
            Healthy
          </span>
        </div>

        {/* Health Metric 2: Variants */}
        <div className="flex-1 flex flex-col items-start gap-1 pl-6 border-l border-[#EAEAEA]">
          <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
            Variants
          </span>
          <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
            4
          </span>
          <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
            Sellable SKUs
          </span>
        </div>

        {/* Health Metric 3: Channels */}
        <div className="flex-1 flex flex-col items-start gap-1 pl-6 border-l border-[#EAEAEA]">
          <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
            Channels
          </span>
          <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
            {isDraftState ? "0 connected" : "3 connected"}
          </span>
          <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
            {isDraftState ? "Not published yet" : "2 Active · 1 Attention"}
          </span>
        </div>
      </div>

      {/* 3. Needs Attention Channel Alert (Only for published active state) */}
      {!isDraftState && (
        <div className="w-full flex flex-row items-center justify-between text-[12px] py-1">
          <div className="flex flex-row items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#666666]" />
            <span className="font-semibold text-[#000000]">Needs attention</span>
            <span className="text-[#666666]">Meesho listing requires review.</span>
          </div>
          <button
            onClick={() => setActiveTab("listings")}
            className="font-semibold text-[#000000] hover:underline"
          >
            Review →
          </button>
        </div>
      )}

      {/* 4. Product Sub-Tabs */}
      <div className="w-full flex flex-row items-start gap-7 border-b border-[#EAEAEA] h-[42px]">
        {[
          { id: "overview", label: "Overview" },
          { id: "variants", label: "Variants" },
          { id: "inventory", label: "Inventory" },
          { id: "listings", label: "Listings" },
          { id: "content", label: "Content" },
          { id: "activity", label: "Activity" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as
                    | "overview"
                    | "variants"
                    | "inventory"
                    | "listings"
                    | "content"
                    | "activity"
                )
              }
              className={`flex flex-row items-center px-0.5 h-[42px] transition-all text-[12px] cursor-pointer ${
                isActive
                  ? "border-b-2 border-[#000000] font-semibold text-[#000000]"
                  : "border-b-0 text-[#666666] hover:text-[#000000] font-normal"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 5. Main Content Area: 2 Columns (Left Main Detail + Right Operational Panel) */}
      <div className="w-full flex flex-col lg:flex-row items-start gap-8">
        {/* =========================================================================
         * Left Main Detail Column (width ~832px or flex-1)
         * ========================================================================= */}
        <div className="flex-1 w-full flex flex-col items-start gap-7">
          {activeTab === "activity" ? (
            /* =======================================================================
             * SCREEN 11 — PRODUCT DETAILS / ACTIVITY
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-7">
              {/* Product activity section */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Product activity
                  </h2>
                  <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Recent changes for this master product and its connected representations.
                  </p>
                </div>

                {/* Activity scope controls */}
                <div className="w-full flex flex-row items-center gap-6 text-[12px] leading-[17px] pt-1">
                  <span className="font-semibold text-[#000000] cursor-pointer">
                    All activity
                  </span>
                  <span className="font-normal text-[#666666]">
                    Master product · Variants · Channels
                  </span>
                </div>

                {/* Activity log rows */}
                <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA]">
                  {/* Event 1 */}
                  <div className="w-full flex flex-row items-center py-[22px] gap-4 text-[12px] leading-[17px]">
                    <RefreshCw className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                    <span className="w-[88px] text-[#666666] shrink-0">2h ago</span>
                    <span className="flex-1 text-[#000000]">Inventory updated from Amazon</span>
                    <span className="w-[90px] text-[#666666] text-right shrink-0">Inventory</span>
                  </div>

                  {/* Event 2 */}
                  <div className="w-full flex flex-row items-center py-[22px] gap-4 text-[12px] leading-[17px]">
                    <FilePenLine className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                    <span className="w-[88px] text-[#666666] shrink-0">5h ago</span>
                    <span className="flex-1 text-[#000000]">Product content edited</span>
                    <span className="w-[90px] text-[#666666] text-right shrink-0">Content</span>
                  </div>

                  {/* Event 3 */}
                  <div className="w-full flex flex-row items-center py-[22px] gap-4 text-[12px] leading-[17px]">
                    <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                    <span className="w-[88px] text-[#666666] shrink-0">Yesterday</span>
                    <span className="flex-1 text-[#000000]">Meesho listing synchronization failed</span>
                    <span className="w-[90px] text-[#666666] text-right shrink-0">Listings</span>
                  </div>

                  {/* Event 4 */}
                  <div className="w-full flex flex-row items-center py-[22px] gap-4 text-[12px] leading-[17px]">
                    <PackagePlus className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                    <span className="w-[88px] text-[#666666] shrink-0">Yesterday</span>
                    <span className="flex-1 text-[#000000]">Variant added</span>
                    <span className="w-[90px] text-[#666666] text-right shrink-0">Variants</span>
                  </div>
                </div>
              </div>

              {/* Attention notice banner */}
              <div className="w-full box-border flex flex-row items-center p-4 bg-[#F5F5F5] rounded-[8px] gap-3">
                <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                <div className="flex-1 flex flex-col items-start gap-1">
                  <span className="text-[12px] font-semibold text-[#000000]">
                    Meesho listing requires review
                  </span>
                  <span className="text-[12px] font-normal text-[#666666]">
                    The synchronization failure is the outstanding channel issue for this product.
                  </span>
                </div>
                <button
                  onClick={() => navigate(ROUTES.LISTINGS)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  Review →
                </button>
              </div>

              <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Showing all 4 recent events.
              </span>
            </div>
          ) : activeTab === "content" ? (
            /* =======================================================================
             * SCREEN 11 — PRODUCT DETAILS / CONTENT
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-7">
              {/* Product information section */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Product information
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Master information · Single source of truth
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Edit information
                  </button>
                </div>

                {/* Master fields grid */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-1">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Product name
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productTitle}
                    </span>
                  </div>

                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Product type
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      Physical product
                    </span>
                  </div>

                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Category
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productCategory}
                    </span>
                  </div>

                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Master SKU
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productSku}
                    </span>
                  </div>

                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Brand
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productBrand}
                    </span>
                  </div>
                </div>

                <div className="w-full flex flex-col items-start gap-1 pt-1">
                  <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Description
                  </span>
                  <p className="text-[12px] font-normal leading-[17px] text-[#000000]">
                    {productDescription}
                  </p>
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Product media section */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Product media
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      6 images
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Manage media
                  </button>
                </div>

                {/* Images strip */}
                <div className="w-full flex flex-row items-start gap-3 overflow-x-auto pb-1">
                  {galleryImages.map((img) => (
                    <div key={img.id} className="flex flex-col items-start gap-1.5 shrink-0">
                      <div className="w-[110px] h-[92px] rounded-[4px] overflow-hidden bg-[#F5F5F5] border border-[#EAEAEA]">
                        <img
                          src={img.url}
                          alt={img.label || productTitle}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {img.isPrimary && (
                        <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
                          Primary image
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Master attributes section */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Master attributes
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Core product attributes are complete.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Edit information
                  </button>
                </div>

                {/* Attributes Table */}
                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="flex-1 min-w-[120px]">Attribute</div>
                    <div className="flex-1 min-w-[120px]">Master value</div>
                    <div className="flex-1 min-w-[120px]">Readiness</div>
                  </div>

                  <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">
                    {[
                      { attribute: "Category", masterValue: "Travel Accessories", readiness: "Complete" },
                      { attribute: "Brand", masterValue: "Urban Carry", readiness: "Complete" },
                      { attribute: "Product type", masterValue: "Physical product", readiness: "Complete" },
                    ].map((row) => (
                      <div
                        key={row.attribute}
                        className="w-full flex flex-row items-center px-3 h-[50px] text-[12px] leading-[17px]"
                      >
                        <div className="flex-1 min-w-[120px] font-medium text-[#000000]">
                          {row.attribute}
                        </div>
                        <div className="flex-1 min-w-[120px] text-[#666666] font-normal">
                          {row.masterValue}
                        </div>
                        <div className="flex-1 min-w-[120px] text-[#000000] font-normal">
                          {row.readiness}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Marketplace content section */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Marketplace content
                  </h2>
                  <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Channel-specific content is separate from your master information.
                  </p>
                </div>

                {/* Attention notice banner */}
                <div className="w-full box-border flex flex-row items-center p-4 bg-[#F5F5F5] rounded-[8px] gap-3">
                  <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                  <div className="flex-1 flex flex-col items-start gap-1">
                    <span className="text-[12px] font-semibold text-[#000000]">
                      Meesho marketplace content needs review
                    </span>
                    <span className="text-[12px] font-normal text-[#666666]">
                      1 channel needs review. Master title, description, images and attributes are complete.
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(ROUTES.LISTINGS)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Review →
                  </button>
                </div>

                <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  Resolve the Meesho review in its channel listing. Your master product remains catalog-ready.
                </p>

                <button
                  onClick={() => navigate(ROUTES.LISTINGS)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  Improve content →
                </button>
              </div>
            </div>
          ) : activeTab === "listings" ? (
            /* =======================================================================
             * SCREEN 11 — PRODUCT DETAILS / LISTINGS
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-7">
              {/* Channel listings section */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Channel listings
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Where this master product is currently published.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(ROUTES.LISTINGS)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Manage listings
                  </button>
                </div>

                {/* Listings Table */}
                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="w-[110px]">Channel</div>
                    <div className="flex-1 min-w-[200px]">Listing status</div>
                    <div className="w-[116px]">Last sync</div>
                    <div className="w-[104px] text-right">Action</div>
                  </div>

                  <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">
                    {[
                      {
                        channel: "Amazon",
                        listingStatus: "Listing Active",
                        lastSync: "18 min ago",
                        action: "View listing →",
                      },
                      {
                        channel: "Shopify",
                        listingStatus: "Listing Active",
                        lastSync: "32 min ago",
                        action: "View listing →",
                      },
                      {
                        channel: "Meesho",
                        listingStatus: "Listing Needs attention",
                        lastSync: "1 hr ago",
                        action: "Review →",
                      },
                    ].map((row) => (
                      <div
                        key={row.channel}
                        className="w-full flex flex-row items-center px-3 h-[56px] text-[12px] leading-[17px]"
                      >
                        <div className="w-[110px] font-medium text-[#000000]">
                          {row.channel}
                        </div>
                        <div className="flex-1 min-w-[200px] text-[#666666] font-normal">
                          {row.listingStatus}
                        </div>
                        <div className="w-[116px] text-[#000000] font-normal">
                          {row.lastSync}
                        </div>
                        <div className="w-[104px] text-right">
                          <button
                            onClick={() => navigate(ROUTES.LISTINGS)}
                            className="font-normal text-[#000000] hover:underline cursor-pointer"
                          >
                            {row.action}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  Master product information stays centralized. Marketplace-specific content can be managed independently for each channel.
                </p>
              </div>

              {/* Attention notice banner */}
              <div className="w-full box-border flex flex-row items-center p-4 bg-[#F5F5F5] rounded-[8px] gap-3">
                <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                <div className="flex-1 flex flex-col items-start gap-1">
                  <span className="text-[12px] font-semibold text-[#000000]">
                    Meesho listing synchronization failed
                  </span>
                  <span className="text-[12px] font-normal text-[#666666]">
                    Needs attention · Last sync 1 hr ago. Review the Meesho listing and its marketplace content.
                  </span>
                </div>
                <button
                  onClick={() => navigate(ROUTES.LISTINGS)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  Review →
                </button>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Publication model section */}
              <div className="w-full flex flex-col items-start gap-3">
                <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                  Publication model
                </h2>
                <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">
                  Master Product → Channel Listing → Marketplace
                </span>
                <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  Premium Travel Bag remains the single source of truth. Marketplace-specific representations are managed independently on Amazon, Shopify and Meesho.
                </p>
              </div>
            </div>
          ) : activeTab === "inventory" ? (
            /* =======================================================================
             * SCREEN 11 — PRODUCT DETAILS / INVENTORY
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-7">
              {/* Product inventory summary */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Product inventory
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Stock for the four sellable SKUs linked to TRV-1042.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(ROUTES.INVENTORY)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Update inventory
                  </button>
                </div>

                {/* Stock metric strip */}
                <div className="w-full flex flex-row items-start pt-1">
                  {/* Available */}
                  <div className="flex-1 flex flex-col items-start gap-1 pr-5">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Available
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      124
                    </span>
                  </div>

                  {/* Reserved */}
                  <div className="flex-1 flex flex-col items-start gap-1 px-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Reserved
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      18
                    </span>
                  </div>

                  {/* Incoming */}
                  <div className="flex-1 flex flex-col items-start gap-1 px-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Incoming
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      40
                    </span>
                  </div>

                  {/* Low-stock variants */}
                  <div className="flex-1 flex flex-col items-start gap-1 pl-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Low-stock variants
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      1
                    </span>
                  </div>
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Stock by variant */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Stock by variant
                  </h2>
                  <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Available inventory · Main Warehouse
                  </p>
                </div>

                {/* Stock table */}
                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="flex-1 min-w-[200px]">Variant</div>
                    <div className="w-[180px]">SKU</div>
                    <div className="w-[100px]">Available</div>
                    <div className="w-[120px]">Status</div>
                  </div>

                  <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">
                    {[
                      { variant: "Black / Cabin", sku: "TRV-1042-B-C", available: "48", status: "Healthy" },
                      { variant: "Black / Large", sku: "TRV-1042-B-L", available: "32", status: "Healthy" },
                      { variant: "Navy / Cabin", sku: "TRV-1042-N-C", available: "28", status: "Healthy" },
                      { variant: "Navy / Large", sku: "TRV-1042-N-L", available: "16", status: "Low stock" },
                    ].map((row) => (
                      <div
                        key={row.sku}
                        className="w-full flex flex-row items-center px-3 h-[50px] text-[12px] leading-[17px]"
                      >
                        <div className="flex-1 min-w-[200px] font-medium text-[#000000]">
                          {row.variant}
                        </div>
                        <div className="w-[180px] text-[#666666] font-normal">{row.sku}</div>
                        <div className="w-[100px] text-[#000000] font-normal">{row.available}</div>
                        <div className="w-[120px] text-[#000000] font-normal">{row.status}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stock total */}
                <div className="w-full flex flex-row justify-between items-center text-[12px] leading-[17px] font-semibold text-[#000000]">
                  <span>Total available</span>
                  <span>124 units</span>
                </div>
              </div>

              {/* Warehouse */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Warehouse
                  </h2>
                  <button
                    onClick={() => navigate(ROUTES.INVENTORY)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    View inventory →
                  </button>
                </div>

                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="flex-1">Location</div>
                    <div className="w-[180px]">Available</div>
                  </div>
                  <div className="w-full flex flex-row items-center px-3 h-[50px] bg-[#FFFFFF] text-[12px] leading-[17px]">
                    <div className="flex-1 font-medium text-[#000000]">Main Warehouse</div>
                    <div className="w-[180px] text-[#666666] font-normal">124 available</div>
                  </div>
                </div>
              </div>

              {/* Attention notice banner */}
              <div className="w-full box-border flex flex-row items-center p-4 bg-[#F5F5F5] rounded-[8px] gap-3">
                <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                <div className="flex-1 flex flex-col items-start gap-1">
                  <span className="text-[12px] font-semibold text-[#000000]">
                    Navy / Large is low on stock
                  </span>
                  <span className="text-[12px] font-normal text-[#666666]">
                    TRV-1042-N-L · 16 available. Review this SKU independently of aggregate product health.
                  </span>
                </div>
                <button
                  onClick={() => navigate(ROUTES.INVENTORY)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  View inventory →
                </button>
              </div>
            </div>
          ) : activeTab === "variants" ? (
            /* =======================================================================
             * SCREEN 11 — PRODUCT DETAILS / VARIANTS
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-6">
              {/* Variants / SKUs Table Header */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Variants / SKUs
                  </h2>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/variants`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Manage variants
                  </button>
                </div>
                <p className="text-[12px] font-normal leading-[17px] text-[#666666] -mt-2">
                  4 variants linked to this master product.
                </p>

                {/* Variants Table */}
                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="flex-1 min-w-[140px]">Variant</div>
                    <div className="w-[120px]">SKU</div>
                    <div className="w-[60px]">Size</div>
                    <div className="w-[60px]">Color</div>
                    <div className="w-[70px]">Inventory</div>
                    <div className="w-[75px] text-right">Status</div>
                  </div>

                  <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">
                    {variantsData.map((v) => (
                      <div
                        key={v.sku}
                        className="w-full flex flex-row items-center px-3 h-[50px] text-[12px] leading-[17px]"
                      >
                        <div className="flex-1 min-w-[140px] font-medium text-[#000000]">
                          {v.variant}
                        </div>
                        <div className="w-[120px] text-[#666666] font-normal">{v.sku}</div>
                        <div className="w-[60px] text-[#000000]">{v.size}</div>
                        <div className="w-[60px] text-[#000000]">{v.color}</div>
                        <div className="w-[70px] text-[#000000]">{v.inventory}</div>
                        <div className="w-[75px] text-right text-[#000000]">{v.status}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  Each SKU represents a sellable size and color configuration. Core information belongs to the master product.
                </p>
              </div>

              {/* Attention Notice Card */}
              <div className="w-full box-border flex flex-row items-center p-4 bg-[#F5F5F5] rounded-[8px] gap-3">
                <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                <div className="flex-1 flex flex-col items-start gap-1">
                  <span className="text-[12px] font-semibold text-[#000000]">
                    1 low-stock variant
                  </span>
                  <span className="text-[12px] font-normal text-[#666666]">
                    Navy / Large · TRV-1042-N-L · 16 available
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab("inventory")}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  View inventory →
                </button>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Inventory Across Variants Strip */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Inventory across variants
                  </h2>
                </div>

                <div className="w-full flex flex-row justify-between items-center text-[12px] leading-[17px]">
                  <span className="text-[#000000]">4 variants · 124 units available</span>
                  <button
                    onClick={() => setActiveTab("variants")}
                    className="font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    View all variants →
                  </button>
                </div>

                <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  Variant inventory is tracked by SKU. Channel listings remain separate marketplace-specific representations.
                </p>
              </div>
            </div>
          ) : isDraftState ? (
            /* =======================================================================
             * SCREEN 11 — PRODUCT DETAILS / INCOMPLETE AND UNPUBLISHED
             * ======================================================================= */
            <>
              {/* Eyebrow Label */}
              <div className="w-full text-[12px] font-semibold leading-[17px] text-[#666666]">
                ALTERNATE STATE · INCOMPLETE / UNPUBLISHED
              </div>

              {/* Attention Notice Card */}
              <div className="w-full box-border flex flex-row items-center p-4 bg-[#F5F5F5] rounded-[8px] gap-3">
                <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" />
                <div className="flex-1 flex flex-col items-start gap-1">
                  <span className="text-[12px] font-semibold text-[#000000]">
                    Product information incomplete
                  </span>
                  <span className="text-[12px] font-normal text-[#666666]">
                    Add missing attributes to improve listing readiness.
                  </span>
                </div>
                <button
                  onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  Complete product
                </button>
              </div>

              {/* Section 1: Product Information */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Product information
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Master information · Single source of truth
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Edit information
                  </button>
                </div>

                {/* Master Fields Grid */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-1">
                  {/* Product name */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Product name
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productTitle}
                    </span>
                  </div>

                  {/* Product type */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Product type
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      Physical product
                    </span>
                  </div>

                  {/* Category */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Category
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productCategory}
                    </span>
                  </div>

                  {/* Master SKU */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Master SKU
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productSku}
                    </span>
                  </div>

                  {/* Brand */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Brand
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productBrand}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div className="w-full flex flex-col items-start gap-1 pt-1">
                  <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Description
                  </span>
                  <p className="text-[12px] font-normal leading-[17px] text-[#000000]">
                    {productDescription}
                  </p>
                </div>
              </div>

              {/* Section 2: Content Readiness */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Content readiness
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Master attributes need completion. No channel content has been published.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Complete product
                  </button>
                </div>

                {/* Readiness Detail Rows */}
                <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA]">
                  <div className="w-full flex flex-row justify-between items-center py-2.5 text-[12px] leading-[17px]">
                    <span className="text-[#666666]">Title</span>
                    <span className="text-[#000000] font-normal">Complete</span>
                  </div>
                  <div className="w-full flex flex-row justify-between items-center py-2.5 text-[12px] leading-[17px]">
                    <span className="text-[#666666]">Description</span>
                    <span className="text-[#000000] font-normal">Complete</span>
                  </div>
                  <div className="w-full flex flex-row justify-between items-center py-2.5 text-[12px] leading-[17px]">
                    <span className="text-[#666666]">Images</span>
                    <span className="text-[#000000] font-normal">Complete</span>
                  </div>
                  <div className="w-full flex flex-row justify-between items-center py-2.5 text-[12px] leading-[17px]">
                    <span className="text-[#666666]">Attributes</span>
                    <span className="text-[#000000] font-normal">Incomplete</span>
                  </div>
                  <div className="w-full flex flex-row justify-between items-center py-2.5 text-[12px] leading-[17px]">
                    <span className="text-[#666666]">Marketplace content</span>
                    <span className="text-[#000000] font-normal">Not published yet</span>
                  </div>
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section 3: Variants */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Variants
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      4 variants linked to this master product.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/variants`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Manage variants
                  </button>
                </div>

                {/* Variants Table */}
                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="flex-1 min-w-[140px]">Variant</div>
                    <div className="w-[120px]">SKU</div>
                    <div className="w-[60px]">Size</div>
                    <div className="w-[60px]">Color</div>
                    <div className="w-[70px]">Inventory</div>
                    <div className="w-[75px] text-right">Status</div>
                  </div>

                  <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">
                    {variantsData.map((v) => (
                      <div
                        key={v.sku}
                        className="w-full flex flex-row items-center px-3 h-[50px] text-[12px] leading-[17px]"
                      >
                        <div className="flex-1 min-w-[140px] font-medium text-[#000000]">
                          {v.variant}
                        </div>
                        <div className="w-[120px] text-[#666666] font-normal">{v.sku}</div>
                        <div className="w-[60px] text-[#000000]">{v.size}</div>
                        <div className="w-[60px] text-[#000000]">{v.color}</div>
                        <div className="w-[70px] text-[#000000]">{v.inventory}</div>
                        <div className="w-[75px] text-right text-[#000000]">{v.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 4: Inventory */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Inventory
                  </h2>
                </div>

                {/* Stock Summary Metrics Strip */}
                <div className="w-full flex flex-row items-start gap-5">
                  <div className="flex-1 flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Available
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      124
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col items-start gap-1 pl-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Reserved
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      18
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col items-start gap-1 pl-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Incoming
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      40
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col items-start gap-1 pl-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Low-stock variants
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      1
                    </span>
                  </div>
                </div>

                <div className="w-full flex flex-row justify-between items-center text-[12px] pt-1">
                  <span className="text-[#666666]">Main Warehouse</span>
                  <span className="text-[#000000] font-semibold">124 available</span>
                </div>

                <button
                  onClick={() => setActiveTab("inventory")}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  View inventory →
                </button>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section 5: Sales Channels */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Sales channels
                  </h2>
                  <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    0 connected channels
                  </p>
                </div>

                {/* Unpublished State Box */}
                <div className="w-full flex flex-col items-start py-4 gap-3">
                  <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">
                    Not published yet
                  </span>
                  <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    This master product has not been published to a sales channel.
                  </p>
                  <button
                    onClick={() => {
                      toast({
                        title: "Publish Wizard",
                        description: "Opening channel publication wizard...",
                      });
                    }}
                    className="box-border flex flex-row justify-center items-center px-4 h-9 bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors cursor-pointer"
                  >
                    Publish product
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* =======================================================================
             * SCREEN 11 — PRODUCT DETAILS / OVERVIEW (DEFAULT)
             * ======================================================================= */
            <>
              {/* Section A: Product Information */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Product information
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Master information · Single source of truth
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Edit information
                  </button>
                </div>

                {/* Master Fields Grid */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-1">
                  {/* Product name */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Product name
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productTitle}
                    </span>
                  </div>

                  {/* Product type */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Product type
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      Physical product
                    </span>
                  </div>

                  {/* Category */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Category
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productCategory}
                    </span>
                  </div>

                  {/* Master SKU */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Master SKU
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productSku}
                    </span>
                  </div>

                  {/* Brand */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Brand
                    </span>
                    <span className="text-[12px] font-normal leading-[17px] text-[#000000]">
                      {productBrand}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div className="w-full flex flex-col items-start gap-1 pt-2">
                  <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Description
                  </span>
                  <p className="text-[12px] font-normal leading-[17px] text-[#000000]">
                    {productDescription}
                  </p>
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section B: Product Media */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Product media
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      6 images
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Manage media
                  </button>
                </div>

                {/* Image strip */}
                <div className="w-full flex flex-row items-start gap-3 overflow-x-auto pb-1">
                  {galleryImages.map((img) => (
                    <div key={img.id} className="flex flex-col items-start gap-1.5 shrink-0">
                      <div className="w-[110px] h-[92px] rounded-[4px] overflow-hidden bg-[#F5F5F5] border border-[#EAEAEA]">
                        <img
                          src={img.url}
                          alt="Product media"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {img.isPrimary && (
                        <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
                          Primary image
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section C: Variants */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Variants
                  </h2>
                  <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    4 variants linked to this master product.
                  </p>
                </div>

                {/* Variants Table */}
                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="flex-1 min-w-[140px]">Variant</div>
                    <div className="w-[120px]">SKU</div>
                    <div className="w-[60px]">Size</div>
                    <div className="w-[60px]">Color</div>
                    <div className="w-[70px]">Inventory</div>
                    <div className="w-[75px] text-right">Status</div>
                  </div>

                  <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">
                    {variantsData.map((v) => (
                      <div
                        key={v.sku}
                        className="w-full flex flex-row items-center px-3 h-[50px] text-[12px] leading-[17px]"
                      >
                        <div className="flex-1 min-w-[140px] font-medium text-[#000000]">
                          {v.variant}
                        </div>
                        <div className="w-[120px] text-[#666666] font-normal">{v.sku}</div>
                        <div className="w-[60px] text-[#000000]">{v.size}</div>
                        <div className="w-[60px] text-[#000000]">{v.color}</div>
                        <div className="w-[70px] text-[#000000]">{v.inventory}</div>
                        <div className="w-[75px] text-right text-[#000000]">{v.status}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab("variants")}
                  className="text-[12px] font-semibold text-[#000000] hover:underline pt-1 cursor-pointer"
                >
                  View all variants →
                </button>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section D: Inventory */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Inventory
                  </h2>
                </div>

                {/* Stock Summary Strip */}
                <div className="w-full flex flex-row items-start gap-5">
                  <div className="flex-1 flex flex-col items-start gap-1">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Available
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      124
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col items-start gap-1 pl-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Reserved
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      18
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col items-start gap-1 pl-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Incoming
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      40
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col items-start gap-1 pl-5 border-l border-[#EAEAEA]">
                    <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      Low stock variants
                    </span>
                    <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      1
                    </span>
                  </div>
                </div>

                <div className="w-full flex flex-row justify-between items-center text-[12px] pt-1">
                  <span className="text-[#000000]">Main Warehouse</span>
                  <span className="text-[#666666]">124 available</span>
                </div>

                <button
                  onClick={() => setActiveTab("inventory")}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  View inventory →
                </button>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section E: Sales Channels */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-col items-start gap-1">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Sales channels
                  </h2>
                  <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Where this master product is currently published.
                  </p>
                </div>

                {/* Channels Table */}
                <div className="w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
                  <div className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
                    <div className="w-[120px]">Channel</div>
                    <div className="flex-1">Listing status</div>
                    <div className="w-[120px]">Last sync</div>
                    <div className="w-[110px] text-right">Action</div>
                  </div>

                  <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">
                    {channelsData.map((ch) => (
                      <div
                        key={ch.channel}
                        className="w-full flex flex-row items-center px-3 h-[56px] text-[12px] leading-[17px]"
                      >
                        <div className="w-[120px] font-medium text-[#000000]">
                          {ch.channel}
                        </div>
                        <div className="flex-1 text-[#666666]">{ch.listingStatus}</div>
                        <div className="w-[120px] text-[#000000]">{ch.lastSync}</div>
                        <div className="w-[110px] text-right">
                          <button
                            onClick={() => setActiveTab("listings")}
                            className="text-[#000000] hover:underline font-normal cursor-pointer"
                          >
                            {ch.action}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  Master product information is distributed. Marketplace-specific content can be managed independently for each channel.
                </p>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section F: Content Readiness */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <div className="flex flex-col items-start gap-1">
                    <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                      Content readiness
                    </h2>
                    <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                      92% complete · Core master information is complete.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/edit`)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    Improve content
                  </button>
                </div>

                {/* Readiness Rows */}
                <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA]">
                  {readinessRows.map((row) => (
                    <div
                      key={row.label}
                      className="w-full flex flex-row justify-between items-center py-2.5 text-[12px] leading-[17px]"
                    >
                      <span className="text-[#666666]">{row.label}</span>
                      <span className="text-[#000000] font-normal">{row.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Section G: Recent Activity */}
              <div className="w-full flex flex-col items-start gap-4">
                <div className="w-full flex flex-row justify-between items-center">
                  <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                    Recent activity
                  </h2>
                  <button
                    onClick={() => setActiveTab("activity")}
                    className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    View all activity →
                  </button>
                </div>

                {/* Activity Rows */}
                <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA]">
                  {activityLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="w-full flex flex-row items-center py-3 text-[12px] leading-[17px] gap-4"
                    >
                      <span className="w-[88px] text-[#666666] shrink-0">{log.time}</span>
                      <span className="flex-1 text-[#000000]">{log.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* =========================================================================
         * Right Operational Panel Column (width 272px, border-left)
         * ========================================================================= */}
        <div className="w-full lg:w-[272px] shrink-0 flex flex-col items-start pl-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] gap-7">
          {activeTab === "activity" ? (
            /* =======================================================================
             * SCREEN 11 — RIGHT PANEL: ACTIVITY SCOPE
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-4">
              <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                Activity scope
              </h3>

              <div className="flex flex-col items-start gap-1">
                <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">
                  {productTitle}
                </span>
                <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  Master SKU · {productSku}
                </span>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Changes to master content, linked variants, inventory and channel listings appear in this product's activity.
              </p>

              <button
                onClick={() => setActiveTab("activity")}
                className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
              >
                View product activity →
              </button>
            </div>
          ) : activeTab === "content" ? (
            /* =======================================================================
             * SCREEN 11 — RIGHT PANEL: CONTENT READINESS
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-4">
              <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                Content readiness
              </h3>

              <div className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
                92% complete
              </div>

              {/* Completeness track */}
              <div className="w-full h-1 bg-[#F5F5F5] rounded-full overflow-hidden">
                <div className="h-full bg-[#000000] w-[92%]" />
              </div>

              <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Core master information is complete. One channel's marketplace content needs review.
              </p>

              <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Title</span>
                  <span className="text-[#000000] font-normal">Complete</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Description</span>
                  <span className="text-[#000000] font-normal">Complete</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Images</span>
                  <span className="text-[#000000] font-normal">Complete</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Attributes</span>
                  <span className="text-[#000000] font-normal">Complete</span>
                </div>
                <div className="w-full flex justify-between items-start py-2.5">
                  <span className="text-[#666666] leading-[17px]">Marketplace content</span>
                  <span className="text-[#000000] font-normal text-right leading-[17px]">
                    1 channel needs review
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate(ROUTES.LISTINGS)}
                className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
              >
                Improve content →
              </button>
            </div>
          ) : activeTab === "listings" ? (
            /* =======================================================================
             * SCREEN 11 — RIGHT PANEL: LISTING STATUS
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-4">
              <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                Listing status
              </h3>

              <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Connected channels</span>
                  <span className="text-[#000000] font-normal">3</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Active listings</span>
                  <span className="text-[#000000] font-normal">2</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Needs attention</span>
                  <span className="text-[#000000] font-normal">1</span>
                </div>
              </div>

              <div className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Last synced 18 min ago
              </div>

              <button
                onClick={() => navigate(ROUTES.LISTINGS)}
                className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
              >
                Manage listings →
              </button>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Master catalog: Ready. The Meesho issue affects its channel listing, not core master information.
              </p>
            </div>
          ) : activeTab === "inventory" ? (
            /* =======================================================================
             * SCREEN 11 — RIGHT PANEL: INVENTORY HEALTH
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-4">
              <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                Inventory health
              </h3>

              <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Aggregate</span>
                  <span className="text-[#000000] font-normal">Healthy</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Available</span>
                  <span className="text-[#000000] font-normal">124 units</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Low-stock variants</span>
                  <span className="text-[#000000] font-normal">1</span>
                </div>
              </div>

              <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Aggregate inventory is healthy. Navy / Large is the only low-stock variant.
              </p>

              <button
                onClick={() => navigate(ROUTES.INVENTORY)}
                className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer pt-1"
              >
                Update inventory →
              </button>
            </div>
          ) : activeTab === "variants" ? (
            /* =======================================================================
             * SCREEN 11 — RIGHT PANEL: VARIANT STRUCTURE SPEC
             * ======================================================================= */
            <div className="w-full flex flex-col items-start gap-4">
              <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                Variant structure
              </h3>
              <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Sellable configurations linked to Premium Travel Bag.
              </p>

              <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Master SKU</span>
                  <span className="text-[#000000] font-normal">{productSku}</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Sizes</span>
                  <span className="text-[#000000] font-normal">Cabin · Large</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Colors</span>
                  <span className="text-[#000000] font-normal">Black · Navy</span>
                </div>
                <div className="w-full flex justify-between py-2.5">
                  <span className="text-[#666666]">Variants</span>
                  <span className="text-[#000000] font-normal">{productVariantsCount}</span>
                </div>
              </div>

              <button
                onClick={() => navigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}/variants`)}
                className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer pt-1"
              >
                Manage variants →
              </button>
            </div>
          ) : (
            /* =======================================================================
             * SCREEN 11 — RIGHT PANEL: PRODUCT STATUS & QUICK ACTIONS (OVERVIEW)
             * ======================================================================= */
            <>
              {/* 1. Product Status Block */}
              <div className="w-full flex flex-col items-start gap-4">
                <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                  Product status
                </h3>

                <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
                  <div className="w-full flex justify-between py-2.5">
                    <span className="text-[#666666]">Catalog</span>
                    <span className="text-[#000000] font-normal">
                      {isDraftState ? "Incomplete" : "Ready"}
                    </span>
                  </div>
                  <div className="w-full flex justify-between py-2.5">
                    <span className="text-[#666666]">Inventory</span>
                    <span className="text-[#000000] font-normal">Healthy</span>
                  </div>
                  <div className="w-full flex justify-between py-2.5">
                    <span className="text-[#666666]">Listings</span>
                    <span className="text-[#000000] font-normal">
                      {isDraftState ? "Not published" : "2 Active · 1 Attention"}
                    </span>
                  </div>
                  <div className="w-full flex justify-between py-2.5">
                    <span className="text-[#666666]">Content</span>
                    <span className="text-[#000000] font-normal">
                      {isDraftState ? "Attributes missing" : "92% complete"}
                    </span>
                  </div>
                  {isDraftState && (
                    <div className="w-full flex justify-between py-2.5">
                      <span className="text-[#666666]">Sync</span>
                      <span className="text-[#000000] font-normal">Not synced</span>
                    </div>
                  )}
                </div>

                {!isDraftState && (
                  <div className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    Signals last synced 18 min ago.
                  </div>
                )}

                <button
                  onClick={() => setActiveTab("activity")}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                >
                  View product activity →
                </button>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* 2. Quick Actions */}
              <div className="w-full flex flex-col items-start gap-4">
                <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                  Quick actions
                </h3>

                <div className="w-full flex flex-col items-start divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
                  {[
                    { label: "Edit product", path: `${ROUTES.PRODUCTS}/${id || "prod-1"}/edit` },
                    {
                      label: "Manage variants",
                      path: `${ROUTES.PRODUCTS}/${id || "prod-1"}/variants`,
                    },
                    { label: "Update inventory", action: () => setActiveTab("inventory") },
                    { label: "Manage listings", action: () => setActiveTab("listings") },
                    {
                      label: "Export product",
                      action: () =>
                        toast({ title: "Export Started", description: "Exporting product CSV." }),
                    },
                  ].map((act) => (
                    <button
                      key={act.label}
                      onClick={() => {
                        if (act.path) navigate(act.path);
                        else if (act.action) act.action();
                      }}
                      className="w-full flex flex-row justify-between items-center py-2 hover:text-[#666666] transition-colors text-left cursor-pointer"
                    >
                      <span className="text-[#000000]">{act.label}</span>
                      <ChevronRight className="h-3 w-3 text-[#666666]" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* 3. Data Hierarchy Note */}
              <div className="w-full flex flex-col items-start gap-2 text-[12px] leading-[17px]">
                <span className="font-semibold text-[#000000]">Master product</span>
                <p className="text-[#666666]">
                  Single source of truth for product information.
                </p>
                <p className="text-[#666666]">
                  Variants / SKUs are sellable configurations. Channel listings are marketplace-specific representations.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
