import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useListingUnlisted, usePrepareListing } from "@/hooks/useListings";
import { ROUTES } from "@/constants/routes";

export default function ListingUnlistedPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listingId = id || "list-8";

  const { data: unlisted, isLoading, error } = useListingUnlisted(listingId);
  const prepareMutation = usePrepareListing();

  if (isLoading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-neutral-500" />
        <span className="text-xs text-neutral-500 font-medium">
          Loading unlisted channel details…
        </span>
      </div>
    );
  }

  if (error || !unlisted) {
    return (
      <div className="w-full p-8 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm space-y-3">
        <p>Failed to load unlisted channel details. Please check your connection.</p>
        <button
          onClick={() => navigate(ROUTES.LISTINGS)}
          className="text-xs underline font-semibold cursor-pointer"
        >
          ← Back to Listings
        </button>
      </div>
    );
  }

  const handlePrepareListing = () => {
    prepareMutation.mutate(
      { id: unlisted.id, channel: unlisted.channel },
      {
        onSuccess: () => {
          setTimeout(() => {
            navigate(`${ROUTES.LISTINGS}/${unlisted.id}`);
          }, 800);
        },
      },
    );
  };

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* =========================================================================
          1. PAGE HEADER (Matches Figma exactly: COMMERCE / Listings)
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
          2. PRODUCT HEADER & NOT LISTED BADGE
         ========================================================================= */}
      <div className="w-full relative flex items-start justify-between pl-4">
        {/* Left vertical muted indicator bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r bg-[#E5E7EB]" />

        <div className="space-y-1">
          <span className="text-xs text-[#666666] font-normal">
            {unlisted.channelName} · Not listed
          </span>
          <h2 className="text-[20px] font-semibold text-black tracking-tight leading-snug">
            {unlisted.productTitle}
          </h2>
          <p className="text-xs text-[#666666]">
            {unlisted.sku} · {unlisted.variantsCount} variants · Master catalog
          </p>
        </div>

        <div>
          <span className="px-3 py-1 rounded-md text-xs font-medium border border-[#BDBDBD] text-[#666666] bg-white">
            Not listed
          </span>
        </div>
      </div>

      {/* =========================================================================
          3. MASTER PRODUCT TELEMETRY CARD
         ========================================================================= */}
      <section className="w-full rounded-lg border border-[#EAEAEA] bg-white p-6 space-y-6 shadow-none">
        <p className="text-xs text-[#666666]">
          {unlisted.description}
        </p>

        {/* Key-Value Details */}
        <div className="space-y-2 text-xs max-w-xl">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Master SKU</span>
            <span className="font-medium text-black font-mono">{unlisted.sku}</span>
          </div>

          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Target marketplace</span>
            <span className="font-medium text-black">{unlisted.channelName}</span>
          </div>

          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Variants</span>
            <span className="font-medium text-black">{unlisted.variantsCount} variants</span>
          </div>

          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Inventory available</span>
            <span className="font-medium text-black font-mono">{unlisted.inventoryAvailable} units</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={handlePrepareListing}
            disabled={prepareMutation.isPending}
            className="h-9 px-4 rounded-lg bg-black text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5 shadow-none"
          >
            {prepareMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <span>Prepare listing</span>
              </>
            )}
          </button>

          <button
            onClick={() => navigate(`${ROUTES.PRODUCTS}/${unlisted.productId}`)}
            className="h-9 px-4 rounded-lg border border-[#BDBDBD] bg-white text-black text-xs font-medium hover:bg-neutral-50 transition-colors cursor-pointer shadow-none"
          >
            View product
          </button>
        </div>
      </section>

      {/* =========================================================================
          4. OTHER CHANNELS FOR THIS PRODUCT
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
            {unlisted.otherChannels.map((item) => (
              <div
                key={item.channel}
                className="h-11 px-4 grid grid-cols-3 items-center hover:bg-[#FAFAFA] transition-colors relative"
              >
                {/* Left accent color bar */}
                {item.status !== "not_listed" && (
                  <div
                    className="absolute left-0 top-2 bottom-2 w-[3px]"
                    style={{ backgroundColor: item.accentColor }}
                  />
                )}

                {/* Channel Name */}
                <div className="font-semibold text-black pl-1">
                  {item.channelName}
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: item.statusDotColor }}
                  />
                  <span
                    className="font-medium"
                    style={{
                      color:
                        item.status === "live"
                          ? "#16A34A"
                          : "#666666",
                    }}
                  >
                    {item.statusLabel}
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
