import { useState, useEffect, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";

export default function ImportProcessingPage() {
  const { importId = "IMP-10482" } = useParams<{ importId: string }>();
  const navigate = useNavigate();

  // Progress animation state (starts at Figma's 64% and 159 products)
  const [percent, setPercent] = useState<number>(64);
  const [processedCount, setProcessedCount] = useState<number>(159);
  const totalProducts = 247;

  // Advance progress realistically
  useEffect(() => {
    const interval = setInterval(() => {
      setPercent((prev) => {
        if (prev >= 100) return 100;
        return Math.min(prev + 2, 100);
      });
      setProcessedCount((prev) => {
        if (prev >= totalProducts) return totalProducts;
        return Math.min(prev + 5, totalProducts);
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [totalProducts]);

  const isCompleted = percent >= 100;
  const isCreatingProducts = percent >= 80 && percent < 100;

  const pipelineStages = [
    { label: "Uploading", status: "complete" },
    { label: "Reading", status: "complete" },
    { label: "Mapping", status: "complete" },
    {
      label: "Validating",
      status: percent >= 80 ? "complete" : "in_progress",
    },
    {
      label: "Creating products",
      status: isCompleted ? "complete" : isCreatingProducts ? "in_progress" : "upcoming",
    },
    {
      label: "Complete",
      status: isCompleted ? "complete" : "upcoming",
    },
  ];

  return (
    <div className="w-full min-h-full pb-28 text-foreground">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">
            CATALOG IMPORT
          </div>
          <h1 className="text-[26px] leading-[39px] font-semibold text-[#000000] dark:text-white mt-0.5">
            Importing products
          </h1>
          <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
            Your catalog is being added to the master product workspace.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11px] leading-[17px] font-medium text-[#666666] font-mono">
            Import ID · {importId}
          </span>
          <Button
            variant="outline"
            onClick={() => navigate(ROUTES.PRODUCTS)}
            className="w-[152px] h-[36px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium"
          >
            Import history
          </Button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex flex-col lg:flex-row gap-12 items-start w-full">
        {/* Left Column: Progress & Pipeline & Feed */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Hero Progress Card */}
          <div className="p-6 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
                  {isCompleted ? "Import complete" : "Import in progress"}
                </h2>
                <div className="flex items-center gap-2 text-[12px] leading-[18px] text-[#666666] mt-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isCompleted ? "bg-emerald-500" : "bg-emerald-500 animate-pulse"
                    }`}
                  />
                  <span>
                    {isCompleted
                      ? "Complete · All 247 products added to master catalog"
                      : isCreatingProducts
                        ? "Running · Creating master product records"
                        : "Running · Overall product processing"}
                  </span>
                </div>
              </div>
              <div className="text-[36px] font-semibold tracking-tight text-[#000000] dark:text-white font-mono">
                {percent}%
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-[12px] leading-[18px] text-[#666666]">
                <span className="font-medium text-[#000000] dark:text-white">
                  {processedCount} of {totalProducts} products processed
                </span>
                <span>
                  {isCompleted
                    ? "Complete just now"
                    : isCreatingProducts
                      ? "Estimated remaining work: < 1 minute"
                      : "Estimated remaining work: 2–3 minutes"}
                </span>
              </div>
              <div className="h-[3px] w-full bg-[#E0E0E0] dark:bg-muted relative overflow-hidden">
                <div
                  className="h-full bg-[#000000] dark:bg-white transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Current Batch Pipeline Stepper */}
          <div className="p-6 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
            <h3 className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">
              CURRENT BATCH
            </h3>

            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
              {pipelineStages.map((stage, idx) => (
                <Fragment key={stage.label}>
                  <div className="flex flex-col items-center text-center shrink-0 min-w-[70px]">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mb-1.5 transition-colors ${
                        stage.status === "complete"
                          ? "bg-black text-white dark:bg-white dark:text-black"
                          : stage.status === "in_progress"
                            ? "border-2 border-black dark:border-white text-black dark:text-white"
                            : "bg-[#F6F6F6] text-[#666666]"
                      }`}
                    >
                      {stage.status === "complete" ? (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : stage.status === "in_progress" ? (
                        <span className="w-2 h-2 rounded-full bg-black dark:bg-white animate-ping" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                      )}
                    </div>
                    <span className="text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white">
                      {stage.label}
                    </span>
                    <span className="text-[10px] leading-[14px] text-[#666666] capitalize">
                      {stage.status === "complete"
                        ? "Complete"
                        : stage.status === "in_progress"
                          ? "In progress"
                          : "Upcoming"}
                    </span>
                  </div>

                  {idx < pipelineStages.length - 1 && (
                    <div
                      className={`flex-1 h-[1px] min-w-[20px] -mt-5 ${
                        idx < 3 ? "bg-black dark:bg-white" : "bg-[#E3E3E3] dark:bg-border"
                      }`}
                    />
                  )}
                </Fragment>
              ))}
            </div>
          </div>

          {/* Activity Live Feed */}
          <div className="p-6 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
            <h3 className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">
              REAL-TIME ACTIVITY FEED
            </h3>

            <div className="divide-y divide-[#E3E3E3] dark:divide-border text-[12px] leading-[18px]">
              {[
                { time: "17:42:08", desc: "Batch 4 (Row 180–240) validation passed.", status: "ok" },
                { time: "17:41:45", desc: "Batch 3 (Row 120–180) mapped successfully.", status: "ok" },
                { time: "17:41:10", desc: "Created master product SKU CBP-116-A.", status: "created" },
                { time: "17:40:40", desc: "Parsed spreadsheet headers: 7 columns identified.", status: "ok" },
                { time: "17:40:12", desc: "Upload received: products_october.xlsx (3.4 MB).", status: "ok" },
              ].map((act, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[#666666] text-[11px]">{act.time}</span>
                    <span className="text-[#000000] dark:text-white">{act.desc}</span>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-[3px]">
                    Success
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Processing Summary Sidebar matching #F6F6F6 styling */}
        <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0 bg-[#F6F6F6] dark:bg-card/40 rounded-[6px] border border-[#E3E3E3] dark:border-border p-6 space-y-4 select-none">
          {/* File info */}
          <div>
            <div className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
              Import summary
            </div>
            <div className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white mt-2">
              products_october.xlsx
            </div>
            <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
              Started at 17:40 · Excel import
            </p>
          </div>

          <div className="h-[1px] bg-[#E3E3E3] dark:bg-border my-2" />

          {/* Confirmed scope */}
          <div>
            <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666] mb-2">
              CONFIRMED IMPORT SCOPE
            </div>
            <div className="space-y-1.5 text-[12px] leading-[18px]">
              <div className="flex justify-between">
                <span className="text-[#666666]">Products</span>
                <span className="font-medium text-[#000000] dark:text-white">247</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Rows</span>
                <span className="font-medium text-[#000000] dark:text-white">1,024</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">New products</span>
                <span className="font-medium text-[#000000] dark:text-white">231</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Product updates</span>
                <span className="font-medium text-[#000000] dark:text-white">16</span>
              </div>
            </div>
            <p className="text-[11px] leading-[17px] text-[#666666] pt-1">
              Planned product changes, not completed creations or updates.
            </p>
          </div>

          <div className="h-[1px] bg-[#E3E3E3] dark:bg-border my-2" />

          {/* Product processing */}
          <div>
            <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666] mb-2">
              PRODUCT PROCESSING
            </div>
            <div className="space-y-1.5 text-[12px] leading-[18px]">
              <div className="flex justify-between">
                <span className="text-[#666666]">Processed</span>
                <span className="font-medium text-[#000000] dark:text-white font-mono">
                  {processedCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Remaining</span>
                <span className="font-medium text-[#000000] dark:text-white font-mono">
                  {Math.max(0, totalProducts - processedCount)}
                </span>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-[#E3E3E3] dark:bg-border my-2" />

          {/* Current issue status */}
          <div>
            <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666] mb-2">
              CURRENT ISSUE STATUS
            </div>
            <div className="space-y-1.5 text-[12px] leading-[18px]">
              <div className="flex justify-between">
                <span className="text-[#666666]">Warnings so far</span>
                <span className="font-medium text-[#000000] dark:text-white">0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Blocking issues</span>
                <span className="font-medium text-[#000000] dark:text-white">0</span>
              </div>
            </div>
            <p className="text-[11px] leading-[17px] text-[#666666] pt-1">
              No action needed. Validation is still running.
            </p>
          </div>

          <div className="h-[1px] bg-[#E3E3E3] dark:bg-border my-2" />

          {/* You can safely leave */}
          <div className="space-y-1.5">
            <div className="text-[13px] leading-[20px] font-semibold text-[#000000] dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              You can safely leave
            </div>
            <p className="text-[12px] leading-[18px] text-[#666666]">
              Your import continues in the background. We'll send a completion notification.
            </p>
            <p className="text-[12px] leading-[18px] text-[#666666]">
              Return through Import history to check progress and review the final result.
            </p>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.PRODUCTS)}
              className="w-full h-[36px] border border-[#E3E3E3] bg-white text-[#000000] hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium"
            >
              Go to products catalog
            </Button>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Reassurance Bar */}
      <div className="fixed bottom-0 left-0 lg:left-[224px] right-0 h-[72px] border-t border-[#E3E3E3] dark:border-border bg-white dark:bg-background px-10 z-40 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] leading-[18px] text-[#666666]">
          <span
            className={`w-2 h-2 rounded-full ${
              isCompleted ? "bg-emerald-500" : "bg-emerald-500 animate-pulse"
            }`}
          />
          <span>
            {isCompleted
              ? "Import complete. All records are confirmed in your catalog."
              : "Import continues in the background. You can safely leave this screen."}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isCompleted ? (
            <Button
              onClick={() => navigate(ROUTES.PRODUCTS)}
              className="h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black rounded-[5px] text-[12px] leading-[18px] font-medium px-5"
            >
              View imported products →
            </Button>
          ) : (
            <span className="text-[12px] leading-[18px] font-normal text-[#666666]">
              We'll notify you when it's complete.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
