import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DISPOSITION_FILTERS,
  INSPECTION_STATUSES,
  REFUND_STATUSES,
  RETURN_SIGNALS,
  type DispositionFilter,
  type InspectionStatus,
  type MarketplaceOption,
  type RefundStatus,
  type ReturnFilters as Filters,
  type ReturnSignal,
  type ReturnSort,
} from "@/types/returns";
import { DISPOSITION_LABELS, INSPECTION_LABELS, REFUND_LABELS, SIGNAL_LABELS, SORT_OPTIONS } from "./returnParams";

const SELECT = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";

interface ReturnFiltersProps {
  filters: Filters;
  sort: ReturnSort;
  channels: MarketplaceOption[];
  filtered: boolean;
  exporting: boolean;
  onSearch: (q: string) => void;
  onChannel: (code: string | null) => void;
  onSignal: (signal: ReturnSignal | null) => void;
  onInspection: (status: InspectionStatus | null) => void;
  onRefund: (status: RefundStatus | null) => void;
  onDisposition: (kind: DispositionFilter | null) => void;
  onSort: (sort: ReturnSort) => void;
  onClear: () => void;
  onExport: () => void;
}

/** search and the filters the ledger API defines; every change goes to the URL */
export function ReturnFilters({ filters, sort, channels, filtered, exporting, onSearch, onChannel, onSignal, onInspection, onRefund, onDisposition, onSort, onClear, onExport }: ReturnFiltersProps) {
  const q = filters.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  // a code from a deep link that is not among the known channels still shows (and can be cleared)
  const channelOptions = filters.marketplace && !channels.some((c) => c.code === filters.marketplace) ? [...channels, { code: filters.marketplace, name: filters.marketplace }] : channels;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="relative w-full max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search returns"
          placeholder="Search return #, order #, product or SKU..."
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          className="pl-9 text-xs"
        />
      </div>

      <select aria-label="Channel" value={filters.marketplace ?? ""} onChange={(e) => onChannel(e.target.value || null)} className={SELECT}>
        <option value="">All channels</option>
        {channelOptions.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <select aria-label="Attention signal" value={filters.signal ?? ""} onChange={(e) => onSignal((e.target.value as ReturnSignal) || null)} className={SELECT}>
        <option value="">Any signal</option>
        {RETURN_SIGNALS.map((s) => (
          <option key={s} value={s}>
            {SIGNAL_LABELS[s]}
          </option>
        ))}
      </select>
      <select aria-label="Inspection status" value={filters.inspectionStatus ?? ""} onChange={(e) => onInspection((e.target.value as InspectionStatus) || null)} className={SELECT}>
        <option value="">Any inspection</option>
        {INSPECTION_STATUSES.map((s) => (
          <option key={s} value={s}>
            Inspection: {INSPECTION_LABELS[s]}
          </option>
        ))}
      </select>
      <select aria-label="Refund status" value={filters.refundStatus ?? ""} onChange={(e) => onRefund((e.target.value as RefundStatus) || null)} className={SELECT}>
        <option value="">Any refund</option>
        {REFUND_STATUSES.map((s) => (
          <option key={s} value={s}>
            Refund: {REFUND_LABELS[s]}
          </option>
        ))}
      </select>
      <select aria-label="Disposition" value={filters.disposition ?? ""} onChange={(e) => onDisposition((e.target.value as DispositionFilter) || null)} className={SELECT}>
        <option value="">Any disposition</option>
        {DISPOSITION_FILTERS.map((d) => (
          <option key={d} value={d}>
            {DISPOSITION_LABELS[d]}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2 lg:ml-auto">
        {filtered && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-primary hover:underline">
            Clear filters
          </button>
        )}
        <select aria-label="Sort returns" value={sort} onChange={(e) => onSort(e.target.value as ReturnSort)} className={SELECT}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>
    </div>
  );
}
