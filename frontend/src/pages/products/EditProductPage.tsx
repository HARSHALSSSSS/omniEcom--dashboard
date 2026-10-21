import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Lock,
  ChevronDown,
  Check,
  ArrowDown,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/useToast";
import { useUiStore } from "@/store/ui.store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sidebarCollapsed } = useUiStore();

  const defaultTitle =
    id === "prod-2"
      ? "Classic Backpack"
      : id === "prod-3"
      ? "Cotton Overshirt"
      : id === "prod-4"
      ? "Travel Organizer Set"
      : "Premium Travel Bag";

  const originalName = defaultTitle;
  const [productName, setProductName] = useState(
    id === "prod-1" ? "Urban Carry Premium Travel Bag" : defaultTitle
  );
  const [productType, setProductType] = useState("Physical product");
  const [sku] = useState(
    id === "prod-2"
      ? "BP-1021"
      : id === "prod-3"
      ? "OS-2048"
      : id === "prod-4"
      ? "ORG-3102"
      : "TRV-1042"
  );
  const [category, setCategory] = useState(
    id === "prod-3" ? "Apparel & Fashion" : "Bags & Luggage"
  );
  const [brand, setBrand] = useState("Nova Living");
  const [description, setDescription] = useState(
    id === "prod-2"
      ? "Everyday minimalist classic backpack featuring padded straps, dual water bottle holders, and durable canvas build."
      : id === "prod-3"
      ? "Premium heavyweight utility overshirt crafted from 100% organic combed cotton with structured chore pockets."
      : "A durable premium travel bag designed for short business trips and weekend travel."
  );
  const [activeSection, setActiveSection] = useState("Overview");
  const [showAiRewrite, setShowAiRewrite] = useState(false);
  const [selectedRewriteOption, setSelectedRewriteOption] = useState<"clarity" | "concise">("clarity");

  const aiRewriteClarity = "A durable, premium travel bag for short business trips and weekend travel.";
  const aiRewriteConcise = "A durable premium travel bag for short business trips and weekends.";

  const [openDropdown, setOpenDropdown] = useState<"productType" | "category" | "brand" | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-custom-dropdown]")) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sections navigation list
  const sections = [
    "Overview",
    "Media",
    "Details",
    "Variants",
    "Inventory",
    "Listings",
    "Content",
    "Activity",
  ];

  const [savedName, setSavedName] = useState(
    id === "prod-1" ? "Urban Carry Premium Travel Bag" : defaultTitle
  );
  const [savedDescription, setSavedDescription] = useState(
    id === "prod-2"
      ? "Everyday minimalist classic backpack featuring padded straps, dual water bottle holders, and durable canvas build."
      : id === "prod-3"
      ? "Premium heavyweight utility overshirt crafted from 100% organic combed cotton with structured chore pockets."
      : "A durable premium travel bag designed for short business trips and weekend travel."
  );
  const [savedCategory, setSavedCategory] = useState(
    id === "prod-3" ? "Apparel & Fashion" : "Bags & Luggage"
  );
  const [savedBrand, setSavedBrand] = useState("Nova Living");
  const [savedProductType, setSavedProductType] = useState("Physical product");
  const [isAttributesExpanded, setIsAttributesExpanded] = useState(false);

  // Category-specific attribute schemas
  const categoryAttributeDefinitions: Record<string, Array<{ key: string; label: string }>> = {
    "Travel Accessories": [
      { key: "material", label: "Material" },
      { key: "dimensions", label: "Dimensions" },
      { key: "weight", label: "Weight" },
      { key: "countryOfOrigin", label: "Country of origin" },
      { key: "hsnCode", label: "HSN code" },
      { key: "taxInformation", label: "Tax information" },
    ],
    "Bags & Luggage": [
      { key: "material", label: "Material" },
      { key: "capacity", label: "Capacity (Volume)" },
      { key: "dimensions", label: "Dimensions" },
      { key: "waterResistance", label: "Water resistance rating" },
      { key: "countryOfOrigin", label: "Country of origin" },
      { key: "hsnCode", label: "HSN code" },
    ],
    "Backpacks": [
      { key: "material", label: "Fabric & Material" },
      { key: "laptopCompartment", label: "Laptop compartment size" },
      { key: "capacity", label: "Capacity (Liters)" },
      { key: "strapType", label: "Strap & Padding type" },
      { key: "countryOfOrigin", label: "Country of origin" },
      { key: "hsnCode", label: "HSN code" },
    ],
    "Apparel & Fashion": [
      { key: "fabricComposition", label: "Fabric composition" },
      { key: "fitType", label: "Fit & Silhouette" },
      { key: "fabricGsm", label: "Fabric weight (GSM)" },
      { key: "careInstructions", label: "Care instructions" },
      { key: "countryOfOrigin", label: "Country of origin" },
      { key: "hsnCode", label: "HSN code" },
    ],
  };

  const currentAttributeDefs =
    categoryAttributeDefinitions[category] ||
    categoryAttributeDefinitions["Travel Accessories"];

  // Category-aware dynamic attributes state
  const [customAttributes, setCustomAttributes] = useState<Record<string, string>>({
    material: id === "prod-2" ? "Waterproof Canvas" : id === "prod-3" ? "100% Combed Cotton" : "Not supplied",
    dimensions: id === "prod-2" ? "42 x 30 x 14 cm" : "Not supplied",
    weight: id === "prod-2" ? "650g" : "Not supplied",
    countryOfOrigin: "Not supplied",
    hsnCode: id === "prod-3" ? "61091000" : id === "prod-2" ? "42021290" : "Not supplied",
    taxInformation: "Not supplied",
    capacity: id === "prod-2" ? "22L" : "35L",
    waterResistance: "Water-repellent",
    laptopCompartment: "Up to 15.6 inch",
    strapType: "Ergonomic air-mesh",
    fabricComposition: "100% Cotton",
    fitType: "Relaxed Boxy",
    fabricGsm: "240 GSM",
    careInstructions: "Machine wash cold with like colors",
  });

  const [savedAttributes, setSavedAttributes] = useState<Record<string, string>>({ ...customAttributes });
  const [isSaved, setIsSaved] = useState(false);

  const isNameModified = productName !== originalName;
  const areAttributesModified = Object.keys(customAttributes).some(
    (k) => customAttributes[k] !== savedAttributes[k]
  );

  const hasChanges =
    productName !== savedName ||
    description !== savedDescription ||
    category !== savedCategory ||
    brand !== savedBrand ||
    productType !== savedProductType ||
    areAttributesModified;

  const handleDiscard = () => {
    setProductName(savedName);
    setDescription(savedDescription);
    setCategory(savedCategory);
    setBrand(savedBrand);
    setProductType(savedProductType);
    setCustomAttributes({ ...savedAttributes });
    setIsSaved(false);
    toast({
      title: "Changes Discarded",
      description: "Restored product fields to previously saved state.",
    });
  };

  const handleRevertName = () => {
    setProductName(originalName);
    setIsSaved(false);
    toast({
      title: "Field Reverted",
      description: `Product name reverted to "${originalName}".`,
    });
  };

  const handleSaveChanges = () => {
    if (!hasChanges) return;
    // Show impact dialog before committing
    setSaveImpactDialogOpen(true);
  };

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [pendingNavigationPath, setPendingNavigationPath] = useState<string | null>(null);
  const [saveImpactDialogOpen, setSaveImpactDialogOpen] = useState(false);

  // Marketplace channels that may be affected
  const affectedChannels = ["Amazon", "Flipkart", "Meesho"];

  const commitSaveChanges = () => {
    setSavedName(productName);
    setSavedDescription(description);
    setSavedCategory(category);
    setSavedBrand(brand);
    setSavedProductType(productType);
    setSavedAttributes({ ...customAttributes });
    setIsSaved(true);
    setSaveImpactDialogOpen(false);
    toast({
      title: "Changes Saved",
      description: `Product changes for ${productName} saved to master product.`,
    });
  };

  // Warn before browser tab reload or close if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  // Intercept navigation if there are unsaved changes
  const requestNavigate = (targetPath: string) => {
    if (hasChanges) {
      setPendingNavigationPath(targetPath);
      setLeaveDialogOpen(true);
    } else {
      navigate(targetPath);
    }
  };

  const handleConfirmDiscardAndLeave = () => {
    setProductName(savedName);
    setDescription(savedDescription);
    setCategory(savedCategory);
    setBrand(savedBrand);
    setProductType(savedProductType);
    setCustomAttributes({ ...savedAttributes });
    setLeaveDialogOpen(false);
    if (pendingNavigationPath) {
      navigate(pendingNavigationPath);
    } else {
      navigate(-1);
    }
  };

  const handleConfirmSaveAndLeave = () => {
    setSavedName(productName);
    setSavedDescription(description);
    setSavedCategory(category);
    setSavedBrand(brand);
    setSavedProductType(productType);
    setSavedAttributes({ ...customAttributes });
    setIsSaved(true);
    setLeaveDialogOpen(false);
    toast({
      title: "Changes Saved",
      description: `Product changes saved.`,
    });
    if (pendingNavigationPath) {
      navigate(pendingNavigationPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="flex flex-col w-full text-[#000000] font-['Inter',sans-serif] pb-24">
      {/* 1. Workspace Introduction / Editor Header */}
      <div className="flex flex-col gap-2.5 pb-5 border-b border-[#EAEAEA]">
        {/* Local Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] leading-[145%] text-[#666666]">
          <button
            type="button"
            onClick={() => requestNavigate(ROUTES.PRODUCTS)}
            className="hover:text-[#000000] transition-colors cursor-pointer"
          >
            Products
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => requestNavigate(`${ROUTES.PRODUCTS}/${id || "prod-1"}`)}
            className="hover:text-[#000000] transition-colors cursor-pointer"
          >
            {originalName}
          </button>
        </div>

        {/* Editor Header: Title + Save State + Identifier + Header Actions */}
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-3.5">
              <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">
                Edit product
              </h1>
              {hasChanges ? (
                <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  Unsaved changes
                </span>
              ) : isSaved ? (
                <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  Saved
                </span>
              ) : null}
            </div>
            <div className="flex flex-row items-center gap-3">
              <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                Master product · {sku}
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 border border-[#EAEAEA] rounded-[2px] text-[11px] font-normal text-[#000000] leading-[145%]">
                Active
              </span>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex flex-row items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!hasChanges}
              onClick={handleDiscard}
              className={`flex items-center justify-center h-9 px-4 rounded-[8px] text-[12px] font-semibold leading-[145%] transition-colors ${
                hasChanges
                  ? "bg-white text-[#000000] hover:bg-neutral-100 cursor-pointer"
                  : "bg-[#F5F5F5] text-[#9E9E9E] cursor-not-allowed"
              }`}
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!hasChanges}
              onClick={handleSaveChanges}
              className={`flex items-center justify-center h-9 px-4 rounded-[8px] text-[12px] font-semibold leading-[145%] transition-colors ${
                hasChanges
                  ? "bg-[#000000] text-white hover:bg-neutral-800 cursor-pointer"
                  : "bg-[#F5F5F5] text-[#9E9E9E] cursor-not-allowed"
              }`}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>

      {/* 2. Continuous Product Workspace: 3 Columns (Nav 120px + Editing Canvas Flex-1 + Change Impact Rail 248px) */}
      <div className="flex flex-row items-start pt-6 gap-6 w-full flex-1">
        {/* COLUMN 1: Product section navigation (120px) */}
        <div className="flex flex-col gap-5 w-[120px] shrink-0">
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
            Product
          </span>

          {/* Product sections */}
          <div className="flex flex-col gap-1 w-full">
            {sections.map((section) => {
              const isActive = activeSection === section;
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveSection(section)}
                  className={`flex items-center h-8 px-2.5 rounded-[4px] text-left transition-colors cursor-pointer w-full ${
                    isActive
                      ? "bg-[#F5F5F5] font-semibold text-[#000000]"
                      : "bg-white font-normal text-[#666666] hover:text-[#000000] hover:bg-neutral-50"
                  }`}
                >
                  <span className="text-[12px] leading-[145%] truncate">
                    {section}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Section divider */}
          <div className="w-full h-[1px] bg-[#EAEAEA]" />

          {/* Product metadata */}
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                Product ID
              </span>
              <span className="text-[11px] font-normal text-[#000000] leading-[145%]">
                {sku}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                Created
              </span>
              <span className="text-[11px] font-normal text-[#000000] leading-[145%]">
                Jan 18, 2026
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                Last updated
              </span>
              <span className="text-[11px] font-normal text-[#000000] leading-[145%]">
                Today, 2:16 PM
              </span>
            </div>
          </div>
        </div>

        {/* COLUMN 2: Editing canvas (Flex-1) */}
        <div className="flex flex-col gap-4 flex-1 min-w-0 pr-2">
          {/* Section introduction */}
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
              Product information
            </h2>
            <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
              Changes made here update the master product and may affect connected listings.
            </p>
          </div>

          {/* Product identity: Media block + Identity fields */}
          <div className="flex flex-row items-start gap-5 w-full">
            {/* Product identity media (148px) */}
            <div className="flex flex-col gap-2 w-[148px] shrink-0">
              <div className="w-[148px] h-[148px] rounded-[4px] bg-[#F5F5F5] overflow-hidden border border-[#EAEAEA] flex items-center justify-center">
                <img
                  src="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"
                  alt="Premium Travel Bag"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                Primary image
              </span>

              {/* Secondary thumbnails */}
              <div className="flex flex-row items-center gap-1.5 w-full">
                <div className="w-[44px] h-[40px] rounded-[4px] overflow-hidden border border-[#EAEAEA] bg-[#F5F5F5]">
                  <img
                    src="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=400&q=80"
                    alt="Detail 1"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="w-[44px] h-[40px] rounded-[4px] overflow-hidden border border-[#EAEAEA] bg-[#F5F5F5]">
                  <img
                    src="https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80"
                    alt="Detail 2"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="w-[44px] h-[40px] rounded-[4px] overflow-hidden border border-[#EAEAEA] bg-[#F5F5F5]">
                  <img
                    src="https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=400&q=80"
                    alt="Detail 3"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Media action */}
              <button
                type="button"
                onClick={() => navigate(`${ROUTES.PRODUCTS}/${sku}/edit`)}
                className="text-[11px] font-normal text-[#000000] hover:underline cursor-pointer text-left pt-1"
              >
                Manage media
              </button>
            </div>

            {/* Identity fields (flex-1) */}
            <div className="flex flex-col gap-3 flex-1 min-w-0">
              {/* Product name field */}
              <div className="flex flex-col gap-1.5 w-full">
                {/* Field label row with Modified & Revert */}
                <div className="flex flex-row items-center justify-between w-full text-[12px] leading-[145%]">
                  <label className="font-normal text-[#000000]">Product name</label>
                  {isNameModified && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#666666]">Modified</span>
                      <button
                        type="button"
                        onClick={handleRevertName}
                        className="font-semibold text-[#000000] hover:underline cursor-pointer"
                      >
                        Revert
                      </button>
                    </div>
                  )}
                </div>

                {/* Control */}
                <div
                  className={`flex items-center h-10 px-3 bg-white rounded-[8px] transition-colors ${
                    isNameModified
                      ? "border border-[#000000]"
                      : "border border-[#BDBDBD] focus-within:border-[#000000]"
                  }`}
                >
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full text-[13px] text-[#000000] leading-[145%] outline-none bg-transparent"
                  />
                </div>

                {/* Previous value info */}
                {isNameModified && (
                  <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                    Previously: {originalName}
                  </span>
                )}
              </div>

              {/* Product type & Master SKU in 2 columns */}
              <div className="flex flex-row items-start gap-5 w-full">
                {/* Product type */}
                <div className="flex flex-col gap-1.5 flex-1" data-custom-dropdown>
                  <label className="text-[12px] font-normal text-[#000000] leading-[145%]">
                    Product type
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === "productType" ? null : "productType")}
                      className={`flex items-center justify-between w-full h-10 px-3 bg-white border rounded-[8px] text-[13px] text-[#000000] leading-[145%] cursor-pointer transition-colors ${
                        openDropdown === "productType"
                          ? "border-[#000000]"
                          : "border-[#BDBDBD] hover:border-[#666666]"
                      }`}
                    >
                      <span className="truncate">{productType}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#666666] shrink-0 transition-transform ${
                          openDropdown === "productType" ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {openDropdown === "productType" && (
                      <div
                        style={{ boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.08)" }}
                        className="absolute left-0 right-0 top-[44px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
                      >
                        {[
                          "Physical product",
                          "Digital product",
                          "Service / Warranty",
                          "Bundle / Kit",
                        ].map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setProductType(option);
                              setOpenDropdown(null);
                            }}
                            className={`flex items-center justify-between w-full h-8 px-2.5 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                              productType === option
                                ? "bg-[#F5F5F5] text-[#000000] font-medium"
                                : "bg-white text-[#000000] font-normal hover:bg-[#F5F5F5]"
                            }`}
                          >
                            <span>{option}</span>
                            {productType === option && (
                              <Check className="w-3.5 h-3.5 text-[#666666] shrink-0 stroke-[2]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Master SKU (locked / read-only) */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex flex-row items-center justify-between w-full">
                    <label className="text-[12px] font-normal text-[#000000] leading-[145%]">
                      Master SKU
                    </label>
                    <Lock className="w-3 h-3 text-[#666666]" />
                  </div>
                  <div className="flex items-center h-10 px-3 bg-[#F5F5F5] border border-[#BDBDBD] rounded-[8px]">
                    <span className="text-[13px] font-mono text-[#000000] leading-[145%] select-all">
                      {sku}
                    </span>
                  </div>
                </div>
              </div>

              {/* Identifier helper copy */}
              <span className="text-[11px] font-normal text-[#666666] leading-[145%] -mt-1">
                Used as the primary internal product identifier.
              </span>

              {/* Category and brand in 2 columns */}
              <div className="flex flex-row items-center gap-5 w-full">
                {/* Category */}
                <div className="flex flex-col gap-1.5 flex-1" data-custom-dropdown>
                  <label className="text-[12px] font-normal text-[#000000] leading-[145%]">
                    Category
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
                      className={`flex items-center justify-between w-full h-10 px-3 bg-white border rounded-[8px] text-[13px] text-[#000000] leading-[145%] cursor-pointer transition-colors ${
                        openDropdown === "category"
                          ? "border-[#000000]"
                          : "border-[#BDBDBD] hover:border-[#666666]"
                      }`}
                    >
                      <span className="truncate">{category}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#666666] shrink-0 transition-transform ${
                          openDropdown === "category" ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {openDropdown === "category" && (
                      <div
                        style={{ boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.08)" }}
                        className="absolute left-0 right-0 top-[44px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
                      >
                        {[
                          "Travel Accessories",
                          "Bags & Luggage",
                          "Backpacks",
                          "Apparel & Fashion",
                        ].map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setCategory(option);
                              setOpenDropdown(null);
                            }}
                            className={`flex items-center justify-between w-full h-8 px-2.5 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                              category === option
                                ? "bg-[#F5F5F5] text-[#000000] font-medium"
                                : "bg-white text-[#000000] font-normal hover:bg-[#F5F5F5]"
                            }`}
                          >
                            <span>{option}</span>
                            {category === option && (
                              <Check className="w-3.5 h-3.5 text-[#666666] shrink-0 stroke-[2]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Brand */}
                <div className="flex flex-col gap-1.5 flex-1" data-custom-dropdown>
                  <label className="text-[12px] font-normal text-[#000000] leading-[145%]">
                    Brand
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === "brand" ? null : "brand")}
                      className={`flex items-center justify-between w-full h-10 px-3 bg-white border rounded-[8px] text-[13px] text-[#000000] leading-[145%] cursor-pointer transition-colors ${
                        openDropdown === "brand"
                          ? "border-[#000000]"
                          : "border-[#BDBDBD] hover:border-[#666666]"
                      }`}
                    >
                      <span className="truncate">{brand}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#666666] shrink-0 transition-transform ${
                          openDropdown === "brand" ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {openDropdown === "brand" && (
                      <div
                        style={{ boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.08)" }}
                        className="absolute left-0 right-0 top-[44px] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
                      >
                        {[
                          "Urban Carry",
                          "Nova Living",
                          "AeroPak",
                          "Wanderlust",
                        ].map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setBrand(option);
                              setOpenDropdown(null);
                            }}
                            className={`flex items-center justify-between w-full h-8 px-2.5 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                              brand === option
                                ? "bg-[#F5F5F5] text-[#000000] font-medium"
                                : "bg-white text-[#000000] font-normal hover:bg-[#F5F5F5]"
                            }`}
                          >
                            <span>{option}</span>
                            {brand === option && (
                              <Check className="w-3.5 h-3.5 text-[#666666] shrink-0 stroke-[2]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Description section */}
          <div className="flex flex-col gap-2.5 w-full pt-2">
            <div className="flex flex-row justify-between items-center w-full">
              <h3 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                Description
              </h3>
              <button
                type="button"
                onClick={() => setShowAiRewrite((prev) => !prev)}
                className={`flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded cursor-pointer transition-colors ${
                  showAiRewrite
                    ? "bg-[#F5F5F5] text-[#000000]"
                    : "text-[#000000] hover:bg-neutral-50"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#C739FF]" />
                <span>Improve with AI</span>
              </button>
            </div>

            {/* Rich text editor container */}
            <div className="flex flex-col w-full border border-[#BDBDBD] rounded-[8px] bg-white overflow-hidden focus-within:border-[#000000] transition-colors">
              {/* Formatting toolbar */}
              <div className="flex flex-row items-center px-3.5 gap-6 h-9 border-b border-[#EAEAEA] bg-white shrink-0">
                <button
                  type="button"
                  className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer"
                >
                  Bold
                </button>
                <button
                  type="button"
                  className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer"
                >
                  Italic
                </button>
                <button
                  type="button"
                  className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer"
                >
                  Bullets
                </button>
                <button
                  type="button"
                  className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer"
                >
                  Link
                </button>
              </div>

              {/* Editor body */}
              <div className="p-4">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full text-[13px] text-[#000000] leading-[145%] outline-none resize-none bg-transparent"
                />
              </div>
            </div>
            <div className="text-[11px] font-normal text-[#666666] leading-[145%]">
              {description.length} / 2,000 characters
            </div>

            {/* AI rewrite preview (Screen 13 specification) */}
            {showAiRewrite && (
              <div className="box-border flex flex-col items-start pt-4 gap-3 w-full border-t border-[#EAEAEA]">
                {/* Assistance heading & Approval sequence */}
                <div className="flex flex-row justify-between items-center w-full">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    Improve with AI
                  </span>
                  <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                    Recommend → Explain → Approve
                  </span>
                </div>

                {/* Rewrite choices */}
                <div className="flex flex-col items-start gap-2 w-full">
                  {/* Option 1: Rewrite for clarity */}
                  <label
                    onClick={() => setSelectedRewriteOption("clarity")}
                    className="flex flex-row items-center gap-2 cursor-pointer w-full"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedRewriteOption === "clarity"
                          ? "border-[#000000] bg-[#000000]"
                          : "border-[#666666] bg-white"
                      }`}
                    >
                      {selectedRewriteOption === "clarity" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                      Rewrite for clarity
                    </span>
                  </label>

                  {/* Option 2: Make more concise */}
                  <label
                    onClick={() => setSelectedRewriteOption("concise")}
                    className="flex flex-row items-center gap-2 cursor-pointer w-full"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedRewriteOption === "concise"
                          ? "border-[#000000] bg-[#000000]"
                          : "border-[#666666] bg-white"
                      }`}
                    >
                      {selectedRewriteOption === "concise" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                      Make more concise
                    </span>
                  </label>
                  <span className="text-[11px] font-normal text-[#666666] leading-[145%] pl-5">
                    Alternative: A durable premium travel bag for short business trips and weekends.
                  </span>
                </div>

                {/* Suggested rewrite preview box */}
                <div className="box-border flex flex-col items-start p-4 gap-3 w-full bg-[#F5F5F5] rounded-[8px]">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    Preview · Not applied
                  </span>

                  <p className="text-[12px] font-normal text-[#000000] leading-[145%]">
                    {selectedRewriteOption === "clarity" ? (
                      <>
                        <span className="font-semibold">A durable, premium travel bag</span> for{" "}
                        <span className="font-semibold">short business trips and weekend travel.</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">A durable premium travel bag</span> for{" "}
                        <span className="font-semibold">short business trips and weekends.</span>
                      </>
                    )}
                  </p>

                  <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
                    Simplifies the sentence using only your existing description. No new features or product claims have been added. Your original remains unchanged above.
                  </p>

                  {/* Approval actions */}
                  <div className="flex flex-row items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const targetRewrite =
                          selectedRewriteOption === "clarity"
                            ? aiRewriteClarity
                            : aiRewriteConcise;
                        setDescription(targetRewrite);
                        setShowAiRewrite(false);
                        toast({
                          title: "Suggestion Applied",
                          description: "AI description suggestion applied to product description.",
                        });
                      }}
                      className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors"
                    >
                      Apply suggestion
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAiRewrite(false)}
                      className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#EAEAEA] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Additional attributes */}
          <div className="flex flex-col gap-4 w-full pt-4 border-t border-[#EAEAEA]">
            {/* Disclosure header */}
            <div className="flex flex-row justify-between items-center w-full">
              <button
                type="button"
                onClick={() => setIsAttributesExpanded(!isAttributesExpanded)}
                className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer flex items-center gap-1"
              >
                Additional attributes {isAttributesExpanded ? "–" : "+"}
              </button>
              <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                {currentAttributeDefs.length} attributes configured
              </span>
            </div>

            {/* Expanded category-specific attributes content */}
            {isAttributesExpanded && (
              <div className="flex flex-col gap-4 w-full">
                {/* Value provenance copy */}
                <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  Attribute values were not supplied in the existing product record. Confirm factual and tax details before distributing them.
                </p>

                {/* Dynamic 2-column grid rendered according to category schema */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
                  {currentAttributeDefs.map((attr) => (
                    <div key={attr.key} className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-normal text-[#000000] leading-[145%]">
                        {attr.label}
                      </label>
                      <div className="flex items-center h-10 px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                        <input
                          type="text"
                          value={customAttributes[attr.key] ?? "Not supplied"}
                          onChange={(e) =>
                            setCustomAttributes((prev) => ({
                              ...prev,
                              [attr.key]: e.target.value,
                            }))
                          }
                          placeholder="Not supplied"
                          className="w-full text-[13px] font-normal text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Master and channel relationship */}
          <div className="flex flex-col gap-2 pt-4 border-t border-[#EAEAEA] w-full">
            <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
              Master product
            </span>
            <div className="flex flex-col gap-1 text-[11px] leading-[145%]">
              <div className="flex items-center gap-1.5 text-[#666666]">
                <ArrowDown className="w-3 h-3 text-[#666666]" />
                <span>Inherited by connected listings</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium text-[#000000]">
                <ArrowDown className="w-3 h-3 text-[#000000]" />
                <span>Amazon · Flipkart · Meesho · Shopify</span>
              </div>
            </div>
            <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
              Changes to core product information may be reflected across connected listings. Marketplace-specific content remains independently manageable.
            </p>
            <button
              type="button"
              onClick={() => navigate(ROUTES.LISTINGS)}
              className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer text-left pt-1"
            >
              View affected listings
            </button>
          </div>
        </div>

        {/* COLUMN 3: Change impact and readiness rail (248px) */}
        <div className="flex flex-col gap-5 w-[248px] border-l border-[#EAEAEA] pl-6 shrink-0">
          {/* Change impact card */}
          <div className="flex flex-col gap-2.5 w-full">
            <h3 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
              Change impact
            </h3>
            {hasChanges ? (
              <>
                <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                  Product name changed
                </span>
                <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  Potential impact · 3 connected listings
                </span>

                {/* Affected marketplaces list */}
                <div className="flex flex-col w-full divide-y divide-[#EAEAEA] border-y border-[#EAEAEA] my-1">
                  <div className="flex flex-row justify-between items-center py-2 text-[12px] leading-[145%]">
                    <span className="text-[#000000]">Amazon</span>
                    <span className="text-[11px] text-[#666666]">Name inherited</span>
                  </div>
                  <div className="flex flex-row justify-between items-center py-2 text-[12px] leading-[145%]">
                    <span className="text-[#000000]">Flipkart</span>
                    <span className="text-[11px] text-[#666666]">Name inherited</span>
                  </div>
                  <div className="flex flex-row justify-between items-center py-2 text-[12px] leading-[145%]">
                    <span className="text-[#000000]">Meesho</span>
                    <span className="text-[11px] text-[#666666]">Name inherited</span>
                  </div>
                </div>

                <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  Shopify content is independently managed.
                </p>
                <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  Updates are not sent to listings until you save.
                </p>

                <button
                  type="button"
                  onClick={() => navigate(ROUTES.LISTINGS)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer text-left pt-0.5"
                >
                  Review affected listings →
                </button>
              </>
            ) : isSaved ? (
              <>
                <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                  No pending changes
                </span>

                {/* Changes saved banner */}
                <div className="box-border flex flex-col p-3 gap-1 bg-[#F5F5F5] rounded-[8px] my-1">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    Changes saved
                  </span>
                  <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                    3 listings will sync shortly.
                  </span>
                </div>

                {/* Affected marketplaces list with sync pending status */}
                <div className="flex flex-col w-full divide-y divide-[#EAEAEA] border-y border-[#EAEAEA] my-1">
                  <div className="flex flex-row justify-between items-center py-2 text-[12px] leading-[145%]">
                    <span className="text-[#000000]">Amazon</span>
                    <span className="text-[11px] text-[#666666]">Sync pending</span>
                  </div>
                  <div className="flex flex-row justify-between items-center py-2 text-[12px] leading-[145%]">
                    <span className="text-[#000000]">Flipkart</span>
                    <span className="text-[11px] text-[#666666]">Sync pending</span>
                  </div>
                  <div className="flex flex-row justify-between items-center py-2 text-[12px] leading-[145%]">
                    <span className="text-[#000000]">Meesho</span>
                    <span className="text-[11px] text-[#666666]">Sync pending</span>
                  </div>
                </div>

                <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  Shopify content is independently managed.
                </p>
                <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  Saved to the master product. Listings have not synced yet.
                </p>

                <button
                  type="button"
                  onClick={() => navigate(ROUTES.LISTINGS)}
                  className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer text-left pt-0.5"
                >
                  View listings →
                </button>
              </>
            ) : (
              <>
                <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                  No changes made
                </span>
                <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  Edit product fields to see the potential impact on connected sales channels.
                </p>
              </>
            )}
          </div>

          {/* Section divider */}
          <div className="w-full h-[1px] bg-[#EAEAEA]" />

          {/* Product readiness */}
          <div className="flex flex-col gap-2.5 w-full">
            <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
              Product readiness
            </span>
            <div className="text-[18px] font-semibold text-[#000000] leading-[145%]">
              92% complete
            </div>

            {/* Progress bar */}
            <div className="w-full h-[3px] bg-[#EAEAEA] rounded-full overflow-hidden">
              <div className="h-full bg-[#000000] w-[92%]" />
            </div>

            {/* Readiness checks */}
            <div className="flex flex-col gap-2.5 w-full pt-1">
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                <span className="text-[#000000]">Core information</span>
              </div>
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                <span className="text-[#000000]">Product media</span>
              </div>
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                <span className="text-[#000000]">Required attributes</span>
              </div>
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                <span className="text-[#000000]">Marketplace content</span>
              </div>
            </div>

            <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
              1 marketplace listing needs content review.
            </p>

            <button
              type="button"
              onClick={() => navigate(ROUTES.LISTINGS)}
              className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer text-left"
            >
              Review →
            </button>
          </div>

          {/* Section divider */}
          <div className="w-full h-[1px] bg-[#EAEAEA]" />

          {/* Suggested improvement */}
          <div className="flex flex-col gap-2 w-full">
            <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
              Suggested improvement
            </span>
            <p className="text-[12px] font-normal text-[#000000] leading-[145%]">
              Your product description is shorter than the average for this category.
            </p>
            <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
              Adding key product benefits may improve listing completeness.
            </p>

            <div className="flex flex-row items-center gap-4 pt-1">
              <button
                type="button"
                className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
              >
                Review suggestion
              </button>
              <button
                type="button"
                className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Persistent Bottom Action Bar */}
      <div
        className={`fixed bottom-0 right-0 z-20 flex flex-row items-center justify-between h-[72px] px-12 bg-white border-t border-[#EAEAEA] transition-all duration-300 ${
          sidebarCollapsed ? "left-14" : "left-[224px]"
        }`}
      >
        {/* Save status */}
        <div className="flex items-center gap-2">
          {!hasChanges && isSaved && (
            <Check className="w-3.5 h-3.5 text-[#666666] stroke-[2.5]" />
          )}
          <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
            {hasChanges ? "Unsaved changes" : "All changes saved"}
          </span>
        </div>

        {/* Save actions */}
        <div className="flex flex-row items-center gap-2">
          <button
            type="button"
            disabled={!hasChanges}
            onClick={handleDiscard}
            className={`flex items-center justify-center h-9 px-4 rounded-[8px] text-[12px] font-semibold leading-[145%] transition-colors ${
              hasChanges
                ? "bg-white text-[#000000] hover:bg-neutral-100 cursor-pointer"
                : "bg-[#F5F5F5] text-[#9E9E9E] cursor-not-allowed"
            }`}
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!hasChanges}
            onClick={handleSaveChanges}
            className={`flex items-center justify-center h-9 px-4 rounded-[8px] text-[12px] font-semibold leading-[145%] transition-colors ${
              hasChanges
                ? "bg-[#000000] text-white hover:bg-neutral-800 cursor-pointer"
                : "bg-[#F5F5F5] text-[#9E9E9E] cursor-not-allowed"
            }`}
          >
            Save changes
          </button>
        </div>
      </div>

      {/* Leave confirmation dialog (Exact Figma Screen 13 specification) */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="max-w-[480px] w-[480px] p-6 bg-white border border-[#EAEAEA] rounded-[12px] shadow-[0px_12px_40px_rgba(0,0,0,0.094)] gap-5 text-left font-['Inter',sans-serif]">
          {/* Section heading */}
          <DialogTitle className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            You have unsaved changes
          </DialogTitle>

          {/* Supporting copy */}
          <p className="text-[13px] font-normal text-[#000000] leading-[145%] -mt-2">
            Your latest edits will be lost if you leave now.
          </p>

          {/* Leave choices */}
          <div className="flex flex-row items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLeaveDialogOpen(false)}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={handleConfirmDiscardAndLeave}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={handleConfirmSaveAndLeave}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors"
            >
              Save changes
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Save Impact Dialog ── */}
      <Dialog open={saveImpactDialogOpen} onOpenChange={setSaveImpactDialogOpen}>
        <DialogContent className="max-w-[520px] w-[520px] p-0 bg-white border border-[#EAEAEA] rounded-[12px] shadow-[0px_12px_40px_rgba(0,0,0,0.094)] gap-0 text-left font-['Inter',sans-serif] overflow-hidden">
          {/* Dialog body */}
          <div className="px-6 pt-6 pb-5 flex flex-col gap-4">
            {/* Heading */}
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-[16px] font-semibold text-[#000000] leading-[145%]">
                This change may affect connected listings.
              </DialogTitle>
              <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
                {affectedChannels.length} marketplace listings may need to be remapped.
              </p>
            </div>

            {/* Change summary */}
            <div className="flex items-center gap-2 text-[12px] leading-[145%]">
              <span className="font-normal text-[#666666]">
                {savedCategory} <span className="mx-1">→</span> {category}
              </span>
            </div>

            {/* Affected channels table */}
            <div className="flex flex-col w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden">
              {affectedChannels.map((channel, idx) => (
                <div
                  key={channel}
                  className={`flex items-center justify-between px-4 h-11 text-[13px] ${
                    idx < affectedChannels.length - 1 ? "border-b border-[#EAEAEA]" : ""
                  }`}
                >
                  <span className="font-normal text-[#000000]">{channel}</span>
                  <span className="font-normal text-[#666666]">Category mapping review</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dialog footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#EAEAEA] bg-[#FAFAFA]">
            <button
              type="button"
              onClick={() => {
                setSaveImpactDialogOpen(false);
                toast({ title: "Review impact", description: "Navigating to affected listings…" });
              }}
              className="text-[12px] font-semibold text-[#000000] leading-[145%] hover:underline cursor-pointer"
            >
              Review impact
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSaveImpactDialogOpen(false)}
                className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#BDBDBD] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitSaveChanges}
                className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors"
              >
                Save and continue
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
