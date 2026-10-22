import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, ArrowLeft, CheckCircle2, AlertCircle, Loader2, UploadCloud } from "lucide-react";
import { usePublishCohort, usePublishingPreparation } from "@/hooks/useListingAudit";
import { useCan } from "@/hooks/useCan";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { AuditError, AuditLoading, TruncatedNote } from "@/components/listings/audit/AuditStates";
import { readBulkScope, selectedParam } from "@/components/listings/audit/bulkScope";
import type { PublishChannel, PublishIssue } from "@/types/listingAudit";

const SYNC_TONE: Record<PublishChannel["sync"]["mode"], string> = { real_time: "text-emerald-600", polling: "text-amber-600", manual: "text-neutral-500" };

const resolvePath = (i: PublishIssue) => (i.severity === "blocker" ? ROUTES.LISTING_BLOCKED.replace(":id", i.listingId) : `${ROUTES.LISTINGS}/${i.listingId}`);

export default function PublishingPreparationPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const canWrite = useCan("listings:write");
  // the bulk screen links here with ?selected=<n>; without it the last bulk review's count is used
  const bulkScope = readBulkScope();
  const selectedCount = selectedParam(params.get("selected")) ?? bulkScope?.count ?? null;
  const bulkHref = bulkScope && bulkScope.ids.length > 0 ? `${ROUTES.LISTINGS_BULK}?ids=${bulkScope.ids.join(",")}` : ROUTES.LISTINGS_BULK;

  // Wizard state: 1: Preparation, 2: Review, 3: Final confirmation
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3>(1);
  const [isCohortExpanded, setIsCohortExpanded] = useState<boolean>(true);
  const [isIssuesExpanded, setIsIssuesExpanded] = useState<boolean>(false);
  const [isAcknowledged, setIsAcknowledged] = useState<boolean>(false);

  const { data: prep, isLoading, error, refetch } = usePublishingPreparation();
  const publish = usePublishCohort();
  const redirect = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (redirect.current) clearTimeout(redirect.current); }, []);

  if (isLoading) return <AuditLoading label="Loading publishing preparation…" />;
  if (error || !prep) return <AuditError title="Failed to load the publishing preparation." error={error} onRetry={() => void refetch()} />;

  const readyProducts = prep.readyProducts;
  const readyVariants = prep.readyVariants;
  const potentialIssuesCount = prep.potentialIssueProducts;
  const issuesList = prep.issues;
  const publishing = prep.channels.filter((c) => c.ready > 0);
  const nothingReady = prep.readyListings === 0;
  const result = publish.data;

  const handleContinue = () => {
    if (currentStage === 1) setCurrentStage(2);
    else if (currentStage === 2) setCurrentStage(3);
  };

  const handleFinalPublish = () => {
    publish.mutate(prep.readyListingIds, {
      onSuccess: (r) => {
        // back to the listings once everything was accepted; failures stay on screen
        if (r.failed === 0) redirect.current = setTimeout(() => navigate(ROUTES.LISTINGS), 2500);
      },
    });
  };

  const confirmDisabled = publish.isPending || !isAcknowledged || nothingReady || !canWrite || publish.isSuccess;

  return (
    <div className="w-full flex flex-col items-start gap-5 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* 1. TOP NAVIGATION / BREADCRUMB */}
      <div className="w-full flex items-center gap-2 text-xs text-[#666666]">
        <button onClick={() => navigate(ROUTES.LISTINGS)} className="hover:text-black flex items-center gap-1 transition-colors cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Listings
        </button>
        <span>/</span>
        <span className="text-black font-medium">Publishing preparation</span>
      </div>

      {/* 2. PAGE HEADER */}
      <header className="w-full flex flex-row justify-between items-center py-1">
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">COMMERCE</span>
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">Publishing preparation</h1>
          <p className="text-[13px] font-normal leading-[19px] text-[#666666]">Review catalog readiness before publishing across your connected channels.</p>
        </div>

        <div>
          {currentStage === 1 ? (
            <button onClick={() => setCurrentStage(2)} className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none">
              Review before publishing
            </button>
          ) : currentStage === 2 ? (
            <button onClick={() => setCurrentStage(3)} className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none">
              Proceed to confirmation
            </button>
          ) : (
            <button
              onClick={handleFinalPublish}
              disabled={confirmDisabled}
              className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer shadow-none"
            >
              {publish.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Publishing catalog…
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  Confirm & publish cohort
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {prep.truncated && <TruncatedNote evaluated={prep.listingsEvaluated} total={prep.totalListings} />}

      {/* 3. PUBLISHING STAGES */}
      <nav aria-label="Publishing stages" className="w-full h-12 border-y border-[#EAEAEA] flex flex-row items-center gap-4 text-[12px]">
        {([
          [1, "Preparation"],
          [2, "Review"],
          [3, "Final confirmation"],
        ] as const).flatMap(([n, label], idx) => [
          idx > 0 ? <div key={`c${n}`} className="w-10 h-[1px] bg-[#BDBDBD]" /> : null,
          <button key={n} type="button" onClick={() => setCurrentStage(n)} aria-current={currentStage === n ? "step" : undefined} className="flex items-center gap-2 cursor-pointer">
            <span
              className={cn(
                "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-medium transition-colors",
                (n === 3 ? currentStage === 3 : currentStage >= n) ? "bg-[#000000] border border-[#000000] text-[#FFFFFF]" : "bg-[#FFFFFF] border border-[#BDBDBD] text-[#666666]",
              )}
            >
              {n}
            </span>
            <span className={cn("leading-[17px]", currentStage === n ? "font-semibold text-[#000000]" : "font-normal text-[#666666]")}>{label}</span>
          </button>,
        ])}
      </nav>

      {/* STAGE 1: PREPARATION VIEW */}
      {currentStage === 1 && (
        <div className="w-full space-y-5">
          <div className="w-full flex flex-row items-start gap-6 text-[12px]">
            <div className="w-[260px] flex flex-col items-start gap-1 shrink-0">
              <span className="text-[11px] font-normal leading-[16px] text-[#666666] uppercase">PUBLISHING SCOPE</span>
              <span className="text-[14px] font-semibold leading-[20px] text-[#000000]">Ready catalog cohort</span>
            </div>

            <div className="flex-1 flex flex-col items-start gap-1">
              <span className="text-[13px] font-normal leading-[19px] text-[#000000]">Catalog-level preparation, not a bulk listing selection.</span>
              <Link to={bulkHref} className="text-[12px] font-normal leading-[17px] text-[#666666] hover:text-black underline transition-colors cursor-pointer">
                {selectedCount === null
                  ? "Listings selected in the bulk screen are a separate scope →"
                  : `The ${selectedCount.toLocaleString()} selected listing${selectedCount === 1 ? "" : "s"} in the bulk screen ${selectedCount === 1 ? "is" : "are"} a separate scope →`}
              </Link>
            </div>
          </div>

          {/* Readiness summary */}
          <div className="w-full flex flex-row items-center py-5 border-y border-[#EAEAEA] gap-8">
            <div className="w-[340px] flex flex-col items-start gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A] leading-[17px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                <span>Ready to publish</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[36px] font-semibold leading-[44px] text-[#000000]">{readyProducts.toLocaleString()}</span>
                <span className="text-[13px] font-normal leading-[19px] text-[#666666]">products</span>
              </div>
            </div>

            <div className="flex-1 border-l border-[#EAEAEA] pl-8 flex flex-col items-start gap-1.5">
              <span className="text-[12px] font-normal leading-[17px] text-[#666666]">Within the ready cohort</span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[36px] font-semibold leading-[44px] text-[#000000]">{readyVariants.toLocaleString()}</span>
                <span className="text-[13px] font-normal leading-[19px] text-[#666666]">variants</span>
              </div>
            </div>

            <div className="w-[300px] border-l border-[#EAEAEA] pl-8 flex flex-col items-start gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#D97706] leading-[17px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Potential issues</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[36px] font-semibold leading-[44px] text-[#000000]">{potentialIssuesCount.toLocaleString()}</span>
                <span className="text-[13px] font-normal leading-[19px] text-[#666666]">products</span>
              </div>
            </div>
          </div>

          {/* Review disclosure */}
          <div className="w-full space-y-3">
            <div className="w-full flex flex-row justify-between items-center">
              <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">Before you publish</h2>
              <span className="text-[11px] font-normal leading-[16px] text-[#666666]">Review details, then confirm</span>
            </div>

            <div className="w-full border-t border-[#EAEAEA]">
              <button
                type="button"
                onClick={() => setIsCohortExpanded((v) => !v)}
                aria-expanded={isCohortExpanded}
                className="w-full h-11 flex flex-row items-center justify-between cursor-pointer hover:bg-[#FAFAFA] transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isCohortExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#666666]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />}
                  <span className="text-[13px] font-semibold leading-[19px] text-[#000000]">Ready catalog cohort</span>
                </div>
                <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  {readyProducts.toLocaleString()} products · {readyVariants.toLocaleString()} variants
                </span>
              </button>

              {isCohortExpanded && (
                <div className="w-full pl-5 divide-y divide-[#EAEAEA] border-b border-[#EAEAEA]">
                  <div className="w-full py-3 flex flex-row items-start gap-6 text-[12px]">
                    <div className="w-[260px] font-semibold leading-[17px] text-[#000000] shrink-0">Catalog scope</div>
                    <div className="flex-1 font-normal leading-[17px] text-[#666666]">
                      {prep.readyListings.toLocaleString()} of {prep.candidateListings.toLocaleString()} unpublished listings are ready; {prep.blockedListings.toLocaleString()} are blocked until their issues are resolved.
                    </div>
                  </div>
                  <div className="w-full py-3 flex flex-row items-start gap-6 text-[12px]">
                    <div className="w-[260px] font-semibold leading-[17px] text-[#000000] shrink-0">Channel listings</div>
                    <div className="flex-1 font-normal leading-[17px] text-[#666666]">
                      {publishing.length === 0 ? "No channel has a ready listing." : publishing.map((c) => `${c.name} ${c.ready.toLocaleString()}`).join(" · ")}
                    </div>
                  </div>
                  <div className="w-full py-3 flex flex-row items-start gap-6 text-[12px]">
                    <div className="w-[260px] font-semibold leading-[17px] text-[#000000] shrink-0">Readiness and potential issues</div>
                    <div className="flex-1 font-normal leading-[17px] text-[#666666]">
                      Review readiness alongside any potential issues before final confirmation.
                      {prep.unvalidatedListings > 0 && ` ${prep.unvalidatedListings} listing${prep.unvalidatedListings === 1 ? " is" : "s are"} validated again when published.`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full border-b border-[#EAEAEA]">
              <div className="w-full h-[52px] flex flex-row items-center justify-between">
                <button type="button" onClick={() => setIsIssuesExpanded((v) => !v)} aria-expanded={isIssuesExpanded} className="flex-1 h-full flex items-center gap-2 cursor-pointer hover:bg-[#FAFAFA] transition-colors text-left">
                  {isIssuesExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#666666]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />}
                  <span className="text-[13px] font-semibold leading-[19px] text-[#000000]">Potential issues</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] ml-1" />
                  <span className="text-[12px] font-medium leading-[16px] text-[#D97706]">{potentialIssuesCount.toLocaleString()} products</span>
                </button>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => navigate(ROUTES.LISTINGS_READINESS)} className="text-[12px] font-semibold leading-[17px] text-[#000000] hover:underline cursor-pointer">
                    Open readiness audit ↗
                  </button>
                  <button type="button" onClick={() => setIsIssuesExpanded((v) => !v)} className="text-[12px] font-semibold leading-[17px] text-[#000000] hover:underline cursor-pointer">
                    {isIssuesExpanded ? "Hide issues ↑" : "Review issues →"}
                  </button>
                </div>
              </div>

              {isIssuesExpanded && (
                <div className="w-full pl-5 pb-3 divide-y divide-[#EAEAEA]">
                  {issuesList.length === 0 && <p className="py-3 text-xs text-[#666666]">No potential issues were found in the catalog.</p>}
                  {issuesList.map((issue) => (
                    <div key={issue.id} onClick={() => navigate(resolvePath(issue))} className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-neutral-50 px-2 rounded cursor-pointer transition-colors group">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className={cn("w-3.5 h-3.5 shrink-0", issue.severity === "blocker" ? "text-red-600" : "text-amber-600")} aria-label={issue.severity === "blocker" ? "Blocker" : "Warning"} />
                        <span className="font-medium text-black group-hover:underline truncate">{issue.productTitle}</span>
                        <span className="text-neutral-500 font-mono text-[11px]">({issue.sku})</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-600">{issue.marketplaceName}</span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-neutral-500 text-[11px] truncate">{issue.issue}</span>
                        <Link to={resolvePath(issue)} onClick={(e) => e.stopPropagation()} className="text-[11px] font-semibold text-red-600 hover:underline shrink-0">
                          Resolve →
                        </Link>
                      </div>
                    </div>
                  ))}
                  {prep.issuesTotal > issuesList.length && <p className="py-2 px-2 text-[11px] text-[#666666]">Showing {issuesList.length} of {prep.issuesTotal.toLocaleString()} issues, blockers first.</p>}
                </div>
              )}
            </div>
          </div>

          {/* Final confirmation preparation */}
          <div className="w-full space-y-4 pt-2">
            <div className="w-full flex flex-row items-start py-5 border-y border-[#EAEAEA] gap-6 text-[12px]">
              <div className="w-[260px] flex flex-col items-start gap-1.5 shrink-0">
                <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">Final confirmation</h3>
                <span className="text-[11px] font-normal leading-[16px] text-[#666666]">Required before publishing</span>
              </div>

              <div className="flex-1 flex flex-col items-start gap-2.5">
                <span className="text-[14px] font-normal leading-[20px] text-[#000000]">You must review and explicitly confirm before high-volume publishing.</span>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={isAcknowledged} onChange={(e) => setIsAcknowledged(e.target.checked)} className="w-3.5 h-3.5 border border-[#BDBDBD] rounded accent-black cursor-pointer" />
                  <span className="text-[12px] font-normal leading-[17px] text-[#666666]">I have reviewed the publishing scope and potential issues.</span>
                </label>

                <span className="text-[11px] font-normal leading-[16px] text-[#666666]">Acknowledgement and the final publishing action are on the confirmation step.</span>
              </div>
            </div>

            <div className="w-full flex flex-row justify-between items-center pt-1 text-[12px]">
              <div className="flex flex-col items-start gap-1">
                <span className="font-semibold leading-[17px] text-[#000000]">Continue advances to confirmation only.</span>
                <span className="font-normal leading-[17px] text-[#666666]">Nothing is published from this preparation screen.</span>
              </div>

              <button onClick={handleContinue} className="w-24 h-9 flex items-center justify-center bg-white border border-[#666666] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer shadow-none">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: REVIEW (channel by channel) */}
      {currentStage === 2 && (
        <div className="w-full space-y-5 animate-in fade-in duration-200">
          <div className="w-full flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <div>
              <h2 className="text-lg font-semibold text-black">Channel Payload Review</h2>
              <p className="text-xs text-neutral-500">Verify target channel configurations for the {prep.readyListings.toLocaleString()} ready listings.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(ROUTES.LISTINGS_READINESS)} className="text-xs font-semibold text-black hover:underline cursor-pointer flex items-center gap-1">
                <span>Open Readiness Diagnostic ↗</span>
              </button>
              <button onClick={() => setCurrentStage(1)} className="text-xs text-neutral-600 hover:text-black underline cursor-pointer">
                ← Back to preparation
              </button>
            </div>
          </div>

          {prep.channels.length === 0 ? (
            <p className="text-xs text-[#666666]">No marketplace is connected yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-xs">
              {prep.channels.map((ch) => {
                const connected = ch.accounts.some((a) => a.status === "active");
                return (
                  <div key={ch.marketplace} className="p-4 rounded-lg border border-[#EAEAEA] bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-black text-sm">{ch.name}</span>
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", ch.ready > 0 ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600")}>{ch.ready.toLocaleString()} ready</span>
                    </div>
                    <p className="text-neutral-500 text-[11px]">{ch.categories.length ? `Target taxonomy: ${ch.categories.join(", ")}` : "No marketplace category mapped yet"}</p>
                    <div className="text-[11px] text-neutral-600 pt-1 border-t border-neutral-100 flex justify-between gap-3">
                      <span title={ch.pricingRule ? `${ch.pricingRule.strategyLabel}${ch.pricingRule.scope === "all_channels" ? " · applies to every channel" : ""}` : undefined}>
                        Pricing rule: {ch.pricingRule ? ch.pricingRule.name : "None (prices stay as set)"}
                      </span>
                      <span className={SYNC_TONE[ch.sync.mode]} title={ch.sync.detail}>
                        Sync: {ch.sync.label}
                      </span>
                    </div>
                    {ch.pricingRule && <p className="text-[11px] text-neutral-500">{ch.pricingRule.summary}</p>}
                    <p className="text-[11px] text-neutral-500">{ch.sync.detail}</p>
                    <div className="text-[11px] text-neutral-600 flex justify-between gap-3">
                      <span>
                        {ch.accounts.length ? `Account: ${ch.accounts.map((a) => a.name).join(", ")}` : "No account connected"}
                        {ch.blocked > 0 && ` · ${ch.blocked} blocked`}
                        {ch.warnings > 0 && ` · ${ch.warnings} with warnings`}
                      </span>
                      <span className={connected ? "text-emerald-600" : "text-red-600"}>{connected ? "Connected" : "Not connected"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="w-full flex justify-between items-center pt-4 border-t border-[#EAEAEA]">
            <button onClick={() => setCurrentStage(1)} className="px-4 py-2 border border-[#BDBDBD] rounded-lg text-xs font-medium text-black hover:bg-neutral-50 cursor-pointer">
              Previous step
            </button>
            <button onClick={() => setCurrentStage(3)} className="px-5 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer">
              Proceed to final confirmation →
            </button>
          </div>
        </div>
      )}

      {/* STAGE 3: FINAL CONFIRMATION */}
      {currentStage === 3 && (
        <div className="w-full space-y-5 animate-in fade-in duration-200">
          <div className="p-6 rounded-xl border border-neutral-200 bg-neutral-50 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold">✓</div>
              <div>
                <h3 className="text-base font-semibold text-black">Ready to trigger catalog publishing</h3>
                <p className="text-xs text-neutral-600">
                  {nothingReady
                    ? "No listing is ready to publish right now."
                    : `You are about to publish ${prep.readyProducts.toLocaleString()} product${prep.readyProducts === 1 ? "" : "s"} (${prep.readyVariants.toLocaleString()} variant${prep.readyVariants === 1 ? "" : "s"}) across ${publishing.length} marketplace${publishing.length === 1 ? "" : "s"}.`}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-neutral-200 bg-white space-y-2 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={isAcknowledged} onChange={(e) => setIsAcknowledged(e.target.checked)} className="w-4 h-4 mt-0.5 border border-[#BDBDBD] rounded accent-black cursor-pointer" />
                <span className="text-neutral-700 leading-relaxed">
                  I explicitly authorize Commerce OS to publish this catalog cohort{publishing.length ? ` to ${publishing.map((c) => c.name).join(", ")}` : ""}. {prep.publishLock.statement}
                </span>
              </label>
              <p className="text-[11px] text-[#666666]">Each listing is validated, approved and submitted to its marketplace; a listing that fails is skipped and reported here.</p>
              {prep.readyIdsTruncated && <p className="text-[11px] text-[#666666]">The first {prep.readyListingIds.length} ready listings are published in this run; open this screen again for the rest.</p>}
              {!canWrite && <p className="text-[11px] text-red-600">You do not have permission to publish listings.</p>}
            </div>

            {publish.isError && (
              <div role="alert" className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs">
                {errorMessage(publish.error, "Publishing could not be started.")}
              </div>
            )}

            {result && (
              <div role="status" className={cn("p-3.5 rounded-lg border text-xs space-y-1.5", result.failed === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={cn("w-4 h-4 shrink-0", result.failed === 0 ? "text-emerald-600" : "text-amber-600")} />
                  <span>
                    Publishing started for {result.succeeded.toLocaleString()} listing{result.succeeded === 1 ? "" : "s"}
                    {result.skipped > 0 && `, ${result.skipped} skipped`}
                    {result.failed > 0 && `, ${result.failed} failed`}.{result.failed === 0 && " Redirecting back to Listings overview…"}
                  </span>
                </div>
                {result.failures.slice(0, 5).map((f) => (
                  <p key={f.id} className="pl-6">
                    <Link to={`${ROUTES.LISTINGS}/${f.id}`} className="underline">
                      {f.sku ?? f.id}
                    </Link>
                    : {f.message}
                  </p>
                ))}
                {result.failures.length > 5 && <p className="pl-6">And {result.failures.length - 5} more.</p>}
              </div>
            )}
          </div>

          <div className="w-full flex justify-between items-center pt-2">
            <button onClick={() => setCurrentStage(2)} className="px-4 py-2 border border-[#BDBDBD] rounded-lg text-xs font-medium text-black hover:bg-neutral-50 cursor-pointer">
              ← Back to review
            </button>
            <button
              onClick={handleFinalPublish}
              disabled={confirmDisabled}
              className="px-6 py-2.5 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {publish.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Publishing cohort…
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  Confirm & publish cohort
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
