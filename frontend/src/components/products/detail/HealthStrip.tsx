import { AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toAppPath } from "@/lib/links";
import { formatNumber } from "@/utils/format";
import type { ProductOverview } from "@/types/productDetail";
import { inventoryLabel } from "./format";

const LABEL = "text-[12px] font-normal leading-[17px] text-[#666666]";
const BIG = "text-[18px] font-semibold leading-[26px] text-[#000000]";
const SMALL = "text-[11px] font-normal leading-[16px] text-[#666666]";

/** Product health + inventory + variants + channels, straight from the overview. */
export function HealthStrip({ overview }: { overview: ProductOverview }) {
  const { health, inventory, variants, channels } = overview;
  return (
    <section aria-label="Product health" className="w-full flex flex-col md:flex-row items-stretch py-5 border-y border-[#EAEAEA] gap-6">
      <div className="flex-1 max-w-[480px] flex flex-col items-start gap-1">
        <div className="flex flex-row items-center gap-3.5 text-[12px]">
          <span className="text-[#666666]">Product health</span>
          <span className="font-semibold text-[#000000]">{health.state === "ready" ? "Ready" : "Incomplete"}</span>
        </div>
        <p className="text-[12px] font-normal leading-[17px] text-[#666666]">{health.text}</p>
      </div>

      <div className="flex-1 flex flex-col items-start gap-1 md:pl-6 md:border-l border-[#EAEAEA]">
        <span className={LABEL}>Inventory</span>
        <span className={BIG}>{formatNumber(inventory.available)} units</span>
        <span className={SMALL}>{inventoryLabel(inventory.status)}</span>
      </div>

      <div className="flex-1 flex flex-col items-start gap-1 md:pl-6 md:border-l border-[#EAEAEA]">
        <span className={LABEL}>Variants</span>
        <span className={BIG}>{formatNumber(variants.count)}</span>
        <span className={SMALL}>{formatNumber(variants.sellable)} sellable {variants.sellable === 1 ? "SKU" : "SKUs"}</span>
      </div>

      <div className="flex-1 flex flex-col items-start gap-1 md:pl-6 md:border-l border-[#EAEAEA]">
        <span className={LABEL}>Channels</span>
        <span className={BIG}>{channels.connected} connected</span>
        <span className={SMALL}>{channels.connected === 0 ? "Not published yet" : `${channels.active} Active · ${channels.attention} Attention`}</span>
      </div>
    </section>
  );
}

/** the one thing that needs a look (a channel listing, or an incomplete product); the API gives the text and where to go */
export function AttentionBanner({ banner }: { banner: ProductOverview["attentionBanner"] }) {
  const navigate = useNavigate();
  if (!banner) return null;
  return (
    <div role="status" className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[12px] py-1">
      <div className="flex flex-row items-center gap-2">
        <AlertCircle className="h-4 w-4 text-[#666666] shrink-0" aria-hidden="true" />
        <span className="font-semibold text-[#000000]">Needs attention</span>
        <span className="text-[#666666]">{banner.text}.</span>
      </div>
      <button type="button" onClick={() => navigate(toAppPath(banner.action.href))} className="font-semibold text-[#000000] hover:underline cursor-pointer min-h-[36px] sm:min-h-0 flex items-center shrink-0">
        {banner.action.key === "complete_product" ? "Complete product" : "Review →"}
      </button>
    </div>
  );
}
