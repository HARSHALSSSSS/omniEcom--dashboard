import { useParams, useNavigate, Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useWorkspaceStore } from "@/store/workspace.store";
import { StepBusiness } from "./steps/StepBusiness";
import { StepChannels } from "./steps/StepChannels";
import { StepProducts } from "./steps/StepProducts";
import { StepInventory } from "./steps/StepInventory";
import { StepFulfillment } from "./steps/StepFulfillment";
import { StepComplete } from "./steps/StepComplete";
import { cn } from "@/utils/cn";

const ONBOARDING_STEPS = [
  { slug: "business", label: "01 Business", width: "75px" },
  { slug: "channels", label: "02 Sales Channels", width: "109px" },
  { slug: "products", label: "03 Products", width: "77px" },
  { slug: "inventory", label: "04 Inventory", width: "79px" },
  { slug: "fulfillment", label: "05 Fulfillment — Current", width: "130px" },
  { slug: "ready", label: "06 Ready", width: "50px" },
] as const;

export default function OnboardingPage() {
  const { step } = useParams<{ step: string }>();
  const navigate = useNavigate();
  const { completeOnboarding } = useWorkspaceStore();

  const currentStepSlug = step || "business";
  const currentIndex = ONBOARDING_STEPS.findIndex(
    (s) => s.slug === currentStepSlug,
  );
  const activeIndex = currentIndex === -1 ? 1 : currentIndex;

  const goToStep = (targetSlug: string) => {
    navigate(`${ROUTES.ONBOARDING}/${targetSlug}`);
  };

  const handleNext = () => {
    if (activeIndex < ONBOARDING_STEPS.length - 1) {
      goToStep(ONBOARDING_STEPS[activeIndex + 1].slug);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleSaveAndExit = () => {
    navigate(ROUTES.DASHBOARD);
  };

  const handleFinish = () => {
    completeOnboarding();
    navigate(ROUTES.DASHBOARD);
  };

  return (
    <div className="relative w-full min-h-screen bg-white flex flex-col font-sans select-none overflow-x-hidden">
      {/* Onboarding top navigation:
          box-sizing: border-box;
          display: flex; flex-direction: row; justify-content: space-between; align-items: center;
          padding: 0px 144px; width: 100%; height: 104px;
          background: #FFFFFF; border-bottom: 1px solid #EFEFEF; z-index: 20;
      */}
      <header className="h-[104px] w-full border-b border-[#EFEFEF] bg-white flex items-center justify-between px-6 sm:px-12 xl:px-[144px] shrink-0 z-20">
        {/* Wordmark: width: 138px; height: 22px; font-weight: 600; font-size: 18px; line-height: 22px; color: #0A0A0A; */}
        <Link
          to={ROUTES.DASHBOARD}
          className="text-[18px] font-semibold leading-[22px] text-[#0A0A0A] shrink-0 tracking-normal"
        >
          [Product Name]
        </Link>

        {/* Journey progress: width: 567px; height: 28px; gap: 12px; */}
        <div className="hidden md:flex items-start gap-[12px] h-[28px]">
          {ONBOARDING_STEPS.map((s, idx) => {
            const isCurrent = idx === activeIndex;
            const isCompleted = idx < activeIndex;

            // In Figma: Current step has "04 Inventory — Current", completed steps have checkmark or label
            let labelText: string = s.label;
            if (isCompleted) {
              // e.g. "01 Business ✓"
              const baseName = s.label.replace(" — Current", "");
              labelText = `${baseName} ✓`;
            } else if (!isCurrent) {
              labelText = s.label.replace(" — Current", "");
            }

            return (
              <button
                key={s.slug}
                type="button"
                onClick={() => goToStep(s.slug)}
                style={{ width: s.width }}
                className="flex flex-col items-start gap-[10px] h-[28px] cursor-pointer text-left shrink-0"
              >
                {/* Progress line */}
                <div
                  style={{ width: s.width }}
                  className={cn(
                    "h-[2px] transition-colors",
                    isCurrent || isCompleted ? "bg-[#000000]" : "bg-[#EAEAEA]",
                  )}
                />

                {/* Step label */}
                <span
                  style={{ width: s.width }}
                  className={cn(
                    "text-[11px] leading-[145%] truncate block transition-colors",
                    isCurrent
                      ? "font-semibold text-[#000000]"
                      : isCompleted
                        ? "font-normal text-[#666666]"
                        : "font-normal text-[#666666]",
                  )}
                >
                  {labelText}
                </span>
              </button>
            );
          })}
        </div>

        {/* Save & exit button:
            width: 128px; height: 40px; padding: 0px 16px; background: #FFFFFF; border-radius: 8px;
            font-weight: 600; font-size: 12px; line-height: 145%; color: #000000;
        */}
        <button
          type="button"
          onClick={handleSaveAndExit}
          className="w-[128px] h-[40px] px-4 rounded-[8px] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-[#F7F7F7] transition-colors cursor-pointer shrink-0"
        >
          Save & exit
        </button>
      </header>

      {/* Main Step Content */}
      <main className="flex-1 flex flex-col justify-start relative z-10">
        {(currentStepSlug === "business" || activeIndex === 0) && (
          <StepBusiness onNext={handleNext} />
        )}
        {currentStepSlug === "channels" && (
          <StepChannels onNext={handleNext} onSkip={handleSkip} />
        )}
        {(currentStepSlug === "products" || currentStepSlug === "connect") && (
          <StepProducts onNext={handleNext} onSkip={handleSkip} />
        )}
        {(currentStepSlug === "inventory" || currentStepSlug === "catalog") && (
          <StepInventory onNext={handleNext} onSkip={handleSkip} />
        )}
        {currentStepSlug === "fulfillment" && (
          <StepFulfillment onNext={handleNext} onSkip={handleSkip} />
        )}
        {(currentStepSlug === "complete" || currentStepSlug === "ready") && (
          <StepComplete
            onFinish={handleFinish}
            onReview={() => goToStep("business")}
          />
        )}
      </main>
    </div>
  );
}
