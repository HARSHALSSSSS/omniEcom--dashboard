import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import {
  PROMOTION_ITEM_STATUSES,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  type PromotionAccount,
  type PromotionCampaign,
  type PromotionType,
  type PromotionView,
} from "@/types/promotions";
import { ITEM_STATUS_LABELS, STATUS_LABELS, TYPE_LABELS } from "./promoFormat";
import type { PromotionsUrlState } from "./promoParams";

const SELECT = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";

interface Props {
  state: PromotionsUrlState;
  /** per status counts from the list response (the tab numbers) */
  counts: Record<string, number> | undefined;
  accounts: PromotionAccount[];
  /** campaigns offered in the products view's campaign filter */
  campaigns: PromotionCampaign[];
  filtered: boolean;
  onSearch: (q: string) => void;
  onStatus: (status: string | null) => void;
  onType: (type: PromotionType | null) => void;
  onAccount: (id: string | null) => void;
  onCampaign: (id: string | null) => void;
  onClear: () => void;
}

/** search, status tabs with counts and the selects of the current view; every change goes to the URL */
export function PromoFilters({ state, counts, accounts, campaigns, filtered, onSearch, onStatus, onType, onAccount, onCampaign, onClear }: Props) {
  const view: PromotionView = state.view;
  const q = state.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  const statuses: ReadonlyArray<string> = view === "campaigns" ? PROMOTION_STATUSES : PROMOTION_ITEM_STATUSES;
  const label = (s: string) => (view === "campaigns" ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : ITEM_STATUS_LABELS[s as keyof typeof ITEM_STATUS_LABELS]);
  const tabs = ["", ...statuses];
  const active = state.status ?? "";
  // a campaign from a deep link that is not on the first page of the picker still shows
  const campaignOptions = state.campaignId && !campaigns.some((c) => c.id === state.campaignId) ? [...campaigns, { id: state.campaignId, name: "Selected campaign" } as PromotionCampaign] : campaigns;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={view === "campaigns" ? "Campaign status" : "Product status"} className="flex flex-wrap gap-2">
        {tabs.map((s) => {
          const selected = s === active;
          const n = counts?.[s === "" ? "all" : s];
          return (
            <button
              key={s || "all"}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onStatus(s || null)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", selected ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted")}
            >
              {s === "" ? "All" : label(s)}
              <span className="ml-1.5 font-mono opacity-80">{n === undefined ? "—" : formatNumber(n)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={view === "campaigns" ? "Search campaigns" : "Search promoted products"}
            placeholder={view === "campaigns" ? "Search by campaign name or code..." : "Search by product, SKU or campaign..."}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        {view === "campaigns" && (
          <select aria-label="Campaign type" className={SELECT} value={state.type ?? ""} onChange={(e) => onType((e.target.value || null) as PromotionType | null)}>
            <option value="">Any type</option>
            {PROMOTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        )}

        {view === "products" && (
          <>
            <select aria-label="Campaign" className={SELECT} value={state.campaignId ?? ""} onChange={(e) => onCampaign(e.target.value || null)}>
              <option value="">All campaigns</option>
              {campaignOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {accounts.length > 0 && (
              <select aria-label="Marketplace account" className={SELECT} value={state.accountId ?? ""} onChange={(e) => onAccount(e.target.value || null)}>
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        {filtered && (
          <button type="button" onClick={onClear} className="h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
