import React, { useState } from "react";
import {
  ShoppingBag,
  Store,
  Building2,
  Boxes,
  MessageSquare,
  MoreHorizontal,
  Check,
  LocateFixed,
  type LucideIcon,
} from "lucide-react";
import { ApiError } from "@/api/errors";
import type { BusinessType, OnboardingOptions, TeamSize } from "@/api/onboarding.api";
import { useOnboardingOptions, useSaveBusiness } from "@/hooks/useOnboarding";
import { FieldError, InlineError, Spinner, StepError, StepLoading } from "@/components/onboarding/wizard";
import { useSavedDraft, useWizard, useWizardDraft } from "@/components/onboarding/wizardContext";
import { cn } from "@/utils/cn";

const TYPE_ICONS: Record<BusinessType, LucideIcon> = {
  d2c_brand: ShoppingBag,
  marketplace_seller: Store,
  retail: Building2,
  wholesaler: Boxes,
  social_commerce: MessageSquare,
  other: MoreHorizontal,
};

const TIERS = [
  { key: "starter", label: "Starter" },
  { key: "growing", label: "Growing" },
  { key: "scale", label: "Scale" },
] as const;

/** the same rule the server uses for the workspace tier */
const tierOf = (size: TeamSize): (typeof TIERS)[number]["key"] =>
  size === "21_50" || size === "50_plus" ? "scale" : size === "6_20" ? "growing" : "starter";

type Draft = { businessName: string; businessType: BusinessType; teamSize: TeamSize; operatingLocation: string };

export const StepBusiness: React.FC = () => {
  const options = useOnboardingOptions();
  if (options.isPending) return <StepLoading label="Loading business options" />;
  if (options.isError) return <StepError error={options.error} onRetry={() => void options.refetch()} />;
  return <BusinessForm options={options.data} />;
};

