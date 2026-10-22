import type { ChannelSummary } from "@/types/listing";

/** the design's channel tabs; `code` is the marketplace code of the backend registry (`social` is a channel group: meesho + shopify) */
export const DESIGN_CHANNEL_TABS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "amazon_in", label: "Amazon" },
  { code: "flipkart", label: "Flipkart" },
  { code: "meesho", label: "Meesho" },
  { code: "shopify", label: "Shopify" },
  { code: "snapdeal", label: "Snapdeal" },
  { code: "social", label: "Social Commerce" },
];

export interface ChannelTab {
  code: string;
  label: string;
  /** listings on the channel; undefined while the numbers load */
  count: number | undefined;
  /** no connected account: the tab shows 0 and offers to connect */
  connect: boolean;
}

/** the tabs: the design's list, then any other marketplace that has an account or listings (Myntra, the sandbox ...) */
export function channelTabsOf(summary: ChannelSummary | undefined, marketplace: string | undefined): ChannelTab[] {
  const byCode = new Map((summary?.channels ?? []).map((c) => [c.code, c]));
  const groups = new Map((summary?.groups ?? []).map((g) => [g.code, g]));
  const designCodes = new Set(DESIGN_CHANNEL_TABS.map((t) => t.code));
  const tabs: ChannelTab[] = DESIGN_CHANNEL_TABS.map((t) => {
    const row = byCode.get(t.code) ?? groups.get(t.code);
    return { code: t.code, label: t.label, count: summary ? (row?.listings ?? 0) : undefined, connect: summary ? !(row?.connected ?? false) : false };
  });
  for (const c of summary?.channels ?? []) {
    if (designCodes.has(c.code) || (c.accounts === 0 && c.listings === 0)) continue;
    tabs.push({ code: c.code, label: c.name, count: c.listings, connect: !c.connected });
  }
  if (marketplace && !tabs.some((t) => t.code === marketplace)) tabs.push({ code: marketplace, label: marketplace, count: undefined, connect: false });
  return tabs;
}
