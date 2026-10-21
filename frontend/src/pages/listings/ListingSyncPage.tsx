import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useListingSyncTelemetry } from "@/hooks/useListings";
import { ROUTES } from "@/constants/routes";

export default function ListingSyncPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listingId = id || "list-3";

  const {
    data: telemetry,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useListingSyncTelemetry(listingId);

  if (isLoading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#2563EB]" />
        <span className="text-xs text-neutral-500 font-medium">
          Loading sync telemetry…
        </span>
      </div>
    );
  }

  if (error || !telemetry) {
    return (
      <div className="w-full p-8 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm space-y-3">
        <p>Failed to load listing sync telemetry. Please check your connection.</p>
        <button
          onClick={() => navigate(ROUTES.LISTINGS)}
          className="text-xs underline font-semibold cursor-pointer"
        >
          ← Back to Listings
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">

      {/* =========================================================================
          2. PAGE HEADER
         ========================================================================= */}
      <header className="w-full flex flex-row justify-between items-start pt-1">
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
            COMMERCE
          </span>
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
            Listings
          </h1>
          <p className="text-[13px] font-normal leading-[19px] text-[#666666]">
            Manage how your master products appear across every connected marketplace.
          </p>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(ROUTES.LISTINGS)}
            className="h-9 px-3 flex items-center justify-center gap-1.5 border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            Create listing
          </button>
          <button
            onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
            className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
          >
            Publish products
          </button>
        </div>
      </header>

      {/* =========================================================================
          3. BANNER (Sync in progress · Meesho)
         ========================================================================= */}
      <div className="w-full p-4 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] flex items-center justify-between">
        <div className="flex flex-col items-start gap-0.5">
          <h3 className="text-sm font-semibold text-[#2563EB]">
            {telemetry.bannerTitle}
          </h3>
          <p className="text-xs text-[#6B7280]">
            {telemetry.bannerSubtext}
          </p>
        </div>
        <span className="text-xs text-[#6B7280] font-normal shrink-0">
          {telemetry.startedAgoText}
        </span>
      </div>

      {/* =========================================================================
          4. PRODUCT TELEMETRY HEADER & BADGE
         ========================================================================= */}
      <div className="w-full relative flex items-start justify-between pl-4">
        {/* Left vertical blue accent bar indicator */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r bg-[#2563EB]" />

        <div className="space-y-1">
          <span className="text-xs text-[#6B7280] font-normal">
            {telemetry.channelName} · Syncing
          </span>
          <h2 className="text-[20px] font-semibold text-black tracking-tight leading-snug">
            {telemetry.productTitle}
          </h2>
          <p className="text-xs text-[#6B7280]">
            {telemetry.sku} · {telemetry.variantsCount} variants · {telemetry.lastSyncedAgoText}
          </p>
        </div>

        <div>
          <span className="px-3 py-1 rounded-md text-xs font-medium border border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]">
            Syncing
          </span>
        </div>
      </div>

      {/* =========================================================================
          5. PROGRESS TELEMETRY CARD
         ========================================================================= */}
      <section className="w-full rounded-lg border border-[#EAEAEA] bg-white p-6 space-y-6 shadow-none">
        <h4 className="text-sm font-semibold text-black">
          Sync in progress
        </h4>

        <div className="space-y-5">
          {telemetry.syncSteps.map((step) => {
            const isComplete = step.status === "complete" || step.progressPct >= 100;
            return (
              <div key={step.name} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-normal text-[#1F2937]">
                    {step.name}
                  </span>
                  <span
                    className="font-medium"
                    style={{ color: isComplete ? "#16A34A" : "#2563EB" }}
                  >
                    {step.statusLabel}
                  </span>
                </div>

                {/* Progress Meter Bar */}
                <div className="w-full h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${step.progressPct}%`,
                      backgroundColor: isComplete ? "#16A34A" : "#2563EB",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          6. OTHER CHANNELS FOR THIS PRODUCT
         ========================================================================= */}
      <section className="w-full space-y-3 pt-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">
          OTHER CHANNELS FOR THIS PRODUCT
        </h3>

        <div className="w-full border border-[#EAEAEA] rounded-md overflow-hidden bg-white text-xs">
          {/* Table Header */}
          <div className="h-9 bg-[#F5F5F5] px-4 grid grid-cols-3 items-center text-[11px] font-medium text-[#666666]">
            <div>Channel</div>
            <div>Status</div>
            <div>Last sync</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-[#EAEAEA]">
            {telemetry.otherChannels.map((item) => (
              <div
                key={item.channel}
                className="h-11 px-4 grid grid-cols-3 items-center hover:bg-[#FAFAFA] transition-colors relative"
              >
                {/* Left accent color bar */}
                <div
                  className="absolute left-0 top-2 bottom-2 w-[3px]"
                  style={{ backgroundColor: item.accentColor }}
                />

                {/* Channel Name */}
                <div className="font-semibold text-black pl-1">
                  {item.channelName}
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: item.accentColor }}
                  />
                  <span
                    className="font-medium capitalize"
                    style={{ color: item.accentColor }}
                  >
                    {item.status === "syncing"
                      ? "Syncing"
                      : item.status === "live"
                        ? "Live"
                        : item.status}
                  </span>
                </div>

                {/* Last Sync */}
                <div className="text-[#666666]">
                  {item.lastSyncText}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