const BusinessForm: React.FC<{ options: OnboardingOptions }> = ({ options }) => {
  const { progress, canWrite, advance } = useWizard();
  const saved = useSavedDraft<Draft>("business");
  const save = useSaveBusiness();

  // the server's saved profile (or the draft from "Save & exit") is the start; typing is only a buffer until Continue succeeds
  const [businessName, setBusinessName] = useState(saved?.businessName ?? progress.business.businessName ?? "");
  const [selectedType, setSelectedType] = useState<BusinessType>(saved?.businessType ?? progress.business.businessType ?? "d2c_brand");
  const [teamSize, setTeamSize] = useState<TeamSize>(saved?.teamSize ?? progress.business.teamSize ?? "just_me");
  const [city, setCity] = useState(saved?.operatingLocation ?? progress.business.operatingLocation ?? "");
  const [touched, setTouched] = useState(false);

  useWizardDraft(() => ({ businessName, businessType: selectedType, teamSize, operatingLocation: city }));

  const local: Record<string, string> = {};
  if (businessName.trim().length < 2) local.businessName = "Enter your business or brand name (at least 2 characters).";
  else if (businessName.trim().length > 120) local.businessName = "Keep the name under 120 characters.";
  if (city.trim().length < 2) local.operatingLocation = "Tell us where you operate from, for example Mumbai, Maharashtra.";
  else if (city.trim().length > 160) local.operatingLocation = "Keep the location under 160 characters.";

  const serverFields = save.error instanceof ApiError ? save.error.fields : null;
  const fieldError = (key: string) => (touched ? local[key] : undefined) ?? serverFields?.[key];
  const generalError = save.isError && !serverFields ? save.error : null;

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(local).length || !canWrite || save.isPending) return;
    save.mutate(
      { businessName: businessName.trim(), businessType: selectedType, teamSize, operatingLocation: city.trim() },
      { onSuccess: (res) => advance(res.state) },
    );
  };

  const tier = tierOf(teamSize);
  const busy = save.isPending;

  return (
    <div className="relative w-full min-h-[calc(100vh-104px)] bg-[#FFFFFF] flex flex-col justify-center overflow-hidden">
      {/* Editorial background (dark left column backdrop - completely clean black) */}
      <div className="pointer-events-none hidden lg:block absolute left-0 top-0 bottom-0 w-[519px] bg-[#0A0A0A] z-0" />

      {/* Atmospheric gradient restricted ONLY to the right side:
          Pure white at top & left, dark/charcoal-grey at the bottom-right */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 left-0 lg:left-[519px] z-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 85% at 90% 95%, rgba(45, 45, 45, 0.42) 0%, rgba(130, 130, 130, 0.28) 32%, rgba(215, 215, 215, 0.12) 60%, rgba(255, 255, 255, 0) 80%), linear-gradient(175deg, #FFFFFF 0%, #FFFFFF 38%, #F7F7F7 58%, #E5E5E5 82%, #CCCCCC 100%)",
        }}
      />

      {/* Main Content Layout */}
      <div className="relative z-10 w-full flex flex-col lg:flex-row items-start justify-start pt-[56px] pb-[40px] pl-6 sm:pl-16 lg:pl-[90px] pr-6 sm:pr-12 lg:pr-[72px] xl:pr-[96px] gap-[32px] lg:gap-[80px] xl:gap-[100px]">
        {/* Left Column: Protruding pure black rounded card */}
        <div className="relative shrink-0 flex items-center w-full lg:w-auto px-4 sm:px-8 lg:px-0">
          <div className="w-full lg:w-[500px] xl:w-[555px] min-h-[680px] lg:h-[750px] bg-[#000000] rounded-[32px] lg:rounded-none lg:rounded-r-[42px] px-8 lg:px-[60px] xl:px-[72px] pt-8 lg:pt-10 pb-8 lg:pb-10 text-white flex flex-col justify-between shrink-0 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
            {/* Top Story & Architecture */}
            <div className="flex flex-col">
              <span className="text-[10px] font-medium leading-none uppercase text-[#737373] tracking-[0.08em]">
                BUSINESS PROFILE
              </span>

              <h1 className="mt-5 text-[38px] sm:text-[44px] xl:text-[48px] font-bold leading-[1.08] text-white tracking-[-0.025em]">
                Tell us about
                <br />
                your business.
              </h1>

              <p className="mt-4 text-[13.5px] font-normal leading-[1.6] text-[#8E8E8E] max-w-[310px]">
                This helps us tailor your workspace. You can change these details later.
              </p>

              {/* Architecture Links */}
              <div className="mt-12 flex flex-col">
                {/* YOUR BUSINESS */}
                <div className="flex items-center justify-between py-1 cursor-default">
                  <span className="text-[15px] font-semibold leading-none text-white tracking-[0.02em]">
                    YOUR BUSINESS
                  </span>
                  <span className="text-[16px] font-light leading-none text-[#8E8E8E]">
                    →
                  </span>
                </div>

                <div className="h-[1px] w-full bg-[#1F1F1F] my-4" />

                {/* YOUR CHANNELS */}
                <div className="flex items-center justify-between py-1 cursor-default">
                  <span className="text-[15px] font-normal leading-none text-[#737373] tracking-[0.02em]">
                    YOUR CHANNELS
                  </span>
                  <span className="text-[16px] font-light leading-none text-[#737373]">
                    →
                  </span>
                </div>

                <div className="h-[1px] w-full bg-[#1F1F1F] my-4" />

                {/* YOUR OPERATIONS */}
                <div className="flex flex-col pt-1">
                  <span className="text-[15px] font-normal leading-none text-[#737373] tracking-[0.02em]">
                    YOUR OPERATIONS
                  </span>
                  <div className="flex items-center gap-5 mt-4 text-[11px] font-normal leading-none text-[#737373]">
                    <span>Products</span>
                    <span>Orders</span>
                    <span>Inventory</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom time note */}
            <div className="pt-6 text-[11.5px] font-normal leading-none text-[#737373]">
              Setup takes about 3 minutes.
            </div>
          </div>
        </div>

        {/* Right Column: Form Area stretching to the complete width */}
        <div className="flex-1 min-w-0 w-full flex items-start justify-start mt-8 lg:mt-0">
          <form onSubmit={handleContinue} noValidate aria-busy={busy} className="w-full flex flex-col">
            {/* Form Title & Subtitle */}
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[24px] sm:text-[26px] font-bold leading-[1.2] text-[#0A0A0A] tracking-[-0.02em]">
                Let's set up your business
              </h2>
              <p className="text-[12.5px] font-normal leading-[1.4] text-[#737373]">
                Start with the basics. We'll help you configure the rest as you grow.
              </p>
            </div>

            {/* Business / Brand Name */}
            <div className="mt-6 flex flex-col gap-2">
              <label htmlFor="onb-business-name" className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                Business / Brand name
              </label>
              <div className={cn("h-[42px] w-full rounded-[10px] border bg-white px-3.5 flex items-center focus-within:border-[#0A0A0A] transition-colors", fieldError("businessName") ? "border-[#B42318]" : "border-[#E5E5E5]")}>
                <input
                  id="onb-business-name"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={!canWrite}
                  maxLength={120}
                  autoComplete="organization"
                  aria-invalid={!!fieldError("businessName")}
                  aria-describedby="onb-business-name-hint"
                  placeholder="e.g. Nova Living"
                  className="w-full bg-transparent text-[12.5px] text-[#0A0A0A] placeholder-[#A3A3A3] outline-none disabled:opacity-60"
                />
              </div>
              <p id="onb-business-name-hint" className="text-[10.5px] font-normal leading-none text-[#8E8E8E]">
                The name customers know your business by.
              </p>
              <FieldError message={fieldError("businessName")} />
            </div>

            {/* What best describes your business? */}
            <div className="mt-6 flex flex-col gap-2.5">
              <span id="onb-type-label" className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                What best describes your business?
              </span>

              {/* 2-column grid of options (from GET /onboarding/options) */}
              <div role="radiogroup" aria-labelledby="onb-type-label" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {options.businessTypes.map((bt) => {
                  const Icon = TYPE_ICONS[bt.value] ?? MoreHorizontal;
                  const isSelected = selectedType === bt.value;
                  return (
                    <button
                      key={bt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!canWrite}
                      onClick={() => setSelectedType(bt.value)}
                      className={cn(
                        "h-[56px] rounded-[14px] px-3.5 flex items-center justify-between text-left border transition-all cursor-pointer disabled:cursor-not-allowed",
                        isSelected
                          ? "bg-[#F5F5F5] border-[#262626]"
                          : "bg-white border-transparent hover:border-[#E5E5E5] shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-1">
                        <Icon className="h-[16px] w-[16px] text-[#171717] shrink-0 stroke-[1.7]" />
                        <div className="flex flex-col min-w-0 gap-0.5">
                          <span className="text-[12px] font-bold leading-[1.2] text-[#0A0A0A]">
                            {bt.label}
                          </span>
                          <span className="text-[10.5px] font-normal leading-[1.2] text-[#8E8E8E] truncate">
                            {bt.description}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-[#0A0A0A] shrink-0 stroke-[2] ml-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Team Size */}
            <div className="mt-6 flex flex-col gap-2">
              <span id="onb-team-label" className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                How many people manage the business?
              </span>
              <div role="radiogroup" aria-labelledby="onb-team-label" className="h-[40px] w-full rounded-[10px] bg-[#F5F5F5] p-[3px] flex items-center">
                {options.teamSizes.map((ts) => {
                  const isSelected = teamSize === ts.value;
                  return (
                    <button
                      key={ts.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!canWrite}
                      onClick={() => setTeamSize(ts.value)}
                      className={cn(
                        "flex-1 h-full rounded-[7px] flex items-center justify-center text-[12px] transition-all cursor-pointer disabled:cursor-not-allowed",
                        isSelected
                          ? "bg-white text-[#0A0A0A] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                          : "text-[#737373] font-normal hover:text-[#0A0A0A]",
                      )}
                    >
                      {ts.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Location */}
            <div className="mt-6 flex flex-col gap-2">
              <label htmlFor="onb-location" className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                Where do you operate from?
              </label>
              <div className={cn("h-[42px] w-full rounded-[10px] border bg-white px-3.5 flex items-center gap-2.5 focus-within:border-[#0A0A0A] transition-colors", fieldError("operatingLocation") ? "border-[#B42318]" : "border-[#E5E5E5]")}>
                <LocateFixed className="h-3.5 w-3.5 text-[#A3A3A3] shrink-0 stroke-[1.6]" />
                <input
                  id="onb-location"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={!canWrite}
                  maxLength={160}
                  aria-invalid={!!fieldError("operatingLocation")}
                  aria-describedby="onb-location-hint"
                  placeholder="Search city or enter location"
                  className="w-full bg-transparent text-[12.5px] text-[#0A0A0A] placeholder-[#A3A3A3] outline-none disabled:opacity-60"
                />
              </div>
              <p id="onb-location-hint" className="text-[10.5px] font-normal leading-none text-[#737373]">
                e.g. Mumbai, Maharashtra
              </p>
              <FieldError message={fieldError("operatingLocation")} />
            </div>

            {/* Workspace Preview */}
            <div className="mt-6 border-t border-[#E5E5E5] pt-3.5 flex flex-col gap-1.5">
              <span className="text-[8.5px] font-semibold leading-none uppercase text-[#737373] tracking-[0.06em]">
                WORKSPACE PREVIEW
              </span>
              <div className="flex items-center justify-between text-[11px] leading-normal text-[#737373]">
                <span>Your workspace will adapt to your business as it grows.</span>
                <span className="text-[#737373]" aria-label={`Workspace tier: ${tier}`}>
                  {TIERS.map((t, i) => (
                    <React.Fragment key={t.key}>
                      {i > 0 && " → "}
                      <span className={t.key === tier ? "font-semibold text-[#0A0A0A]" : undefined}>{t.label}</span>
                    </React.Fragment>
                  ))}
                </span>
              </div>
            </div>

            {/* Continue Action */}
            <div className="mt-5 flex flex-col items-end gap-2.5">
              <InlineError error={generalError} className="w-full" />
              <button
                type="submit"
                disabled={busy || !canWrite}
                className="w-[150px] h-[42px] rounded-[12px] bg-[#0A0A0A] text-white flex items-center justify-center gap-1.5 hover:bg-[#1F1F1F] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Spinner />
                    <span className="text-[12px] font-semibold leading-none text-white">Saving…</span>
                  </>
                ) : (
                  <>
                    <span className="text-[12px] font-semibold leading-none text-white">Continue</span>
                    <span className="text-white text-[13px] leading-none">→</span>
                  </>
                )}
              </button>
              <span className="text-[10.5px] font-normal leading-none text-[#8E8E8E]">
                You can update these details anytime in Settings.
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
