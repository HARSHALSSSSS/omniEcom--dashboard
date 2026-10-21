import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { ImportSummary, IssueSeverity, IssueStatus, RowStatus } from "@/types/import";
import { ROW_STATUSES } from "@/types/import";
import { codeLabel, num } from "../importFormat";
import type { IssuesUrl } from "../importParams";

type Patch = Partial<Record<"code" | "severity" | "status" | "q" | "rows", string | null>>;

const SELECT = "h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium";

/** the search box keeps its own text and reaches the URL after a short pause, so typing does not refetch on every key */
function SearchBox({ value, label, placeholder, onSearch }: { value: string; label: string; placeholder: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text.trim() === value) return;
    const t = setTimeout(() => onSearch(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text, value, onSearch]);
  return (
    <label className="relative block w-full max-w-xs">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs" />
    </label>
  );
}

const countFor = (status: IssuesUrl["status"], x: { total: number; open: number; resolved: number; ignored: number }): number => (status === "all" ? x.total : x[status]);

interface Props {
  summary: ImportSummary | undefined;
  url: IssuesUrl;
  onChange: (patch: Patch) => void;
  onClear: () => void;
  filtered: boolean;
}

/** The issue kinds as tabs (counts from GET /imports/{id}/summary) plus severity, status and search. */
export function IssueFilters({ summary, url, onChange, onClear, filtered }: Props) {
  const all = summary ? countFor(url.status, summary) : undefined;
  const tabs = summary?.byCode ?? [];
  const tab = (active: boolean) => `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`;
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Issue kind" className="flex items-center gap-1.5 overflow-x-auto border-b border-border pb-2">
        <button type="button" role="tab" aria-selected={!url.code} className={tab(!url.code)} onClick={() => onChange({ code: null })}>
          All issues{all !== undefined && <span className="ml-1.5 tabular-nums">{num(all)}</span>}
        </button>
        {tabs.map((t) => (
          <button key={t.code} type="button" role="tab" aria-selected={url.code === t.code} className={tab(url.code === t.code)} onClick={() => onChange({ code: t.code })}>
            {t.title || codeLabel(t.code)}
            <span className="ml-1.5 tabular-nums">{num(countFor(url.status, t))}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={url.q ?? ""} label="Search issues" placeholder="Search value, SKU or title" onSearch={(q) => onChange({ q: q || null })} />
        <select aria-label="Severity" className={SELECT} value={url.severity ?? ""} onChange={(e) => onChange({ severity: (e.target.value as IssueSeverity) || null })}>
          <option value="">All severities</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
        </select>
        <select aria-label="Status" className={SELECT} value={url.status} onChange={(e) => onChange({ status: e.target.value as IssueStatus | "all" })}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
          <option value="all">Any status</option>
        </select>
        {filtered && (
          <button type="button" className="h-9 rounded-lg px-3 text-xs font-semibold text-primary hover:bg-muted" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/** the toolbar of the "Rows" view: search and the row status */
export function RowsToolbar({ q, status, onChange }: { q: string; status: RowStatus | undefined; onChange: (patch: Patch) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox value={q} label="Search rows" placeholder="Search SKU or title" onSearch={(v) => onChange({ q: v || null })} />
      <select aria-label="Row status" className={SELECT} value={status ?? ""} onChange={(e) => onChange({ rows: e.target.value || null })}>
        <option value="">All rows</option>
        {ROW_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}
