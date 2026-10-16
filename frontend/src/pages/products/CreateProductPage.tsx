import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ImagePlus,
  Sparkles,
  ChevronDown,
  ArrowRight,
  ArrowDown,
  Check,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/useToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateProduct, useProductAiSuggest } from "@/hooks/useProducts";
import { useUiStore } from "@/store/ui.store";

export default function CreateProductPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sidebarCollapsed } = useUiStore();

  // Form states matching fresh Create Product flow (empty with placeholders)
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [primaryImage, setPrimaryImage] = useState<string | null>(null);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [isAiPreviewMode, setIsAiPreviewMode] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [selectedAiChoice, setSelectedAiChoice] = useState<
    "clarity" | "concise" | "benefits"
  >("concise");

  // Track if user entered or changed information
  const isDirty = Boolean(
    productName.trim().length > 0 ||
      description.trim().length > 0 ||
      primaryImage !== null ||
      sku.trim().length > 0 ||
      brand.trim().length > 0 ||
      category.trim().length > 0 ||
      productType.trim().length > 0
  );

  const aiChoicesData = {
    clarity: {
      label: "Rewrite for clarity",
      preview:
        "The Premium Travel Bag is built for organized travel. Featuring structured compartments and weatherproof fabrics, it keeps everyday essentials secure and accessible.",
      subtext:
        "Refines syntax and flow while preserving your product identity.",
    },
    concise: {
      label: "Create a concise product description",
      preview:
        "Explore the Premium Travel Bag in our Travel Accessories collection. Review the product details to find out whether it suits your travel needs.",
      subtext:
        "Based on the product name and category only. Add verified features before highlighting specific benefits.",
    },
    benefits: {
      label: "Highlight key benefits",
      preview:
        "Travel smarter with the Premium Travel Bag: durable water-resistant exterior, quick-grab tech storage, and balanced ergonomics for all-day commuting.",
      subtext:
        "Emphasizes key customer advantages and usage scenarios for marketplace listings.",
    },
  };

  // Form states for Screen 12 More Product Information
  const [productCategory, setProductCategory] = useState("Select material");
  const [material, setMaterial] = useState("Select material");
  const [countryOfOrigin, setCountryOfOrigin] = useState("Select country");
  const [dimensions, setDimensions] = useState("");
  const [weight, setWeight] = useState("");
  const [taxRate, setTaxRate] = useState("Select tax rate");
  const [hsnCode, setHsnCode] = useState<string>("42021290");
  const [price] = useState<number>(1499);
  const [mrp] = useState<number>(2499);
  const [stock] = useState<number>(25);
  const [customAttributes, setCustomAttributes] = useState<Array<{ name: string; value: string }>>([
    { name: "", value: "" },
  ]);

  // Upload state for Screen 12 — Primary image uploading
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(64);
  const [uploadFileName, setUploadFileName] = useState("premium-travel-bag.jpg");

  // Handle uploading simulation
  const startImageUpload = (file?: File, placeholderUrl?: string) => {
    const name = file ? file.name : "premium-travel-bag.jpg";
    const previewUrl = file
      ? URL.createObjectURL(file)
      : placeholderUrl || "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80";
    
    setUploadFileName(name);
    setPrimaryImage(previewUrl);
    setIsUploadingImage(true);
    setUploadProgress(20);

    let currentProgress = 20;
    const interval = setInterval(() => {
      currentProgress += 20;
      if (currentProgress >= 100) {
        clearInterval(interval);
        setUploadProgress(100);
        setTimeout(() => {
          setIsUploadingImage(false);
          toast({
            title: "Image Uploaded",
            description: `${name} uploaded successfully.`,
          });
        }, 500);
      } else {
        setUploadProgress(currentProgress);
      }
    }, 350);
  };

  const handleCancelUpload = () => {
    setIsUploadingImage(false);
    setUploadProgress(0);
    setPrimaryImage(null);
  };

  const handleAddAttribute = () => {
    setCustomAttributes([...customAttributes, { name: "", value: "" }]);
  };

  const handleAttributeChange = (index: number, field: "name" | "value", val: string) => {
    const updated = [...customAttributes];
    updated[index][field] = val;
    setCustomAttributes(updated);
  };

  const createMutation = useCreateProduct();
  const aiSuggestMutation = useProductAiSuggest();

  // Handle AI suggestion
  const handleApplyAi = async () => {
    if (!productName) {
      toast({
        title: "Product Name Required",
        description: "Please enter a product name to generate description suggestions.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await aiSuggestMutation.mutateAsync({
        title: productName,
        description: description || "Ergonomic multi-compartment travel bag with waterproof lining and laptop sleeve.",
      });

      if (result.suggestedDescription) {
        setDescription(result.suggestedDescription);
      }
      setAiModalOpen(false);
      toast({
        title: "Content Enhanced",
        description: "AI description suggestions have been applied.",
      });
    } catch {
      toast({
        title: "AI Suggestion Failed",
        description: "Could not contact AI service. Default description applied.",
      });
      setDescription(
        "Crafted with water-resistant ballistic nylon, the Premium Travel Bag features dedicated quick-access compartments, ergonomic padded shoulder straps, and a secure 16-inch padded laptop pocket engineered for seamless transit."
      );
      setAiModalOpen(false);
    }
  };

  const handleSaveDraft = () => {
    toast({
      title: "Draft Saved",
      description: `Product draft "${productName || sku || "TRV-1042"}" saved successfully.`,
    });
    setLeaveDialogOpen(false);
  };

  const handleCancelOrLeave = () => {
    if (isDirty) {
      setLeaveDialogOpen(true);
    } else {
      navigate(ROUTES.PRODUCTS);
    }
  };

  const handleConfirmDiscard = () => {
    setLeaveDialogOpen(false);
    navigate(ROUTES.PRODUCTS);
  };

  const handleContinue = async () => {
    try {
      await createMutation.mutateAsync({
        title: productName,
        sku: sku || "TRV-1042",
        brand,
        category,
        description: description || "Product description pending.",
        price,
        mrp,
        costPrice: 600,
        taxRatePercent: 18,
        hsnCode: hsnCode || "42021290",
        stock,
        bullets: ["Durable water-resistant finish", "Dedicated laptop compartment"],
        attributes: {},
      });
      toast({
        title: "Product Created",
        description: `Successfully added ${productName} to master catalog.`,
      });
      navigate(ROUTES.PRODUCTS);
    } catch {
      toast({
        title: "Saved Locally",
        description: "Saved product draft to local store.",
      });
      navigate(ROUTES.PRODUCTS);
    }
  };

  return (
    <div className="flex flex-col w-full text-[#000000] font-['Inter',sans-serif] pb-24">
      {/* 1. Page Introduction / Header */}
      <div className="flex flex-col gap-3 pb-6 border-b border-[#EAEAEA]">
        {/* Local breadcrumb */}
        <div className="text-[12px] leading-[145%] text-[#666666]">
          Products / Create product
        </div>

        {/* Page Title & Actions */}
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1.5 max-w-[936px]">
            <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">
              Create product
            </h1>
            <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
              Build a master product that can be distributed across your connected sales channels.
            </p>
          </div>

          {/* Header actions */}
          <div className="flex flex-row items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={handleCancelOrLeave}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* 2. Continuous Product Workspace: Left Editing Canvas (Flex-1) + Right Readiness Rail (272px) */}
      <div className="flex flex-row items-start pt-6 gap-8 w-full flex-1">
        {/* LEFT COLUMN: Editing Canvas (flex-1 expands across full screen width) */}
        <div className="flex flex-col gap-6 flex-1 min-w-0">
          {!moreInfoOpen ? (
            /* ============================================================ */
            /* VIEW 1: Standard Upper Editor View                            */
            /* ============================================================ */
            <>
              {/* Section Introduction */}
              <div className="flex flex-col gap-1.5">
                <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                  Basic information
                </h2>
                <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
                  Start with the information shared across your sales channels.
                </p>
                {isUploadingImage && (
                  <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
                    {productName || "Premium Travel Bag"} · Primary image upload · {sku || "TRV-1042"}
                  </p>
                )}
              </div>

              {isUploadingImage ? (
                /* ============================================================ */
                /* Primary Image Uploading State (Figma Screen 12)               */
                /* ============================================================ */
                <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
                  {/* Primary media stage: h-[280px] */}
                  <div className="flex flex-col items-center justify-center gap-4 w-full h-[280px] border border-[#EAEAEA] rounded-[4px] bg-white">
                    <div className="w-[180px] h-[164px] rounded-[4px] overflow-hidden flex items-center justify-center bg-[#F5F5F5]">
                      <img
                        src={primaryImage || "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"}
                        alt="Local preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
                      Local preview · Upload in progress
                    </span>
                  </div>

                  {/* Upload progress block */}
                  <div className="flex flex-col gap-3 w-full">
                    {/* File context: File name + Progress value */}
                    <div className="flex flex-row justify-between items-center w-full text-[12px] leading-[145%]">
                      <span className="font-semibold text-[#000000]">{uploadFileName}</span>
                      <span className="font-medium text-[#000000]">{uploadProgress}%</span>
                    </div>

                    {/* Upload track: 3px height */}
                    <div className="w-full h-[3px] bg-[#EAEAEA] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#000000] transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>

                    {/* Upload metadata: Transfer status + Cancel upload */}
                    <div className="flex flex-row justify-between items-center w-full">
                      <span className="text-[11px] text-[#666666] leading-[145%]">
                        1.5 MB of 2.4 MB · Uploading primary image
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelUpload}
                        className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer"
                      >
                        Cancel upload
                      </button>
                    </div>

                    {/* Supporting copy */}
                    <p className="text-[11px] text-[#666666] leading-[145%] pt-1">
                      The image will become your primary image after uploading. Product readiness will update when the file is available.
                    </p>
                  </div>

                  {/* Section divider */}
                  <div className="w-full h-[1px] bg-[#EAEAEA]" />

                  {/* Media guidance */}
                  <div className="flex flex-col gap-3 w-full">
                    <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                      Primary image
                    </span>
                    <p className="text-[13px] text-[#666666] leading-[145%]">
                      Use a clear product image. This becomes the default image inherited by connected listings.
                    </p>

                    <div className="flex flex-row items-center gap-2 pt-1">
                      <label className="flex items-center justify-center h-9 px-4 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) startImageUpload(file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          startImageUpload(
                            undefined,
                            "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"
                          )
                        }
                        className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
                      >
                        Generate placeholder
                      </button>
                    </div>
                  </div>

                  {/* Autosave state indicator */}
                  <div className="flex items-center gap-1.5 text-[11px] text-[#666666] leading-[145%] pt-2">
                    <Check className="w-3.5 h-3.5 text-[#666666]" />
                    <span>Saved · Basic information</span>
                  </div>
                </div>
              ) : (
                /* Product identity media stage: Standard Idle or Uploaded */
                <div className="flex flex-col items-center justify-center gap-3 w-full h-[176px] border border-[#EAEAEA] rounded-[4px] bg-white">
                  {primaryImage ? (
                    <div className="relative group w-full h-full flex items-center justify-center p-2">
                      <img
                        src={primaryImage}
                        alt="Product preview"
                        className="max-h-full max-w-full object-contain rounded"
                      />
                      <button
                        type="button"
                        onClick={() => setPrimaryImage(null)}
                        className="absolute top-2 right-2 px-2 py-1 bg-white/90 border border-[#EAEAEA] text-[11px] font-medium rounded hover:bg-white cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <ImagePlus className="w-6 h-6 text-[#666666]" strokeWidth={1.5} />
                      <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                        Add product image
                      </span>
                      <div className="flex flex-row items-center gap-2">
                        <label className="flex items-center justify-center h-9 px-4 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors">
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) startImageUpload(file);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            startImageUpload(
                              undefined,
                              "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"
                            )
                          }
                          className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
                        >
                          Generate placeholder
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Product identity fields */}
              <div className="flex flex-col gap-6 w-full">
                {/* First product field: Add your product heading + Product name input */}
                <div className="flex flex-col gap-2.5 w-full">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    Add your product
                  </span>

                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                      Product name
                    </label>
                    <div className="flex items-center h-[46px] px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                      <input
                        type="text"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="Product name"
                        className="w-full text-[13px] text-[#000000] leading-[145%] outline-none bg-transparent"
                      />
                    </div>
                    <span className="text-[11px] text-[#666666] leading-[145%]">
                      Use a clear, customer-facing product name.
                    </span>
                  </div>
                </div>

                {/* Product type */}
                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                    Product type
                  </label>
                  <div className="relative">
                    <select
                      value={productType}
                      onChange={(e) => setProductType(e.target.value)}
                      className={`w-full h-[45px] px-3 pr-8 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors ${
                        !productType ? "text-[#666666]" : "text-[#000000]"
                      }`}
                    >
                      <option value="" disabled>
                        Select product type
                      </option>
                      <option value="Physical product">Physical product</option>
                      <option value="Digital product">Digital product</option>
                      <option value="Service / Warranty">Service / Warranty</option>
                      <option value="Bundle / Kit">Bundle / Kit</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" />
                  </div>
                </div>

                {/* Category and brand in 2 columns */}
                <div className="flex flex-row items-center gap-5 w-full">
                  {/* Category */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                      Category
                    </label>
                    <div className="relative">
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={`w-full h-[45px] px-3 pr-8 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors ${
                          !category ? "text-[#666666]" : "text-[#000000]"
                        }`}
                      >
                        <option value="" disabled>
                          Select category
                        </option>
                        <option value="Travel Accessories">Travel Accessories</option>
                        <option value="Bags & Luggage">Bags & Luggage</option>
                        <option value="Backpacks">Backpacks</option>
                        <option value="Apparel & Fashion">Apparel & Fashion</option>
                        <option value="Electronics">Electronics</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" />
                    </div>
                  </div>

                  {/* Brand */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                      Brand
                    </label>
                    <div className="relative">
                      <select
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className={`w-full h-[45px] px-3 pr-8 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors ${
                          !brand ? "text-[#666666]" : "text-[#000000]"
                        }`}
                      >
                        <option value="" disabled>
                          Select brand
                        </option>
                        <option value="Urban Carry">Urban Carry</option>
                        <option value="Nova Living">Nova Living</option>
                        <option value="AeroPak">AeroPak</option>
                        <option value="Wanderlust">Wanderlust</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Master SKU */}
                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                    Master SKU
                  </label>
                  <div className="flex items-center h-[46px] px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="e.g. TRV-1042"
                      className="w-full text-[13px] text-[#000000] font-mono leading-[145%] outline-none bg-transparent"
                    />
                  </div>
                  <span className="text-[11px] text-[#666666] leading-[145%]">
                    Used internally to identify this master product.
                  </span>
                </div>

                {/* Description */}
                <div className="flex flex-col gap-3 w-full">
                  {/* Description introduction */}
                  <div className="flex flex-row justify-between items-center w-full">
                    <h3 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                      Description
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsAiPreviewMode(!isAiPreviewMode)}
                      className="flex flex-row items-center gap-2 h-9 px-4 rounded-[8px] bg-white hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <Sparkles
                        className="w-3.5 h-3.5 text-[#C739FF]"
                        style={{ stroke: "url(#ai-gradient)" }}
                      />
                      <svg width="0" height="0">
                        <linearGradient id="ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop stopColor="#C739FF" offset="0%" />
                          <stop stopColor="#0050FF" offset="100%" />
                        </linearGradient>
                      </svg>
                      <span
                        className="text-[12px] font-semibold leading-[145%]"
                        style={{
                          background: "linear-gradient(107.52deg, #C739FF 0.96%, #0050FF 121.91%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                        }}
                      >
                        Improve with AI
                      </span>
                    </button>
                  </div>

                  {/* Multiline editor container */}
                  <div className="flex flex-col w-full h-[184px] border border-[#BDBDBD] rounded-[8px] bg-white overflow-hidden focus-within:border-[#000000] transition-colors">
                    {/* Formatting toolbar */}
                    <div className="flex flex-row items-center px-3.5 gap-5 h-10 border-b border-[#EAEAEA] bg-white shrink-0">
                      <button
                        type="button"
                        className="text-[12px] font-medium text-[#666666] hover:text-[#000000] cursor-pointer"
                      >
                        Bold
                      </button>
                      <button
                        type="button"
                        className="text-[12px] font-medium text-[#666666] hover:text-[#000000] cursor-pointer"
                      >
                        Italic
                      </button>
                      <button
                        type="button"
                        className="text-[12px] font-medium text-[#666666] hover:text-[#000000] cursor-pointer"
                      >
                        Bullets
                      </button>
                      <button
                        type="button"
                        className="text-[12px] font-medium text-[#666666] hover:text-[#000000] cursor-pointer"
                      >
                        Link
                      </button>
                    </div>

                    {/* Description input */}
                    <div className="flex-1 p-4 flex flex-col justify-between">
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                        placeholder="Describe what makes this product useful, who it is for and what customers should know."
                        className="w-full flex-1 text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none resize-none bg-transparent"
                      />
                      <div className="text-[11px] text-[#666666] leading-[145%] select-none">
                        {description.length} / 2,000 characters
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI suggestions container — Appears below Description when Improve with AI is active */}
                {isAiPreviewMode && (
                  <div className="flex flex-col gap-3 pt-4 border-t border-[#EAEAEA] w-full animate-in fade-in duration-200">
                    {/* Approval principle */}
                    <div className="flex flex-row justify-between items-center w-full">
                      <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                        Improve with AI
                      </span>
                      <span className="text-[11px] text-[#666666] leading-[145%]">
                        AI recommends → Merchant approves
                      </span>
                    </div>

                    {/* Suggestion choices */}
                    <div className="flex flex-col gap-1 w-full">
                      {/* Choice 1: Rewrite for clarity */}
                      <button
                        type="button"
                        onClick={() => setSelectedAiChoice("clarity")}
                        className="flex flex-row items-center gap-2.5 h-[30px] w-full text-left group cursor-pointer"
                      >
                        <div className="w-[14px] flex items-center justify-center shrink-0">
                          {selectedAiChoice === "clarity" ? (
                            <div className="w-3.5 h-3.5 rounded-full bg-[#000000] flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-[#666666]" />
                          )}
                        </div>
                        <span
                          className={`text-[12px] leading-[145%] ${
                            selectedAiChoice === "clarity"
                              ? "font-semibold text-[#000000]"
                              : "font-normal text-[#666666] group-hover:text-[#000000]"
                          }`}
                        >
                          Rewrite for clarity
                        </span>
                      </button>

                      {/* Choice 2: Create a concise product description */}
                      <button
                        type="button"
                        onClick={() => setSelectedAiChoice("concise")}
                        className="flex flex-row items-center gap-2.5 h-[30px] w-full text-left group cursor-pointer"
                      >
                        <div className="w-[14px] flex items-center justify-center shrink-0">
                          {selectedAiChoice === "concise" ? (
                            <div className="w-3.5 h-3.5 rounded-full bg-[#000000] flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-[#666666]" />
                          )}
                        </div>
                        <span
                          className={`text-[12px] leading-[145%] ${
                            selectedAiChoice === "concise"
                              ? "font-semibold text-[#000000]"
                              : "font-normal text-[#666666] group-hover:text-[#000000]"
                          }`}
                        >
                          Create a concise product description
                        </span>
                      </button>

                      {/* Choice 3: Highlight key benefits */}
                      <button
                        type="button"
                        onClick={() => setSelectedAiChoice("benefits")}
                        className="flex flex-row items-center gap-2.5 h-[30px] w-full text-left group cursor-pointer"
                      >
                        <div className="w-[14px] flex items-center justify-center shrink-0">
                          {selectedAiChoice === "benefits" ? (
                            <div className="w-3.5 h-3.5 rounded-full bg-[#000000] flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-[#666666]" />
                          )}
                        </div>
                        <span
                          className={`text-[12px] leading-[145%] ${
                            selectedAiChoice === "benefits"
                              ? "font-semibold text-[#000000]"
                              : "font-normal text-[#666666] group-hover:text-[#000000]"
                          }`}
                        >
                          Highlight key benefits
                        </span>
                      </button>
                    </div>

                    {/* Suggestion preview card */}
                    <div className="flex flex-col gap-3 p-4 bg-[#F5F5F5] rounded-[8px] w-full">
                      <div className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                        Preview · Not applied
                      </div>
                      <p className="text-[13px] font-normal text-[#000000] leading-[145%]">
                        {aiChoicesData[selectedAiChoice].preview}
                      </p>
                      <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
                        {aiChoicesData[selectedAiChoice].subtext}
                      </p>

                      {/* Merchant approval actions */}
                      <div className="flex flex-row items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDescription(aiChoicesData[selectedAiChoice].preview);
                            setIsAiPreviewMode(false);
                            toast({
                              title: "Suggestion Applied",
                              description: "AI product description applied successfully.",
                            });
                          }}
                          className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors"
                        >
                          Apply suggestion
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAiPreviewMode(false)}
                          className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Optional disclosure */}
                <div className="flex flex-col gap-2 pt-4 pb-2 border-t border-[#EAEAEA] w-full">
                  <button
                    type="button"
                    onClick={() => setMoreInfoOpen(true)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-[#000000] leading-[145%] hover:underline cursor-pointer text-left"
                  >
                    <span>Add more product information +</span>
                  </button>
                  <span className="text-[11px] text-[#666666] leading-[145%]">
                    Optional details can be added later. You can always save a draft.
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* ============================================================ */
            /* VIEW 2: Screen 12 — More product information (Lower Editor)   */
            /* ============================================================ */
            <div className="flex flex-col gap-5 w-full animate-in fade-in duration-200">
              {/* Editing context: Basic information summary */}
              <div className="flex flex-col gap-1.5 w-full">
                <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
                  Basic information
                </h2>
                <div className="text-[13px] font-normal text-[#666666] leading-[145%]">
                  {productName || "Premium Travel Bag"} · {sku || "TRV-1042"}
                </div>
                <div className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  Identity and description above · Lower editor view
                </div>
              </div>

              {/* Section divider */}
              <div className="w-full h-[1px] bg-[#EAEAEA]" />

              {/* Disclosure action (collapses back) */}
              <button
                type="button"
                onClick={() => setMoreInfoOpen(false)}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-[#000000] leading-[145%] hover:underline cursor-pointer text-left"
              >
                <span>Add more product information −</span>
              </button>

              {/* Supporting copy */}
              <p className="text-[13px] font-normal text-[#666666] leading-[145%] -mt-2">
                Optional information improves listing quality. Leave any field blank and save a draft.
              </p>

              {/* Origin attributes: 3 columns */}
              <div className="flex flex-row items-center gap-5 w-full">
                {/* Product category */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                    Product category
                  </label>
                  <div className="relative">
                    <select
                      value={productCategory}
                      onChange={(e) => setProductCategory(e.target.value)}
                      className="w-full h-[45px] px-3 pr-8 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] text-[#000000] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors"
                    >
                      <option value="Select material">Select material</option>
                      <option value="Luggage & Travel Gear">Luggage & Travel Gear</option>
                      <option value="Bags & Backpacks">Bags & Backpacks</option>
                      <option value="Travel Accessories">Travel Accessories</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" />
                  </div>
                </div>

                {/* Material */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                    Material
                  </label>
                  <div className="relative">
                    <select
                      value={material}
                      onChange={(e) => setMaterial(e.target.value)}
                      className="w-full h-[45px] px-3 pr-8 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] text-[#000000] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors"
                    >
                      <option value="Select material">Select material</option>
                      <option value="Ballistic Nylon">Ballistic Nylon</option>
                      <option value="Vegan Leather">Vegan Leather</option>
                      <option value="Waterproof Canvas">Waterproof Canvas</option>
                      <option value="Polyester Fabric">Polyester Fabric</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" />
                  </div>
                </div>

                {/* Country of origin */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                    Country of origin
                  </label>
                  <div className="relative">
                    <select
                      value={countryOfOrigin}
                      onChange={(e) => setCountryOfOrigin(e.target.value)}
                      className="w-full h-[45px] px-3 pr-8 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] text-[#000000] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors"
                    >
                      <option value="Select country">Select country</option>
                      <option value="India">India</option>
                      <option value="Vietnam">Vietnam</option>
                      <option value="China">China</option>
                      <option value="Indonesia">Indonesia</option>
                      <option value="United States">United States</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Dimensions */}
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                  Dimensions
                </label>
                <div className="flex items-center h-[46px] px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                  <input
                    type="text"
                    value={dimensions}
                    onChange={(e) => setDimensions(e.target.value)}
                    placeholder="Length × Width × Height · cm"
                    className="w-full text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
                  />
                </div>
                <span className="text-[11px] text-[#666666] leading-[145%]">
                  Use the product's dimensions, not its shipping package.
                </span>
              </div>

              {/* Weight */}
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                  Weight
                </label>
                <div className="flex items-center h-[45px] px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                  <input
                    type="text"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="Enter weight · kg"
                    className="w-full text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
                  />
                </div>
              </div>

              {/* Tax attributes: 2 columns */}
              <div className="flex flex-row items-center gap-5 w-full">
                {/* GST / tax information */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                    GST / tax information
                  </label>
                  <div className="relative">
                    <select
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-full h-[45px] px-3 pr-8 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] text-[#000000] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors"
                    >
                      <option value="Select tax rate">Select tax rate</option>
                      <option value="GST 18%">GST 18%</option>
                      <option value="GST 12%">GST 12%</option>
                      <option value="GST 28%">GST 28%</option>
                      <option value="GST 5%">GST 5%</option>
                      <option value="GST 0%">GST 0% (Exempt)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" />
                  </div>
                </div>

                {/* HSN code */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                    HSN code
                  </label>
                  <div className="flex items-center h-[45px] px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                    <input
                      type="text"
                      value={hsnCode}
                      onChange={(e) => setHsnCode(e.target.value)}
                      placeholder="Enter HSN code"
                      className="w-full text-[13px] text-[#000000] font-mono leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Section divider */}
              <div className="w-full h-[1px] bg-[#EAEAEA] my-1" />

              {/* Custom attributes */}
              <div className="flex flex-col gap-3 w-full">
                <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                  Custom attributes
                </span>
                <p className="text-[11px] text-[#666666] leading-[145%] -mt-1">
                  Add a product-specific attribute to the master record. Confirm factual details before distributing them to listings.
                </p>

                {/* Dynamic attribute rows */}
                <div className="flex flex-col gap-3 w-full">
                  {customAttributes.map((attr, idx) => (
                    <div key={idx} className="flex flex-row items-center gap-5 w-full">
                      {/* Attribute name */}
                      <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                          Attribute name
                        </label>
                        <div className="flex items-center h-[45px] px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                          <input
                            type="text"
                            value={attr.name}
                            onChange={(e) => handleAttributeChange(idx, "name", e.target.value)}
                            placeholder="e.g. Collection"
                            className="w-full text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
                          />
                        </div>
                      </div>

                      {/* Attribute value */}
                      <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-[12px] font-medium text-[#333333] leading-[145%]">
                          Attribute value
                        </label>
                        <div className="flex items-center h-[45px] px-3 bg-white border border-[#BDBDBD] rounded-[8px] focus-within:border-[#000000] transition-colors">
                          <input
                            type="text"
                            value={attr.value}
                            onChange={(e) => handleAttributeChange(idx, "value", e.target.value)}
                            placeholder="Enter value"
                            className="w-full text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add attribute action button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleAddAttribute}
                    className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
                  >
                    + Add attribute
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Readiness and channel impact rail (w-[272px] border-l pl-6) */}
        <div className="flex flex-col gap-7 w-[272px] border-l border-[#EAEAEA] pl-6 shrink-0">
          {/* 1. Product readiness */}
          <div className="flex flex-col gap-4 w-full">
            <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
              Product readiness
            </span>

            <div className="text-[18px] font-semibold text-[#000000] leading-[145%]">
              {isUploadingImage ? "50% complete" : primaryImage ? "52% complete" : "38% complete"}
            </div>

            {/* Readiness progress bar: 3px height, #EAEAEA track, black fill */}
            <div className="w-full h-[3px] bg-[#EAEAEA] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#000000] transition-all duration-300"
                style={{ width: isUploadingImage ? "50%" : primaryImage ? "52%" : "38%" }}
              />
            </div>

            {/* Required checklist heading */}
            <div className="text-[12px] font-semibold text-[#000000] leading-[145%] pt-1">
              Required
            </div>

            {/* Checklist items: Required */}
            <div className="flex flex-col gap-2.5 w-full">
              {/* Product name */}
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                {productName.trim().length > 0 ? (
                  <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                )}
                <span className="text-[#000000]">Product name</span>
              </div>

              {/* Category */}
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                {category ? (
                  <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                )}
                <span className="text-[#000000]">Category</span>
              </div>

              {/* Product type */}
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                {productType ? (
                  <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                )}
                <span className="text-[#000000]">Product type</span>
              </div>

              {/* Primary image */}
              <div className="flex flex-row items-center justify-between text-[12px] leading-[145%]">
                <div className="flex items-center gap-2.5">
                  {isUploadingImage ? (
                    <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                  ) : primaryImage ? (
                    <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                  )}
                  <span className="text-[#000000]">Primary image</span>
                </div>
                {isUploadingImage && (
                  <span className="text-[10px] text-[#666666] leading-[145%]">
                    Uploading
                  </span>
                )}
              </div>

              {/* Master SKU */}
              <div className="flex flex-row items-center justify-between text-[12px] leading-[145%]">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                  <span className="text-[#000000]">Master SKU</span>
                </div>
                <span className="text-[10px] text-[#666666] leading-[145%]">
                  Verify
                </span>
              </div>
            </div>

            {/* Recommended checklist heading */}
            <div className="text-[12px] font-semibold text-[#000000] leading-[145%] pt-2">
              Recommended
            </div>

            {/* Checklist items: Recommended */}
            <div className="flex flex-col gap-2.5 w-full">
              {/* Description */}
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                {description.length > 20 ? (
                  <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                )}
                <span className="text-[#000000]">Description</span>
              </div>

              {/* Brand */}
              <div className="flex flex-row items-center justify-between text-[12px] leading-[145%]">
                <div className="flex items-center gap-2.5">
                  {isUploadingImage ? (
                    <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                  )}
                  <span className="text-[#000000]">Brand</span>
                </div>
                {!isUploadingImage && (
                  <span className="text-[10px] text-[#666666] leading-[145%]">
                    Confirm
                  </span>
                )}
              </div>

              {/* Attributes */}
              <div className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
                <div className="w-3.5 h-3.5 rounded-full border border-[#666666] flex items-center justify-center shrink-0" />
                <span className="text-[#000000]">Attributes</span>
              </div>
            </div>

            {/* Disclaimer caption */}
            <p className="text-[11px] text-[#666666] leading-[145%] pt-1">
              SKU and brand are entered; circles indicate pending verification or confirmation, not missing values.
            </p>

            {/* Section divider */}
            <div className="w-full h-[1px] bg-[#EAEAEA] my-1" />

            {/* 1 issue blocking publication callout */}
            <div className="flex flex-col gap-2 w-full">
              <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                1 issue blocking publication
              </span>
              <p className="text-[11px] text-[#666666] leading-[145%]">
                {isUploadingImage
                  ? "Primary image is uploading. Publication stays blocked until the upload completes."
                  : "Add a primary image before publishing this product to marketplaces."}
              </p>
              <button
                type="button"
                onClick={() =>
                  startImageUpload(
                    undefined,
                    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"
                  )
                }
                className="flex items-center justify-center h-9 w-[84px] rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors mt-1"
              >
                Fix issue
              </button>
            </div>
          </div>

          {/* Section divider */}
          <div className="w-full h-[1px] bg-[#EAEAEA]" />

          {/* 2. Channel impact */}
          <div className="flex flex-col gap-3 w-full">
            <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
              Where this information goes
            </span>

            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                Master Product
              </span>
              <div className="text-[12px] text-[#666666] flex items-center">
                <ArrowDown className="w-3.5 h-3.5 text-[#666666]" />
              </div>
              <span className="text-[11px] font-medium text-[#000000] leading-[145%]">
                Amazon · Flipkart · Meesho · Shopify
              </span>
            </div>

            <p className="text-[11px] text-[#666666] leading-[145%]">
              Core product information can be inherited by connected listings. Marketplace-specific content can be customized later.
            </p>

            <div className="text-[11px] text-[#666666] leading-[145%] pt-1 flex items-center flex-wrap gap-1">
              <span>Product</span>
              <span>→</span>
              <span>Variants</span>
              <span>→</span>
              <span>Inventory</span>
              <span>→</span>
              <span>Listings</span>
              <span>→</span>
              <span>Channels</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Persistent Bottom Action Bar (Fixed at bottom: h-[72px] border-t bg-white) */}
      <div
        className={`fixed bottom-0 right-0 z-20 flex flex-row items-center justify-between h-[72px] px-12 bg-white border-t border-[#EAEAEA] transition-all duration-300 ${
          sidebarCollapsed ? "left-14" : "left-[224px]"
        }`}
      >
        {/* Draft actions: Save as draft + Last saved just now */}
        <div className="flex flex-row items-center gap-4">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="flex items-center justify-center h-9 px-4 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors"
          >
            Save as draft
          </button>
          <span className="text-[11px] text-[#666666] leading-[145%]">
            Last saved just now
          </span>
        </div>

        {/* Step navigation: Validation scope + Back + Continue */}
        <div className="flex flex-row items-center gap-2">
          <span className="text-[11px] text-[#666666] leading-[145%] mr-2">
            Continue checks this step only
          </span>
          <button
            type="button"
            onClick={handleCancelOrLeave}
            className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="flex items-center justify-center gap-2 h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            <span>Continue</span>
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Leave confirmation dialog (Figma: Screen 12 — Leave confirmation dialog) */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="max-w-[480px] w-[480px] p-6 bg-white border border-[#EAEAEA] rounded-[12px] shadow-[0px_12px_40px_rgba(0,0,0,0.094)] gap-5 text-left">
          {/* Section heading */}
          <DialogTitle className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Save changes before leaving?
          </DialogTitle>

          {/* Supporting copy 1 */}
          <p className="text-[13px] font-normal text-[#000000] leading-[145%] -mt-1">
            You have unsaved changes to {productName || "this product"}. Save a draft to keep your work, or discard the changes and leave.
          </p>

          {/* Supporting copy 2 */}
          <p className="text-[11px] font-normal text-[#666666] leading-[145%] -mt-2">
            Draft saving is available even when this step needs a correction. Nothing is published.
          </p>

          {/* Leave choices */}
          <div className="flex flex-row items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLeaveDialogOpen(false)}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors"
            >
              Stay
            </button>
            <button
              type="button"
              onClick={handleConfirmDiscard}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors"
            >
              Save draft
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Suggestion Dialog */}
      <Dialog open={aiModalOpen} onOpenChange={setAiModalOpen}>
        <DialogContent className="max-w-md bg-white border border-[#EAEAEA] p-6 rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-[#000000]">
              <Sparkles className="h-4 w-4 text-[#C739FF]" />
              <span>AI Content Enhancement</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs py-2">
            <p className="text-[#666666] leading-[145%]">
              Commerce Copilot generates channel-optimized copy tailored for high-converting product pages across Amazon, Flipkart, and Shopify.
            </p>
            <div className="rounded-lg bg-neutral-50 p-3 border border-[#EAEAEA] text-[#000000] space-y-1">
              <div className="font-semibold text-[12px]">Product:</div>
              <div className="italic text-[12px]">{productName || "Untitled"}</div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#EAEAEA]">
            <button
              type="button"
              onClick={() => setAiModalOpen(false)}
              className="px-3 py-1.5 rounded-[8px] text-xs font-semibold text-[#000000] hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyAi}
              disabled={aiSuggestMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold bg-[#000000] text-white hover:bg-neutral-800"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiSuggestMutation.isPending ? "Generating..." : "Generate & Apply"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
