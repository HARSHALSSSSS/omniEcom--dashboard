import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Loader2,
  CheckCircle2,
  X,
  ExternalLink,
} from "lucide-react";
import {
  useListingBlocker,
  useResolveListingBlocker,
} from "@/hooks/useListings";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";

export default function ListingBlockerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listingId = id || "list-3";

  const { data: blocker, isLoading, error } = useListingBlocker(listingId);
  const resolveMutation = useResolveListingBlocker(listingId);

  // Quick fix modal / inline drawer state
  const [isFixing, setIsFixing] = useState(false);
  const [materialValue, setMaterialValue] = useState("100% Cotton");
  const [resolvedSuccess, setResolvedSuccess] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-neutral-500" />
        <span className="text-xs text-neutral-500 font-medium">
          Loading listing issue details…
        </span>
      </div>
    );
  }

  if (error || !blocker) {
    return (
      <div className="w-full p-8 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm space-y-3">
        <p>Failed to load listing issue details. Please check connection.</p>
        <button
          onClick={() => navigate(ROUTES.LISTINGS)}
          className="text-xs underline font-semibold"
        >
          ← Back to Listings
        </button>
      </div>
    );
  }

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialValue.trim()) return;

    resolveMutation.mutate(
      { value: materialValue.trim(), attributeKey: blocker.missingAttribute },
      {
        onSuccess: (res) => {
          setIsFixing(false);
          setResolvedSuccess(res.message);
          setTimeout(() => setResolvedSuccess(null), 6000);
        },
      },
    );
  };

  const isResolved = blocker.status !== "blocked" || blocker.blockedCount === 0;

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* =========================================================================
          1. TOP BREADCRUMB
         ========================================================================= */}
      <div className="w-full flex items-center justify-between text-xs text-[#666666]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(ROUTES.LISTINGS)}
            className="hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </button>
          <span>/</span>
          <button
            onClick={() => navigate(ROUTES.LISTINGS)}
            className="hover:text-black transition-colors cursor-pointer"
          >
            Listings
          </button>
          <span>/</span>
          <span className="text-black font-medium">
            {blocker.productTitle} · Blocker
          </span>
        </div>
      </div>

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
          3. BANNER (Red alert or Success alert)
         ========================================================================= */}
      {!isResolved ? (
        <div className="w-full p-4 rounded-lg border border-[#FCA5A5] bg-white flex flex-col items-start gap-0.5">
          <h3 className="text-sm font-semibold text-[#DC2626]">
            {blocker.bannerMessage}
          </h3>
          <p className="text-xs text-[#DC2626]">
            {blocker.bannerSubtext}
          </p>
        </div>
      ) : (
        <div className="w-full p-4 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">
                {blocker.bannerMessage}
              </h3>
              <p className="text-xs text-emerald-700">
                {blocker.bannerSubtext}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
            className="h-8 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors cursor-pointer"
          >
            Publish now →
          </button>
        </div>
      )}

      {resolvedSuccess && (
        <div className="w-full p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{resolvedSuccess}</span>
        </div>
      )}

      {/* =========================================================================
          4. MAIN ISSUE DIAGNOSTIC CARD
         ========================================================================= */}
      <section className="w-full rounded-lg border border-[#EAEAEA] bg-white p-6 space-y-5 shadow-none relative">
        {/* Left vertical red accent bar indicator */}
        <div
          className={cn(
            "absolute left-0 top-6 bottom-6 w-1 rounded-r",
            !isResolved ? "bg-[#DC2626]" : "bg-[#16A34A]",
          )}
        />

        {/* Card Header: Product & Badge */}
        <div className="flex items-start justify-between pl-3">
          <div className="space-y-1">
            <span className="text-xs text-[#666666]">
              {blocker.channelName} · {!isResolved ? "Blocked" : "Ready"}
            </span>
            <h2 className="text-[20px] font-semibold text-black tracking-tight leading-snug">
              {blocker.productTitle}
            </h2>
            <p className="text-xs text-[#666666]">
              {blocker.sku} · {blocker.variantsCount} variants · {blocker.channelCategory}
            </p>
          </div>

          <div>
            <span
              className={cn(
                "px-2.5 py-0.5 rounded text-xs font-medium border",
                !isResolved
                  ? "border-[#DC2626] text-[#DC2626] bg-red-50/50"
                  : "border-[#16A34A] text-[#16A34A] bg-emerald-50/50",
              )}
            >
              {!isResolved ? "Blocked" : "Ready"}
            </span>
          </div>
        </div>

        {/* Issue Details Box */}
        <div className="pl-3 space-y-3 pt-2">
          <h4
            className={cn(
              "text-sm font-semibold",
              !isResolved ? "text-[#DC2626]" : "text-emerald-700",
            )}
          >
            {!isResolved ? blocker.issueTitle : "✓ Attribute configured"}
          </h4>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between max-w-xl">
              <span className="text-[#666666]">Missing attribute</span>
              <span
                className={cn(
                  "font-medium",
                  !isResolved ? "text-[#DC2626]" : "text-emerald-700",
                )}
              >
                {blocker.missingAttribute}
                {blocker.currentAttributeValue && ` (${blocker.currentAttributeValue})`}
              </span>
            </div>
            <div className="flex items-center justify-between max-w-xl">
              <span className="text-[#666666]">Affected marketplace</span>
              <span className="text-black font-medium">{blocker.channelName}</span>
            </div>
            <div className="flex items-center justify-between max-w-xl">
              <span className="text-[#666666]">Category</span>
              <span className="text-black font-medium">{blocker.fullCategoryPath}</span>
            </div>
          </div>

          <p className="text-xs text-[#666666] pt-1 leading-relaxed">
            {blocker.description}
          </p>

          {/* Action buttons */}
          <div className="pt-2 flex items-center gap-3">
            {!isResolved ? (
              <button
                onClick={() => setIsFixing(true)}
                className="h-9 px-4 rounded-lg bg-black text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
              >
                Fix listing
              </button>
            ) : (
              <button
                onClick={() => setIsFixing(true)}
                className="h-9 px-4 rounded-lg border border-[#BDBDBD] bg-white text-black text-xs font-semibold hover:bg-neutral-50 transition-colors cursor-pointer shadow-none"
              >
                Edit attribute
              </button>
            )}

            <button
              onClick={() => navigate(`${ROUTES.LISTINGS}/${listingId}`)}
              className="h-9 px-4 rounded-lg border border-[#BDBDBD] bg-white text-black text-xs font-medium hover:bg-neutral-50 transition-colors cursor-pointer flex items-center gap-1.5 shadow-none"
            >
              <span>View full listing</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#666666]" />
            </button>
          </div>
        </div>

        {/* Inline Quick Fix Drawer / Modal */}
        {isFixing && (
          <form
            onSubmit={handleResolveSubmit}
            className="ml-3 mt-4 p-4 rounded-lg border border-neutral-200 bg-neutral-50 max-w-xl space-y-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-black">
                Provide {blocker.missingAttribute} for {blocker.channelName}
              </span>
              <button
                type="button"
                onClick={() => setIsFixing(false)}
                className="text-neutral-500 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600">
                {blocker.missingAttribute} specification:
              </label>
              <input
                type="text"
                value={materialValue}
                onChange={(e) => setMaterialValue(e.target.value)}
                placeholder="e.g., 100% Cotton, Poplin Weave"
                required
                className="w-full h-8 px-3 rounded border border-neutral-300 bg-white text-xs text-black focus:outline-none focus:ring-1 focus:ring-black"
              />
              <span className="text-[10px] text-neutral-500">
                Meets Amazon category taxonomy requirements for Apparel.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsFixing(false)}
                className="h-8 px-3 rounded border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resolveMutation.isPending || !materialValue.trim()}
                className="h-8 px-4 rounded bg-black text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {resolveMutation.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save & Unblock"
                )}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* =========================================================================
          5. OTHER CHANNELS FOR THIS PRODUCT
         ========================================================================= */}
      <section className="w-full space-y-3 pt-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">
          OTHER CHANNELS FOR THIS PRODUCT
        </h3>

        <div className="w-full border border-[#EAEAEA] rounded-md overflow-hidden bg-white text-xs">
          {/* Table Header */}
          <div className="h-9 bg-[#F5F5F5] px-4 grid grid-cols-4 items-center text-[11px] font-medium text-[#666666]">
            <div>Channel</div>
            <div>Status</div>
            <div>Readiness</div>
            <div>Last sync</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-[#EAEAEA]">
            {blocker.otherChannels.map((item) => (
              <div
                key={item.channel}
                className="h-11 px-4 grid grid-cols-4 items-center hover:bg-[#FAFAFA] transition-colors relative"
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
                    {item.status.replace("_", " ")}
                  </span>
                </div>

                {/* Readiness */}
                <div className="text-black font-medium">
                  {item.readinessPct}%
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
