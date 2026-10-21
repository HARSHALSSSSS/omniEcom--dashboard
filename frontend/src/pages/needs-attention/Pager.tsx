interface Props {
  page: number;
  pages: number;
  shown: number;
  total: number;
  fetching?: boolean;
  onPage: (page: number) => void;
}

/** "Showing 10 of 18" with Previous / Next, driven by the server's numbered envelope */
export function Pager({ page, pages, shown, total, fetching, onPage }: Props) {
  const atStart = page <= 1;
  const atEnd = page >= pages;
  return (
    <div className="flex flex-row justify-between items-center pt-2 h-[30px] w-full text-[12px] text-[#666666]">
      <span className="font-normal leading-[145%]">
        Showing {shown} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={atStart || fetching}
          onClick={() => onPage(page - 1)}
          className={`px-4 h-[30px] rounded-[8px] border text-[12px] font-semibold flex items-center justify-center transition-colors ${
            atStart ? "bg-[#F5F5F5] border-[#EAEAEA] text-[#666666] cursor-not-allowed" : "bg-white border-[#666666] text-[#000000] hover:bg-neutral-50"
          }`}
        >
          Previous
        </button>
        <span className="px-2 text-[12px] font-normal text-[#666666]">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          disabled={atEnd || fetching}
          onClick={() => onPage(page + 1)}
          className={`px-4 h-[30px] rounded-[8px] border text-[12px] font-semibold flex items-center justify-center transition-colors ${
            atEnd ? "bg-[#F5F5F5] border-[#EAEAEA] text-[#666666] cursor-not-allowed" : "bg-white border-[#666666] text-[#000000] hover:bg-neutral-50"
          }`}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
