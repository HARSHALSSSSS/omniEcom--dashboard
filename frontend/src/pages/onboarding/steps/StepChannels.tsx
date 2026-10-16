import React, { useState } from "react";
import {
  Check,
  RefreshCw,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepChannelsProps {
  onNext: () => void;
  onSkip: () => void;
}

interface ChannelItem {
  id: string;
  name: string;
  category: string;
  description: string;
  logo: string;
}

const CHANNELS: ChannelItem[] = [
  {
    id: "amazon",
    name: "Amazon",
    category: "Marketplace",
    description: "Products, orders, inventory and listings",
    logo: "/logos/amazon.svg",
  },
  {
    id: "flipkart",
    name: "Flipkart",
    category: "Marketplace",
    description: "Products, orders, inventory and listings",
    logo: "/logos/flipkart.svg",
  },
  {
    id: "meesho",
    name: "Meesho",
    category: "Marketplace",
    description: "Catalog, orders and inventory",
    logo: "/logos/meesho.svg",
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "Online store",
    description: "Products, orders, customers and inventory",
    logo: "/logos/shopify.svg",
  },
  {
    id: "snapdeal",
    name: "Snapdeal",
    category: "Marketplace",
    description: "Products, orders and inventory",
    logo: "/logos/snapdeal.svg",
  },
  {
    id: "social_commerce",
    name: "Social Commerce",
    category: "Social selling",
    description: "Catalog and orders from social channels",
    logo: "/logos/social.svg",
  },
];

export const StepChannels: React.FC<StepChannelsProps> = ({
  onNext,
  onSkip,
}) => {
  const { onboardingData, toggleChannelConnection } = useWorkspaceStore();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const connectedChannels = onboardingData.connectedChannels;

  const handleConnect = async (channelId: string) => {
    setConnectingId(channelId);
    await new Promise((res) => setTimeout(res, 500));
    toggleChannelConnection(channelId);
    setConnectingId(null);
  };

  return (
    <div className="relative w-full min-h-[calc(100vh-104px)] bg-[#FFFFFF] flex flex-col justify-center overflow-hidden">
      {/* Editorial background (dark left column backdrop - completely clean black) */}
      <div className="pointer-events-none hidden lg:block absolute left-0 top-0 bottom-0 w-[519px] bg-[#0A0A0A] z-0" />

      {/* Atmospheric gradient restricted ONLY to the right side */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 left-0 lg:left-[519px] z-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 85% at 90% 95%, rgba(45, 45, 45, 0.42) 0%, rgba(130, 130, 130, 0.28) 32%, rgba(215, 215, 215, 0.12) 60%, rgba(255, 255, 255, 0) 80%), linear-gradient(175deg, #FFFFFF 0%, #FFFFFF 38%, #F7F7F7 58%, #E5E5E5 82%, #CCCCCC 100%)",
        }}
      />

      <div className="relative z-10 w-full flex flex-col lg:flex-row items-start justify-start pt-[56px] pb-[40px] pl-6 sm:pl-16 lg:pl-[110px] pr-6 sm:pr-12 lg:pr-[72px] xl:pr-[96px] gap-[32px] lg:gap-[80px] xl:gap-[100px]">
        {/* Left Column: Protruding pure black rounded card */}
        <div className="relative shrink-0 flex items-center w-full lg:w-auto px-4 sm:px-8 lg:px-0">
          <div className="w-full lg:w-[500px] xl:w-[555px] min-h-[680px] lg:h-[750px] bg-[#000000] rounded-[32px] lg:rounded-none lg:rounded-r-[42px] px-8 lg:px-[60px] xl:px-[72px] pt-8 lg:pt-10 pb-8 lg:pb-10 text-white flex flex-col justify-between shrink-0 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium leading-none uppercase text-[#737373] tracking-[0.08em]">
                SALES CHANNELS
              </span>
              <h1 className="mt-5 text-[38px] sm:text-[44px] xl:text-[48px] font-bold leading-[1.08] text-white tracking-[-0.025em]">
                Your channels.
                <br />
                One workspace.
              </h1>
              <p className="mt-4 text-[13.5px] font-normal leading-[1.6] text-[#8E8E8E] max-w-[310px]">
                Bring the places you sell into one connected view. Start with what matters to your business.
              </p>

              <div className="mt-12 flex flex-col">
                <div className="flex items-center justify-between py-1 cursor-default">
                  <span className="text-[15px] font-normal leading-none text-[#737373] tracking-[0.02em]">
                    YOUR BUSINESS
                  </span>
                  <Check className="h-4 w-4 text-[#737373]" />
                </div>
                <div className="h-[1px] w-full bg-[#1F1F1F] my-4" />
                <div className="flex items-center justify-between py-1 cursor-default">
                  <span className="text-[15px] font-semibold leading-none text-white tracking-[0.02em]">
                    YOUR CHANNELS
                  </span>
                  <span className="text-[16px] font-light leading-none text-white">→</span>
                </div>
                <div className="h-[1px] w-full bg-[#1F1F1F] my-4" />
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

            <div className="pt-6 text-[11.5px] font-normal leading-none text-[#737373]">
              Connect at your own pace.
              <br />
              <span className="text-[#555555]">One channel or many. Your choice.</span>
            </div>
          </div>
        </div>

        {/* Right channel selection container */}
        <div className="flex-1 min-w-0 w-full flex items-start justify-start mt-8 lg:mt-0">
          <div className="w-full flex flex-col space-y-5">
            <div>
              <h2 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-[#0A0A0A]">
                Where do you sell today?
              </h2>
              <p className="mt-1.5 text-[13px] text-[#737373]">
                Connect your existing sales channels and manage them from one workspace.
              </p>
            </div>

            {/* Section header */}
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <span className="text-[13px] font-bold text-[#0A0A0A]">
                  Choose any channels you sell on
                </span>
                <p className="text-[11px] text-[#737373]">
                  Select one or more. Connect each separately, or skip this step.
                </p>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373]">
                OPTIONAL
              </span>
            </div>

            {/* Channel cards */}
            <div className="flex flex-col gap-3 pt-1">
              {CHANNELS.map((ch) => {
                const isConnected = connectedChannels.includes(ch.id);
                const isConnecting = connectingId === ch.id;

                return (
                  <div
                    key={ch.id}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between rounded-[18px] px-5 py-4 transition-all gap-4 bg-white",
                      isConnected
                        ? "border border-[#0A0A0A]"
                        : "border border-[#EFEFEF] hover:border-[#D6D6D6]",
                    )}
                  >
                    {/* Left: Checkbox + Logo + Info */}
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => handleConnect(ch.id)}
                        className="cursor-pointer shrink-0"
                      >
                        {isConnected ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-black text-white">
                            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                          </div>
                        ) : (
                          <div className="h-5 w-5 rounded-[6px] border border-[#CCCCCC] bg-white hover:border-black" />
                        )}
                      </button>

                      {/* Brand Logo / Icon */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-[#EFEFEF] p-2">
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          className="h-full w-full object-contain"
                        />
                      </div>

                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-bold text-[#0A0A0A]">
                            {ch.name}
                          </span>
                          <span className="text-[12px] text-[#8E8E8E]">
                            / {ch.category}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-[#737373]">
                          {ch.description}
                        </p>
                      </div>
                    </div>

                    {/* Right: Status pill + Action button */}
                    <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                      {isConnected ? (
                        <div className="text-right">
                          <div className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#0A0A0A]">
                            <Check className="h-3.5 w-3.5 stroke-[2]" />
                            <span>Connected</span>
                          </div>
                          <p className="text-[10px] text-[#8E8E8E] mt-0.5">
                            Last sync just now
                          </p>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-[11.5px] text-[#8E8E8E]">
                          <div className="h-2 w-2 rounded-full border border-[#B0B0B0]" />
                          <span>Not connected</span>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={isConnecting}
                        onClick={() => handleConnect(ch.id)}
                        className={cn(
                          "h-9 px-4 text-xs font-semibold rounded-[10px] border transition-colors cursor-pointer min-w-[76px]",
                          isConnected
                            ? "border-[#D6D6D6] bg-white text-[#0A0A0A] hover:bg-neutral-100"
                            : "border-[#D6D6D6] bg-white text-[#0A0A0A] hover:border-black",
                        )}
                      >
                        {isConnecting ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin mx-auto" />
                        ) : isConnected ? (
                          "Manage"
                        ) : (
                          "Connect"
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          {/* Bottom count & helper */}
          <div className="border-t border-[#E5E5E5] pt-4 flex items-center justify-between text-[11px] text-[#737373]">
            <span>
              {connectedChannels.length} connected ·{" "}
              {connectedChannels.length > 0
                ? `${connectedChannels.length} selected to connect`
                : "1 selected to connect"}
            </span>
            <span className="text-[#8E8E8E] hover:underline cursor-pointer">
              Example connection & sync
            </span>
          </div>
          <p className="text-[11px] text-[#8E8E8E]">
            You can add more channels anytime from your workspace.
          </p>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3">
            <button
              type="button"
              onClick={onSkip}
              className="h-[42px] px-6 rounded-[12px] bg-white border border-[#E5E5E5] text-[12px] font-semibold text-[#0A0A0A] hover:bg-neutral-50 cursor-pointer shadow-2xs"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={onNext}
              className="w-[150px] h-[42px] rounded-[12px] bg-[#0A0A0A] text-white flex items-center justify-center gap-1.5 hover:bg-[#1F1F1F] transition-colors cursor-pointer"
            >
              <span className="text-[12px] font-semibold leading-none text-white">
                Continue
              </span>
              <span className="text-white text-[13px] leading-none">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};
