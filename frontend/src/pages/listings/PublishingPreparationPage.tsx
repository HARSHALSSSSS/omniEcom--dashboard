import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UploadCloud,
} from "lucide-react";
import {
  usePublishingPreparation,
  useConfirmPublishCohort,
} from "@/hooks/useListings";
import { PublishingPreparationIssue } from "@/types/listing";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";

export default function PublishingPreparationPage() {
  const navigate = useNavigate();

  // Wizard state: 1: Preparation, 2: Review, 3: Final confirmation
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3>(1);

  // Accordion state
  const [isCohortExpanded, setIsCohortExpanded] = useState<boolean>(true);
  const [isIssuesExpanded, setIsIssuesExpanded] = useState<boolean>(false);

  // Checkbox acknowledgment
  const [isAcknowledged, setIsAcknowledged] = useState<boolean>(false);

  // Live queries & mutations
  const { data: prepData, isLoading } = usePublishingPreparation();
  const confirmPublishMutation = useConfirmPublishCohort();

  const readyProducts = prepData?.readyProductsCount ?? 186;
  const readyVariants = prepData?.readyVariantsCount ?? 1284;
  const potentialIssuesCount = prepData?.potentialIssuesCount ?? 7;
  const issuesList = prepData?.potentialIssues ?? [];

  const handleContinue = () => {
    if (currentStage === 1) {
      setCurrentStage(2);
    } else if (currentStage === 2) {
      setCurrentStage(3);
    }
  };

  const handleFinalPublish = () => {
    confirmPublishMutation.mutate(isAcknowledged, {
      onSuccess: () => {
        // Return to listings page after publishing
        setTimeout(() => {
          navigate(ROUTES.LISTINGS);
        }, 1200);
      },
    });
  };

  return (
    <div className="w-full flex flex-col items-start gap-5 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* =========================================================================
          1. TOP NAVIGATION / BREADCRUMB
         ========================================================================= */}
      <div className="w-full flex items-center gap-2 text-xs text-[#666666]">
        <button
          onClick={() => navigate(ROUTES.LISTINGS)}
          className="hover:text-black flex items-center gap-1 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Listings
        </button>
        <span>/</span>
        <span className="text-black font-medium">Publishing preparation</span>
      </div>

      {/* =========================================================================
          2. PAGE HEADER (Figma: Page header height 77px)
         ========================================================================= */}
      <header className="w-full flex flex-row justify-between items-center py-1">
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
            COMMERCE
          </span>
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
            Publishing preparation
          </h1>
          <p className="text-[13px] font-normal leading-[19px] text-[#666666]">
            Review catalog readiness before publishing across your connected channels.
          </p>
        </div>

        <div>
          {currentStage === 1 ? (
            <button
              onClick={() => setCurrentStage(2)}
              className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
            >
              Review before publishing
            </button>
          ) : currentStage === 2 ? (
            <button
              onClick={() => setCurrentStage(3)}
              className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
            >
              Proceed to confirmation
            </button>
          ) : (
            <button
              onClick={handleFinalPublish}
              disabled={confirmPublishMutation.isPending || !isAcknowledged}
              className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer shadow-none"
            >
              {confirmPublishMutation.isPending ? (
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

      {/* =========================================================================
          3. PUBLISHING STAGES (Figma: Publishing stages height 48px)
         ========================================================================= */}
      <nav className="w-full h-12 border-y border-[#EAEAEA] flex flex-row items-center gap-4 text-[12px]">
        {/* Stage 1: Preparation */}
        <div
          onClick={() => setCurrentStage(1)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div
            className={cn(
              "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-medium transition-colors",
              currentStage >= 1
                ? "bg-[#000000] border border-[#000000] text-[#FFFFFF]"
                : "bg-[#FFFFFF] border border-[#BDBDBD] text-[#666666]",
            )}
          >
            1
          </div>
          <span
            className={cn(
              "leading-[17px]",
              currentStage === 1
                ? "font-semibold text-[#000000]"
                : "font-normal text-[#666666]",
            )}
          >
            Preparation
          </span>
        </div>

        {/* Connector */}
        <div className="w-10 h-[1px] bg-[#BDBDBD]" />

        {/* Stage 2: Review */}
        <div
          onClick={() => setCurrentStage(2)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div
            className={cn(
              "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-medium transition-colors",
              currentStage >= 2
                ? "bg-[#000000] border border-[#000000] text-[#FFFFFF]"
                : "bg-[#FFFFFF] border border-[#BDBDBD] text-[#666666]",
            )}
          >
            2
          </div>
          <span
            className={cn(
              "leading-[17px]",
              currentStage === 2
                ? "font-semibold text-[#000000]"
                : "font-normal text-[#666666]",
            )}
          >
            Review
          </span>
        </div>

        {/* Connector */}
        <div className="w-10 h-[1px] bg-[#BDBDBD]" />

        {/* Stage 3: Final confirmation */}
        <div
          onClick={() => setCurrentStage(3)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div
            className={cn(
              "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-medium transition-colors",
              currentStage === 3
                ? "bg-[#000000] border border-[#000000] text-[#FFFFFF]"
                : "bg-[#FFFFFF] border border-[#BDBDBD] text-[#666666]",
            )}
          >
            3
          </div>
          <span
            className={cn(
              "leading-[17px]",
              currentStage === 3
                ? "font-semibold text-[#000000]"
                : "font-normal text-[#666666]",
            )}
          >
            Final confirmation
          </span>
        </div>
      </nav>

      {/* =========================================================================
          STAGE 1: PREPARATION VIEW
         ========================================================================= */}
      {currentStage === 1 && (
        <div className="w-full space-y-5">
          {/* Publishing Scope Banner (Figma: Publishing scope height 40px) */}
          <div className="w-full flex flex-row items-start gap-6 text-[12px]">
            <div className="w-[260px] flex flex-col items-start gap-1 shrink-0">
              <span className="text-[11px] font-normal leading-[16px] text-[#666666] uppercase">
                PUBLISHING SCOPE
              </span>
              <span className="text-[14px] font-semibold leading-[20px] text-[#000000]">
                Ready catalog cohort
              </span>
            </div>

            <div className="flex-1 flex flex-col items-start gap-1">
              <span className="text-[13px] font-normal leading-[19px] text-[#000000]">
                Catalog-level preparation, not a bulk listing selection.
              </span>
              <Link
                to={ROUTES.LISTINGS_BULK}
                className="text-[12px] font-normal leading-[17px] text-[#666666] hover:text-black underline transition-colors cursor-pointer"
              >
                The 18 selected listings in the bulk screen are a separate scope →
              </Link>
            </div>
          </div>

          {/* Readiness Summary Metrics Bar (Figma: Readiness summary height 107px) */}
          <div className="w-full flex flex-row items-center py-5 border-y border-[#EAEAEA] gap-8">
            {/* Box 1: Ready Products */}
            <div className="w-[340px] flex flex-col items-start gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A] leading-[17px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                <span>Ready to publish</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[36px] font-semibold leading-[44px] text-[#000000]">
                  {isLoading ? "…" : readyProducts.toLocaleString()}
                </span>
                <span className="text-[13px] font-normal leading-[19px] text-[#666666]">
                  products
                </span>
              </div>
            </div>

            {/* Box 2: Ready Variants */}
            <div className="flex-1 border-l border-[#EAEAEA] pl-8 flex flex-col items-start gap-1.5">
              <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                Within the ready cohort
              </span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[36px] font-semibold leading-[44px] text-[#000000]">
                  {isLoading ? "…" : readyVariants.toLocaleString()}
                </span>
                <span className="text-[13px] font-normal leading-[19px] text-[#666666]">
                  variants
                </span>
              </div>
            </div>

            {/* Box 3: Potential Issues */}
            <div className="w-[300px] border-l border-[#EAEAEA] pl-8 flex flex-col items-start gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#D97706] leading-[17px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Potential issues</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[36px] font-semibold leading-[44px] text-[#000000]">
                  {isLoading ? "…" : potentialIssuesCount}
                </span>
                <span className="text-[13px] font-normal leading-[19px] text-[#666666]">
                  products
                </span>
              </div>
            </div>
          </div>

          {/* Review and Confirmation Preparation (Figma: Review disclosure) */}
          <div className="w-full space-y-3">
            {/* Section heading */}
            <div className="w-full flex flex-row justify-between items-center">
              <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                Before you publish
              </h2>
              <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
                Review details, then confirm
              </span>
            </div>

            {/* Accordion Item 1: Ready catalog cohort */}
            <div className="w-full border-t border-[#EAEAEA]">
              <div
                onClick={() => setIsCohortExpanded((v) => !v)}
                className="w-full h-11 flex flex-row items-center justify-between cursor-pointer hover:bg-[#FAFAFA] transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isCohortExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
                  )}
                  <span className="text-[13px] font-semibold leading-[19px] text-[#000000]">
                    Ready catalog cohort
                  </span>
                </div>
                <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                  {readyProducts} products · {readyVariants.toLocaleString()} variants
                </span>
              </div>

              {isCohortExpanded && (
                <div className="w-full pl-5 divide-y divide-[#EAEAEA] border-b border-[#EAEAEA]">
                  {/* Row 1 */}
                  <div className="w-full py-3 flex flex-row items-start gap-6 text-[12px]">
                    <div className="w-[260px] font-semibold leading-[17px] text-[#000000] shrink-0">
                      Catalog scope
                    </div>
                    <div className="flex-1 font-normal leading-[17px] text-[#666666]">
                      Review the products and variants included in this publishing cohort.
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div className="w-full py-3 flex flex-row items-start gap-6 text-[12px]">
                    <div className="w-[260px] font-semibold leading-[17px] text-[#000000] shrink-0">
                      Channel listings
                    </div>
                    <div className="flex-1 font-normal leading-[17px] text-[#666666]">
                      Check the listing details for the channels you intend to publish to.
                    </div>
                  </div>

                  {/* Row 3 */}
                  <div className="w-full py-3 flex flex-row items-start gap-6 text-[12px]">
                    <div className="w-[260px] font-semibold leading-[17px] text-[#000000] shrink-0">
                      Readiness and potential issues
                    </div>
                    <div className="flex-1 font-normal leading-[17px] text-[#666666]">
                      Review readiness alongside any potential issues before final confirmation.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion Item 2: Potential issues */}
            <div className="w-full border-b border-[#EAEAEA]">
              <div
                onClick={() => setIsIssuesExpanded((v) => !v)}
                className="w-full h-[52px] flex flex-row items-center justify-between cursor-pointer hover:bg-[#FAFAFA] transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isIssuesExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
                  )}
                  <span className="text-[13px] font-semibold leading-[19px] text-[#000000]">
                    Potential issues
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] ml-1" />
                  <span className="text-[12px] font-medium leading-[16px] text-[#D97706]">
                    {potentialIssuesCount} products
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(ROUTES.LISTINGS_READINESS);
                    }}
                    className="text-[12px] font-semibold leading-[17px] text-[#000000] hover:underline cursor-pointer"
                  >
                    Open readiness audit ↗
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsIssuesExpanded((v) => !v);
                    }}
                    className="text-[12px] font-semibold leading-[17px] text-[#000000] hover:underline cursor-pointer"
                  >
                    {isIssuesExpanded ? "Hide issues ↑" : "Review issues →"}
                  </button>
                </div>
              </div>

              {isIssuesExpanded && (
                <div className="w-full pl-5 pb-3 divide-y divide-[#EAEAEA]">
                  {issuesList.map((issue: PublishingPreparationIssue) => (
                    <div
                      key={issue.id}
                      onClick={() => navigate(`/listings/${issue.sku === "OS-2048" ? "list-3" : issue.id}/blocked`)}
                      className="py-2.5 flex items-center justify-between text-xs hover:bg-neutral-50 px-2 rounded cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-medium text-black group-hover:underline">
                          {issue.productTitle}
                        </span>
                        <span className="text-neutral-500 font-mono text-[11px]">
                          ({issue.sku})
                        </span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-600">
                          {issue.channel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-[11px]">
                          {issue.issue}
                        </span>
                        <span className="text-[11px] font-semibold text-red-600 group-hover:underline">
                          Resolve →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Final Confirmation Preparation (Figma: Final confirmation preparation) */}
          <div className="w-full space-y-4 pt-2">
            <div className="w-full flex flex-row items-start py-5 border-y border-[#EAEAEA] gap-6 text-[12px]">
              {/* Left Column: Title & State */}
              <div className="w-[260px] flex flex-col items-start gap-1.5 shrink-0">
                <h3 className="text-[18px] font-semibold leading-[26px] text-[#000000]">
                  Final confirmation
                </h3>
                <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
                  Required before publishing
                </span>
              </div>

              {/* Right Column: Checkbox and Guidance */}
              <div className="flex-1 flex flex-col items-start gap-2.5">
                <span className="text-[14px] font-normal leading-[20px] text-[#000000]">
                  You must review and explicitly confirm before high-volume publishing.
                </span>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAcknowledged}
                    onChange={(e) => setIsAcknowledged(e.target.checked)}
                    className="w-3.5 h-3.5 border border-[#BDBDBD] rounded accent-black cursor-pointer"
                  />
                  <span className="text-[12px] font-normal leading-[17px] text-[#666666]">
                    I have reviewed the publishing scope and potential issues.
                  </span>
                </label>

                <span className="text-[11px] font-normal leading-[16px] text-[#666666]">
                  Acknowledgement and the final publishing action are on the confirmation step.
                </span>
              </div>
            </div>

            {/* Preparation Actions Footer (Figma: Preparation actions) */}
            <div className="w-full flex flex-row justify-between items-center pt-1 text-[12px]">
              <div className="flex flex-col items-start gap-1">
                <span className="font-semibold leading-[17px] text-[#000000]">
                  Continue advances to confirmation only.
                </span>
                <span className="font-normal leading-[17px] text-[#666666]">
                  Nothing is published from this preparation screen.
                </span>
              </div>

              <button
                onClick={handleContinue}
                className="w-24 h-9 flex items-center justify-center bg-white border border-[#666666] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer shadow-none"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STAGE 2: REVIEW STAGE (Channel-by-channel breakdown)
         ========================================================================= */}
      {currentStage === 2 && (
        <div className="w-full space-y-5 animate-in fade-in duration-200">
          <div className="w-full flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <div>
              <h2 className="text-lg font-semibold text-black">
                Channel Payload Review
              </h2>
              <p className="text-xs text-neutral-500">
                Verify target channel configurations for the 186 ready products.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(ROUTES.LISTINGS_READINESS)}
                className="text-xs font-semibold text-black hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>Open Readiness Diagnostic ↗</span>
              </button>
              <button
                onClick={() => setCurrentStage(1)}
                className="text-xs text-neutral-600 hover:text-black underline cursor-pointer"
              >
                ← Back to preparation
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            {/* Amazon */}
            <div className="p-4 rounded-lg border border-[#EAEAEA] bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-black text-sm">Amazon.in</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-medium">
                  84 ready
                </span>
              </div>
              <p className="text-neutral-500 text-[11px]">
                Target taxonomy: Apparel, Luggage, Home & Garden
              </p>
              <div className="text-[11px] text-neutral-600 pt-1 border-t border-neutral-100 flex justify-between">
                <span>Pricing rule: Standard + 0%</span>
                <span className="text-emerald-600">Sync: Real-time</span>
              </div>
            </div>

            {/* Flipkart */}
            <div className="p-4 rounded-lg border border-[#EAEAEA] bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-black text-sm">Flipkart</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-medium">
                  52 ready
                </span>
              </div>
              <p className="text-neutral-500 text-[11px]">
                Target taxonomy: Fashion & Lifestyle, Accessories
              </p>
              <div className="text-[11px] text-neutral-600 pt-1 border-t border-neutral-100 flex justify-between">
                <span>Pricing rule: Flipkart Gold Tier</span>
                <span className="text-emerald-600">Sync: Real-time</span>
              </div>
            </div>

            {/* Meesho */}
            <div className="p-4 rounded-lg border border-[#EAEAEA] bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-black text-sm">Meesho</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-medium">
                  32 ready
                </span>
              </div>
              <p className="text-neutral-500 text-[11px]">
                Target taxonomy: Luggage & Duffels, Ethnic Wear
              </p>
              <div className="text-[11px] text-neutral-600 pt-1 border-t border-neutral-100 flex justify-between">
                <span>Pricing rule: 0% Commission Net</span>
                <span className="text-emerald-600">Sync: Real-time</span>
              </div>
            </div>

            {/* Shopify */}
            <div className="p-4 rounded-lg border border-[#EAEAEA] bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-black text-sm">Shopify</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-medium">
                  18 ready
                </span>
              </div>
              <p className="text-neutral-500 text-[11px]">
                Target taxonomy: Direct to Consumer Storefront
              </p>
              <div className="text-[11px] text-neutral-600 pt-1 border-t border-neutral-100 flex justify-between">
                <span>Pricing rule: Web MSRP</span>
                <span className="text-emerald-600">Sync: Real-time</span>
              </div>
            </div>
          </div>

          <div className="w-full flex justify-between items-center pt-4 border-t border-[#EAEAEA]">
            <button
              onClick={() => setCurrentStage(1)}
              className="px-4 py-2 border border-[#BDBDBD] rounded-lg text-xs font-medium text-black hover:bg-neutral-50 cursor-pointer"
            >
              Previous step
            </button>
            <button
              onClick={() => setCurrentStage(3)}
              className="px-5 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Proceed to final confirmation →
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          STAGE 3: FINAL CONFIRMATION VIEW
         ========================================================================= */}
      {currentStage === 3 && (
        <div className="w-full space-y-5 animate-in fade-in duration-200">
          <div className="p-6 rounded-xl border border-neutral-200 bg-neutral-50 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold">
                ✓
              </div>
              <div>
                <h3 className="text-base font-semibold text-black">
                  Ready to trigger catalog publishing
                </h3>
                <p className="text-xs text-neutral-600">
                  You are about to publish 186 products (1,284 variants) across 4 marketplaces.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-neutral-200 bg-white space-y-2 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAcknowledged}
                  onChange={(e) => setIsAcknowledged(e.target.checked)}
                  className="w-4 h-4 mt-0.5 border border-[#BDBDBD] rounded accent-black cursor-pointer"
                />
                <span className="text-neutral-700 leading-relaxed">
                  I explicitly authorize Commerce OS to publish this catalog cohort to Amazon,
                  Flipkart, Meesho, and Shopify. Inventory allocation and pricing formulas will
                  be automatically locked during transit.
                </span>
              </label>
            </div>

            {confirmPublishMutation.isSuccess && (
              <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  High-volume publishing initiated successfully! Redirecting back to Listings overview…
                </span>
              </div>
            )}
          </div>

          <div className="w-full flex justify-between items-center pt-2">
            <button
              onClick={() => setCurrentStage(2)}
              className="px-4 py-2 border border-[#BDBDBD] rounded-lg text-xs font-medium text-black hover:bg-neutral-50 cursor-pointer"
            >
              ← Back to review
            </button>
            <button
              onClick={handleFinalPublish}
              disabled={confirmPublishMutation.isPending || !isAcknowledged}
              className="px-6 py-2.5 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {confirmPublishMutation.isPending ? (
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
