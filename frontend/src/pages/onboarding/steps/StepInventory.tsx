import React, { useState } from "react";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepInventoryProps {
  onNext: () => void;
  onSkip: () => void;
}

export const StepInventory: React.FC<StepInventoryProps> = ({
  onNext,
  onSkip,
}) => {
  const { onboardingData, updateOnboardingData } = useWorkspaceStore();

  const [mode, setMode] = useState<"simple" | "warehouse">(
    onboardingData.inventory.mode || "simple",
  );
  const [locationName, setLocationName] = useState(
    onboardingData.inventory.locationName || "Home Inventory",
  );
  const [warehouseName, setWarehouseName] = useState(
    onboardingData.inventory.warehouseName || "",
  );
  const [city, setCity] = useState(
    onboardingData.inventory.city || "",
  );
  const [address, setAddress] = useState(
    onboardingData.inventory.address || "",
  );
  const [startingMethod, setStartingMethod] = useState<
    "manual" | "marketplace" | "file"
  >(onboardingData.inventory.startingMethod || "manual");

  const handleContinue = () => {
    updateOnboardingData({
      inventory: {
        mode,
        locationName,
        warehouseName,
        city,
        address,
        startingMethod,
      },
    });
    onNext();
  };

  return (
    <div className="relative w-full min-h-[940px] bg-[#FFFFFF] flex flex-col justify-start overflow-hidden">
      {/* Background Gradient matching StepBusiness: clean white at top and left, soft dark radial fade at bottom-right */}
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
        {/* Inventory introduction: width: 1152px; gap: 16px; */}
        <div className="flex flex-col gap-[16px] w-full">
          <h1 className="text-[32px] sm:text-[38px] lg:text-[40px] font-semibold leading-[1.15] text-[#000000] tracking-[-0.02em]">
            Let's set up your inventory.
          </h1>
          <p className="text-[14px] font-normal leading-[1.65] text-[#666666] max-w-[815px]">
            Start with the stock you have today. You can add warehouses, locations and advanced inventory controls as your business grows.
          </p>
        </div>

        {/* Inventory workspace:
            display: flex; flex-direction: row; gap: 64px;
            width: 1152px; border-top: 1px solid #EAEAEA; padding-top: 24px;
        */}
        <div className="border-t border-[#EAEAEA] pt-[24px] grid grid-cols-1 lg:grid-cols-12 gap-[64px] items-start w-full">
          {/* Left Column: Inventory configuration (720px width / approx 7.5 cols in 12-col grid) */}
          <div className="lg:col-span-7 flex flex-col gap-[24px] w-full max-w-[720px]">
            {/* Inventory management decision */}
            <div className="flex flex-col gap-[16px] w-full">
              <h2 className="text-[18px] font-semibold leading-[1.45] text-[#000000]">
                How do you manage your inventory?
              </h2>

              {/* Inventory modes: gap 16px, cards 352px x 176px */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px] w-full">
                {/* Simple inventory card (Mode=Simple) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setMode("simple")}
                  className={cn(
                    "relative w-full h-[176px] rounded-[12px] p-[20px_16px] flex flex-row items-start gap-[10px] cursor-pointer transition-all text-left select-none box-border",
                    mode === "simple"
                      ? "bg-[#F5F5F5] border border-[#000000]"
                      : "bg-[#FFFFFF] border border-[#EAEAEA] hover:border-[#CCCCCC]",
                  )}
                >
                  {/* Icon */}
                  <div className="w-[16px] h-[16px] shrink-0 mt-[2px]">
                    {/* Simple inventory symbol (3 connected cubes icon) */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M8 1.5L13.5 4.5V11.5L8 14.5L2.5 11.5V4.5L8 1.5Z"
                        stroke="#0A0A0A"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M8 1.5V14.5M2.5 4.5L8 8L13.5 4.5M2.5 11.5L8 8L13.5 11.5"
                        stroke="#0A0A0A"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Business option content */}
                  <div className="flex-1 flex flex-col justify-between h-full">
                    <div className="flex flex-col gap-[3px]">
                      <span className="text-[16px] font-semibold leading-[1.65] text-[#000000]">
                        Simple inventory
                      </span>
                      <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                        Track stock at the product or SKU level without setting up a warehouse.
                      </p>
                    </div>

                    <div className="text-[11px] font-normal leading-[1.45] text-[#666666]">
                      <p>Home inventory · Small business</p>
                      <p>Single location</p>
                    </div>
                  </div>

                  {/* checkmark when selected */}
                  {mode === "simple" && (
                    <div className="w-[14px] h-[14px] shrink-0 mt-[2px]">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M2.5 7.5L5.5 10.5L11.5 3.5"
                          stroke="#0A0A0A"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Warehouse inventory card (Mode=Warehouse) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setMode("warehouse")}
                  className={cn(
                    "relative w-full h-[176px] rounded-[12px] p-[20px_16px] flex flex-row items-start gap-[10px] cursor-pointer transition-all text-left select-none box-border",
                    mode === "warehouse"
                      ? "bg-[#F5F5F5] border border-[#000000]"
                      : "bg-[#FFFFFF] border border-[#EAEAEA] hover:border-[#CCCCCC]",
                  )}
                >
                  {/* Icon */}
                  <div className="w-[16px] h-[16px] shrink-0 mt-[2px]">
                    {/* Warehouse symbol */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2 5.5L8 2L14 5.5V13.5H2V5.5Z"
                        stroke="#0A0A0A"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 13.5V9.5H10V13.5"
                        stroke="#0A0A0A"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M2 5.5H14"
                        stroke="#0A0A0A"
                        strokeWidth="1.3"
                      />
                    </svg>
                  </div>

                  {/* Business option content */}
                  <div className="flex-1 flex flex-col justify-between h-full">
                    <div className="flex flex-col gap-[3px]">
                      <span className="text-[16px] font-semibold leading-[1.65] text-[#000000]">
                        Warehouse inventory
                      </span>
                      <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                        Track stock across warehouses and locations.
                      </p>
                    </div>

                    <div className="text-[11px] font-normal leading-[1.45] text-[#666666]">
                      <p>Multiple warehouses · Warehouse staff</p>
                      <p>Bins and storage locations</p>
                    </div>
                  </div>

                  {/* checkmark when selected */}
                  {mode === "warehouse" && (
                    <div className="w-[14px] h-[14px] shrink-0 mt-[2px]">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M2.5 7.5L5.5 10.5L11.5 3.5"
                          stroke="#0A0A0A"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Simple inventory details */}
            {mode === "simple" ? (
              <div className="flex flex-col gap-[20px] w-full">
                {/* Inventory field: State=Filled */}
                <div className="flex flex-col gap-[6px] w-full">
                  <label className="text-[12px] font-medium leading-[1.45] text-[#333333]">
                    Inventory location name
                  </label>
                  <div className="w-full h-[40px] px-[12px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] flex items-center box-border">
                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="Home Inventory"
                      className="w-full text-[13px] font-normal leading-[1.45] text-[#000000] bg-transparent outline-none border-none p-0"
                    />
                  </div>
                </div>

                {/* Starting inventory method */}
                <div className="flex flex-col gap-[8px] w-full">
                  <label className="text-[12px] font-medium leading-[1.45] text-[#333333]">
                    Starting inventory method
                  </label>

                  {/* Stock entry choices: 3 radio rows */}
                  <div className="flex flex-col gap-[4px] w-full">
                    {/* Option 1: Enter stock manually */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setStartingMethod("manual")}
                      className="w-full h-[40px] flex flex-row items-center gap-[8px] cursor-pointer select-none"
                    >
                      <div className="w-[32px] h-[32px] rounded-[16px] flex items-center justify-center shrink-0">
                        <div className="w-[18px] h-[18px] rounded-[9px] bg-white border border-[#000000] flex items-center justify-center box-border">
                          {startingMethod === "manual" && (
                            <div className="w-[8px] h-[8px] rounded-[4px] bg-[#000000]" />
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-[13px] leading-[1.45]",
                          startingMethod === "manual"
                            ? "font-semibold text-[#000000]"
                            : "font-normal text-[#000000]",
                        )}
                      >
                        Enter stock manually
                      </span>
                    </div>

                    {/* Option 2: Import stock from marketplace */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setStartingMethod("marketplace")}
                      className="w-full h-[40px] flex flex-row items-center gap-[8px] cursor-pointer select-none"
                    >
                      <div className="w-[32px] h-[32px] rounded-[16px] flex items-center justify-center shrink-0">
                        <div className="w-[18px] h-[18px] rounded-[9px] bg-white border border-[#000000] flex items-center justify-center box-border">
                          {startingMethod === "marketplace" && (
                            <div className="w-[8px] h-[8px] rounded-[4px] bg-[#000000]" />
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-[13px] leading-[1.45]",
                          startingMethod === "marketplace"
                            ? "font-semibold text-[#000000]"
                            : "font-normal text-[#000000]",
                        )}
                      >
                        Import stock from marketplace
                      </span>
                    </div>

                    {/* Option 3: Import inventory file */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setStartingMethod("file")}
                      className="w-full h-[40px] flex flex-row items-center gap-[8px] cursor-pointer select-none"
                    >
                      <div className="w-[32px] h-[32px] rounded-[16px] flex items-center justify-center shrink-0">
                        <div className="w-[18px] h-[18px] rounded-[9px] bg-white border border-[#000000] flex items-center justify-center box-border">
                          {startingMethod === "file" && (
                            <div className="w-[8px] h-[8px] rounded-[4px] bg-[#000000]" />
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-[13px] leading-[1.45]",
                          startingMethod === "file"
                            ? "font-semibold text-[#000000]"
                            : "font-normal text-[#000000]",
                        )}
                      >
                        Import inventory file
                      </span>
                    </div>
                  </div>
                </div>

                {/* Central inventory reassurance */}
                <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                  Your inventory will become the central stock source for connected marketplaces.
                </p>
              </div>
            ) : (
              /* Warehouse inventory details */
              <div className="flex flex-col gap-[20px] w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px] w-full">
                  <div className="flex flex-col gap-[6px]">
                    <label className="text-[12px] font-medium leading-[1.45] text-[#333333]">
                      Warehouse name
                    </label>
                    <div className="w-full h-[40px] px-[12px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] flex items-center box-border">
                      <input
                        type="text"
                        value={warehouseName}
                        onChange={(e) => setWarehouseName(e.target.value)}
                        placeholder="Main Warehouse"
                        className="w-full text-[13px] font-normal leading-[1.45] text-[#000000] bg-transparent outline-none border-none p-0"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    <label className="text-[12px] font-medium leading-[1.45] text-[#333333]">
                      Location: City / State
                    </label>
                    <div
                      className={cn(
                        "w-full h-[40px] px-[12px] bg-[#FFFFFF] rounded-[8px] flex items-center box-border border transition-colors",
                        city ? "border-[#666666]" : "border-[#D1D5DB] focus-within:border-[#666666]",
                      )}
                    >
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Mumbai, Maharashtra"
                        className="w-full text-[13px] font-normal leading-[1.45] text-[#000000] placeholder:text-[#666666] bg-transparent outline-none border-none p-0"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-[6px] w-full">
                  <label className="text-[12px] font-medium leading-[1.45] text-[#333333]">
                    Warehouse address (optional)
                  </label>
                  <div className="w-full h-[40px] px-[12px] bg-[#FFFFFF] border border-[#D1D5DB] rounded-[8px] flex items-center box-border">
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street address, building or landmark"
                      className="w-full text-[13px] font-normal leading-[1.45] text-[#000000] bg-transparent outline-none border-none p-0"
                    />
                  </div>
                </div>

                <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                  Advanced locations such as zones, racks, shelves and bins can be configured later.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Inventory overview (368px width / border-left: 1px solid #EAEAEA; padding-left: 32px;) */}
          <div className="lg:col-span-5 flex flex-col gap-[24px] w-full lg:border-l lg:border-[#EAEAEA] lg:pl-[32px] max-w-[368px]">
            {/* Preview heading */}
            <div className="flex flex-row justify-between items-center w-full h-[16px]">
              <span className="text-[11px] font-medium leading-[1.45] uppercase tracking-[0.04em] text-[#666666]">
                INVENTORY OVERVIEW
              </span>
              <span className="text-[11px] font-normal leading-[1.45] text-[#666666]">
                Preview
              </span>
            </div>

            {/* Stock summary (4 metric rows, 64px height each, border-b: 1px solid #EAEAEA) */}
            <div className="flex flex-col w-full">
              {/* Metric 1: Products */}
              <div className="h-[64px] border-b border-[#EAEAEA] flex flex-row justify-between items-center w-full">
                <span className="text-[13px] font-normal leading-[1.45] text-[#666666]">
                  Products
                </span>
                <span className="text-[24px] font-semibold leading-[32px] text-[#000000]">
                  427
                </span>
              </div>

              {/* Metric 2: Units */}
              <div className="h-[64px] border-b border-[#EAEAEA] flex flex-row justify-between items-center w-full">
                <span className="text-[13px] font-normal leading-[1.45] text-[#666666]">
                  Units
                </span>
                <span className="text-[24px] font-semibold leading-[32px] text-[#000000]">
                  2,846
                </span>
              </div>

              {/* Metric 3: Low stock */}
              <div className="h-[64px] border-b border-[#EAEAEA] flex flex-row justify-between items-center w-full">
                <span className="text-[13px] font-normal leading-[1.45] text-[#666666]">
                  Low stock
                </span>
                <span className="text-[24px] font-semibold leading-[32px] text-[#000000]">
                  18
                </span>
              </div>

              {/* Metric 4: Out of stock */}
              <div className="h-[64px] border-b border-[#EAEAEA] flex flex-row justify-between items-center w-full">
                <span className="text-[13px] font-normal leading-[1.45] text-[#666666]">
                  Out of stock
                </span>
                <span className="text-[24px] font-semibold leading-[32px] text-[#000000]">
                  6
                </span>
              </div>
            </div>

            {/* Example data note: 11px color #8E8E8E / subtle note */}
            <p className="text-[11px] font-normal leading-[1.45] text-[#8E8E8E]">
              Example stock figures. Your inventory will reflect the quantities you enter or import.
            </p>

            {/* Central inventory architecture diagram */}
            <div className="flex flex-col items-center pt-[8px] w-full">
              {/* Master inventory node card */}
              <div className="w-[200px] h-[56px] rounded-[8px] bg-[#F5F5F5] border border-[#EAEAEA] flex flex-col items-center justify-center gap-[4px] box-border shadow-xs">
                <span className="text-[12px] font-semibold leading-[1.45] text-[#000000]">
                  Master Inventory
                </span>
                <span className="text-[10px] font-normal leading-[1.45] text-[#666666]">
                  One central stock source
                </span>
              </div>

              {/* Connector lines SVG tree */}
              <div className="w-[301px] flex flex-col items-center">
                <svg
                  width="301"
                  height="36"
                  viewBox="0 0 301 36"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="shrink-0"
                >
                  <path
                    d="M150.5 0V20M0.5 36V20H300.5V36M100.5 20V36M200.5 20V36"
                    stroke="#BDBDBD"
                  />
                </svg>

                {/* Connected sales channels labels positioned directly beneath branch endpoints */}
                <div className="relative w-[301px] h-[20px] mt-[6px]">
                  <span className="absolute left-[0.5px] -translate-x-1/2 text-center text-[11px] font-normal leading-[1.45] text-[#8E8E8E]">
                    Amazon
                  </span>
                  <span className="absolute left-[100.5px] -translate-x-1/2 text-center text-[11px] font-normal leading-[1.45] text-[#8E8E8E]">
                    Flipkart
                  </span>
                  <span className="absolute left-[200.5px] -translate-x-1/2 text-center text-[11px] font-normal leading-[1.45] text-[#8E8E8E]">
                    Meesho
                  </span>
                  <span className="absolute left-[300.5px] -translate-x-1/2 text-center text-[11px] font-normal leading-[1.45] text-[#8E8E8E]">
                    Shopify
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inventory synchronization insight banner:
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
            Your inventory will stay synchronized across connected sales channels.
          </span>
        </div>

        {/* Onboarding footer:
            height: 96px; border-top: 1px solid #EDEDED;
            display: flex; justify-content: space-between; align-items: center;
        */}
        <div className="w-full border-t border-[#EDEDED] pt-[24px] pb-[16px] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
            You can change inventory settings later.
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
