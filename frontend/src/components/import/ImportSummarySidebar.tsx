import { cn } from "@/utils/cn";
import { num } from "./importFormat";
import type { ExceptionBucket } from "./wizard/exceptions";

export interface ImportSummarySidebarProps {
  /** products (or rows, when the API does not count products) found in the file; undefined while unknown */
  totalProducts?: number;
  readyCount?: number;
  attentionCount?: number;
  rowsCount?: number;
  newCount?: number;
  matchedCount?: number;
  updatedCount?: number;
  readinessPercent?: number;
  /** what the totals count ("products" unless the API only knows rows) */
  unit?: string;
  isConfirmationStep?: boolean;
  /** the kinds of exception that still need a decision, with their side panel wording */
  issueGroups?: Array<{ type: ExceptionBucket; label: string }>;
  onReviewIssues?: () => void;
  onSelectIssueType?: (type: ExceptionBucket) => void;
  onImportReady?: () => void;
  /** the buttons wait for something (no write permission, or nothing to import) */
  actionsDisabled?: boolean;
  className?: string;
}

export function ImportSummarySidebar({
  totalProducts,
  readyCount,
  attentionCount,
  rowsCount,
  newCount,
  matchedCount,
  updatedCount,
  readinessPercent,
  unit = "products",
  isConfirmationStep = false,
  issueGroups = [],
  onReviewIssues,
  onSelectIssueType,
  onImportReady,
  actionsDisabled = false,
  className,
}: ImportSummarySidebarProps) {
  const attention = attentionCount ?? 0;
  const percent = isConfirmationStep ? 100 : (readinessPercent ?? 0);
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
        {num(totalProducts)} {unit} detected
      </div>

      {/* Ready count */}
      <p className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white mt-1">
        {num(isConfirmationStep ? totalProducts : readyCount)} ready
      </p>

      {/* Attention Pill */}
      <div className="mt-2.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] bg-white dark:bg-card border border-[#E3E3E3] dark:border-border text-[11px] leading-[17px] font-medium text-[#000000] dark:text-white shadow-xs">
          {isConfirmationStep ? "0 require attention" : `${num(attentionCount)} require attention`}
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
              {num(rowsCount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#666666] font-normal">New</span>
            <span className="font-medium text-[#000000] dark:text-white text-right">
              {num(newCount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#666666] font-normal">Matched</span>
            <span className="font-medium text-[#000000] dark:text-white text-right">
              {num(matchedCount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#666666] font-normal">Updated</span>
            <span className="font-medium text-[#000000] dark:text-white text-right">
              {num(updatedCount)}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

      {/* Requires attention */}
      <div>
        {isConfirmationStep || (attentionCount !== undefined && attention === 0) ? (
          <div className="space-y-1">
            <div className="text-[13px] leading-[20px] font-semibold text-[#000000] dark:text-white">
              Review complete
            </div>
            <p className="text-[11px] leading-[17px] text-[#666666]">
              All mappings confirmed. No blocking issues remain.
            </p>
          </div>
        ) : attentionCount === undefined ? (
          <div className="space-y-1">
            <div className="text-[13px] leading-[20px] font-semibold text-[#000000] dark:text-white">
              Analysis pending
            </div>
            <p className="text-[11px] leading-[17px] text-[#666666]">
              Exceptions appear here once the file has been analysed.
            </p>
          </div>
        ) : (
          <div>
            <div className="text-[13px] leading-[20px] font-semibold text-[#000000] dark:text-white mb-2">
              Requires attention · {num(attention)} items
            </div>
            <div className="space-y-1">
              {issueGroups.map((item) => (
                <button
                  key={item.type}
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
            {readinessPercent === undefined && !isConfirmationStep ? "–" : `${percent}% ready`}
          </span>
        </div>

        {/* Readiness track matching Figma: 3px track #E0E0E0, 3px fill #000000 */}
        <div
          className="w-full h-[3px] bg-[#E0E0E0] dark:bg-muted relative my-2 overflow-hidden"
          role="progressbar"
          aria-label="Import readiness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-[3px] bg-[#000000] dark:bg-white transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="text-[11px] leading-[17px] text-[#666666] font-normal mt-2">
          {isConfirmationStep ? (
            `${num(totalProducts)} ${unit} can be imported now.`
          ) : readyCount === undefined ? (
            "Readiness is calculated once the file has been analysed."
          ) : (
            <>
              {num(readyCount)} {unit} can be imported now.
              <br />
              {num(attentionCount)} {unit} need review.
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
              disabled={actionsDisabled}
              className="w-full h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Review {num(attention)} issues
            </button>
          )}
          {onImportReady && (
            <button
              type="button"
              onClick={onImportReady}
              disabled={actionsDisabled}
              className="w-full h-[36px] bg-[#FFFFFF] border border-[#E3E3E3] hover:bg-neutral-50 dark:bg-card dark:border-border text-[#000000] dark:text-white rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import {num(readyCount)} ready {unit}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
