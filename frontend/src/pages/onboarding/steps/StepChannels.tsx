import React, { useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  iconLetter: string;
  iconBg: string;
}

const CHANNELS: ChannelItem[] = [
  {
    id: "amazon",
    name: "Amazon",
    category: "Marketplace",
    description: "Products, orders, inventory and listings",
    iconLetter: "a",
    iconBg: "bg-amber-100 text-amber-900 border-amber-300",
  },
  {
    id: "flipkart",
    name: "Flipkart",
    category: "Marketplace",
    description: "Products, orders, inventory and listings",
    iconLetter: "F",
    iconBg: "bg-blue-100 text-blue-900 border-blue-300",
  },
  {
    id: "meesho",
    name: "Meesho",
    category: "Marketplace",
    description: "Catalog, orders and inventory",
    iconLetter: "m",
    iconBg: "bg-pink-100 text-pink-900 border-pink-300",
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "Online store",
    description: "Products, orders, customers and inventory",
    iconLetter: "S",
    iconBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  {
    id: "snapdeal",
    name: "Snapdeal",
    category: "Marketplace",
    description: "Products, orders and inventory",
    iconLetter: "⬡",
    iconBg: "bg-red-100 text-red-900 border-red-300",
  },
  {
    id: "social_commerce",
    name: "Social Commerce",
    category: "Social selling",
    description: "Catalog and orders from social channels",
    iconLetter: "💬",
    iconBg: "bg-purple-100 text-purple-900 border-purple-300",
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
    <div className="flex w-full min-h-[calc(100vh-64px)] flex-col lg:flex-row">
      {/* Left dark summary panel from Screen 03 */}
      <div className="hidden lg:flex w-[400px] shrink-0 bg-black p-10 text-white flex-col justify-between rounded-r-3xl my-4 ml-4">
        <div className="space-y-6">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Sales Channels
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
            Your channels.
            <br />
            One workspace.
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Bring the places you sell into one connected view. Start with what
            matters to your business.
          </p>

          <div className="space-y-4 pt-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 text-neutral-400 font-medium text-xs tracking-wider">
              <span>YOUR BUSINESS</span>
              <Check className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 text-white font-medium text-xs tracking-wider">
              <span>YOUR CHANNELS</span>
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="text-neutral-600 font-medium text-xs tracking-wider pt-2">
              <span className="block mb-2 text-neutral-500">
                YOUR OPERATIONS
              </span>
              <div className="flex gap-4 text-[11px] text-neutral-600">
                <span>Products</span>
                <span>Orders</span>
                <span>Inventory</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-white font-medium">Connect at your own pace.</p>
          <p className="text-[11px] text-neutral-500">
            One channel or many. Your choice.
          </p>
        </div>
      </div>

      {/* Right channel selection container */}
      <div className="flex-1 flex justify-center p-6 sm:p-10 lg:p-14 overflow-y-auto">
        <div className="w-full max-w-2xl space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0A0A0A]">
              Where do you sell today?
            </h2>
            <p className="mt-1 text-sm text-[#666666]">
              Connect your existing sales channels and manage them from one
              workspace.
            </p>
          </div>

          {/* Section header */}
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-2">
            <div>
              <span className="text-xs font-semibold text-[#0A0A0A]">
                Choose any channels you sell on
              </span>
              <p className="text-[11px] text-[#666666]">
                Select one or more. Connect each separately, or skip this step.
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">
              Optional
            </span>
          </div>

          {/* Channel cards */}
          <div className="space-y-3">
            {CHANNELS.map((ch) => {
              const isConnected = connectedChannels.includes(ch.id);
              const isConnecting = connectingId === ch.id;

              return (
                <div
                  key={ch.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-4 transition-all gap-3",
                    isConnected
                      ? "border-black bg-neutral-50/50 shadow-2xs"
                      : "border-[#E5E7EB] bg-white hover:border-neutral-300",
                  )}
                >
                  {/* Left: Checkbox + Logo + Info */}
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => handleConnect(ch.id)}
                      className="text-neutral-400 hover:text-black transition-colors"
                    >
                      {isConnected ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-black text-white">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded border border-[#D1D5DB] bg-white hover:border-black" />
                      )}
                    </button>

                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-bold text-sm",
                        ch.iconBg,
                      )}
                    >
                      {ch.iconLetter}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#0A0A0A]">
                          {ch.name}
                        </span>
                        <span className="text-[11px] text-[#666666]">
                          / {ch.category}
                        </span>
                      </div>
                      <p className="text-xs text-[#666666]">{ch.description}</p>
                    </div>
                  </div>

                  {/* Right: Status pill + Action button */}
                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {isConnected ? (
                      <div className="text-right">
                        <div className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Connected</span>
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          Last sync just now
                        </p>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-[11px] text-[#666666]">
                        <Circle className="h-2 w-2 text-neutral-300 fill-neutral-300" />
                        <span>Not connected</span>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isConnecting}
                      onClick={() => handleConnect(ch.id)}
                      className={cn(
                        "h-8 px-3 text-xs font-semibold rounded-lg",
                        isConnected
                          ? "border-[#E5E7EB] text-[#0A0A0A] hover:bg-neutral-100"
                          : "border-black text-black hover:bg-neutral-50",
                      )}
                    >
                      {isConnecting ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : isConnected ? (
                        "Manage"
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom count & helper */}
          <div className="border-t border-[#EAEAEA] pt-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#666666]">
              <span>
                {connectedChannels.length} connected ·{" "}
                {connectedChannels.length > 0
                  ? `${connectedChannels.length} selected to connect`
                  : "0 selected"}
              </span>
              <span className="hover:underline cursor-pointer">
                Example connection & sync
              </span>
            </div>
            <p className="text-[11px] text-[#666666]">
              You can add more channels anytime from your workspace.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onSkip}
              className="h-11 px-6 rounded-lg text-xs font-semibold border-[#E5E7EB] text-[#666666] hover:text-black"
            >
              Skip for now
            </Button>
            <Button
              type="button"
              onClick={onNext}
              className="h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2"
            >
              <span>Continue</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
