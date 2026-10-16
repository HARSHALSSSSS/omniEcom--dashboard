import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileSpreadsheet,
  Layers,
  Store,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileCheck,
  Download,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Stepper } from "@/components/common/Stepper";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/common/FileDropzone";
import { ROUTES } from "@/constants/routes";
import {
  useStartImport,
  useUpdateMapping,
  useImportJob,
} from "@/hooks/useImport";
import { useJobPolling } from "@/hooks/useJobPolling";
import { ImportSourceType } from "@/types/import";

const STEPS = [
  { id: "source", label: "Source" },
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Column Mapping" },
  { id: "settings", label: "Settings" },
  { id: "processing", label: "Processing" },
];

const SOURCE_OPTIONS: Array<{
  id: ImportSourceType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  recommended?: boolean;
}> = [
  {
    id: "csv_excel",
    title: "CSV or Excel Spreadsheet",
    description: "Standard table format (.csv, .xlsx). Ideal for bulk merchant catalogs and spreadsheets.",
    icon: FileSpreadsheet,
    recommended: true,
  },
  {
    id: "marketplace",
    title: "Marketplace Listing Export",
    description: "Export file from Amazon Seller Central, Flipkart Seller Portal, or Meesho Supplier Hub.",
    icon: Store,
  },
  {
    id: "shopify",
    title: "Shopify Product Export",
    description: "Standard Shopify catalog CSV containing handles, variant options, and CDN image URLs.",
    icon: Layers,
  },
];

const TARGET_FIELDS = [
  { value: "sku", label: "Merchant SKU (Required)", required: true },
  { value: "title", label: "Product Title (Required)", required: true },
  { value: "category", label: "Category / Taxonomy (Required)", required: true },
  { value: "sellingPrice", label: "Selling Price (₹) (Required)", required: true },
  { value: "mrp", label: "Maximum Retail Price (MRP) (₹)", required: false },
  { value: "stock", label: "Inventory Stock Level", required: false },
  { value: "imageUrl", label: "Primary Image URL (Required)", required: true },
  { value: "barcode", label: "Barcode (EAN / UPC / ISBN)", required: false },
  { value: "hsn", label: "HSN Code", required: false },
  { value: "description", label: "Product Description", required: false },
  { value: "ignore", label: "-- Do not import this column --", required: false },
];

