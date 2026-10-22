import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useReadinessAudit } from "@/hooks/useListingAudit";
import { useCan } from "@/hooks/useCan";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { AuditError, AuditLoading, TruncatedNote } from "@/components/listings/audit/AuditStates";
import { SuggestionDialog } from "@/components/listings/audit/SuggestionDialog";
import { scoreColor, SPECTRUM_COLOR, SPECTRUM_LABEL, spectrumBars, STATUS_LABEL } from "@/components/listings/audit/format";
import type { ApplyOutcome } from "@/hooks/useListingAudit";
import type { Suggestion } from "@/types/listingAudit";

export default function ListingReadinessPage() {
  const navigate = useNavigate();
  const { data: audit, isLoading, error, refetch } = useReadinessAudit();
  const canWrite = useCan("listings:write");

  const [dismissed, setDismissed] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState<Suggestion | null>(null);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  if (isLoading) return <AuditLoading label="Loading listing readiness audit…" />;
  if (error || !audit) return <AuditError title="Failed to load the listing readiness audit." error={error} onRetry={() => void refetch()} />;

  const pct = audit.overall.readinessPct;
  const bars = spectrumBars(audit.spectrum);
  const suggestions = audit.suggestions.filter((s) => !dismissed.includes(s.id));
  const empty = audit.listingsEvaluated === 0 && audit.spectrum.not_listed === 0;

  const handleApplied = (s: Suggestion, o: ApplyOutcome, value: string) => {
    setReviewing(null);
    setAppliedMessage(`${s.label} set to '${value}' on ${o.done} ${s.marketplaceName} listing${o.done === 1 ? "" : "s"}. Readiness updated!`);
    setTimeout(() => setAppliedMessage(null), 5000);
  };

  // the applied toast and the suggestion box sit under the journey stepper; every suggestion needs the merchant's confirmation before anything changes
  const suggestionsBlock = (
    <>
      {appliedMessage && (
        <div role="status" className="w-full p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{appliedMessage}</span>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="w-full space-y-3" role="region" aria-label="Suggestions">
          {suggestions.map((s) => (
            <div key={s.id} className="w-full p-4 rounded-xl border border-[#EAEAEA] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-none">
              <div className="flex flex-col items-start gap-1">
                <span className="text-sm font-semibold text-black">{s.title}</span>
                <p className="text-xs text-[#666666]">{s.description}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                  {s.suggestedValue ? (
                    <>
                      <span className="text-[#666666]">Suggested value:</span>
                      <span className="px-2 py-0.5 rounded border border-[#BDBDBD] bg-neutral-50 text-xs font-medium text-black">{s.suggestedValue}</span>
                    </>
                  ) : (
                    <span className="text-[#666666]">No value is known yet: you enter it when you review.</span>
                  )}
                  <span className="text-[11px] text-[#666666]">{s.note}</span>
                </div>
                {s.valueSource && <span className="text-[11px] text-[#666666]">{s.valueSource}</span>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setReviewing(s)}
                  disabled={!canWrite}
                  title={canWrite ? undefined : "You do not have permission to edit listings"}
                  className="h-9 px-4 rounded-lg bg-black text-white text-xs font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  Review suggestions
                </button>
                <button
                  onClick={() => setDismissed((d) => [...d, s.id])}
                  className="h-9 px-4 rounded-lg border border-[#BDBDBD] bg-white text-neutral-700 text-xs font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="w-full flex flex-col items-start gap-8 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* 1. BREADCRUMB / BACK NAVIGATION */}
      <div className="w-full flex items-center justify-between text-xs text-[#666666]">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(ROUTES.LISTINGS)} className="hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </button>
          <span>/</span>
          <button onClick={() => navigate(ROUTES.LISTINGS)} className="hover:text-black transition-colors cursor-pointer">
            Listings
          </button>
          <span>/</span>
          <span className="text-black font-medium">Readiness</span>
        </div>

        <button
          onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
          className="h-8 px-3.5 flex items-center gap-1.5 bg-[#000000] text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
        >
          <span>Go to Publishing ({audit.overall.readyProducts.toLocaleString()} ready)</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. HEADER & READINESS KPI */}
      <header className="w-full flex flex-row items-baseline justify-between border-b border-[#EAEAEA] pb-4">
        <div className="flex flex-col items-start gap-1">
          <h1 className="text-[26px] font-semibold leading-[32px] text-[#000000] tracking-tight">Listing readiness</h1>
          <p className="text-[13px] font-normal leading-[18px] text-[#666666]">Readiness across the preparation cohort</p>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[36px] font-semibold leading-none text-[#000000] tracking-tight">{pct === null ? "—" : `${pct}%`}</span>
          <span className="text-xs font-normal text-[#666666] mt-1">ready to publish</span>
        </div>
      </header>

      {audit.truncated && <TruncatedNote evaluated={audit.listingsEvaluated} total={audit.totalListings} />}

      {empty && (
        <div className="w-full rounded-lg border border-dashed border-[#BDBDBD] p-8 text-center text-sm text-[#666666]">
          There are no listings yet. Create a listing from the Listings screen and its readiness shows up here.
        </div>
      )}

      {/* 3. BARCODE SPECTROGRAM */}
      <section className="w-full space-y-3" aria-label="Listing states">
        <div className="w-full h-10 flex items-center gap-[2.5px] overflow-hidden py-1">
          {bars.map((state, idx) => (
            <div
              key={idx}
              title={SPECTRUM_LABEL[state]}
              className="w-[3px] h-full rounded-[1.5px] transition-transform hover:scale-y-110 cursor-default shrink-0"
              style={{ backgroundColor: SPECTRUM_COLOR[state] }}
            />
          ))}
        </div>

        <div className="w-full flex flex-wrap items-center justify-between text-xs text-[#666666] pt-1 gap-2">
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            {(Object.keys(SPECTRUM_COLOR) as Array<keyof typeof SPECTRUM_COLOR>).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SPECTRUM_COLOR[s] }} />
                <span className={s === "ready" ? "text-[#000000] font-medium" : undefined}>
                  {SPECTRUM_LABEL[s]} ({audit.spectrum[s].toLocaleString()})
                </span>
              </div>
            ))}
          </div>

          <p className="text-[12px] text-[#666666]">
            {pct === null
              ? "No listings are waiting to be published."
              : `${audit.overall.readyProducts.toLocaleString()} product${audit.overall.readyProducts === 1 ? "" : "s"} can be published without additional changes. ${pct}% readiness of preparation cohort.`}
          </p>
        </div>
      </section>

      {/* 4. LISTING HEALTH */}
      <section className="w-full space-y-4 pt-2 border-t border-[#EAEAEA]">
        <div className="w-full flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#000000]">Listing health</h2>
          <span className="text-[12px] text-[#666666]">Content quality · across {audit.listingsEvaluated.toLocaleString()} listings</span>
        </div>

        {audit.health.length === 0 ? (
          <p className="text-xs text-[#666666]">Nothing to score yet.</p>
        ) : (
          <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {audit.health.map((metric) => {
              const color = scoreColor(metric.scorePct);
              return (
                <div key={metric.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-700 font-medium">{metric.label}</span>
                    <span className="font-semibold" style={{ color }}>
                      {metric.scorePct}%
                    </span>
                  </div>
                  <div className="w-full h-[3px] bg-[#E5E7EB] rounded-full overflow-hidden" role="progressbar" aria-label={metric.label} aria-valuenow={metric.scorePct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${metric.scorePct}%`, backgroundColor: color }} />
                  </div>
                  {metric.unchecked > 0 && (
                    <span className="text-[11px] text-[#666666]">
                      {metric.unchecked} listing{metric.unchecked === 1 ? "" : "s"} not validated yet
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. MARKETPLACE COVERAGE */}
      <section className="w-full space-y-4 pt-2 border-t border-[#EAEAEA]">
        <div className="w-full flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#000000]">Marketplace coverage</h2>
          <span className="text-[12px] text-[#666666]">Master products available per channel</span>
        </div>

        {audit.coverage.length === 0 ? (
          <p className="text-xs text-[#666666]">No marketplace is connected yet.</p>
        ) : (
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {audit.coverage.map((ch) => {
              const color = scoreColor(ch.percent);
              return (
                <div key={ch.marketplace} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-black">{ch.name}</span>
                    <span className="font-semibold" style={{ color }}>
                      {ch.percent}%
                    </span>
                  </div>
                  <div className="w-full h-[3px] bg-[#E5E7EB] rounded-full overflow-hidden" role="progressbar" aria-label={`${ch.name} coverage`} aria-valuenow={ch.percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ch.percent}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[11px] text-[#666666]">
                    {ch.activeProducts.toLocaleString()} / {ch.totalProducts.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="w-full flex flex-wrap items-center justify-between pt-1 text-xs">
          <p className="text-[#666666]">
            {audit.unlistedProducts.toLocaleString()} product{audit.unlistedProducts === 1 ? " is" : "s are"} not currently listed on at least one connected marketplace.
          </p>
          <button onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)} className="font-medium text-black hover:underline cursor-pointer flex items-center gap-1 group">
            <span>Explore publishing opportunities</span>
            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        </div>
      </section>

      {/* 6. LISTING JOURNEY & RESOLUTION ASSIST */}
      {audit.journey && (
        <section className="w-full space-y-5 pt-2 border-t border-[#EAEAEA]">
          <div className="flex w-full items-start justify-between gap-4">
            <div className="flex flex-col items-start gap-0.5">
              <h2 className="text-[16px] font-semibold text-[#000000]">Listing journey</h2>
              <p className="text-xs text-[#666666]">
                {audit.journey.productTitle} · {audit.journey.marketplaceName} · {STATUS_LABEL[audit.journey.screenStatus]}
              </p>
            </div>
            <Link to={`/listings/${audit.journey.listingId}`} className="text-xs font-medium text-black hover:underline shrink-0">
              Open listing →
            </Link>
          </div>

          <div className="w-full py-2">
            <ol className="grid grid-cols-5 relative">
              {audit.journey.steps.map((step, idx) => {
                const isComplete = step.state === "complete";
                const isWarning = step.state === "warning";
                const isCurrent = step.state === "current";
                const dotColor = isComplete ? "bg-[#16A34A]" : isWarning || isCurrent ? "bg-[#D97706]" : "bg-[#9CA3AF]";
                const textColor = isComplete ? "text-[#16A34A]" : isWarning || isCurrent ? "text-[#D97706]" : "text-[#666666]";
                return (
                  <li key={step.key} className="flex flex-col items-start relative pr-4">
                    {idx < (audit.journey?.steps.length ?? 0) - 1 && (
                      <div className={cn("absolute top-2 left-3 right-0 h-[2px]", isComplete ? "bg-[#16A34A]" : isWarning || isCurrent ? "bg-[#D97706]" : "bg-[#E5E7EB]")} />
                    )}
                    <div className="relative z-10 mb-2">
                      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center", dotColor)}>
                        {isComplete && <span className="text-white text-[9px] font-bold">✓</span>}
                        {isWarning && <span className="text-white text-[9px] font-bold">!</span>}
                        {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-xs font-semibold text-black">{step.title}</span>
                      <span className={cn("text-[11px] font-medium mt-0.5", textColor)}>{step.statusText}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {suggestionsBlock}
        </section>
      )}

      {!audit.journey && suggestionsBlock}

      {reviewing && <SuggestionDialog key={reviewing.id} suggestion={reviewing} open onClose={() => setReviewing(null)} onApplied={(o, v) => handleApplied(reviewing, o, v)} />}
    </div>
  );
}
