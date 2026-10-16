import React, { useState } from "react";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepFulfillmentProps {
  onNext: () => void;
  onSkip: () => void;
}

export const StepFulfillment: React.FC<StepFulfillmentProps> = ({
  onNext,
  onSkip,
}) => {
  const { onboardingData, updateOnboardingData } = useWorkspaceStore();

  const [method, setMethod] = useState<
    "marketplace" | "seller" | "third_party"
  >(onboardingData.fulfillment?.method || "marketplace");

  const [preference, setPreference] = useState(
    onboardingData.fulfillment?.preference || "Recommended for most orders",
  );

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [shippingProviderConnected, setShippingProviderConnected] = useState(false);

  const handleContinue = () => {
    updateOnboardingData({
      fulfillment: {
        method,
        preference,
      },
    });
    onNext();
  };

  const fulfillmentOptions = [
    {
      id: "marketplace" as const,
      title: "Marketplace Shipping",
      desc: "Use the shipping service provided by the marketplace when available.",
      sub: "Marketplace service · When supported",
    },
    {
      id: "seller" as const,
      title: "Seller Shipping",
      desc: "Manage shipping through your own configured logistics provider.",
      sub: "Your logistics · Your control",
    },
    {
      id: "third_party" as const,
      title: "Third-party Shipping",
      desc: "Use a connected shipping or logistics provider.",
      sub: "Connected provider · Connection required",
    },
  ];

  const preferenceOptions = [
    "Recommended for most orders",
    "Lowest shipping rate first",
    "Fastest delivery time",
    "Manual selection per order",
  ];

  return (
    <div className="relative w-full min-h-[1012px] bg-[#FFFFFF] flex flex-col justify-start overflow-hidden">
      {/* Background Gradient matching StepBusiness: clean white at top/left, soft dark radial fade at bottom-right */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 85% at 90% 95%, rgba(45, 45, 45, 0.42) 0%, rgba(130, 130, 130, 0.28) 32%, rgba(215, 215, 215, 0.12) 60%, rgba(255, 255, 255, 0) 80%), linear-gradient(175deg, #FFFFFF 0%, #FFFFFF 38%, #F7F7F7 58%, #E5E5E5 82%, #CCCCCC 100%)",
        }}
      />

      {/* Main Content Layout matching Figma spec:
          padding: 40px 144px;
          gap: 32px;
          width: 1440px max-w;
      */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-6 sm:px-12 xl:px-[144px] pt-[40px] pb-[32px] flex flex-col gap-[32px]">
        {/* Fulfillment introduction: width: 1152px; gap: 16px; */}
        <div className="flex flex-col gap-[16px] w-full">
          <h1 className="text-[32px] sm:text-[38px] lg:text-[40px] font-semibold leading-[1.15] text-[#000000] tracking-[-0.02em]">
            How will you fulfill your orders?
          </h1>
          <p className="text-[14px] font-normal leading-[1.65] text-[#666666] max-w-[815px]">
            Choose how orders should be shipped. You can change these preferences later for individual marketplaces, warehouses or products.
          </p>
        </div>

        {/* Shipping workspace:
            display: flex; flex-direction: row; gap: 64px;
            width: 1152px; border-top: 1px solid #EAEAEA; padding-top: 24px;
        */}
        <div className="border-t border-[#EAEAEA] pt-[24px] grid grid-cols-1 lg:grid-cols-12 gap-[64px] items-start w-full">
          {/* Left Column: Fulfillment configuration (720px width / approx 7 cols in 12-col grid) */}
          <div className="lg:col-span-7 flex flex-col gap-[24px] w-full max-w-[720px]">
            {/* Default fulfillment method */}
            <div className="flex flex-col gap-[16px] w-full">
              <h2 className="text-[18px] font-semibold leading-[1.45] text-[#000000]">
                Default fulfillment method
              </h2>

              {/* Fulfillment methods list: gap 8px */}
              <div className="flex flex-col gap-[8px] w-full">
                {fulfillmentOptions.map((opt) => {
                  const isSelected = method === opt.id;
                  return (
                    <div
                      key={opt.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setMethod(opt.id)}
                      className={cn(
                        "w-full min-h-[96px] sm:h-[100px] rounded-[12px] p-[12px] flex flex-row items-center gap-[8px] cursor-pointer transition-all text-left select-none box-border",
                        isSelected
                          ? "bg-[#F5F5F5] border border-[#000000]"
                          : "bg-[#FFFFFF] border border-[#EAEAEA] hover:border-[#CCCCCC]",
                      )}
                    >
                      {/* Radio selection control */}
                      <div className="w-[32px] h-[32px] rounded-[16px] flex items-center justify-center shrink-0">
                        <div className="w-[18px] h-[18px] rounded-[9px] bg-white border border-[#000000] flex items-center justify-center box-border">
                          {isSelected && (
                            <div className="w-[8px] h-[8px] rounded-[4px] bg-[#000000]" />
                          )}
                        </div>
                      </div>

                      {/* Method details */}
                      <div className="flex-1 flex flex-col justify-center min-w-0">
                        <span className="text-[13px] font-semibold leading-[1.5] text-[#000000]">
                          {opt.title}
                        </span>
                        <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                          {opt.desc}
                        </p>
                        <p className="text-[11px] font-normal leading-[1.45] text-[#8E8E8E] mt-[2px]">
                          {opt.sub}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Default preference */}
            <div className="flex flex-col gap-[8px] w-full">
              {/* Preference dropdown */}
              <div className="flex flex-col gap-[6px] w-full relative">
                <label className="text-[12px] font-medium leading-[1.45] text-[#333333]">
                  Your default preference
                </label>

                {/* Dropdown Control: height 40px, border: 1px solid #666666 */}
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full h-[40px] px-[12px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] flex flex-row items-center justify-between box-border text-left cursor-pointer"
                >
                  <span className="text-[13px] font-normal leading-[1.45] text-[#333333] truncate">
                    {preference}
                  </span>
                  <div className="w-[16px] h-[16px] flex items-center justify-center shrink-0 text-[#000000]">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2.5 4.5L6 8L9.5 4.5"
                        stroke="#000000"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>

                {/* Dropdown list */}
                {dropdownOpen && (
                  <div className="absolute top-[68px] left-0 w-full bg-white border border-[#EAEAEA] rounded-[8px] shadow-lg py-1 z-30">
                    {preferenceOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setPreference(opt);
                          setDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-[13px] hover:bg-[#F5F5F5] transition-colors",
                          preference === opt ? "font-semibold text-black" : "text-[#333333]",
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Override guidance */}
              <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                You can override this preference when supported.
              </p>
            </div>

            {/* Shipping connections */}
            <div className="flex flex-col gap-[8px] w-full pt-[8px]">
              <h2 className="text-[18px] font-semibold leading-[1.45] text-[#000000]">
                Shipping connections
              </h2>

              {/* Row 1: Marketplace connection (height: 76px, border-b: 1px solid #EAEAEA) */}
              <div className="w-full min-h-[76px] border-b border-[#EAEAEA] flex flex-row items-center justify-between gap-[16px] py-3 box-border">
                <div className="flex flex-col gap-[4px] min-w-0">
                  <span className="text-[13px] font-semibold leading-[1.45] text-[#000000]">
                    Marketplace Shipping
                  </span>
                  <span className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                    Available through connected marketplaces
                  </span>
                </div>

                {/* Availability badge: width 80px, height 26px, bg #F5F5F5, border 1px solid #EAEAEA */}
                <div className="w-[80px] h-[26px] bg-[#F5F5F5] border border-[#EAEAEA] rounded-[4px] px-[8px] flex flex-row items-center justify-center gap-[5px] shrink-0 box-border">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2.5 6.5L4.5 8.5L9.5 3.5"
                      stroke="#333333"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[11px] font-normal leading-[1.45] text-[#333333]">
                    Available
                  </span>
                </div>
              </div>

              {/* Row 2: Provider connection (height: 76px, border-b: 1px solid #EAEAEA) */}
              <div className="w-full min-h-[76px] border-b border-[#EAEAEA] flex flex-row items-center justify-between gap-[16px] py-3 box-border">
                <div className="flex flex-col gap-[4px] min-w-0">
                  <span className="text-[13px] font-semibold leading-[1.45] text-[#000000]">
                    Third-party provider
                  </span>
                  <span className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                    {shippingProviderConnected ? "Shiprocket connected" : "Connect a shipping provider"}
                  </span>
                </div>

                {/* Connection action button: width 88px, height 40px, border 1px solid #666666 */}
                <button
                  type="button"
                  onClick={() => setShippingProviderConnected(!shippingProviderConnected)}
                  className="w-[88px] h-[40px] px-[16px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] flex items-center justify-center text-[12px] font-semibold leading-[1.45] text-[#000000] hover:bg-[#F9F9F9] transition-colors cursor-pointer shrink-0 box-border"
                >
                  {shippingProviderConnected ? "Manage" : "Connect"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Shipping overview (368px width / border-left: 1px solid #EAEAEA; padding-left: 32px;) */}
          <div className="lg:col-span-5 flex flex-col gap-[24px] w-full lg:border-l lg:border-[#EAEAEA] lg:pl-[32px] max-w-[368px]">
            {/* Preferences preview */}
            <div className="flex flex-col gap-[16px] w-full">
              {/* Preview heading */}
              <div className="flex flex-row justify-between items-center w-full h-[19px]">
                <span className="text-[13px] font-semibold leading-[1.45] text-[#000000]">
                  Your shipping preferences
                </span>
                <span className="text-[11px] font-normal leading-[1.45] text-[#666666]">
                  Preview
                </span>
              </div>

              {/* Preference rows: 3 items (68px height each, border-b: 1px solid #EAEAEA) */}
              <div className="flex flex-col w-full bg-[#FFFFFF] rounded-[8px]">
                {/* Row 1: Marketplace / Amazon */}
                <div className="h-[68px] border-b border-[#EAEAEA] flex flex-row items-center justify-between px-[12px] box-border">
                  <span className="text-[12px] font-semibold leading-[1.45] text-[#333333]">
                    Marketplace / Amazon
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-normal leading-[1.45] text-[#333333]">
                      Marketplace Shipping
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-normal leading-[1.45] text-[#000000] underline hover:text-[#4A4A4A] cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Row 2: Marketplace / Flipkart */}
                <div className="h-[68px] border-b border-[#EAEAEA] flex flex-row items-center justify-between px-[12px] box-border">
                  <span className="text-[12px] font-semibold leading-[1.45] text-[#333333]">
                    Marketplace / Flipkart
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-normal leading-[1.45] text-[#333333]">
                      Marketplace Shipping
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-normal leading-[1.45] text-[#000000] underline hover:text-[#4A4A4A] cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Row 3: Other orders */}
                <div className="h-[68px] border-b border-[#EAEAEA] flex flex-row items-center justify-between px-[12px] box-border">
                  <span className="text-[12px] font-semibold leading-[1.45] text-[#333333]">
                    Other orders
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-normal leading-[1.45] text-[#333333]">
                      Default preference
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-normal leading-[1.45] text-[#000000] underline hover:text-[#4A4A4A] cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced rules guidance */}
              <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                Manage advanced shipping rules later
              </p>
            </div>

            {/* Order process flow */}
            <div className="flex flex-col items-center pt-[8px] gap-[12px] w-full">
              <span className="w-full text-left text-[11px] font-medium leading-[1.45] uppercase tracking-[0.04em] text-[#000000]">
                FROM ORDER TO DISPATCH
              </span>

              {/* Fulfillment flow vertical steps */}
              <div className="w-full flex flex-col items-center gap-[4px] py-1">
                {/* Step 1: Order received */}
                <div className="flex flex-col items-center gap-[4px]">
                  <span className="text-[13px] font-normal leading-[1.45] text-[#000000]">
                    Order received
                  </span>
                  <span className="text-[16px] leading-[18px] text-[#000000]">↓</span>
                </div>

                {/* Step 2: Pick */}
                <div className="flex flex-col items-center gap-[4px]">
                  <span className="text-[13px] font-normal leading-[1.45] text-[#000000]">
                    Pick
                  </span>
                  <span className="text-[16px] leading-[18px] text-[#000000]">↓</span>
                </div>

                {/* Step 3: Pack */}
                <div className="flex flex-col items-center gap-[4px]">
                  <span className="text-[13px] font-normal leading-[1.45] text-[#000000]">
                    Pack
                  </span>
                  <span className="text-[16px] leading-[18px] text-[#000000]">↓</span>
                </div>

                {/* Step 4: Shipping */}
                <div className="flex flex-col items-center gap-[4px]">
                  <span className="text-[13px] font-normal leading-[1.45] text-[#000000]">
                    Shipping
                  </span>
                  <span className="text-[16px] leading-[18px] text-[#000000]">↓</span>
                </div>

                {/* Step 5: Dispatch */}
                <div className="flex flex-col items-center">
                  <span className="text-[13px] font-normal leading-[1.45] text-[#000000]">
                    Dispatch
                  </span>
                </div>
              </div>

              {/* Footnote reassurance */}
              <p className="w-full text-left text-[11px] font-normal leading-[1.45] text-[#8E8E8E] mt-1">
                One workspace to manage each step, with shipping based on your preferences.
              </p>
            </div>
          </div>
        </div>

        {/* Shipping availability insight banner:
            width: 1152px; height: 48px; background: #F5F5F5; border: 1px solid #EAEAEA; border-radius: 8px;
            padding: 14px; gap: 10px;
        */}
        <div className="w-full max-w-[1152px] min-h-[48px] rounded-[8px] bg-[#F5F5F5] border border-[#EAEAEA] px-[14px] py-[12px] flex flex-row items-center gap-[10px] box-border">
          {/* circle-alert icon */}
          <div className="w-[16px] h-[16px] shrink-0 flex items-center justify-center">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="8" cy="8" r="6.75" stroke="#000000" strokeWidth="1.3" />
              <line x1="8" y1="4.5" x2="8" y2="8.5" stroke="#000000" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="8" cy="11.25" r="0.75" fill="#000000" />
            </svg>
          </div>
          <span className="text-[12px] font-normal leading-[1.45] text-[#333333]">
            Shipping options may vary by marketplace, product, location and configured provider.
          </span>
        </div>

        {/* Onboarding footer:
            height: 96px; border-top: 1px solid #EDEDED;
            display: flex; justify-content: space-between; align-items: center;
        */}
        <div className="w-full border-t border-[#EDEDED] pt-[24px] pb-[16px] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
            You can configure advanced fulfillment rules from Settings.
          </p>

          <div className="flex flex-row items-center gap-[16px]">
            {/* Skip for now button: width: 112px; height: 40px; background: #FFFFFF; border-radius: 8px; */}
            <button
              type="button"
              onClick={onSkip}
              className="w-[112px] h-[40px] px-[16px] rounded-[8px] bg-white border border-[#D6D6D6] flex items-center justify-center text-[12px] font-semibold leading-[1.45] text-[#000000] hover:bg-[#F9F9F9] transition-colors cursor-pointer"
            >
              Skip for now
            </button>

            {/* Continue button: width: 168px; height: 44px; background: #0A0A0A; border-radius: 12px; */}
            <button
              type="button"
              onClick={handleContinue}
              className="w-[168px] h-[44px] px-[16px] rounded-[12px] bg-[#0A0A0A] flex items-center justify-center text-[13px] font-semibold leading-[1.45] text-[#FFFFFF] hover:bg-[#262626] transition-colors cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