export default function ImportWizardPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSource, setSelectedSource] =
    useState<ImportSourceType>("csv_excel");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string>("imp-2026-9041");
  const [duplicateStrategy, setDuplicateStrategy] = useState<
    "skip" | "overwrite" | "create_variant"
  >("create_variant");
  const [assignAllChannels, setAssignAllChannels] = useState(true);

  const { data: job } = useImportJob(jobId);
  const startImportMutation = useStartImport();
  const updateMappingMutation = useUpdateMapping(jobId);

  // Background polling during Step 4/Processing
  const { jobStatus } = useJobPolling({
    jobId: currentStep === 4 ? jobId : null,
    enabled: currentStep === 4,
    onComplete: (completed) => {
      if (completed.status === "needs_attention") {
        setTimeout(() => {
          navigate(`${ROUTES.PRODUCTS_IMPORT}/${jobId}/issues`);
        }, 1200);
      } else if (completed.status === "completed") {
        setTimeout(() => {
          navigate(ROUTES.PRODUCTS);
        }, 1200);
      }
    },
  });

  const handleNext = () => {
    if (currentStep === 1 && selectedFile) {
      startImportMutation.mutate(
        {
          sourceType: selectedSource,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
        },
        {
          onSuccess: (newJob) => {
            setJobId(newJob.id);
            setCurrentStep(2);
          },
        },
      );
    } else if (currentStep === 3) {
      setCurrentStep(4);
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="mx-auto max-w-[1136px] space-y-6 pb-16">
      <PageHeader
        eyebrow="COMMERCE CATALOG"
        title="Bulk Import Products"
        description="Add multiple products at once via CSV/Excel, marketplace reports, or ERP exports."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.PRODUCTS)}
          >
            Cancel & Exit
          </Button>
        }
      />

      {/* Progress Stepper */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <Stepper steps={STEPS} currentStepIndex={currentStep} />
      </div>

      {/* STEP 0: SOURCE SELECTION */}
      {currentStep === 0 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">
              Select catalog source
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the origin of your product file. We automatically map
              recognized headers.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {SOURCE_OPTIONS.map((source) => {
                const Icon = source.icon;
                const isSelected = selectedSource === source.id;
                return (
                  <div
                    key={source.id}
                    onClick={() => setSelectedSource(source.id)}
                    className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-5 transition-all ${
                      isSelected
                        ? "border-[#1D4ED8] bg-[#E6F4FF]/30 shadow-sm ring-1 ring-[#1D4ED8]"
                        : "border-border bg-card hover:border-border-subtle hover:bg-muted/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            isSelected
                              ? "bg-[#1D4ED8] text-white"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        {source.recommended && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            Recommended
                          </span>
                        )}
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-foreground">
                        {source.title}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {source.description}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center text-xs font-medium text-foreground">
                      <span
                        className={`inline-block h-2 w-2 rounded-full mr-2 ${
                          isSelected ? "bg-[#1D4ED8]" : "bg-border"
                        }`}
                      />
                      {isSelected ? "Selected" : "Select this format"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Template download row */}
            <div className="mt-6 flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileCheck className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-foreground">
                    Need our standard template?
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Download our formatted CSV with examples for variants, HSN, and GST rates.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  window.alert("Downloading omniEcom_product_template_v2.csv");
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV Template
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleNext}
            >
              Continue to Upload <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 1: UPLOAD */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">
              Upload your catalog file
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a .csv, .xlsx, or .tsv file up to 25MB (up to 10,000 SKUs
              per batch).
            </p>

            <div className="mt-6">
              <FileDropzone
                accept=".csv,.xlsx"
                maxSizeMb={25}
                helpText="CSV or XLSX up to 25MB"
                uploadedFileName={selectedFile?.name}
                onFileSelect={(file: File) => {
                  setSelectedFile(file);
                }}
              />
            </div>

            {selectedFile && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-950">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready
                      for analysis
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedFile(null)}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!selectedFile || startImportMutation.isPending}
              onClick={handleNext}
            >
              {startImportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading & Analyzing...
                </>
              ) : (
                <>
                  Analyze Columns <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: COLUMN MAPPING & AUTOMATIC ANALYSIS */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Column Mapping & Automatic Analysis
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We identified 9 columns from{" "}
                  <span className="font-medium text-foreground">
                    {job?.fileName ?? "festive_apparel_catalog_v2.csv"}
                  </span>
                  . Match your headers to omniEcom attributes.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> 9 of 9 columns mapped (95%
                confidence)
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-3">Your File Column</th>
                    <th className="px-3 py-3">Sample Preview</th>
                    <th className="px-3 py-3">Match Confidence</th>
                    <th className="py-3 pl-3 pr-4">Target Attribute</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {job?.mappings.map((mapping) => (
                    <tr key={mapping.sourceColumn} className="hover:bg-muted/20">
                      <td className="py-3 pl-4 pr-3 font-mono font-medium text-foreground">
                        {mapping.sourceColumn}
                        {mapping.isRequired && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-muted-foreground">
                        {mapping.sampleValues.join(", ")}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${mapping.confidence}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {mapping.confidence}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pl-3 pr-4">
                        <select
                          className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs focus:border-ring focus:ring-1 focus:ring-ring"
                          value={mapping.targetField}
                          onChange={(e) => {
                            updateMappingMutation.mutate({
                              sourceColumn: mapping.sourceColumn,
                              targetField: e.target.value,
                            });
                          }}
                        >
                          {TARGET_FIELDS.map((target) => (
                            <option key={target.value} value={target.value}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleNext}
            >
              Confirm Mapping & Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW & IMPORT SETTINGS */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Import Settings & Duplicate Strategy
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Define how catalog conflicts and channel assignments are handled.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {/* Duplicate Strategy Radio Cards */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  When a SKU or Barcode already exists in catalog
                </label>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div
                    onClick={() => setDuplicateStrategy("create_variant")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      duplicateStrategy === "create_variant"
                        ? "border-[#1D4ED8] bg-[#E6F4FF]/30 ring-1 ring-[#1D4ED8]"
                        : "border-border bg-card hover:bg-muted/30"
                    }`}
                  >
                    <p className="text-xs font-semibold text-foreground">
                      Group as Variant (Recommended)
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Add as a new variant size/color under the existing parent SKU.
                    </p>
                  </div>

                  <div
                    onClick={() => setDuplicateStrategy("overwrite")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      duplicateStrategy === "overwrite"
                        ? "border-[#1D4ED8] bg-[#E6F4FF]/30 ring-1 ring-[#1D4ED8]"
                        : "border-border bg-card hover:bg-muted/30"
                    }`}
                  >
                    <p className="text-xs font-semibold text-foreground">
                      Overwrite Existing Record
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Replace price, stock, and descriptions with values in this file.
                    </p>
                  </div>

                  <div
                    onClick={() => setDuplicateStrategy("skip")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      duplicateStrategy === "skip"
                        ? "border-[#1D4ED8] bg-[#E6F4FF]/30 ring-1 ring-[#1D4ED8]"
                        : "border-border bg-card hover:bg-muted/30"
                    }`}
                  >
                    <p className="text-xs font-semibold text-foreground">
                      Skip Existing
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Keep existing catalog product unchanged and ignore the row.
                    </p>
                  </div>
                </div>
              </div>

              {/* Channel Assignment Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Assign imported items to all connected channels
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically create drafts on Amazon, Flipkart, Meesho, and Shopify.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={assignAllChannels}
                  onChange={(e) => setAssignAllChannels(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                />
              </div>

              {/* Batch Summary */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-[#1D4ED8]" />
                    <span className="text-xs font-semibold text-[#1E3A8A]">
                      Batch Summary: 420 items detected
                    </span>
                  </div>
                  <span className="text-xs text-[#1E3A8A]">
                    Estimated processing time: ~5 seconds
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleNext}
            >
              Start Batch Import <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: PROCESSING & JOB POLLING (Screen 16) */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E6F4FF] text-[#1D4ED8]">
              <UploadCloud className="h-8 w-8 animate-bounce" />
            </div>

            <h2 className="mt-6 text-xl font-bold text-foreground">
              Processing Catalog Import
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Validating barcodes, parsing pricing, checking image headers, and
              verifying category tax mappings.
            </p>

            {/* Progress Bar */}
            <div className="mx-auto mt-8 max-w-lg">
              <div className="flex justify-between text-xs font-medium text-foreground">
                <span>
                  {jobStatus?.processed ?? 320} of {jobStatus?.total ?? 420}{" "}
                  records analyzed
                </span>
                <span className="font-mono text-[#1D4ED8]">
                  {jobStatus?.progress ?? 76}%
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-[#1D4ED8] transition-all duration-300"
                  style={{ width: `${jobStatus?.progress ?? 76}%` }}
                />
              </div>
            </div>

            {/* Live Stats */}
            <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6 text-left">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Valid Records
                </p>
                <p className="mt-1 text-lg font-bold text-emerald-600">
                  {jobStatus?.valid ?? 414}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Issues Found
                </p>
                <p className="mt-1 text-lg font-bold text-amber-600">
                  {jobStatus?.errors ?? 6}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                <p className="mt-1 text-sm font-semibold capitalize text-foreground">
                  {jobStatus?.status ?? "Validating..."}
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`${ROUTES.PRODUCTS_IMPORT}/${jobId}/issues`)
                }
              >
                Jump to Issue Resolution
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
