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
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepBusinessProps {
  onNext: () => void;
}

const BUSINESS_TYPES = [
  {
    id: "d2c_brand",
    title: "D2C Brand",
    description: "Sell your own brand directly.",
    icon: ShoppingBag,
  },
  {
    id: "marketplace_seller",
    title: "Marketplace Seller",
    description: "Sell on online marketplaces.",
    icon: Store,
  },
  {
    id: "retail_business",
    title: "Retail Business",
    description: "Sell through physical stores.",
    icon: Building2,
  },
  {
    id: "wholesaler",
    title: "Wholesaler",
    description: "Supply products to businesses.",
    icon: Boxes,
  },
  {
    id: "social_commerce",
    title: "Social Commerce",
    description: "Sell through social channels.",
    icon: MessageSquare,
  },
  {
    id: "other",
    title: "Other",
    description: "Build a business your way.",
    icon: MoreHorizontal,
  },
];

const TEAM_SIZES = [
  { id: "just_me", label: "Just me" },
  { id: "2-5", label: "2–5" },
  { id: "6-20", label: "6–20" },
  { id: "21-50", label: "21–50" },
  { id: "50+", label: "50+" },
];

export const StepBusiness: React.FC<StepBusinessProps> = ({ onNext }) => {
  const { onboardingData, updateOnboardingData, user, setUser } =
    useWorkspaceStore();

  const [businessName, setBusinessName] = useState(
    onboardingData.business.name || user?.businessName || "",
  );
  const [selectedType, setSelectedType] = useState(
    onboardingData.business.type || "d2c_brand",
  );
  const [teamSize, setTeamSize] = useState(
    onboardingData.business.teamSize || "just_me",
  );
  const [city, setCity] = useState(
    onboardingData.business.city || "",
  );

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    updateOnboardingData({
      business: {
        name: businessName || "Nova Living",
        type: selectedType,
        teamSize,
        city: city || "Mumbai, Maharashtra",
      },
    });

    if (user) {
      setUser({
        ...user,
        businessName: businessName || "Nova Living",
        businessType: selectedType,
        teamSize,
        city: city || "Mumbai, Maharashtra",
      });
    }

    onNext();
  };

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
          <form
            onSubmit={handleContinue}
            className="w-full flex flex-col"
          >
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
              <label className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                Business / Brand name
              </label>
              <div className="h-[42px] w-full rounded-[10px] border border-[#E5E5E5] bg-white px-3.5 flex items-center focus-within:border-[#0A0A0A] transition-colors">
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Nova Living"
                  className="w-full bg-transparent text-[12.5px] text-[#0A0A0A] placeholder-[#A3A3A3] outline-none"
                />
              </div>
              <p className="text-[10.5px] font-normal leading-none text-[#8E8E8E]">
                The name customers know your business by.
              </p>
            </div>

            {/* What best describes your business? */}
            <div className="mt-6 flex flex-col gap-2.5">
              <label className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                What best describes your business?
              </label>

              {/* 2-column grid: 3 rows of options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {BUSINESS_TYPES.map((bt) => {
                  const Icon = bt.icon;
                  const isSelected = selectedType === bt.id;
                  return (
                    <button
                      key={bt.id}
                      type="button"
                      onClick={() => setSelectedType(bt.id)}
                      className={cn(
                        "h-[56px] rounded-[14px] px-3.5 flex items-center justify-between text-left border transition-all cursor-pointer",
                        isSelected
                          ? "bg-[#F5F5F5] border-[#262626]"
                          : "bg-white border-transparent hover:border-[#E5E5E5] shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-1">
                        <Icon className="h-[16px] w-[16px] text-[#171717] shrink-0 stroke-[1.7]" />
                        <div className="flex flex-col min-w-0 gap-0.5">
                          <span className="text-[12px] font-bold leading-[1.2] text-[#0A0A0A]">
                            {bt.title}
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
              <label className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                How many people manage the business?
              </label>
              <div className="h-[40px] w-full rounded-[10px] bg-[#F5F5F5] p-[3px] flex items-center">
                {TEAM_SIZES.map((ts) => {
                  const isSelected = teamSize === ts.id;
                  return (
                    <button
                      key={ts.id}
                      type="button"
                      onClick={() => setTeamSize(ts.id)}
                      className={cn(
                        "flex-1 h-full rounded-[7px] flex items-center justify-center text-[12px] transition-all cursor-pointer",
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
              <label className="text-[12.5px] font-semibold leading-none text-[#0A0A0A]">
                Where do you operate from?
              </label>
              <div className="h-[42px] w-full rounded-[10px] border border-[#E5E5E5] bg-white px-3.5 flex items-center gap-2.5 focus-within:border-[#0A0A0A] transition-colors">
                <LocateFixed className="h-3.5 w-3.5 text-[#A3A3A3] shrink-0 stroke-[1.6]" />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Search city or enter location"
                  className="w-full bg-transparent text-[12.5px] text-[#0A0A0A] placeholder-[#A3A3A3] outline-none"
                />
              </div>
              <p className="text-[10.5px] font-normal leading-none text-[#737373]">
                e.g. Mumbai, Maharashtra
              </p>
            </div>

            {/* Workspace Preview */}
            <div className="mt-6 border-t border-[#E5E5E5] pt-3.5 flex flex-col gap-1.5">
              <span className="text-[8.5px] font-semibold leading-none uppercase text-[#737373] tracking-[0.06em]">
                WORKSPACE PREVIEW
              </span>
              <div className="flex items-center justify-between text-[11px] leading-normal text-[#737373]">
                <span>Your workspace will adapt to your business as it grows.</span>
                <span className="text-[#737373]">Starter → Growing → Scale</span>
              </div>
            </div>

            {/* Continue Action */}
            <div className="mt-5 flex flex-col items-end gap-2.5">
              <button
                type="submit"
                className="w-[150px] h-[42px] rounded-[12px] bg-[#0A0A0A] text-white flex items-center justify-center gap-1.5 hover:bg-[#1F1F1F] transition-colors cursor-pointer"
              >
                <span className="text-[12px] font-semibold leading-none text-white">
                  Continue
                </span>
                <span className="text-white text-[13px] leading-none">→</span>
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