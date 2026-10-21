import { PAGE_SIZES } from "./catalogParams";
import { formatNumber } from "@/utils/format";

interface PaginationProps {
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
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

const NAV = "box-border flex flex-row justify-center items-center px-4 h-[30px] rounded-[8px] text-[12px] font-semibold border";

export function Pagination({ page, pages, total, pageSize, shown, onPage, onPageSize }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label="Pagination" className="w-full flex flex-row flex-wrap justify-between items-center gap-2 min-h-[34px] pt-2">
      <span className="text-[12px] font-normal leading-[17px] text-[#666666]" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} products
      </span>

      <div className="flex flex-row items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={`${NAV} border-[#666666] bg-[#FFFFFF] text-[#000000] hover:bg-[#F5F5F5] disabled:bg-[#F5F5F5] disabled:border-[#EAEAEA] disabled:text-[#666666] disabled:cursor-not-allowed`}
        >
          Previous
        </button>

        {windowOf(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="text-[12px] text-[#666666]" aria-hidden>
              ...
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={`flex flex-row justify-center items-center min-w-[28px] h-[28px] px-1 rounded-[4px] text-[12px] font-semibold text-[#000000] ${n === page ? "bg-[#F5F5F5]" : "hover:bg-[#F5F5F5]"}`}
            >
              {n}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={`${NAV} border-[#666666] bg-[#FFFFFF] text-[#000000] hover:bg-[#F5F5F5] disabled:bg-[#F5F5F5] disabled:border-[#EAEAEA] disabled:text-[#666666] disabled:cursor-not-allowed`}
        >
          Next
        </button>

        <select
          aria-label="Products per page"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="px-2.5 h-[34px] bg-[#FFFFFF] border border-[#BDBDBD] rounded-[8px] text-[12px] font-medium text-[#000000]"
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
