import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { formatNumber } from "@/utils/format";
import type { ListingsInsights } from "@/types/listing";

const DIVIDER = <div className="h-9 w-[1px] bg-[#EAEAEA]" aria-hidden />;
const dash = (n: number | undefined) => (n === undefined ? "—" : formatNumber(n));

interface ListingReachProps {
  insights: ListingsInsights | undefined;
  onReview: () => void;
}

/** the catalogue reach strip: active listings, master products, channels, what is ready and what needs a look */
export function ListingReach({ insights: i, onReview }: ListingReachProps) {
  return (
    <section aria-label="Catalog reach" className="w-full space-y-1">
      <span className="text-[10px] font-medium leading-[12px] text-[#6B7280]">Catalog reach</span>

      <div className="flex w-full flex-row flex-wrap items-center gap-6 border-y border-[#EAEAEA] py-3">
        <div className="flex min-w-[90px] flex-col items-start">
          <span className="text-[32px] font-semibold leading-[39px] text-[#000000]">{dash(i?.activeListings)}</span>
          <span className="text-[12px] font-normal leading-[15px] text-[#666666]">active listings</span>
        </div>

        {DIVIDER}

        <div className="flex min-w-[90px] flex-col items-start">
          <span className="text-[18px] font-semibold leading-[22px] text-[#000000]">{dash(i?.masterProducts)}</span>
          <span className="text-[11px] font-normal leading-[13px] text-[#666666]">master products</span>
        </div>

        {DIVIDER}

        <div className="flex min-w-[110px] flex-col items-start">
          <span className="text-[18px] font-semibold leading-[22px] text-[#000000]">{dash(i?.connectedChannels)}</span>
          <span className="text-[11px] font-normal leading-[13px] text-[#666666]">connected channels</span>
        </div>

        {DIVIDER}

        <Link to={ROUTES.LISTINGS_PUBLISH} className="group flex min-w-[90px] cursor-pointer flex-col items-start">
          <span className="text-[18px] font-semibold leading-[22px] text-[#16A34A] group-hover:underline">{dash(i?.readyToPublish)}</span>
          <span className="text-[11px] font-normal leading-[13px] text-[#666666]">ready to publish</span>
        </Link>

        {DIVIDER}

        <button type="button" onClick={onReview} className="group flex min-w-[80px] cursor-pointer flex-col items-start text-left">
          <span className="text-[18px] font-semibold leading-[22px] text-[#D97706] group-hover:underline">{dash(i?.needReview)}</span>
          <span className="text-[11px] font-normal leading-[13px] text-[#666666]">need review</span>
        </button>
      </div>
    </section>
  );
}
