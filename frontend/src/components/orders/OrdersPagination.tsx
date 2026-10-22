import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/utils/format";
import { PAGE_SIZES } from "./orderParams";

interface OrdersPaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  shown: number;
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

export function OrdersPagination({ page, pages, total, pageSize, shown, onPage, onPageSize }: OrdersPaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label="Pagination" className="w-full flex flex-row flex-wrap justify-between items-center gap-2 min-h-[16px] pt-1">
      <span className="text-[10px] font-normal leading-[12px] text-[#666666]" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} orders
      </span>
      <div className="flex flex-row items-center gap-[10px]">
        <button
          type="button"
          aria-label="Previous"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="text-[11px] font-normal leading-[13px] text-[#666666] hover:text-[#000000] disabled:text-[#BDBDBD] disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="w-3 h-3 inline" aria-hidden />
        </button>
        {windowOf(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="text-[11px] text-[#666666]" aria-hidden>
              ...
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={`text-[11px] leading-[13px] cursor-pointer ${n === page ? "font-semibold text-[#000000]" : "font-normal text-[#666666] hover:text-[#000000]"}`}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="text-[11px] font-normal leading-[13px] text-[#666666] hover:text-[#000000] disabled:text-[#BDBDBD] disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronRight className="w-3 h-3 inline" aria-hidden />
        </button>
        <select
          aria-label="Orders per page"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-[24px] rounded-lg border border-[#EAEAEA] bg-white px-1 text-[11px] font-normal text-[#666666] cursor-pointer"
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
