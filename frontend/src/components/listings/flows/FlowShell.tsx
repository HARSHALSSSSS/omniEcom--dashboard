import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { errorMessage } from "@/api/errors";
import { accentOf, STATUS_COLOR, STATUS_LABEL } from "./flowFormat";
import type { ChannelStatus } from "@/types/listingFlows";
import { formatRelativeTime } from "@/utils/format";

/** the header every listing flow screen starts with: COMMERCE / Listings plus the two top actions */
export function FlowHeader() {
  const navigate = useNavigate();
  return (
    <header className="flex w-full flex-row items-start justify-between pt-1">
      <div className="flex flex-col items-start gap-1">
        <span className="text-[10px] font-medium uppercase leading-[12px] tracking-wider text-[#707070]">COMMERCE</span>
        <h1 className="text-[26px] font-semibold leading-[38px] tracking-tight text-[#000000]">Listings</h1>
        <p className="text-[13px] font-normal leading-[19px] text-[#666666]">Manage how your master products appear across every connected marketplace.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(`${ROUTES.LISTINGS}?tab=not_listed`)}
          className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#BDBDBD] px-3 text-[12px] font-semibold text-[#000000] transition-colors hover:bg-neutral-50"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.2]" aria-hidden />
          Create listing
        </button>
        <button
          type="button"
          onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
          className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#000000] px-4 text-[12px] font-semibold text-[#FFFFFF] shadow-none transition-colors hover:bg-neutral-800"
        >
          Publish products
        </button>
      </div>
    </header>
  );
}

export function FlowLoading({ text }: { text: string }) {
  return (
    <div role="status" className="flex h-96 w-full flex-col items-center justify-center gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-neutral-500" aria-hidden />
      <span className="text-xs font-medium text-neutral-500">{text}</span>
    </div>
  );
}

export function FlowError({ text, error, onRetry }: { text: string; error?: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="w-full space-y-3 rounded-xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
      <p>{text}</p>
      {error !== undefined && <p className="text-xs">{errorMessage(error)}</p>}
      <div className="flex items-center gap-4">
        {onRetry && (
          <button type="button" onClick={onRetry} className="cursor-pointer text-xs font-semibold underline">
            Try again
          </button>
        )}
        <Link to={ROUTES.LISTINGS} className="text-xs font-semibold underline">
          ← Back to Listings
        </Link>
      </div>
    </div>
  );
}

interface ChannelsTableProps {
  channels: ChannelStatus[];
  /** blocker screen: Channel, Status, Readiness, Last sync; unlisted screen: Channel, Status, Last sync */
  showReadiness: boolean;
}

/** OTHER CHANNELS FOR THIS PRODUCT: the same variant on every other connected account */
export function OtherChannels({ channels, showReadiness }: ChannelsTableProps) {
  const cols = showReadiness ? "grid-cols-4" : "grid-cols-3";
  return (
    <section className="w-full space-y-3 pt-2" aria-label="Other channels for this product">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#666666]">OTHER CHANNELS FOR THIS PRODUCT</h3>
      <div className="w-full overflow-hidden rounded-md border border-[#EAEAEA] bg-white text-xs">
        <div className={`grid h-9 ${cols} items-center bg-[#F5F5F5] px-4 text-[11px] font-medium text-[#666666]`}>
          <div>Channel</div>
          <div>Status</div>
          {showReadiness && <div>Readiness</div>}
          <div>Last sync</div>
        </div>
        {channels.length === 0 ? (
          <p className="px-4 py-4 text-[#666666]">This product has no other connected channel.</p>
        ) : (
          <div className="divide-y divide-[#EAEAEA]">
            {channels.map((item) => {
              const color = STATUS_COLOR[item.screenStatus];
              const accent = accentOf(item.marketplace);
              const listed = item.screenStatus !== "not_listed";
              return (
                <div key={item.accountId} data-marketplace={item.marketplace} className={`relative grid h-11 ${cols} items-center px-4 transition-colors hover:bg-[#FAFAFA]`}>
                  <div data-testid="channel-accent" className="absolute bottom-2 left-0 top-2 w-[3px]" style={{ backgroundColor: listed ? accent : "#E5E7EB" }} />
                  <div className="flex items-center gap-1.5 pl-1 font-semibold text-black">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: accent }} />
                    {item.listingId ? (
                      <Link to={`${ROUTES.LISTINGS}/${item.listingId}`} className="hover:underline">
                        {item.marketplaceName}
                      </Link>
                    ) : (
                      <span>{item.marketplaceName}</span>
                    )}
                    <span className="font-normal text-[#666666]">{item.accountName}</span>
                    {item.current && <span className="rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] font-medium text-[#666666]">This listing</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-medium" style={{ color: item.screenStatus === "not_listed" ? "#666666" : color }}>
                      {STATUS_LABEL[item.screenStatus]}
                    </span>
                  </div>
                  {showReadiness && <div className="font-medium text-black">{item.readinessPercent === null ? "—" : `${item.readinessPercent}%`}</div>}
                  <div className="text-[#666666]">{item.lastSyncAt ? formatRelativeTime(item.lastSyncAt) : listed ? "Not published" : "Never"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
