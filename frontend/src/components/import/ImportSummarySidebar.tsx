import { cn } from "@/utils/cn";

export interface ImportSummarySidebarProps {
  totalProducts?: number;
  readyCount?: number;
  attentionCount?: number;
  rowsCount?: number;
  newCount?: number;
  matchedCount?: number;
  updatedCount?: number;
  readinessPercent?: number;
  isConfirmationStep?: boolean;
  onReviewIssues?: () => void;
  onSelectIssueType?: (type: "categories" | "skus" | "duplicates" | "images") => void;
  onImportReady?: () => void;
  className?: string;
}

export function ImportSummarySidebar({
  totalProducts = 247,
  readyCount = 231,
  attentionCount = 16,
  rowsCount = 1024,
  newCount = 812,
  matchedCount = 128,
  updatedCount = 84,
  readinessPercent = 93,
  isConfirmationStep = false,
  onReviewIssues,
  onSelectIssueType,
  onImportReady,
  className,
}: ImportSummarySidebarProps) {
  return (
    <div
      className={cn(
        "w-full lg:w-[340px] xl:w-[380px] shrink-0 bg-[#F6F6F6] dark:bg-card/40 border border-[#E3E3E3] dark:border-border rounded-[6px] p-6 select-none",
        className,
      )}
    >
      {/* Title */}
      <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
        Import summary
      </h3>

      {/* Main product count */}
      <div className="text-[21px] leading-[32px] font-semibold text-[#000000] dark:text-white mt-3.5">
        {totalProducts} products detected
      </div>

      {/* Ready count */}
      <p className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white mt-1">
        {isConfirmationStep ? totalProducts : readyCount} ready
      </p>

      {/* Attention Pill */}
      <div className="mt-2.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] bg-white dark:bg-card border border-[#E3E3E3] dark:border-border text-[11px] leading-[17px] font-medium text-[#000000] dark:text-white shadow-xs">
          {isConfirmationStep ? "0 require attention" : `${attentionCount} require attention`}
        </span>
      </div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

      {/* ROW-LEVEL IMPACT */}
      <div>
        <div className="text-[10px] leading-[15px] font-medium text-[#666666] uppercase tracking-wider mb-2.5">
          ROW-LEVEL IMPACT
        </div>
        <div className="space-y-1.5 text-[12px] leading-[18px]">
          <div className="flex items-center justify-between">
            <span className="text-[#666666] font-normal">Rows</span>
            <span className="font-medium text-[#000000] dark:text-white text-right">
              {rowsCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#666666] font-normal">New</span>
            <span className="font-medium text-[#000000] dark:text-white text-right">
              {newCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#666666] font-normal">Matched</span>
            <span className="font-medium text-[#000000] dark:text-white text-right">
              {matchedCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#666666] font-normal">Updated</span>
            <span className="font-medium text-[#000000] dark:text-white text-right">
              {updatedCount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

      {/* Requires attention */}
      <div>
        {isConfirmationStep || attentionCount === 0 ? (
          <div className="space-y-1">
            <div className="text-[13px] leading-[20px] font-semibold text-[#000000] dark:text-white">
              Review complete
            </div>
            <p className="text-[11px] leading-[17px] text-[#666666]">
              All mappings confirmed. No blocking issues remain.
            </p>
          </div>
        ) : (
          <div>
            <div className="text-[13px] leading-[20px] font-semibold text-[#000000] dark:text-white mb-2">
              Requires attention · {attentionCount} items
            </div>
            <div className="space-y-1">
              {[
                { label: "8 category mappings", type: "categories" as const },
                { label: "4 missing SKUs", type: "skus" as const },
                { label: "3 duplicate products", type: "duplicates" as const },
                { label: "1 invalid image URL", type: "images" as const },
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (onSelectIssueType) {
                      onSelectIssueType(item.type);
                    } else if (onReviewIssues) {
                      onReviewIssues();
                    }
                  }}
                  className="w-full flex items-center justify-between py-1 text-left text-[12px] leading-[18px] text-[#000000] dark:text-white hover:text-black/70 dark:hover:text-white/70 transition-colors group"
                >
                  <span className="font-normal group-hover:underline underline-offset-2">
                    {item.label}
                  </span>
                  <span className="text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white">
                    ›
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

      {/* Import readiness */}
      <div>
        <div className="flex items-center justify-between text-[12px] leading-[18px]">
          <span className="font-medium text-[#000000] dark:text-white">
            Import readiness
          </span>
          <span className="font-semibold text-[#000000] dark:text-white">
            {isConfirmationStep ? "100% ready" : `${readinessPercent}% ready`}
          </span>
        </div>

        {/* Readiness track matching Figma: 3px track #E0E0E0, 3px fill #000000 */}
        <div className="w-full h-[3px] bg-[#E0E0E0] dark:bg-muted relative my-2 overflow-hidden">
          <div
            className="h-[3px] bg-[#000000] dark:bg-white transition-all duration-300"
            style={{ width: `${isConfirmationStep ? 100 : readinessPercent}%` }}
          />
        </div>

        <div className="text-[11px] leading-[17px] text-[#666666] font-normal mt-2">
          {isConfirmationStep ? (
            `${totalProducts} products can be imported now.`
          ) : (
            <>
              {readyCount} products can be imported now.
              <br />
              {attentionCount} products need review.
            </>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isConfirmationStep && (
        <div className="mt-4 space-y-2.5">
          {onReviewIssues && (
            <button
              type="button"
              onClick={onReviewIssues}
              className="w-full h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors flex items-center justify-center cursor-pointer"
            >
              Review {attentionCount} issues
            </button>
          )}
          {onImportReady && (
            <button
              type="button"
              onClick={onImportReady}
              className="w-full h-[36px] bg-[#FFFFFF] border border-[#E3E3E3] hover:bg-neutral-50 dark:bg-card dark:border-border text-[#000000] dark:text-white rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors flex items-center justify-center cursor-pointer"
            >
              Import {readyCount} ready products
            </button>
          )}
        </div>
      )}
    </div>
  );
}
