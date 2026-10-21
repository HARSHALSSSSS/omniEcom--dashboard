import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { PRICING_STRATEGIES, PROPOSAL_SORTS, PROPOSAL_TABS, type PriceStrategy, type PricingChannel, type ProposalSort, type ProposalTab, type ProposalsQuery } from "@/types/pricing";
import { SELECT_CLASS } from "../PricingStates";
import { SORT_LABELS, STRATEGY_LABELS, TAB_LABELS } from "../pricingFormat";

interface ProposalFiltersProps {
  query: ProposalsQuery;
  counts: Record<string, number> | undefined;
  channels: PricingChannel[];
  filtered: boolean;
  onTab: (tab: ProposalTab) => void;
  onSearch: (q: string) => void;
  onAccount: (id: string | null) => void;
  onStrategy: (strategy: PriceStrategy | null) => void;
  onSort: (sort: ProposalSort) => void;
  onClear: () => void;
}

/** status tabs with their counts, search, channel / strategy / sort; every change goes to the URL */
export function ProposalFilters({ query, counts, channels, filtered, onTab, onSearch, onAccount, onStrategy, onSort, onClear }: ProposalFiltersProps) {
  const q = query.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Proposal status" className="flex flex-wrap gap-2">
        {PROPOSAL_TABS.map((tab) => {
          const selected = tab === query.tab;
          const count = counts?.[tab];
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTab(tab)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {TAB_LABELS[tab]}
              <span className="ml-1.5 font-mono">{count === undefined ? "—" : formatNumber(count)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Search proposals" placeholder="Search by SKU or product title..." value={text} onChange={(e) => setText(e.target.value)} className="pl-9 text-xs" />
        </div>
        <select aria-label="Channel" className={SELECT_CLASS} value={query.accountId ?? ""} onChange={(e) => onAccount(e.target.value || null)}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.accountId} value={c.accountId}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Strategy" className={SELECT_CLASS} value={query.strategy ?? ""} onChange={(e) => onStrategy((e.target.value || null) as PriceStrategy | null)}>
          <option value="">All strategies</option>
          {PRICING_STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {STRATEGY_LABELS[s]}
            </option>
          ))}
        </select>
        <select aria-label="Sort proposals" className={SELECT_CLASS} value={query.sort} onChange={(e) => onSort(e.target.value as ProposalSort)}>
          {PROPOSAL_SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        {filtered && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
