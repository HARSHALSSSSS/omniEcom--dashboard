import { formatNumber } from "@/utils/format";
import { PAGE_SIZES } from "./pricingParams";

interface PricingPaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  shown: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  pageSizes?: readonly number[];
}

/** the pages around the current one: 1 ... 4 5 [6] 7 8 ... 20 */
function windowOf(page: number, pages: number): Array<number | "gap"> {
  const sorted = [...new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

const NAV = "h-8 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export function PricingPagination({ page, pages, total, pageSize, shown, noun, onPage, onPageSize, pageSizes = PAGE_SIZES }: PricingPaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label={`${noun} pagination`} className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} {noun}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button type="button" className={NAV} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        {windowOf(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="text-xs text-muted-foreground" aria-hidden>
              ...
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={`h-7 min-w-[28px] rounded px-1 text-xs font-semibold ${n === page ? "bg-muted" : "hover:bg-muted"}`}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" className={NAV} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
        <select aria-label={`${noun} per page`} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 rounded-lg border border-border bg-card px-2 text-xs font-medium cursor-pointer">
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}
