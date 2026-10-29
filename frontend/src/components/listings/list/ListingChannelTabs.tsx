import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { ChannelSummary } from "@/types/listing";

import { channelTabsOf, type ChannelTab as Tab } from "./channelTabs";

interface ListingChannelTabsProps {
  /** the marketplace code in the URL (a code from a deep link that is not a tab still shows, and can be cleared) */
  marketplace: string | undefined;
  summary: ChannelSummary | undefined;
  onChange: (code: string | null) => void;
}

/** the channel switcher: all channels, then one tab per marketplace with its listing count (0 and "Connect" without an account) */
export function ListingChannelTabs({ marketplace, summary, onChange }: ListingChannelTabsProps) {
  const total = summary ? summary.channels.reduce((sum, c) => sum + c.listings, 0) : undefined;
  const tabs: Tab[] = [{ code: "", label: "All channels", count: total, connect: false }, ...channelTabsOf(summary, marketplace)];
  return (
    <div role="group" aria-label="Marketplace" className="flex h-[34px] min-h-[44px] sm:min-h-[34px] w-full flex-row items-center gap-4 sm:gap-5 overflow-x-auto scrollbar-none border-b border-[#EAEAEA] text-[12px]">
      {tabs.map((tab) => {
        const active = tab.code === "" ? !marketplace : marketplace === tab.code;
        return (
          <div key={tab.code || "all"} className="flex h-full shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onChange(tab.code || null)}
              className={cn(
                "relative flex h-full min-h-[44px] sm:min-h-0 shrink-0 cursor-pointer items-center gap-1 px-0.5 transition-colors",
                active ? "border-b-2 border-[#000000] font-semibold text-[#000000]" : "font-normal text-[#666666] hover:text-[#000000]",
              )}
            >
              {tab.label}
              {tab.count !== undefined && <span className="font-normal text-[#666666]">{formatNumber(tab.count)}</span>}
            </button>
            {tab.connect && (
              <Link to={ROUTES.MARKETPLACE_HUB} className="text-[10px] font-medium text-[#2563EB] hover:underline min-h-[44px] sm:min-h-0 flex items-center" aria-label={`Connect ${tab.label}`} title={`No ${tab.label} account is connected yet`}>
                Connect
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
