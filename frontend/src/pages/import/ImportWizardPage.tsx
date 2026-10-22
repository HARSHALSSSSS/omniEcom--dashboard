import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, LayoutGrid, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportStepper } from "@/components/import/ImportStepper";
import { cn } from "@/utils/cn";
import { ImportSummarySidebar } from "@/components/import/ImportSummarySidebar";
import { ImportSettingsSection } from "@/components/import/ImportSettingsSection";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/useToast";
import { initialImportJob } from "@/mocks/data/imports.data";
import { ColumnMappingField } from "@/types/import";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ImportWizardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasFileError, setHasFileError] = useState<boolean>(false);
  const [showSettingsView, setShowSettingsView] = useState<boolean>(false);
  const [isStartingImport, setIsStartingImport] = useState<boolean>(false);
  const [step4ViewMode, setStep4ViewMode] = useState<"card" | "table">("card");

  // Step 3 Dynamic Column Mappings State (Backend-connectable)
  const [mappings, setMappings] = useState<ColumnMappingField[]>(initialImportJob.mappings);
  const [editingMapping, setEditingMapping] = useState<ColumnMappingField | null>(null);
  const [targetFieldDraft, setTargetFieldDraft] = useState<string>("");
  const [isSavingMapping, setIsSavingMapping] = useState<boolean>(false);

  const MASTER_PRODUCT_FIELDS = [
    { value: "Product name", label: "Product name", required: true, description: "Primary product title shown on all sales channels" },
    { value: "Master SKU", label: "Master SKU", required: true, description: "Unique catalog identifier across platforms" },
    { value: "Product type", label: "Product type", required: false, description: "High-level classification or physical form" },
    { value: "Category", label: "Category", required: true, description: "Standard category in your taxonomy tree" },
    { value: "Description", label: "Description", required: false, description: "Rich or plain text product description" },
    { value: "Product media", label: "Product media", required: false, description: "Primary product image URL or gallery links" },
    { value: "Selling price", label: "Selling price", required: true, description: "Retail selling price (INR)" },
    { value: "Cost price", label: "Cost price", required: false, description: "Unit purchase or manufacturing cost" },
    { value: "Barcode", label: "Barcode / UPC / EAN", required: false, description: "Universal product barcode" },
    { value: "Inventory quantity", label: "Inventory quantity", required: false, description: "Current on-hand stock" },
    { value: "Brand", label: "Brand", required: false, description: "Brand name or manufacturer label" },
    { value: "Weight", label: "Weight", required: false, description: "Package shipping weight" },
    { value: "Do not import", label: "Do not import (Ignore)", required: false, description: "Skip this column during catalog import" },
  ];

  const hasCategoryIssue = mappings.some(
    (m) => m.sourceColumn === "Product Category" && m.status === "needs_review"
  );
  const step3AttentionCount = hasCategoryIssue ? 16 : 8;
  const step3ReadyCount = 247 - step3AttentionCount;
  const step3ReadinessPercent = Math.floor((step3ReadyCount / 247) * 100);

  const handleOpenMappingDialog = (mapping: ColumnMappingField) => {
    setEditingMapping(mapping);
    setTargetFieldDraft(mapping.targetField);
  };

  const handleSaveMapping = () => {
    if (!editingMapping) return;
    setIsSavingMapping(true);

    setTimeout(() => {
      setMappings((prev) =>
        prev.map((m) => {
          if (m.sourceColumn === editingMapping.sourceColumn) {
            const isIgnored = targetFieldDraft === "Do not import";
            return {
              ...m,
              targetField: targetFieldDraft,
              status: isIgnored ? "unmatched" : "matched",
            };
          }
          return m;
        })
      );
      setIsSavingMapping(false);
      toast({
        title: "Column mapping saved",
        description: `Mapped "${editingMapping.sourceColumn}" to "${targetFieldDraft}".`,
      });
      setEditingMapping(null);
    }, 300);
  };

  const handleResetMappings = () => {
    setMappings(initialImportJob.mappings);
    toast({
      title: "Mappings reset",
      description: "Restored default automatic column matches.",
    });
  };

  // Settings State
  const [duplicateStrategy, setDuplicateStrategy] = useState<"update" | "create_only" | "ask">("ask");
  const [importImageUrls, setImportImageUrls] = useState<boolean>(true);
  const [matchVariants, setMatchVariants] = useState<boolean>(true);
  const [importQuantities, setImportQuantities] = useState<boolean>(true);

  // Step 4 filter tab
  const [activeTab, setActiveTab] = useState<"categories" | "skus" | "duplicates" | "images">("categories");

  // Mock Job ID
  const importId = "IMP-10482";

  // Handlers
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.endsWith(".csv") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        setHasFileError(true);
      } else {
        setHasFileError(false);
        setSelectedFile(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith(".csv") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        setHasFileError(true);
      } else {
        setHasFileError(false);
        setSelectedFile(file);
      }
    }
  };

  const simulateSelectDefaultFile = () => {
    setHasFileError(false);
    setSelectedFile(new File(["mock"], "products_october.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };

  const handleStartImport = () => {
    setIsStartingImport(true);
    setTimeout(() => {
      navigate(`/products/import/${importId}/processing`);
    }, 1500);
  };

  return (
    <div className="w-full min-h-full pb-28 text-foreground">
      {/* Top Breadcrumb & Catalog Import Header */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">
              CATALOG IMPORT
            </div>
            <h1 className="text-[26px] leading-[39px] font-semibold text-[#000000] dark:text-white mt-0.5">
              Import products
            </h1>
            <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
              Bring your existing catalog into your master product workspace.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(ROUTES.PRODUCTS)}
            className="w-[152px] h-[36px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium"
          >
            Import history
          </Button>
        </div>

        {/* Stepper with top and bottom dividers */}
        <div className="border-t border-b border-[#E3E3E3] dark:border-border py-2.5">
          <ImportStepper
            currentStep={currentStep}
            onStepClick={(step) => {
              setShowSettingsView(false);
              setCurrentStep(step);
            }}
          />
        </div>
      </div>

      {/* Main Content Area Based on Current Step */}

      {/* ──────────────── STEP 1: SOURCE ──────────────── */}
      {currentStep === 1 && (
        <div className="pt-4">
          {/* Main Section Heading */}
          <div className="mb-8">
            <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">
              Bring your catalog into one place.
            </h2>
            <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
              Upload a spreadsheet or import products from a connected marketplace.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-12 items-start w-full">
            {/* Left: Where are your products coming from? + 3 Rows (takes all available width) */}
            <div className="flex-1 min-w-0 w-full">
              <h3 className="text-[17px] leading-[26px] font-semibold text-[#000000] dark:text-white">
                Where are your products coming from?
              </h3>
              <p className="text-[12px] leading-[18px] font-normal text-[#666666] mt-1 mb-5">
                Choose how you want to bring products into your catalog.
              </p>

              {/* Rows List with Clean Horizontal Dividers */}
              <div className="divide-y divide-[#E3E3E3] dark:divide-border border-y border-[#E3E3E3] dark:border-border w-full">
                {/* Option 01: Excel or Csv */}
                <div className="flex items-center justify-between py-6">
                  <div className="flex items-start gap-4">
                    <span className="w-[42px] shrink-0 text-[11px] leading-[17px] font-medium text-[#666666] pt-1">
                      01
                    </span>
                    <div className="space-y-1">
                      <h4 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white">
                        Excel or CSV
                      </h4>
                      <p className="text-[12px] leading-[18px] font-normal text-[#666666]">
                        Import products from an existing spreadsheet.
                      </p>
                      <div className="text-[11px] leading-[17px] font-medium text-[#666666] pt-2">
                        .xlsx, .xls, .csv
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      simulateSelectDefaultFile();
                      setCurrentStep(2);
                    }}
                    className="w-[192px] h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium rounded-[5px]"
                  >
                    Choose file
                  </Button>
                </div>

                {/* Option 02: Connected Marketplace */}
                <div className="flex items-center justify-between py-6">
                  <div className="flex items-start gap-4">
                    <span className="w-[42px] shrink-0 text-[11px] leading-[17px] font-medium text-[#666666] pt-1">
                      02
                    </span>
                    <div className="space-y-1">
                      <h4 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white">
                        Connected marketplace
                      </h4>
                      <p className="text-[12px] leading-[18px] font-normal text-[#666666]">
                        Import products from a marketplace already connected to your workspace.
                      </p>
                      <div className="text-[11px] leading-[17px] font-medium text-[#666666] pt-2">
                        Amazon · 427 products
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      simulateSelectDefaultFile();
                      setCurrentStep(3);
                    }}
                    className="w-[192px] h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 text-[12px] leading-[18px] font-medium rounded-[5px] bg-white dark:bg-card"
                  >
                    Import catalog
                  </Button>
                </div>

                {/* Option 03: Request bulk product */}
                <div className="flex items-center justify-between py-6">
                  <div className="flex items-start gap-4">
                    <span className="w-[42px] shrink-0 text-[11px] leading-[17px] font-medium text-[#666666] pt-1">
                      03
                    </span>
                    <div className="space-y-1">
                      <h4 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white">
                        Request bulk product template
                      </h4>
                      <p className="text-[12px] leading-[18px] font-normal text-[#666666]">
                        Download a structured template, add your products, then upload it here.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({
                        title: "Template downloaded",
                        description: "Sample product template (Excel) downloaded to your computer.",
                      });
                    }}
                    className="w-[192px] h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 text-[12px] leading-[18px] font-medium rounded-[5px] bg-white dark:bg-card"
                  >
                    Download template
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Rail: Recommended for you & Trust reassurance */}
            <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0 space-y-8">
              <div className="w-full bg-[#F6F6F6] dark:bg-card/40 rounded-[5px] p-6 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] leading-[17px] font-medium text-[#666666]">
                    Recommended for you
                  </div>
                  <h3 className="text-[20px] leading-[30px] font-semibold text-[#000000] dark:text-white mt-1">
                    Import from Amazon
                  </h3>
                  <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-3">
                    We found 427 products in your connected Amazon catalog. The system can automatically match common product fields and flag only exceptions.
                  </p>
                </div>

                <div className="pt-6 space-y-3">
                  <Button
                    onClick={() => {
                      simulateSelectDefaultFile();
                      setCurrentStep(3);
                    }}
                    className="w-full h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium text-[12px] leading-[18px] rounded-[5px]"
                  >
                    Use Amazon catalog
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      simulateSelectDefaultFile();
                      setCurrentStep(2);
                    }}
                    className="w-full h-[36px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 font-medium text-[12px] leading-[18px] rounded-[5px]"
                  >
                    Choose another method
                  </Button>

                  <div className="w-full h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

                  <p className="text-[12px] leading-[18px] font-normal text-[#666666]">
                    You review the impact before importing.
                  </p>
                </div>
              </div>

              <div className="w-full space-y-2">
                <h4 className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white">
                  Review first. Import with confidence.
                </h4>
                <p className="text-[12px] leading-[18px] font-normal text-[#666666]">
                  Common fields are matched automatically. Uncertain rows remain yours to decide. Nothing is overwritten until you confirm.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── STEP 2: UPLOAD ──────────────── */}
      {currentStep === 2 && !showSettingsView && (
        <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-4">
          <div className="flex-1 min-w-0 w-full space-y-8">
            <div>
              <h2 className="text-[20px] leading-[30px] font-semibold text-[#000000] dark:text-white">
                Upload your catalog
              </h2>
              <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
                Drop your Excel or CSV file here, or choose a file from your computer.
              </p>
            </div>

            {/* Dropzone with Error State Support */}
            {hasFileError ? (
              <div className="border border-dashed border-destructive/50 rounded-[5px] p-12 bg-destructive/5 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="text-[16px] font-semibold text-foreground">
                  We couldn't read this file
                </h3>
                <p className="text-[12px] text-[#666666] max-w-sm">
                  Check that the file is an Excel or CSV document and try again.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={simulateSelectDefaultFile}
                    className="h-[36px] px-5 bg-[#000000] text-white hover:bg-[#000000]/90 text-[12px] font-medium rounded-[5px]"
                  >
                    Choose another file
                  </Button>
                </div>
                <p className="text-[11px] text-[#666666] pt-1">
                  Maximum file size: 25 MB · Supported formats: Excel, CSV
                </p>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className="min-h-[226px] border border-dashed border-[#E3E3E3] dark:border-border rounded-[5px] py-8 px-6 bg-[#FCFCFC] dark:bg-card/20 text-center flex flex-col items-center justify-center space-y-2.5 transition-colors"
              >
                {/* File Icon matching Figma: 34px × 42px with 3 lines of #8C8C8C */}
                <div className="w-[34px] h-[42px] rounded-[3px] border border-[#E3E3E3] bg-[#FFFFFF] dark:bg-card flex flex-col justify-center items-start px-2 py-2 gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="w-[18px] h-[1px] bg-[#8C8C8C]" />
                  <div className="w-[18px] h-[1px] bg-[#8C8C8C]" />
                  <div className="w-[12px] h-[1px] bg-[#8C8C8C]" />
                </div>

                <h3 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white pt-1">
                  {selectedFile ? selectedFile.name : "Upload catalog spreadsheet"}
                </h3>
                <p className="text-[12px] leading-[18px] text-[#666666] font-normal">or</p>
                <div>
                  <label>
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <span className="inline-flex items-center justify-center rounded-[5px] font-medium text-[12px] leading-[18px] bg-[#000000] text-white hover:bg-[#000000]/90 h-[36px] w-[152px] cursor-pointer">
                      Browse files
                    </span>
                  </label>
                </div>
                <p className="text-[11px] leading-[17px] text-[#666666] font-normal pt-2">
                  Maximum file size: 25 MB · Supported formats: Excel, CSV
                </p>
              </div>
            )}

            {/* Need a starting point? */}
            <div className="space-y-3 pt-2">
              <h4 className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white">
                Need a starting point?
              </h4>
              <p className="text-[12px] leading-[18px] text-[#666666] -mt-1.5">
                Use our product import template with predefined columns for common catalog data.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "Excel template downloaded",
                      description: "product_template.xlsx is ready.",
                    })
                  }
                  className="w-[195px] h-[36px] text-[12px] leading-[18px] font-medium border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 bg-[#FFFFFF] dark:bg-card rounded-[5px]"
                >
                  Download Excel template
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "CSV template downloaded",
                      description: "product_template.csv is ready.",
                    })
                  }
                  className="w-[190px] h-[36px] text-[12px] leading-[18px] font-medium border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 bg-[#FFFFFF] dark:bg-card rounded-[5px]"
                >
                  Download CSV template
                </Button>
              </div>

              {/* Expected template structure preview */}
              <div className="w-full min-h-[44px] flex items-center bg-[#F6F6F6] dark:bg-muted/40 rounded-[3px] px-3.5 py-2.5 text-[11px] leading-[17px] font-normal text-[#666666]">
                Product name · SKU · Brand · Category · Price · Description · Barcode · Weight · Images
              </div>
            </div>

            {/* Import settings collapsed */}
            <div className="border-t border-[#E3E3E3] dark:border-border pt-3">
              <button
                type="button"
                onClick={() => setShowSettingsView(true)}
                className="flex items-center justify-between w-full py-1 text-left hover:opacity-80 transition-opacity"
              >
                <span className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white">
                  Import settings
                </span>
                <span className="text-[16px] leading-[24px] font-normal text-[#000000] dark:text-white">+</span>
              </button>
              <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                Your products will be reviewed before anything is added or updated.
              </p>
            </div>
          </div>

          {/* Right Rail: Import guidance (A safe path to your catalog) */}
          <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0">
            <div className="w-full min-h-[446px] bg-[#F6F6F6] dark:bg-card/40 rounded-[6px] border border-[#E3E3E3] dark:border-border p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white mb-6">
                  A safe path to your catalog
                </h3>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white flex items-baseline gap-3">
                      <span className="text-[11px] leading-[17px] font-medium text-[#666666] w-5 shrink-0">01</span>
                      <span>Upload your spreadsheet</span>
                    </div>
                    <p className="text-[12px] leading-[18px] text-[#666666] pl-8">
                      Your original file stays intact.
                    </p>
                  </div>

                  <div className="h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

                  <div className="space-y-1">
                    <div className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white flex items-baseline gap-3">
                      <span className="text-[11px] leading-[17px] font-medium text-[#666666] w-5 shrink-0">02</span>
                      <span>Review automatic matching</span>
                    </div>
                    <p className="text-[12px] leading-[18px] text-[#666666] pl-8">
                      Confirm fields and uncertain matches.
                    </p>
                  </div>

                  <div className="h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

                  <div className="space-y-1">
                    <div className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white flex items-baseline gap-3">
                      <span className="text-[11px] leading-[17px] font-medium text-[#666666] w-5 shrink-0">03</span>
                      <span>Import what is ready</span>
                    </div>
                    <p className="text-[12px] leading-[18px] text-[#666666] pl-8">
                      Fix exceptions without restarting.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <p className="text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white">
                  No records are silently merged.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── STEP 2: EXPANDED SETTINGS VIEW ──────────────── */}
      {currentStep === 2 && showSettingsView && (
        <ImportSettingsSection
          duplicateStrategy={duplicateStrategy}
          onDuplicateStrategyChange={setDuplicateStrategy}
          importImageUrls={importImageUrls}
          onImportImageUrlsChange={setImportImageUrls}
          matchVariants={matchVariants}
          onMatchVariantsChange={setMatchVariants}
          importQuantities={importQuantities}
          onImportQuantitiesChange={setImportQuantities}
          onBackToUpload={() => setShowSettingsView(false)}
        />
      )}

      {/* ──────────────── STEP 3: MAPPING & AUTOMATIC ANALYSIS ──────────────── */}
      {currentStep === 3 && (
        <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-1">
          {/* Left Column: Analysis, Bars & Mapping Table (takes full available width) */}
          <div className="flex-1 min-w-0 w-full space-y-4">
            {/* Detected File Header */}
            <div className="flex items-start gap-3.5">
              {/* File Icon matching Figma: 34px × 42px with 3 lines of #8C8C8C */}
              <div className="w-[34px] h-[42px] rounded-[3px] border border-[#E3E3E3] dark:border-neutral-700 bg-[#FFFFFF] dark:bg-card flex flex-col justify-center items-start px-2 py-2 gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] shrink-0">
                <div className="w-[18px] h-[1px] bg-[#8C8C8C]" />
                <div className="w-[18px] h-[1px] bg-[#8C8C8C]" />
                <div className="w-[12px] h-[1px] bg-[#8C8C8C]" />
              </div>
              <div>
                <h3 className="text-[15px] leading-[23px] font-semibold text-[#000000] dark:text-white">
                  {selectedFile ? selectedFile.name : "products_october.xlsx"}
                </h3>
                <p className="text-[12px] leading-[18px] text-[#666666] font-normal">
                  File detected · 247 products · 1,024 rows
                </p>
              </div>
            </div>

            {/* Automatic Matching Section */}
            <div className="space-y-3">
              <h3 className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white">
                Automatic matching
              </h3>
              <div className="space-y-2 pt-1">
                {[
                  { label: "Product match", fillWidth: "93.5%", count: "231 likely matches" },
                  { label: "SKU match", fillWidth: "80.1%", count: "198 exact matches" },
                  { label: "Variant match", fillWidth: "86.6%", count: "214 detected" },
                  { label: "Category mapping", fillWidth: "96.7%", count: "239 mapped" },
                  { label: "Image mapping", fillWidth: "92.3%", count: "228 detected" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center text-[12px] leading-[18px]">
                    <span className="w-[160px] text-[#666666] font-normal shrink-0">
                      {item.label}
                    </span>
                    <div className="w-[301px] h-[3px] bg-[#EBEBEB] dark:bg-neutral-800 shrink-0 relative overflow-hidden">
                      <div
                        className="h-[3px] bg-[#4D4D4D] dark:bg-neutral-300"
                        style={{ width: item.fillWidth }}
                      />
                    </div>
                    <span className="text-[#000000] dark:text-white font-medium pl-6 shrink-0">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Banner: "Only exceptions need you" */}
            <div className="w-full min-h-[77px] bg-[#F6F6F6] dark:bg-card/40 rounded-[4px] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white">
                  Most of your catalog can be handled automatically.
                </h4>
                <p className="text-[11px] leading-[17px] text-[#666666] font-normal mt-0.5">
                  We'll identify matches, map common fields and bring only uncertain rows to your attention.
                </p>
              </div>
              <div className="shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] bg-[#F6F6F6] dark:bg-card border border-[#E3E3E3]/60 dark:border-border text-[11px] leading-[17px] font-medium text-[#000000] dark:text-white">
                  {step3AttentionCount} require attention
                </span>
              </div>
            </div>

            {/* Review Field Mapping Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-[17px] leading-[26px] font-semibold text-[#000000] dark:text-white">
                    Review field mapping
                  </h3>
                  <p className="text-[12px] leading-[18px] text-[#666666] font-normal mt-0.5">
                    We matched your spreadsheet columns to master product fields.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetMappings}
                  className="text-[11px] text-[#666666] hover:text-black dark:hover:text-white font-normal underline-offset-2 hover:underline transition-colors cursor-pointer"
                >
                  Reset to auto matches
                </button>
              </div>

              {/* Mapping Preview Table */}
              <div className="border border-[#E3E3E3] dark:border-border rounded-[4px] bg-[#FFFFFF] dark:bg-card overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="h-[27px] bg-[#F6F6F6] dark:bg-muted/40 border-b border-[#E3E3E3] dark:border-border">
                      <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] w-[30%]">
                        Your column
                      </th>
                      <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] w-[28%]">
                        Product field
                      </th>
                      <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] w-[22%]">
                        Status
                      </th>
                      <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] text-right w-[20%]">
                        {/* Action column */}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((row, idx) => {
                      const isNeedsReview = row.status === "needs_review";
                      const isLast = idx === mappings.length - 1;

                      return (
                        <tr
                          key={idx}
                          className={cn(
                            "h-[24px] sm:h-[26px] transition-colors",
                            !isLast && "border-b border-[#E3E3E3] dark:border-border",
                            isNeedsReview
                              ? "bg-[#F4F4F4] dark:bg-muted/60"
                              : "bg-[#FFFFFF] dark:bg-card hover:bg-neutral-50/50"
                          )}
                        >
                          <td
                            className={cn(
                              "px-3 py-1 text-[11px] leading-[16px] text-[#000000] dark:text-white",
                              isNeedsReview ? "font-semibold" : "font-normal"
                            )}
                          >
                            {row.sourceColumn}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1 text-[11px] leading-[16px] text-[#000000] dark:text-white",
                              isNeedsReview ? "font-semibold" : "font-normal"
                            )}
                          >
                            {row.targetField}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1 text-[11px] leading-[16px]",
                              isNeedsReview
                                ? "font-semibold text-[#666666] dark:text-neutral-300"
                                : "font-normal text-[#666666]"
                            )}
                          >
                            {isNeedsReview
                              ? "Needs review"
                              : row.status === "unmatched"
                                ? "Ignored"
                                : "Matched"}
                          </td>
                          <td className="px-3 py-1 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenMappingDialog(row)}
                              className="text-[11px] leading-[16px] font-medium text-[#000000] dark:text-white hover:underline underline-offset-2 transition-opacity cursor-pointer"
                            >
                              Change mapping
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Rail: Import Summary Contextual Panel */}
          <ImportSummarySidebar
            totalProducts={247}
            readyCount={step3ReadyCount}
            attentionCount={step3AttentionCount}
            rowsCount={1024}
            newCount={812}
            matchedCount={128}
            updatedCount={84}
            readinessPercent={step3ReadinessPercent}
            onReviewIssues={() => setCurrentStep(4)}
            onSelectIssueType={(type) => {
              setActiveTab(type);
              setCurrentStep(4);
            }}
            onImportReady={() => setCurrentStep(5)}
          />

          {/* Change Column Mapping Dialog (Interactive & Backend-Ready) */}
          <Dialog open={!!editingMapping} onOpenChange={(open) => !open && setEditingMapping(null)}>
            <DialogContent className="max-w-md bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[8px] p-6 shadow-xl">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                  Change column mapping
                </DialogTitle>
                <DialogDescription className="text-[12px] leading-[18px] text-[#666666]">
                  Map spreadsheet column <span className="font-semibold text-black dark:text-white">"{editingMapping?.sourceColumn}"</span> to a catalog master product field.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 my-2">
                {/* Sample values preview */}
                {editingMapping?.sampleValues && editingMapping.sampleValues.length > 0 && (
                  <div className="bg-[#F6F6F6] dark:bg-muted/40 rounded-[4px] p-3 border border-[#E3E3E3] dark:border-border">
                    <div className="text-[10px] uppercase font-semibold text-[#666666] tracking-wider mb-1">
                      Sample values in your file
                    </div>
                    <div className="text-[12px] text-[#000000] dark:text-white font-mono break-words">
                      {editingMapping.sampleValues.join(" · ")}
                    </div>
                  </div>
                )}

                {/* Target Field Select */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-[#000000] dark:text-white">
                    Destination product field
                  </label>
                  <select
                    value={targetFieldDraft}
                    onChange={(e) => setTargetFieldDraft(e.target.value)}
                    className="w-full h-[38px] px-3 bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[5px] text-[13px] text-[#000000] dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors cursor-pointer"
                  >
                    {MASTER_PRODUCT_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label} {field.required ? "(Required)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#666666]">
                    {MASTER_PRODUCT_FIELDS.find((f) => f.value === targetFieldDraft)?.description ||
                      "Select how this column should be stored in master products."}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingMapping(null)}
                  className="h-[36px] px-4 border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white bg-white dark:bg-card hover:bg-neutral-50 hover:dark:bg-muted rounded-[5px] text-[12px] font-medium"
                >
                  Cancel
                </Button>
                <Button
                  disabled={isSavingMapping}
                  onClick={handleSaveMapping}
                  className="h-[36px] px-5 bg-[#000000] text-white hover:bg-[#000000]/90 rounded-[5px] text-[12px] font-medium"
                >
                  {isSavingMapping ? "Saving..." : "Save mapping"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ──────────────── STEP 4: REVIEW EXCEPTIONS & RECOVERY ──────────────── */}
      {currentStep === 4 && (
        <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-1">
          <div className="flex-1 min-w-0 w-full space-y-6">
            {/* Header with Switch between Table and Card View */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">
                  Only exceptions need you
                </h2>
                <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
                  Resolve uncertain items here. Your file and confirmed mappings stay intact.
                </p>
              </div>

              {/* View Mode Switcher Toggle */}
              <div className="flex items-center gap-1 border border-[#E3E3E3] dark:border-border rounded-[5px] p-0.5 bg-white dark:bg-card">
                <button
                  type="button"
                  title="Card view"
                  onClick={() => setStep4ViewMode("card")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-[12px] leading-[18px] font-medium transition-colors ${
                    step4ViewMode === "card"
                      ? "bg-[#000000] text-white dark:bg-white dark:text-black"
                      : "text-[#666666] hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-muted"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  title="Table view"
                  onClick={() => setStep4ViewMode("table")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-[12px] leading-[18px] font-medium transition-colors ${
                    step4ViewMode === "table"
                      ? "bg-[#000000] text-white dark:bg-white dark:text-black"
                      : "text-[#666666] hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-muted"
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("categories")}
                className={`px-3.5 py-1.5 rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors ${
                  activeTab === "categories"
                    ? "bg-[#000000] text-white dark:bg-white dark:text-black"
                    : "bg-[#F6F6F6] dark:bg-card border border-[#E3E3E3] dark:border-border text-[#666666] hover:text-black dark:hover:text-white"
                }`}
              >
                Categories · 8 selected
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("skus")}
                className={`px-3.5 py-1.5 rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors ${
                  activeTab === "skus"
                    ? "bg-[#000000] text-white dark:bg-white dark:text-black"
                    : "bg-[#F6F6F6] dark:bg-card border border-[#E3E3E3] dark:border-border text-[#666666] hover:text-black dark:hover:text-white"
                }`}
              >
                Missing SKUs · 4
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("duplicates")}
                className={`px-3.5 py-1.5 rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors ${
                  activeTab === "duplicates"
                    ? "bg-[#000000] text-white dark:bg-white dark:text-black"
                    : "bg-[#F6F6F6] dark:bg-card border border-[#E3E3E3] dark:border-border text-[#666666] hover:text-black dark:hover:text-white"
                }`}
              >
                Duplicates · 3
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("images")}
                className={`px-3.5 py-1.5 rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors ${
                  activeTab === "images"
                    ? "bg-[#000000] text-white dark:bg-white dark:text-black"
                    : "bg-[#F6F6F6] dark:bg-card border border-[#E3E3E3] dark:border-border text-[#666666] hover:text-black dark:hover:text-white"
                }`}
              >
                Image URL · 1
              </button>
            </div>

            {/* Content Based on Selected View Mode: Cards vs Table */}
            {step4ViewMode === "card" ? (
              <div className="space-y-4">
                {/* Exception Card 1: Category Mapping Missing */}
                <div className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                      Premium Travel Bag
                    </h3>
                    <span className="text-[11px] leading-[17px] font-mono font-medium text-[#666666] bg-[#F6F6F6] dark:bg-muted border border-[#E3E3E3]/60 px-2 py-0.5 rounded-[3px]">
                      Row 84
                    </span>
                  </div>

                  <div className="space-y-2 text-[12px] leading-[18px]">
                    <div className="font-medium text-[#000000] dark:text-white">
                      Category mapping missing
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="text-[#666666] uppercase font-semibold text-[10px] leading-[15px] tracking-wider pt-0.5">
                        WHY
                      </span>
                      <span className="text-[#666666]">
                        "Travel gear" does not have a mapped master category.
                      </span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2 pt-1">
                      <span className="text-[#666666] uppercase font-semibold text-[10px] leading-[15px] tracking-wider pt-0.5">
                        SUGGESTION
                      </span>
                      <div>
                        <div className="font-semibold text-[#000000] dark:text-white">
                          Product Category → Category
                        </div>
                        <p className="text-[#666666] mt-0.5">
                          "Travel Gear" was matched to "Travel Accessories" with medium confidence.
                        </p>
                        <p className="text-[#666666] mt-0.5">
                          Suggested solution: Map to Travel Accessories.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={() =>
                        toast({
                          title: "Mapping accepted",
                          description: "Mapped to Travel Accessories.",
                        })
                      }
                      className="h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium text-[12px] leading-[18px] px-5 rounded-[5px]"
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/products/import/${importId}/issues`)}
                      className="h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white bg-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium px-4"
                    >
                      Change
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/products/import/${importId}/issues`)}
                      className="h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white bg-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium px-4"
                    >
                      Review mapping
                    </Button>
                  </div>
                  <p className="text-[11px] leading-[17px] text-[#666666]">
                    AI recommends and explains. You decide which mapping is applied.
                  </p>
                </div>

                {/* Exception Card 2: Potential Duplicate */}
                <div className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6 space-y-4">
                  <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                    Potential duplicates · Premium Travel Bag
                  </h3>
                  <p className="text-[12px] leading-[18px] text-[#666666] -mt-2">
                    CSV SKU: TRV-1042 · Existing master product: TRV-1042
                  </p>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      onClick={() =>
                        toast({
                          title: "Resolution applied",
                          description: "Existing product will be updated.",
                        })
                      }
                      className="h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium text-[12px] leading-[18px] px-5 rounded-[5px]"
                    >
                      Update existing product
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast({
                          title: "Resolution applied",
                          description: "Will create as a new independent product.",
                        })
                      }
                      className="h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white bg-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium px-4"
                    >
                      Create new product
                    </Button>
                    <span className="text-[12px] leading-[18px] text-[#666666] pl-2">
                      No records are silently merged.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Exception Table View */
              <div className="border border-[#E3E3E3] dark:border-border rounded-[4px] overflow-hidden bg-white dark:bg-card">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="h-[27px] bg-[#F6F6F6] dark:bg-muted/40 border-b border-[#E3E3E3] dark:border-border text-[11px] leading-[16px] font-medium text-[#666666]">
                      <th className="py-1 px-3 font-medium w-14">Row</th>
                      <th className="py-1 px-3 font-medium">Product</th>
                      <th className="py-1 px-3 font-medium">Issue</th>
                      <th className="py-1 px-3 font-medium">Field</th>
                      <th className="py-1 px-3 font-medium">Suggested Fix</th>
                      <th className="py-1 px-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        row: 84,
                        product: "Premium Travel Bag",
                        sku: "TRV-1042",
                        issue: "Category not mapped",
                        field: "Category",
                        fix: "Travel Accessories",
                      },
                      {
                        row: 116,
                        product: "Classic Backpack",
                        sku: "SKU missing",
                        issue: "Missing master SKU",
                        field: "SKU",
                        fix: "CBP-116-A",
                      },
                      {
                        row: 214,
                        product: "Travel Organizer Set",
                        sku: "ORG-3102",
                        issue: "Possible duplicate",
                        field: "Product",
                        fix: "Match: TRV-1042",
                      },
                      {
                        row: 482,
                        product: "Cotton Overshirt",
                        sku: "OS-2048",
                        issue: "Invalid image URL",
                        field: "Product media",
                        fix: "Replacement URL",
                      },
                    ].map((item, idx) => (
                      <tr
                        key={idx}
                        className="h-[36px] border-b border-[#E3E3E3] dark:border-border hover:bg-neutral-50/50 transition-colors text-[11px] leading-[16px]"
                      >
                        <td className="py-2 px-3 font-mono text-[#666666]">
                          {item.row}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-[#000000] dark:text-white">
                            {item.product}
                          </div>
                          <div className="text-[10px] text-[#666666] font-mono">
                            {item.sku}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-medium text-[#000000] dark:text-white">
                          {item.issue}
                        </td>
                        <td className="py-2 px-3 text-[#666666]">
                          {item.field}
                        </td>
                        <td className="py-2 px-3 font-medium text-[#000000] dark:text-white">
                          {item.fix}
                        </td>
                        <td className="py-2 px-3 text-right space-x-1.5">
                          <Button
                            onClick={() =>
                              toast({
                                title: "Fix applied",
                                description: `Applied fix for row ${item.row}.`,
                              })
                            }
                            className="bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black font-medium text-[11px] h-[28px] px-3 rounded-[4px]"
                          >
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/products/import/${importId}/issues`)}
                            className="text-[11px] h-[28px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 hover:dark:bg-muted font-medium px-3 rounded-[4px] bg-white dark:bg-card"
                          >
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recovery Actions Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/products/import/${importId}/issues`)}
                  className="h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 hover:dark:bg-muted rounded-[5px] text-[12px] leading-[18px] font-medium bg-white dark:bg-card px-4"
                >
                  Fix in platform
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "Download initiated",
                      description: "corrected_products_october.xlsx downloaded.",
                    })
                  }
                  className="h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 hover:dark:bg-muted rounded-[5px] text-[12px] leading-[18px] font-medium bg-white dark:bg-card px-4"
                >
                  Download corrected file
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    toast({
                      title: "Revalidation complete",
                      description: "All pending fixes validated.",
                    });
                    setCurrentStep(5);
                  }}
                  className="h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 hover:dark:bg-muted rounded-[5px] text-[12px] leading-[18px] font-medium bg-white dark:bg-card px-4"
                >
                  Revalidate
                </Button>
              </div>
              <span className="text-[12px] leading-[18px] text-[#666666]">
                Fix → Revalidate → Continue
              </span>
            </div>
          </div>

          {/* Right Rail: Import Summary */}
          <ImportSummarySidebar
            totalProducts={247}
            readyCount={step3ReadyCount}
            attentionCount={step3AttentionCount}
            readinessPercent={step3ReadinessPercent}
            onSelectIssueType={(type) => setActiveTab(type)}
            onReviewIssues={() => navigate(`/products/import/${importId}/issues`)}
            onImportReady={() => setCurrentStep(5)}
          />
        </div>
      )}

      {/* ──────────────── STEP 5: READY TO IMPORT & STARTING ──────────────── */}
      {currentStep === 5 && (
        <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-1">
          <div className="flex-1 min-w-0 w-full space-y-6">
            <div>
              <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">
                {isStartingImport ? "Your import is starting" : "Ready to import"}
              </h2>
              <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
                {isStartingImport
                  ? "247 products · 1,024 rows · 231 new · 16 updates"
                  : "Review the final impact, then explicitly confirm your catalog import."}
              </p>
            </div>

            {isStartingImport ? (
              /* Starting Import Progress Box */
              <div className="p-8 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-6">
                <div>
                  <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                    Starting import...
                  </h3>
                  <p className="text-[12px] leading-[18px] text-[#666666] mt-1">
                    Your reviewed catalog is being prepared for import. Your file and confirmed mappings have been saved.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="h-[3px] w-full bg-[#E0E0E0] dark:bg-muted relative overflow-hidden">
                    <div className="h-full bg-[#000000] dark:bg-white w-1/3 animate-pulse" />
                  </div>
                  <div className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white pt-1">
                    Next: Screen 16 — Import Processing
                  </div>
                  <p className="text-[11px] leading-[17px] text-[#666666]">
                    Import has begun. Product records are not yet confirmed as imported.
                  </p>
                </div>
              </div>
            ) : (
              /* Ready to Import Scope Card */
              <div className="space-y-6">
                <div className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6 space-y-6">
                  <div>
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                      products_october.xlsx
                    </h3>
                    <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                      All mappings confirmed · Review complete
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-[#E3E3E3] dark:border-border">
                    <div>
                      <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">247</div>
                      <div className="text-[12px] leading-[18px] text-[#666666]">Products</div>
                    </div>
                    <div>
                      <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">1,024</div>
                      <div className="text-[12px] leading-[18px] text-[#666666]">Rows</div>
                    </div>
                    <div>
                      <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">231</div>
                      <div className="text-[12px] leading-[18px] text-[#666666]">New products</div>
                    </div>
                    <div>
                      <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">16</div>
                      <div className="text-[12px] leading-[18px] text-[#666666]">Product updates</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white">
                      0 blocking issues · 247 products ready to import
                    </span>
                  </div>
                </div>

                <p className="text-[12px] leading-[18px] text-[#666666]">
                  Your original file is preserved. Updates apply only to the 16 products you confirmed.
                </p>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleStartImport}
                    className="bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium text-[12px] leading-[18px] h-[36px] px-6 rounded-[5px]"
                  >
                    Import products
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(4)}
                    className="border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 hover:dark:bg-muted bg-white dark:bg-card font-medium text-[12px] leading-[18px] h-[36px] px-6 rounded-[5px]"
                  >
                    Back to review
                  </Button>
                </div>

                <p className="text-[11px] leading-[17px] text-[#666666] pt-1">
                  Product totals above are distinct from the row-level analysis. No unresolved records remain.
                </p>
              </div>
            )}
          </div>

          {/* Right Rail: Confirmation Summary */}
          <ImportSummarySidebar
            totalProducts={247}
            readyCount={247}
            attentionCount={0}
            readinessPercent={100}
            isConfirmationStep={true}
          />
        </div>
      )}

      {/* ──────────────── STICKY BOTTOM BAR ──────────────── */}
      <div className="fixed bottom-0 left-0 lg:left-[224px] right-0 h-[72px] border-t border-[#E3E3E3] dark:border-border bg-white dark:bg-background px-10 z-40 flex items-center justify-between">
        <div className="text-[12px] leading-[18px] font-normal text-[#666666]">
          {currentStep === 5
            ? "247 products detected · 0 require attention"
            : currentStep === 3
              ? `247 products detected · ${step3AttentionCount} require attention`
              : "Your catalog stays unchanged until you confirm import."}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(ROUTES.PRODUCTS)}
            className="w-[72px] h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 bg-white dark:bg-card rounded-[5px] text-[12px] leading-[18px] font-medium px-0"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast({
                title: "Draft saved",
                description: "Import draft progress has been saved.",
              });
            }}
            className="w-[116px] h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 bg-white dark:bg-card rounded-[5px] text-[12px] leading-[18px] font-medium px-0"
          >
            Save as draft
          </Button>

          {currentStep === 5 ? (
            <Button
              disabled={isStartingImport}
              onClick={handleStartImport}
              className="min-w-[140px] h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium px-4 rounded-[5px]"
            >
              {isStartingImport ? "Starting import..." : "Import 247 products"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                setShowSettingsView(false);
                setCurrentStep((prev) => Math.min(prev + 1, 5));
              }}
              className={cn(
                "w-[140px] h-[36px] bg-[#000000] text-white rounded-[5px] text-[12px] leading-[18px] font-medium transition-opacity",
                currentStep === 1
                  ? "opacity-35 hover:opacity-100"
                  : "opacity-100 hover:bg-[#000000]/90"
              )}
            >
              Continue →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
