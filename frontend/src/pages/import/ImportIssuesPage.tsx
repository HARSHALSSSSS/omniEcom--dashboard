import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import {
  useImportIssues,
  useResolveIssue,
  useRevalidateImport,
  useCommitImport,
  useImportJob,
} from "@/hooks/useImport";
import { ImportIssue } from "@/types/import";

const CATEGORY_TAXONOMY = [
  "Apparel & Accessories > Ethnic Wear > Kurtas",
  "Apparel & Accessories > Casual Tops > T-Shirts",
  "Apparel & Accessories > Outerwear > Jackets",
  "Footwear > Traditional > Mojaris & Juttis",
  "Home & Living > Furnishing > Cushion Covers",
];

export default function ImportIssuesPage() {
  const { importId } = useParams<{ importId: string }>();
  const navigate = useNavigate();
  const effectiveImportId = importId || "imp-2026-9041";

  const { data: job } = useImportJob(effectiveImportId);
  const { data: issuesData } = useImportIssues(effectiveImportId);
  const resolveIssueMutation = useResolveIssue(effectiveImportId);
  const revalidateMutation = useRevalidateImport(effectiveImportId);
  const commitMutation = useCommitImport(effectiveImportId);

  const [selectedIssueId, setSelectedIssueId] = useState<string>("iss-001");
  const [filterType, setFilterType] = useState<string>("all");
  const [customInputValue, setCustomInputValue] = useState<string>("");

  const issues = issuesData?.issues ?? [];
  const selectedIssue =
    issues.find((i) => i.id === selectedIssueId) ?? issues[0];

  const filteredIssues = issues.filter((i) => {
    if (filterType === "all") return true;
    if (filterType === "open") return i.status === "open";
    if (filterType === "resolved") return i.status === "resolved";
    return i.type === filterType;
  });

  const openIssuesCount = issues.filter((i) => i.status === "open").length;
  const resolvedIssuesCount = issues.filter((i) => i.status === "resolved").length;

  const handleApplySuggested = (issue: ImportIssue) => {
    if (!issue.suggestedFix) return;
    resolveIssueMutation.mutate({
      issueId: issue.id,
      action: "accept_suggestion",
    });
  };

  const handleApplyCustom = (issue: ImportIssue) => {
    if (!customInputValue.trim()) return;
    resolveIssueMutation.mutate(
      {
        issueId: issue.id,
        action: "custom_value",
        customValue: customInputValue,
      },
      {
        onSuccess: () => {
          setCustomInputValue("");
        },
      },
    );
  };

  const handleRevalidate = () => {
    revalidateMutation.mutate();
  };

  const handleCommit = () => {
    commitMutation.mutate(undefined, {
      onSuccess: () => {
        navigate(ROUTES.PRODUCTS);
      },
    });
  };

  return (
    <div className="w-full space-y-6 pb-16">
      {/* Page Header with Action buttons */}
      <PageHeader
        eyebrow="BATCH EXCEPTION RESOLUTION"
        title="Resolve Import Exceptions"
        description={`Review and resolve data validation warnings for ${
          job?.fileName ?? "festive_apparel_catalog_v2.csv"
        } before committing.`}
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleRevalidate}
              disabled={revalidateMutation.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  revalidateMutation.isPending ? "animate-spin" : ""
                }`}
              />
              Revalidate All
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCommit}
              disabled={commitMutation.isPending}
            >
              {openIssuesCount === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Commit All (
                  {(job?.validRows ?? 414) + resolvedIssuesCount} Products)
                </>
              ) : (
                <>
                  Commit Clean Records Only ({job?.validRows ?? 414})
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Progress & Summary Ribbon */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Total Rows:
            </span>
            <span className="font-mono text-sm font-bold text-foreground">
              {job?.totalRows ?? 420}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-emerald-600">
              Valid:
            </span>
            <span className="font-mono text-sm font-bold text-emerald-700">
              {job?.validRows ?? 414}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-amber-600">
              Resolved:
            </span>
            <span className="font-mono text-sm font-bold text-amber-700">
              {resolvedIssuesCount}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-destructive">
              Remaining Issues:
            </span>
            <span className="font-mono text-sm font-bold text-destructive">
              {openIssuesCount}
            </span>
          </div>
        </div>

        {/* Quick status message */}
        <div className="text-xs">
          {openIssuesCount === 0 ? (
            <span className="flex items-center gap-1.5 font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> All exceptions resolved. Ready
              to commit.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-medium text-amber-600">
              <AlertTriangle className="h-4 w-4" /> {openIssuesCount} issue(s)
              require attention.
            </span>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setFilterType("all")}
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            filterType === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          All Issues ({issues.length})
        </button>
        <button
          onClick={() => setFilterType("open")}
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            filterType === "open"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Open ({openIssuesCount})
        </button>
        <button
          onClick={() => setFilterType("resolved")}
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            filterType === "resolved"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Resolved ({resolvedIssuesCount})
        </button>
      </div>

      {/* Main Two-Panel Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Issue List (5 cols) */}
        <div className="space-y-3 lg:col-span-5">
          {filteredIssues.map((issue) => {
            const isSelected = selectedIssue?.id === issue.id;
            const isResolved = issue.status === "resolved";

            return (
              <div
                key={issue.id}
                onClick={() => setSelectedIssueId(issue.id)}
                className={`cursor-pointer rounded-xl border p-4 transition-all ${
                  isSelected
                    ? "border-[#1D4ED8] bg-[#E6F4FF]/30 shadow-sm ring-1 ring-[#1D4ED8]"
                    : "border-border bg-card hover:border-border-subtle hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      Row {issue.rowNumber}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        isResolved
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {issue.type.replace("_", " ")}
                    </span>
                  </div>
                  {isResolved ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                      <Check className="h-3.5 w-3.5" /> Resolved
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-destructive">
                      Action Required
                    </span>
                  )}
                </div>

                <h4 className="mt-2 text-xs font-semibold text-foreground">
                  {issue.title}
                </h4>
                <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                  {issue.productData.title}
                </p>

                {issue.currentFix && (
                  <div className="mt-2.5 rounded bg-muted/50 px-2 py-1 text-[11px] font-mono text-muted-foreground">
                    Applied:{" "}
                    <span className="text-foreground">{issue.currentFix}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Fix & Inspection Workspace (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          {selectedIssue ? (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      Row {selectedIssue.rowNumber}
                    </span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {selectedIssue.type.replace("_", " ")}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-foreground">
                    {selectedIssue.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedIssue.description}
                  </p>
                </div>
                {selectedIssue.status === "resolved" ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Resolved
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    Open
                  </span>
                )}
              </div>

              {/* Product Preview Card */}
              <div className="mt-4 flex gap-4 rounded-lg border border-border bg-muted/20 p-4">
                {selectedIssue.productData.imageUrl && (
                  <img
                    src={selectedIssue.productData.imageUrl}
                    alt=""
                    className="h-16 w-16 rounded-md object-cover border border-border bg-muted"
                  />
                )}
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-foreground">
                    {selectedIssue.productData.title}
                  </p>
                  <p className="text-muted-foreground">
                    SKU:{" "}
                    <span className="font-mono text-foreground">
                      {selectedIssue.productData.sku ?? "None"}
                    </span>{" "}
                    · Category:{" "}
                    <span className="text-foreground">
                      {selectedIssue.productData.category ?? "Unassigned"}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Price: ₹{selectedIssue.productData.price} · Barcode:{" "}
                    <span className="font-mono">
                      {selectedIssue.productData.barcode ?? "—"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Resolution Panel */}
              <div className="mt-6 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Choose Resolution
                </h4>

                {/* Option A: Suggested Fix (AI / Catalog Rule) */}
                {selectedIssue.suggestedFix && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
                        <Sparkles className="h-4 w-4 text-emerald-600" />
                        Suggested Fix (Auto-Detected)
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
                        onClick={() => handleApplySuggested(selectedIssue)}
                        disabled={resolveIssueMutation.isPending}
                      >
                        Accept Suggestion
                      </Button>
                    </div>
                    <p className="mt-2 font-mono text-xs font-medium text-emerald-900">
                      {selectedIssue.suggestedFix}
                    </p>
                  </div>
                )}

                {/* Option B: Category Selector if category issue */}
                {selectedIssue.type === "category_unmapped" && (
                  <div className="rounded-lg border border-border p-4 space-y-2">
                    <p className="text-xs font-semibold text-foreground">
                      Map to Standard Category Taxonomy
                    </p>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      onChange={(e) => {
                        if (e.target.value) {
                          resolveIssueMutation.mutate({
                            issueId: selectedIssue.id,
                            action: "custom_value",
                            customValue: e.target.value,
                          });
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select matching taxonomy category...
                      </option>
                      {CATEGORY_TAXONOMY.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Option C: Custom Manual Entry */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground">
                    Custom Manual Value
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder={`Enter manual ${selectedIssue.affectedFields.join(", ")}...`}
                      value={customInputValue}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCustomInputValue(e.target.value)
                      }
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApplyCustom(selectedIssue)}
                      disabled={
                        !customInputValue.trim() ||
                        resolveIssueMutation.isPending
                      }
                    >
                      Apply
                    </Button>
                  </div>
                </div>

                {/* Option D: Ignore Row */}
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      resolveIssueMutation.mutate({
                        issueId: selectedIssue.id,
                        action: "ignore",
                      });
                    }}
                  >
                    Ignore this row (Skip from import)
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
              Select an issue from the list to review details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
