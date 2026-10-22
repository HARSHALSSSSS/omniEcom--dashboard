import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, Search, ChevronDown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/useToast";
import { initialImportIssues } from "@/mocks/data/imports.data";
import { ImportIssue, IssueResolutionStatus } from "@/types/import";

export default function ImportIssuesPage() {
  const { importId = "IMP-10482" } = useParams<{ importId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [issues, setIssues] = useState<ImportIssue[]>(initialImportIssues);
  const [selectedIssueId, setSelectedIssueId] = useState<string>("iss-084");
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Resolution Sub-states for Right Drawer
  const [categoryPickerOpen, setCategoryPickerOpen] = useState<boolean>(false);
  const [selectedCategoryOption, setSelectedCategoryOption] = useState<string>("Travel Accessories");
  const [imageUrlInput, setImageUrlInput] = useState<string>("https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400");
  const [manualSkuInput, setManualSkuInput] = useState<string>("");
  const [isEditingSkuManually, setIsEditingSkuManually] = useState<boolean>(false);

  // Validation States
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [revalidationDone, setRevalidationDone] = useState<boolean>(false);

  const selectedIssue = issues.find((i) => i.id === selectedIssueId) || issues[0];

  // Derived counts
  const resolvedCount = issues.filter((i) => i.status === "resolved").length;
  const openCount = issues.length - resolvedCount;
  const blockingCount = issues.filter((i) => i.severity === "blocking" && i.status === "open").length;

  // Filtered issues
  const filteredIssues = issues.filter((issue) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = issue.productData.title.toLowerCase().includes(q);
      const matchSku = (issue.productData.sku || "").toLowerCase().includes(q);
      const matchRow = issue.rowNumber.toString().includes(q);
      if (!matchTitle && !matchSku && !matchRow) return false;
    }

    // Category Tabs filter
    if (activeCategoryTab === "missing_info") {
      return ["missing_sku", "missing_weight", "missing_material", "missing_brand"].includes(issue.type);
    }
    if (activeCategoryTab === "mapping") {
      return issue.type === "category_unmapped";
    }
    if (activeCategoryTab === "duplicates") {
      return issue.type === "possible_duplicate";
    }
    if (activeCategoryTab === "invalid_data") {
      return issue.type === "invalid_image";
    }

    return true;
  });

  // Action Handlers
  const handleResolveIssue = (issueId: string, fixText: string) => {
    setIssues((prev) =>
      prev.map((item) =>
        item.id === issueId
          ? {
              ...item,
              status: "resolved" as IssueResolutionStatus,
              currentFix: fixText,
              severity: item.severity === "blocking" ? ("needs_review" as const) : item.severity,
            }
          : item,
      ),
    );
    toast({
      title: "Correction recorded",
      description: `Correction applied for row ${selectedIssue.rowNumber}.`,
    });
  };

  const handleRunRevalidation = () => {
    setIsRevalidating(true);
    setRevalidationDone(false);

    // Temporarily set statuses to checking
    setIssues((prev) =>
      prev.map((item) => (item.status === "resolved" ? { ...item, status: "checking" as IssueResolutionStatus } : item)),
    );

    setTimeout(() => {
      setIsRevalidating(false);
      setRevalidationDone(true);

      // Return items to resolved
      setIssues((prev) =>
        prev.map((item) => (item.status === "checking" ? { ...item, status: "resolved" as IssueResolutionStatus } : item)),
      );

      toast({
        title: "Revalidation complete",
        description: "5 corrected items verified successfully.",
      });
    }, 2000);
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
              Review import issues
            </h1>
            <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
              Fix the items that need attention before completing your catalog setup.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[11px] leading-[17px] font-medium text-[#666666] font-mono">
              Import ID · {importId}
            </span>
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.PRODUCTS_IMPORT)}
              className="h-[36px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium px-4"
            >
              View import summary
            </Button>
          </div>
        </div>

        {/* 5 KPI Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          <div className="p-4 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-[#F6F6F6] dark:bg-card/40">
            <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">247</div>
            <div className="text-[12px] leading-[18px] text-[#666666] mt-0.5">products</div>
          </div>
          <div className="p-4 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-[#F6F6F6] dark:bg-card/40">
            <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">
              {revalidationDone ? "244" : "239"}
            </div>
            <div className="text-[12px] leading-[18px] text-[#666666] mt-0.5">imported</div>
          </div>
          <div className="p-4 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-[#F6F6F6] dark:bg-card/40">
            <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">
              {revalidationDone ? "3" : "8"}
            </div>
            <div className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
              require attention
            </div>
          </div>
          <div className="p-4 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-[#F6F6F6] dark:bg-card/40">
            <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">
              {blockingCount}
            </div>
            <div className="text-[12px] leading-[18px] text-[#666666] mt-0.5">blocking</div>
          </div>
          <div className="p-4 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-[#F6F6F6] dark:bg-card/40">
            <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">
              {revalidationDone ? "3" : "8"}
            </div>
            <div className="text-[12px] leading-[18px] text-[#666666] mt-0.5">warnings</div>
          </div>
        </div>

        {/* Review Progress Tracker */}
        <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between text-[12px] leading-[18px] text-[#666666] gap-2">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[#000000] dark:text-white">
              {resolvedCount} of {issues.length} issues reviewed
            </span>
            <div className="w-48 h-[3px] bg-[#E0E0E0] dark:bg-muted relative overflow-hidden">
              <div
                className="h-full bg-[#000000] dark:bg-white transition-all duration-300"
                style={{ width: `${(resolvedCount / issues.length) * 100}%` }}
              />
            </div>
            <span>{openCount} issues remaining to review</span>
          </div>
          <span className="text-[11px] leading-[17px] font-medium text-[#666666]">
            {isRevalidating
              ? "5 corrections being revalidated"
              : revalidationDone
                ? "5 corrections validated · 3 not yet reviewed"
                : "Reviewed corrections await revalidation"}
          </span>
        </div>

        {/* Search, Filter & Tabs Bar */}
        <div className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#666666]" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search product, SKU or row..."
                  className="pl-9 h-[36px] text-[12px] leading-[18px] bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[5px]"
                />
              </div>

              {/* Filter Dropdowns */}
              <div className="flex items-center gap-1.5">
                {["Issue type", "Severity", "Status", "Field"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="flex items-center gap-1.5 h-[36px] text-[12px] leading-[18px] font-medium px-3 rounded-[5px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card hover:bg-neutral-50 text-[#000000] dark:text-white transition-colors"
                  >
                    <span>{f}</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[12px] leading-[18px] text-[#666666] font-medium">
              <span>Sort · Most important first</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 border-b border-[#E3E3E3] dark:border-border pb-2 text-[12px] leading-[18px]">
            {[
              { id: "all", label: "All 8" },
              { id: "missing_info", label: "Missing information 4" },
              { id: "mapping", label: "Mapping 2" },
              { id: "duplicates", label: "Duplicates 1" },
              { id: "invalid_data", label: "Invalid data 1" },
              { id: "other", label: "Other 0" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategoryTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-[5px] font-medium text-[12px] leading-[18px] transition-colors ${
                  activeCategoryTab === tab.id
                    ? "bg-[#000000] text-white dark:bg-white dark:text-black font-semibold"
                    : "text-[#666666] hover:text-[#000000] hover:bg-[#F6F6F6] dark:hover:bg-muted/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ──────────────── MAIN TWO-COLUMN SPLIT LAYOUT ──────────────── */}
      <div className="flex flex-col lg:flex-row gap-12 items-start w-full">
        {/* Left Column: Data Table */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          <div className="border border-[#E3E3E3] dark:border-border rounded-[4px] overflow-hidden bg-white dark:bg-card">
            <table className="w-full text-left text-[12px] leading-[18px]">
              <thead className="bg-[#F6F6F6] dark:bg-muted/50 border-b border-[#E3E3E3] dark:border-border text-[#666666] font-medium text-[11px] leading-[17px] h-[27px]">
                <tr>
                  <th className="py-1 px-3.5 font-medium w-12">Row</th>
                  <th className="py-1 px-3.5 font-medium">Product</th>
                  <th className="py-1 px-3.5 font-medium">Issue</th>
                  <th className="py-1 px-3.5 font-medium">Field</th>
                  <th className="py-1 px-3.5 font-medium">Severity</th>
                  <th className="py-1 px-3.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E3E3] dark:divide-border">
                {filteredIssues.map((issue) => {
                  const isSelected = issue.id === selectedIssueId;
                  const isResolved = issue.status === "resolved";
                  const isChecking = issue.status === "checking";

                  return (
                    <tr
                      key={issue.id}
                      onClick={() => {
                        setSelectedIssueId(issue.id);
                        setCategoryPickerOpen(false);
                        setIsEditingSkuManually(false);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#F0F0F0] dark:bg-muted font-medium"
                          : "hover:bg-[#F9F9F9] dark:hover:bg-muted/40"
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono text-[#666666] text-[11px]">
                        {issue.rowNumber}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-[#000000] dark:text-white">
                          {issue.productData.title}
                        </div>
                        <div className="text-[11px] text-[#666666] font-mono">
                          {issue.productData.sku || "SKU missing"}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-[#000000] dark:text-white">
                        {issue.title}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#666666]">
                        {issue.field || "General"}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`text-[11px] leading-[16px] font-medium capitalize ${
                            issue.severity === "blocking" && !isResolved
                              ? "text-red-600 font-semibold"
                              : issue.severity === "needs_review"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-[#666666]"
                          }`}
                        >
                          {issue.severity === "blocking" && isResolved
                            ? "Blocking · cleared"
                            : issue.severity === "needs_review"
                              ? "Needs review"
                              : issue.severity || "Warning"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        {isChecking ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#666666] font-medium animate-pulse">
                            Checking...
                          </span>
                        ) : isResolved ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#000000] dark:text-white font-semibold">
                            <Check className="w-3.5 h-3.5 stroke-[2.5] text-emerald-600" />
                            Resolved
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#666666]">
                            Open
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-1 text-[11px] leading-[17px] text-[#666666] space-y-1">
            <p>
              Showing all 8 findings · Resolved corrections stay visible. Additional sample records: rows 305, 367, 638 and 701.
            </p>
            <p className="opacity-80">
              Blocking: affected record only · Review: confirmation needed · Warning: may not prevent import. Health counts include nonblocking review findings awaiting validation.
            </p>
          </div>
        </div>

        {/* Right Column: Contextual Resolution Details Panel */}
        <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0 bg-[#F6F6F6] dark:bg-card/40 rounded-[6px] border border-[#E3E3E3] dark:border-border p-6 space-y-5">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-[#E3E3E3] dark:border-border pb-3">
            <span className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">
              ISSUE DETAILS
            </span>
            <span className="text-[11px] font-mono text-[#666666]">
              Row {selectedIssue.rowNumber}
            </span>
          </div>

          {/* ──────────────── CASE A: REVALIDATING PROGRESS VIEW ──────────────── */}
          {isRevalidating ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                  Revalidating 5 corrected items...
                </h3>
                <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                  {selectedIssue.productData.title}
                </p>
                <p className="text-[11px] leading-[17px] text-[#666666]">
                  In progress · Corrections preserved
                </p>
              </div>

              <div className="p-4 bg-white dark:bg-card rounded-[6px] border border-[#E3E3E3] dark:border-border space-y-2">
                <div className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
                  Checking approved corrections
                </div>
                <p className="text-[11px] leading-[17px] text-[#666666]">
                  2 of 5 checked · Validating image accessibility
                </p>
                <div className="space-y-1.5 text-[12px] leading-[18px] pt-2">
                  <div className="flex items-center gap-2 text-[#000000] dark:text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Row 84 · Category mapping
                  </div>
                  <div className="flex items-center gap-2 text-[#000000] dark:text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Row 116 · Master SKU
                  </div>
                  <div className="flex items-center gap-2 text-[#000000] dark:text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Row 305 · Product weight
                  </div>
                  <div className="flex items-center gap-2 text-[#666666]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    Row 367 · Product material
                  </div>
                  <div className="flex items-center gap-2 text-[#666666]">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                    Row 482 · Product image
                  </div>
                </div>
              </div>

              <p className="text-[11px] leading-[17px] text-[#666666]">
                Only corrected items are checked. 239 valid products remain imported. The 3 unreviewed issues stay in the queue; no import restart is needed.
              </p>
            </div>
          ) : revalidationDone && selectedIssue.id === "iss-084" ? (
            /* ──────────────── CASE B: 5 RESOLVED BATCH SUMMARY VIEW ──────────────── */
            <div className="space-y-4">
              <div>
                <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">5 resolved</h3>
                <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                  {selectedIssue.productData.title}
                </p>
                <p className="text-[11px] leading-[17px] text-[#666666]">
                  Revalidation complete · This batch passed
                </p>
              </div>

              <div className="p-4 bg-white dark:bg-card rounded-[6px] border border-[#E3E3E3] dark:border-border space-y-3">
                <div className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
                  Approved corrections validated
                </div>
                <p className="text-[12px] leading-[18px] text-[#666666]">
                  All 5 corrected items passed. These products have now completed import.
                </p>

                <div className="space-y-1.5 text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white pt-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" /> Row 84 · Travel Accessories
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" /> Row 116 · CBP-116-A
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" /> Row 305 · Weight added
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" /> Row 367 · Material added
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" /> Row 482 · Image retrieved
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-card rounded-[6px] text-[12px] leading-[18px] space-y-1 border border-[#E3E3E3] dark:border-border">
                <div className="font-semibold text-[#000000] dark:text-white">3 issues still need review</div>
                <p className="text-[#666666]">
                  Row 214: duplicate match. Row 638: category mapping. Row 701: missing brand. These were not part of this validation batch.
                </p>
              </div>

              <Button
                onClick={() => setSelectedIssueId("iss-214")}
                className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
              >
                Review remaining issues
              </Button>
            </div>
          ) : (
            /* ──────────────── REGULAR ISSUE DETAILS BY TYPE ──────────────── */
            <>
              {/* 1. CATEGORY NOT MAPPED (Row 84 & Row 638) */}
              {selectedIssue.type === "category_unmapped" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                      {categoryPickerOpen ? "Map category" : "Category not mapped"}
                    </h3>
                    <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                      {selectedIssue.productData.title}
                    </p>
                    <p className="text-[11px] leading-[17px] text-[#666666]">
                      {selectedIssue.status === "resolved"
                        ? "Resolved · Awaiting revalidation"
                        : "Open · Needs review"}
                    </p>
                  </div>

                  {selectedIssue.status === "resolved" && !categoryPickerOpen ? (
                    <div className="space-y-4">
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-[5px] text-[12px] leading-[18px] font-medium flex items-center gap-2">
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        Category mapped successfully
                      </div>

                      <div className="space-y-2.5 text-[12px] leading-[18px]">
                        <div>
                          <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">
                            Source value
                          </span>
                          <span className="text-[#000000] dark:text-white font-medium">
                            {selectedIssue.sourceValue}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">
                            Applied destination
                          </span>
                          <span className="text-[#000000] dark:text-white font-semibold">
                            {selectedIssue.currentFix || "Travel Accessories"}
                          </span>
                        </div>
                        <div className="pt-1">
                          <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">
                            What changed
                          </span>
                          <p className="text-[#666666]">
                            Your approved mapping is saved in the working import data for Row {selectedIssue.rowNumber}. The imported record is not declared complete yet.
                          </p>
                        </div>
                        <div className="pt-1">
                          <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">
                            Next step
                          </span>
                          <p className="text-[#666666]">
                            Revalidate to check the correction. Your other products and confirmed fixes stay intact.
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => setCategoryPickerOpen(true)}
                        className="w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50"
                      >
                        Change category
                      </Button>
                    </div>
                  ) : categoryPickerOpen ? (
                    /* Inline Category Selector Dropdown State */
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
                          Current source value
                        </label>
                        <p className="text-[12px] leading-[18px] text-[#666666]">
                          {selectedIssue.sourceValue}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
                          Destination category
                        </label>
                        <div className="border border-[#E3E3E3] dark:border-border rounded-[6px] bg-white dark:bg-card p-2 space-y-2">
                          <Input
                            placeholder="Search categories..."
                            className="h-[32px] text-[12px] bg-[#F6F6F6] dark:bg-muted/40 border border-[#E3E3E3] rounded-[4px]"
                          />
                          <div className="space-y-1 pt-1">
                            {["Travel Accessories", "Bags & Luggage", "Accessories"].map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setSelectedCategoryOption(cat)}
                                className={`w-full flex items-center justify-between p-2 rounded-[4px] text-[12px] leading-[18px] transition-colors ${
                                  selectedCategoryOption === cat
                                    ? "bg-[#F0F0F0] dark:bg-muted font-semibold text-[#000000] dark:text-white"
                                    : "hover:bg-[#F9F9F9] dark:hover:bg-muted/50 text-[#000000] dark:text-white"
                                }`}
                              >
                                <span>{cat}</span>
                                {selectedCategoryOption === cat && (
                                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={() => {
                          handleResolveIssue(selectedIssue.id, selectedCategoryOption);
                          setCategoryPickerOpen(false);
                        }}
                        className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
                      >
                        Apply mapping
                      </Button>
                      <p className="text-[11px] leading-[17px] text-[#666666]">
                        Applies to Row {selectedIssue.rowNumber} in your working import data. Revalidate before completing this record.
                      </p>
                    </div>
                  ) : (
                    /* Default Unresolved Category State */
                    <div className="space-y-4">
                      <div className="space-y-1 text-[12px] leading-[18px]">
                        <span className="font-semibold text-[#000000] dark:text-white">What happened</span>
                        <p className="text-[#666666]">
                          {selectedIssue.description}
                        </p>
                      </div>

                      <div className="space-y-1 text-[12px] leading-[18px]">
                        <span className="font-semibold text-[#000000] dark:text-white">Why</span>
                        <p className="text-[#666666]">
                          No exact category match was found.
                        </p>
                      </div>

                      <div className="space-y-1 text-[12px] leading-[18px]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#000000] dark:text-white">Suggested solution</span>
                          <span className="text-[11px] text-[#666666]">Confidence · Medium</span>
                        </div>
                        <div className="font-semibold text-[#000000] dark:text-white text-[13px]">
                          {selectedIssue.suggestedFix || "Travel Accessories"}
                        </div>
                        <p className="text-[#666666] text-[11px] leading-[17px]">
                          Matches the existing product category structure used by 18 similar products in this catalog.
                        </p>
                      </div>

                      <div className="space-y-2 pt-2">
                        <Button
                          onClick={() =>
                            handleResolveIssue(
                              selectedIssue.id,
                              selectedIssue.suggestedFix || "Travel Accessories",
                            )
                          }
                          className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
                        >
                          Accept suggestion
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setCategoryPickerOpen(true)}
                          className="w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50"
                        >
                          Choose another category
                        </Button>
                      </div>
                      <p className="text-[11px] leading-[17px] text-[#666666]">
                        You're in control. Suggestions never change your catalog until you approve them.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 2. POSSIBLE DUPLICATE (Row 214) */}
              {selectedIssue.type === "possible_duplicate" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                      Possible duplicate
                    </h3>
                    <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                      {selectedIssue.productData.title}
                    </p>
                    <p className="text-[11px] leading-[17px] text-[#666666]">
                      Open · Review · Illustrative example
                    </p>
                  </div>

                  <div className="space-y-1 text-[12px] leading-[18px]">
                    <span className="font-semibold text-[#000000] dark:text-white">What happened</span>
                    <p className="text-[#666666]">
                      An existing master product has the same SKU as this imported product.
                    </p>
                  </div>

                  {/* Side-by-side comparison boxes */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-white dark:bg-card rounded-[6px] border border-[#E3E3E3] dark:border-border space-y-1 text-[12px] leading-[18px]">
                      <span className="text-[10px] uppercase font-medium tracking-wider text-[#666666]">
                        Imported product
                      </span>
                      <div className="font-semibold text-[#000000] dark:text-white">
                        Premium Travel Bag
                      </div>
                      <div className="font-mono text-[#666666] text-[11px]">
                        SKU TRV-1042
                      </div>
                    </div>

                    <div className="p-3 bg-white dark:bg-card rounded-[6px] border border-[#E3E3E3] dark:border-border space-y-1 text-[12px] leading-[18px]">
                      <span className="text-[10px] uppercase font-medium tracking-wider text-[#666666]">
                        Existing product
                      </span>
                      <div className="font-semibold text-[#000000] dark:text-white">
                        Premium Travel Bag
                      </div>
                      <div className="font-mono text-[#666666] text-[11px]">
                        SKU TRV-1042
                      </div>
                    </div>
                  </div>

                  <div className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
                    High-confidence match · Exact SKU
                  </div>

                  <div className="space-y-2 pt-1">
                    <Button
                      onClick={() =>
                        handleResolveIssue(selectedIssue.id, "Update existing product")
                      }
                      className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
                    >
                      Update existing product
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleResolveIssue(selectedIssue.id, "Create new product")
                      }
                      className="w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50"
                    >
                      Create new product
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleResolveIssue(selectedIssue.id, "Ignore match")
                      }
                      className="w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50"
                    >
                      Ignore match
                    </Button>
                  </div>

                  <p className="text-[11px] leading-[17px] text-[#666666]">
                    You decide how to handle this match. No records are silently merged.
                  </p>
                </div>
              )}

              {/* 3. MISSING MASTER SKU (Row 116) */}
              {selectedIssue.type === "missing_sku" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                      Missing master SKU
                    </h3>
                    <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                      {selectedIssue.productData.title}
                    </p>
                    <p className="text-[11px] leading-[17px] text-[#666666]">
                      {selectedIssue.status === "resolved"
                        ? "Resolved · Awaiting revalidation"
                        : "Open · Blocking this record only"}
                    </p>
                  </div>

                  <div className="space-y-1 text-[12px] leading-[18px]">
                    <span className="font-semibold text-[#000000] dark:text-white">What happened</span>
                    <p className="text-[#666666]">
                      Row 116 does not contain a valid SKU.
                    </p>
                  </div>

                  <div className="space-y-1 text-[12px] leading-[18px]">
                    <span className="font-semibold text-[#000000] dark:text-white">Why it matters</span>
                    <p className="text-[#666666]">
                      Each master product requires a unique internal SKU.
                    </p>
                  </div>

                  <div className="p-4 bg-white dark:bg-card rounded-[6px] border border-[#E3E3E3] dark:border-border space-y-1 text-[12px] leading-[18px]">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[#666666]">
                      Suggested solution · Generate SKU
                    </span>
                    <div className="text-[11px] text-[#666666]">Preview · Not applied</div>
                    <div className="text-[18px] font-mono font-bold text-[#000000] dark:text-white">
                      CBP-116-A
                    </div>
                  </div>

                  {isEditingSkuManually ? (
                    <div className="space-y-2">
                      <Input
                        value={manualSkuInput}
                        onChange={(e) => setManualSkuInput(e.target.value)}
                        placeholder="Enter unique SKU code..."
                        className="text-[12px] leading-[18px] h-[36px] bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[5px]"
                      />
                      <Button
                        onClick={() => {
                          if (manualSkuInput.trim()) {
                            handleResolveIssue(selectedIssue.id, manualSkuInput.trim());
                            setIsEditingSkuManually(false);
                          }
                        }}
                        className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
                      >
                        Apply custom SKU
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <Button
                        onClick={() => handleResolveIssue(selectedIssue.id, "CBP-116-A")}
                        className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
                      >
                        Use suggested SKU
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setIsEditingSkuManually(true)}
                        className="w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50"
                      >
                        Enter manually
                      </Button>
                    </div>
                  )}

                  <p className="text-[11px] leading-[17px] text-[#666666]">
                    Nothing is generated or committed until you approve. Other valid products remain imported.
                  </p>
                </div>
              )}

              {/* 4. INVALID IMAGE URL (Row 482) */}
              {selectedIssue.type === "invalid_image" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                      Invalid image URL
                    </h3>
                    <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                      {selectedIssue.productData.title}
                    </p>
                    <p className="text-[11px] leading-[17px] text-[#666666]">
                      Open · Warning · Product media
                    </p>
                  </div>

                  <div className="space-y-1 text-[12px] leading-[18px]">
                    <span className="font-semibold text-[#000000] dark:text-white">Source</span>
                    <p className="text-[#666666] font-mono text-[11px] break-all">
                      {selectedIssue.sourceValue}
                    </p>
                  </div>

                  <div className="space-y-1 text-[12px] leading-[18px]">
                    <span className="font-semibold text-[#000000] dark:text-white">Problem</span>
                    <p className="text-[#666666]">
                      The image could not be retrieved.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
                      Replace image URL
                    </label>
                    <Input
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Paste a valid image URL..."
                      className="text-[12px] leading-[18px] h-[36px] bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[5px]"
                    />
                    <div className="text-center text-[11px] text-[#666666]">or</div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast({
                          title: "File selector",
                          description: "Select replacement photo from your computer.",
                        })
                      }
                      className="w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      Upload image
                    </Button>
                  </div>

                  <div className="space-y-2 pt-1">
                    <Button
                      onClick={() => handleResolveIssue(selectedIssue.id, imageUrlInput)}
                      className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
                    >
                      Fix image
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleResolveIssue(selectedIssue.id, "Skipped")}
                      className="w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50"
                    >
                      Skip image
                    </Button>
                  </div>

                  <p className="text-[11px] leading-[17px] text-[#666666]">
                    This product stays usable without an image. A channel image requirement may block only the affected listing, not your catalog.
                  </p>
                </div>
              )}

              {/* 5. OTHER RESOLVED ISSUES (Weight, Material, Brand) */}
              {["missing_weight", "missing_material", "missing_brand"].includes(
                selectedIssue.type,
              ) && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                      {selectedIssue.title}
                    </h3>
                    <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                      {selectedIssue.productData.title}
                    </p>
                    <p className="text-[11px] leading-[17px] text-[#666666]">
                      {selectedIssue.status === "resolved" ? "Resolved" : "Open"} · Warning
                    </p>
                  </div>

                  <div className="p-4 bg-white dark:bg-card rounded-[6px] text-[12px] leading-[18px] space-y-1 border border-[#E3E3E3] dark:border-border">
                    <div className="font-semibold text-[#000000] dark:text-white">Summary</div>
                    <p className="text-[#666666]">{selectedIssue.description}</p>
                    <div className="pt-2">
                      <span className="font-semibold text-[#000000] dark:text-white">Applied Value: </span>
                      <span className="font-mono text-[#000000] dark:text-white font-semibold">
                        {selectedIssue.currentFix || selectedIssue.suggestedFix}
                      </span>
                    </div>
                  </div>

                  {selectedIssue.status !== "resolved" && (
                    <Button
                      onClick={() =>
                        handleResolveIssue(
                          selectedIssue.id,
                          selectedIssue.suggestedFix || "Fixed",
                        )
                      }
                      className="w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]"
                    >
                      Apply suggested fix
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ──────────────── STICKY BOTTOM BAR ──────────────── */}
      <div className="fixed bottom-0 left-0 lg:left-[224px] right-0 h-[72px] border-t border-[#E3E3E3] dark:border-border bg-white dark:bg-background px-10 z-40 flex items-center justify-between">
        <div className="text-[12px] leading-[18px] text-[#666666]">
          <span className="font-medium text-[#000000] dark:text-white">
            {revalidationDone ? "244" : "239"} valid products remain imported.
          </span>{" "}
          Only affected records need attention. Fix → Revalidate → Continue
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={isRevalidating}
            onClick={handleRunRevalidation}
            className="h-[36px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium px-4"
          >
            {isRevalidating ? "Revalidating..." : "Revalidate"}
          </Button>
          <Button
            onClick={() => navigate(ROUTES.PRODUCTS_IMPORT)}
            className="h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-[5px] text-[12px] leading-[18px] font-medium px-5"
          >
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
