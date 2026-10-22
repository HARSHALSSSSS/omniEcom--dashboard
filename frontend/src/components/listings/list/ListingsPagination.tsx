import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { PAGE_SIZES } from "./listingParams";

interface ListingsPaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  shown: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
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

export function ListingsPagination({ page, pages, total, pageSize, shown, noun, onPage, onPageSize }: ListingsPaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label="Pagination" className="flex w-full flex-row flex-wrap items-center justify-between gap-2 pt-2.5 text-[12px]">
      <span className="font-normal text-[#666666]" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} {noun}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-7 cursor-pointer rounded-md border border-[#BDBDBD] px-2.5 text-[12px] text-[#666666] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        {windowOf(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="text-[12px] text-[#666666]" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={cn("flex h-7 min-w-7 cursor-pointer items-center justify-center rounded px-1 text-[12px]", n === page ? "bg-[#F5F5F5] font-semibold text-[#000000]" : "text-[#666666] hover:bg-[#F5F5F5]")}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="h-7 cursor-pointer rounded-md border border-[#BDBDBD] px-2.5 text-[12px] text-[#000000] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
        <select
          aria-label="Listings per page"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-7 cursor-pointer rounded-md border border-[#BDBDBD] bg-white px-2 text-[12px] font-medium text-[#000000] focus:outline-none"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}
