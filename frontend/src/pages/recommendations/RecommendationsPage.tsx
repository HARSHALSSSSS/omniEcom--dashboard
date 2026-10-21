import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { errorMessage } from "@/api/errors";
import { useRecommendations, useRetrySync } from "@/hooks/useRecommendations";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ChannelPanel } from "./ChannelPanel";
import { ProductPanel } from "./ProductPanel";
import { ReplenishmentPanel } from "./ReplenishmentPanel";

function PanelSkeleton() {
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 flex flex-col gap-4 animate-pulse min-h-[420px]">
      <div className="h-2.5 w-1/3 rounded bg-[#F5F5F5]" />
      <div className="h-5 w-2/3 rounded bg-[#F5F5F5]" />
      <div className="h-3 w-1/2 rounded bg-[#F5F5F5]" />
      <div className="h-24 w-full rounded bg-[#F5F5F5]" />
      <div className="h-24 w-full rounded bg-[#F5F5F5]" />
    </div>
  );
}

/** Recommendations: the channel, product and replenishment cards the server built from live data (a card with nothing to say is not shown) */
export default function RecommendationsPage() {
  const navigate = useNavigate();
  const query = useRecommendations();
  const sync = useRetrySync();
  const businessName = useWorkspaceStore((s) => s.user?.businessName ?? "");
  const data = query.data;
  const empty = data && !data.channel && !data.product && !data.replenishment;

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#666666]">Contextual Detail States</span>
        <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">Inspect. Understand. Decide.</h1>
        <p className="text-[13px] font-normal text-[#666666] leading-[145%]">Companion panels opened from channel health, inventory health and the recommended action.</p>
      </div>

      {query.isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch" role="status" aria-label="Loading recommendations">
          <PanelSkeleton />
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      ) : query.isError ? (
        <div role="alert" className="w-full bg-white border border-[#F2CAD2] rounded-[18px] flex flex-col justify-center items-center gap-3 px-6 py-16">
          <h2 className="text-[18px] font-semibold text-[#000000]">Couldn’t load recommendations</h2>
          <p className="text-[13px] text-[#666666] text-center max-w-[560px]">{errorMessage(query.error)}</p>
          <button type="button" onClick={() => query.refetch()} className="h-10 px-4 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors">
            Try again
          </button>
        </div>
      ) : empty ? (
        <div className="w-full bg-white border border-[#E4E7EF] rounded-[18px] flex flex-col justify-center items-center gap-3.5 px-6 py-24">
          <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
            <Check className="w-[18px] h-[18px] text-[#666666] stroke-[2]" />
          </div>
          <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] text-center">Nothing needs your attention right now</h2>
          <p className="text-[13px] font-normal leading-[145%] text-[#666666] text-center max-w-[560px]">
            Your channels are healthy and stock levels look fine. Recommendations appear here when that changes.
          </p>
          <button
            type="button"
            onClick={() => navigate(ROUTES.NEEDS_ATTENTION)}
            className="h-10 px-4 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors mt-2"
          >
            Open the issue queue
          </button>
        </div>
      ) : (
        data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {data.channel && (
              <ChannelPanel card={data.channel} businessName={businessName} connections={data.channelConnections} sync={sync.state} onRetry={sync.run} onNavigate={navigate} />
            )}
            {data.product && <ProductPanel card={data.product} onNavigate={navigate} />}
            {data.replenishment && <ReplenishmentPanel card={data.replenishment} onNavigate={navigate} />}
          </div>
        )
      )}
    </div>
  );
}
