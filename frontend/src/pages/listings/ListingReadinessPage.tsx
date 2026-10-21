import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  useListingReadinessAudit,
  useApplyReadinessSuggestion,
} from "@/hooks/useListings";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";

export default function ListingReadinessPage() {
  const navigate = useNavigate();
  const { data: audit, isLoading, error } = useListingReadinessAudit();
  const applySuggestionMutation = useApplyReadinessSuggestion();

  const [appliedSuccessMessage, setAppliedSuccessMessage] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-neutral-500" />
        <span className="text-xs text-neutral-500 font-medium">
          Loading listing readiness audit…
        </span>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="w-full p-8 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm">
        Failed to load listing readiness diagnostic. Please try again.
      </div>
    );
  }

  const handleApply = (suggestionId: string) => {
    applySuggestionMutation.mutate(
      { suggestionId, action: "apply" },
      {
        onSuccess: () => {
          setAppliedSuccessMessage(
            "Material updated to 'Cotton' across 4 Meesho listings. Readiness updated!",
          );
          setTimeout(() => setAppliedSuccessMessage(null), 5000);
        },
      },
    );
  };

  const handleDismiss = (suggestionId: string) => {
    applySuggestionMutation.mutate({ suggestionId, action: "dismiss" });
  };

  return (
    <div className="w-full flex flex-col items-start gap-8 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* =========================================================================
          1. BREADCRUMB / BACK NAVIGATION
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
          <span className="text-black font-medium">Readiness</span>
        </div>

        <button
          onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
          className="h-8 px-3.5 flex items-center gap-1.5 bg-[#000000] text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
        >
          <span>Go to Publishing ({audit.readyProductsCount} ready)</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* =========================================================================
          2. HEADER & READINESS KPI
         ========================================================================= */}
      <header className="w-full flex flex-row items-baseline justify-between border-b border-[#EAEAEA] pb-4">
        <div className="flex flex-col items-start gap-1">
          <h1 className="text-[26px] font-semibold leading-[32px] text-[#000000] tracking-tight">
            Listing readiness
          </h1>
          <p className="text-[13px] font-normal leading-[18px] text-[#666666]">
            Readiness across the preparation cohort
          </p>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[36px] font-semibold leading-none text-[#000000] tracking-tight">
            {audit.overallReadinessPct}%
          </span>
          <span className="text-xs font-normal text-[#666666] mt-1">
            ready to publish
          </span>
        </div>
      </header>

      {/* =========================================================================
          3. BARCODE SPECTROGRAM VISUALIZATION
         ========================================================================= */}
      <section className="w-full space-y-3">
        {/* Dense clusters of vertical rounded bars */}
        <div className="w-full h-10 flex items-center gap-[2.5px] overflow-hidden py-1">
          {audit.spectrogram.map((bar, idx) => (
            <div
              key={bar.id || idx}
              title={`Item ${idx + 1}: ${bar.status.replace("_", " ")}`}
              className="w-[3px] h-full rounded-[1.5px] transition-transform hover:scale-y-110 cursor-default shrink-0"
              style={{ backgroundColor: bar.color }}
            />
          ))}
        </div>

        {/* Legend & Summary caption */}
        <div className="w-full flex flex-wrap items-center justify-between text-xs text-[#666666] pt-1 gap-2">
          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A]" />
              <span className="text-[#000000] font-medium">Ready</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#D97706]" />
              <span>Needs review</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]" />
              <span>Blocked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#E5E7EB]" />
              <span>Not listed</span>
            </div>
          </div>

          <p className="text-[12px] text-[#666666]">
            {audit.cohortDescription}
          </p>
        </div>
      </section>

      {/* =========================================================================
          4. LISTING HEALTH (Content quality · across active listings)
         ========================================================================= */}
      <section className="w-full space-y-4 pt-2 border-t border-[#EAEAEA]">
        <div className="w-full flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#000000]">
            Listing health
          </h2>
          <span className="text-[12px] text-[#666666]">
            Content quality · across active listings
          </span>
        </div>

        <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          {audit.healthMetrics.map((metric) => (
            <div key={metric.name} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-700 font-medium">
                  {metric.name}
                </span>
                <span
                  className="font-semibold"
                  style={{ color: metric.color }}
                >
                  {metric.score}%
                </span>
              </div>
              <div className="w-full h-[3px] bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${metric.score}%`,
                    backgroundColor: metric.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          5. MARKETPLACE COVERAGE (Master products available per channel)
         ========================================================================= */}
      <section className="w-full space-y-4 pt-2 border-t border-[#EAEAEA]">
        <div className="w-full flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#000000]">
            Marketplace coverage
          </h2>
          <span className="text-[12px] text-[#666666]">
            Master products available per channel
          </span>
        </div>

        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {audit.coverage.map((ch) => (
            <div key={ch.channel} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-black">
                  {ch.channelName}
                </span>
                <span
                  className="font-semibold"
                  style={{ color: ch.color }}
                >
                  {ch.percentage}%
                </span>
              </div>
              <div className="w-full h-[3px] bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${ch.percentage}%`,
                    backgroundColor: ch.color,
                  }}
                />
              </div>
              <span className="text-[11px] text-[#666666]">
                {ch.activeCount} / {ch.totalCount}
              </span>
            </div>
          ))}
        </div>

        <div className="w-full flex flex-wrap items-center justify-between pt-1 text-xs">
          <p className="text-[#666666]">
            {audit.unlistedCount} products are not currently listed on at least one connected marketplace.
          </p>
          <button
            onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
            className="font-medium text-black hover:underline cursor-pointer flex items-center gap-1 group"
          >
            <span>Explore publishing opportunities</span>
            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        </div>
      </section>

      {/* =========================================================================
          6. LISTING JOURNEY & AI RESOLUTION ASSIST
         ========================================================================= */}
      {audit.journey && (
        <section className="w-full space-y-5 pt-2 border-t border-[#EAEAEA]">
          <div className="flex flex-col items-start gap-0.5">
            <h2 className="text-[16px] font-semibold text-[#000000]">
              Listing journey
            </h2>
            <p className="text-xs text-[#666666]">
              {audit.journey.productTitle} · {audit.journey.channelName} · {audit.journey.statusText}
            </p>
          </div>

          {/* Stepper */}
          <div className="w-full py-2">
            <div className="grid grid-cols-5 relative">
              {audit.journey.steps.map((step, idx) => {
                const isComplete = step.state === "complete";
                const isWarning = step.state === "warning";
                const isCurrent = step.state === "current";

                const dotColor = isComplete
                  ? "bg-[#16A34A]"
                  : isWarning || isCurrent
                  ? "bg-[#D97706]"
                  : "bg-[#9CA3AF]";

                const textColor = isComplete
                  ? "text-[#16A34A]"
                  : isWarning || isCurrent
                  ? "text-[#D97706]"
                  : "text-[#666666]";

                return (
                  <div key={step.title} className="flex flex-col items-start relative pr-4">
                    {/* Horizontal connecting track line */}
                    {idx < audit.journey!.steps.length - 1 && (
                      <div
                        className={cn(
                          "absolute top-2 left-3 right-0 h-[2px]",
                          isComplete
                            ? "bg-[#16A34A]"
                            : isWarning || isCurrent
                            ? "bg-[#D97706]"
                            : "bg-[#E5E7EB]",
                        )}
                      />
                    )}

                    {/* Step Node Dot */}
                    <div className="relative z-10 mb-2">
                      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center", dotColor)}>
                        {isComplete && (
                          <span className="text-white text-[9px] font-bold">✓</span>
                        )}
                        {isWarning && (
                          <span className="text-white text-[9px] font-bold">!</span>
                        )}
                        {isCurrent && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>

                    {/* Step Title & Subtext */}
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-xs font-semibold text-black">
                        {step.title}
                      </span>
                      <span className={cn("text-[11px] font-medium mt-0.5", textColor)}>
                        {step.statusText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Toast / Success notification */}
          {appliedSuccessMessage && (
            <div className="w-full p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{appliedSuccessMessage}</span>
            </div>
          )}

          {/* AI Suggestion Box */}
          {audit.journey.suggestionBox && (
            <div className="w-full p-4 rounded-xl border border-[#EAEAEA] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-none">
              <div className="flex flex-col items-start gap-1">
                <span className="text-sm font-semibold text-black">
                  {audit.journey.suggestionBox.title}
                </span>
                <p className="text-xs text-[#666666]">
                  {audit.journey.suggestionBox.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                  <span className="text-[#666666]">Suggested value:</span>
                  <span className="px-2 py-0.5 rounded border border-[#BDBDBD] bg-neutral-50 text-xs font-medium text-black">
                    {audit.journey.suggestionBox.suggestedValue}
                  </span>
                  <span className="text-[11px] text-[#666666]">
                    {audit.journey.suggestionBox.note}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleApply(audit.journey!.suggestionBox!.id)}
                  disabled={applySuggestionMutation.isPending}
                  className="h-9 px-4 rounded-lg bg-black text-white text-xs font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {applySuggestionMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Applying…
                    </>
                  ) : (
                    "Review suggestions"
                  )}
                </button>
                <button
                  onClick={() => handleDismiss(audit.journey!.suggestionBox!.id)}
                  disabled={applySuggestionMutation.isPending}
                  className="h-9 px-4 rounded-lg border border-[#BDBDBD] bg-white text-neutral-700 text-xs font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
