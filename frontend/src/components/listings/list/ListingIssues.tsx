import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { ListingIssueKey, ListingsInsights } from "@/types/listing";
import { ISSUE_LABELS } from "./listingParams";

const CHIPS: Array<{ issue: ListingIssueKey; key: keyof Omit<ListingsInsights["issues"], "notReady">; color: string }> = [
  { issue: "missing_attributes", key: "missingAttributes", color: "#D97706" },
  { issue: "missing_images", key: "missingImages", color: "#DC2626" },
  { issue: "category_mismatch", key: "categoryMismatch", color: "#D97706" },
  { issue: "variant_issues", key: "variantIssues", color: "#D97706" },
];

interface ListingIssuesProps {
  issues: ListingsInsights["issues"];
  /** the issue the table is filtered by */
  active: ListingIssueKey | undefined;
  /** a chip filters the table to the listings the issue affects; the active chip clears the filter */
  onToggle: (issue: ListingIssueKey | null) => void;
  /** "Filter by issue →": every listing that needs attention */
  onFilter: () => void;
}

/** "Why not live": how many listings are not ready and the causes; each cause filters the table, the audit has the details */
export function ListingIssues({ issues, active, onToggle, onFilter }: ListingIssuesProps) {
  if (issues.notReady === 0 && !active) {
    return (
      <section aria-label="Why not live" className="flex w-full flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-y border-[#EAEAEA] py-2.5 text-[12px]">
        <span className="font-semibold text-[#16A34A]">Every listing is ready to publish</span>
        <Link to={ROUTES.LISTINGS_READINESS} className="shrink-0 font-semibold text-[#000000] hover:underline min-h-[44px] sm:min-h-0 inline-flex items-center">
          Audit readiness →
        </Link>
      </section>
    );
  }
  return (
    <section aria-label="Why not live" className="flex w-full flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-y border-[#EAEAEA] py-2.5 text-[12px]">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <span className="font-semibold text-[#D97706]">{formatNumber(issues.notReady)} listings are not ready to publish</span>
        <span className="text-[11px] text-[#666666]">—</span>
        {CHIPS.map((chip, i) => {
          const on = active === chip.issue;
          return (
            <span key={chip.key} className="flex items-center gap-2">
              {i > 0 && <span className="h-[1px] w-5 bg-[#EAEAEA]" aria-hidden />}
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(on ? null : chip.issue)}
                title={on ? "Show every listing again" : `Show only the listings with ${ISSUE_LABELS[chip.issue].toLowerCase()}`}
                className={cn("flex min-h-[44px] sm:min-h-0 cursor-pointer items-center gap-1.5 transition-colors py-1 sm:py-0", on ? "font-semibold underline" : "hover:underline")}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chip.color }} />
                <span className="text-[#000000]">
                  {formatNumber(issues[chip.key])} {ISSUE_LABELS[chip.issue]}
                </span>
              </button>
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 shrink-0 pt-1 sm:pt-0">
        <Link to={ROUTES.LISTINGS_READINESS} className="font-medium text-[#666666] hover:text-[#000000] hover:underline min-h-[44px] sm:min-h-0 inline-flex items-center">
          Audit readiness →
        </Link>
        <button type="button" onClick={onFilter} className="cursor-pointer font-semibold text-[#000000] hover:underline min-h-[44px] sm:min-h-0 inline-flex items-center">
          Filter by issue →
        </button>
      </div>
    </section>
  );
}
