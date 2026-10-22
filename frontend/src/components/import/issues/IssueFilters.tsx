import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { ImportSummary, IssueSeverity, IssueStatus, RowStatus } from "@/types/import";
import { ROW_STATUSES } from "@/types/import";
import { codeLabel, num } from "../importFormat";
import type { IssuesUrl } from "../importParams";

type Patch = Partial<Record<"code" | "severity" | "status" | "q" | "rows" | "field" | "sort", string | null>>;

/** the design's filter "buttons": native selects dressed as the teammate's dropdown buttons */
const SELECT =
  "h-[36px] appearance-none rounded-[5px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card pl-3 pr-8 text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white transition-colors hover:bg-neutral-50";

function Dropdown({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex items-center">
      <select aria-label={label} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 opacity-60" aria-hidden />
    </span>
  );
}

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
    <label className="relative block flex-1">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#666666]" aria-hidden />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-[36px] w-full rounded-[5px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card pl-9 pr-3 text-[12px] leading-[18px]"
      />
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
  /** the fields of the import (target fields of GET /imports/options) for the "Field" filter */
  fields: Array<{ key: string; label: string }>;
}

/** Search, the Issue type / Severity / Status / Field filters, the sort note and the issue kinds as tabs (counts from GET /imports/{id}/summary). */
export function IssueFilters({ summary, url, onChange, onClear, filtered, fields }: Props) {
  const all = summary ? countFor(url.status, summary) : undefined;
  const tabs = summary?.byCode ?? [];
  const tab = (active: boolean) =>
    `whitespace-nowrap px-3.5 py-1.5 rounded-[5px] font-medium text-[12px] leading-[18px] transition-colors ${
      active ? "bg-[#000000] text-white dark:bg-white dark:text-black font-semibold" : "text-[#666666] hover:text-[#000000] hover:bg-[#F6F6F6] dark:hover:bg-muted/50"
    }`;
  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <SearchBox value={url.q ?? ""} label="Search issues" placeholder="Search product, SKU or row..." onSearch={(q) => onChange({ q: q || null })} />
          <div className="flex items-center gap-1.5">
            <Dropdown label="Issue type" value={url.code ?? ""} onChange={(v) => onChange({ code: v || null })}>
              <option value="">Issue type</option>
              {tabs.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.title || codeLabel(t.code)}
                </option>
              ))}
            </Dropdown>
            <Dropdown label="Severity" value={url.severity ?? ""} onChange={(v) => onChange({ severity: (v as IssueSeverity) || null })}>
              <option value="">Severity</option>
              <option value="error">Blocking</option>
              <option value="warning">Warning</option>
            </Dropdown>
            <Dropdown label="Status" value={url.status} onChange={(v) => onChange({ status: v as IssueStatus | "all" })}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="ignored">Ignored</option>
              <option value="all">Any status</option>
            </Dropdown>
            <Dropdown label="Field" value={url.field ?? ""} onChange={(v) => onChange({ field: v || null })}>
              <option value="">Field</option>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Dropdown>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[12px] leading-[18px] text-[#666666] font-medium">
          <span>Sort ·</span>
          <Dropdown label="Sort" value={url.sort} onChange={(v) => onChange({ sort: v })}>
            <option value="severity">Most important first</option>
            <option value="row">Row, first to last</option>
            <option value="-row">Row, last to first</option>
            <option value="code">Issue type</option>
          </Dropdown>
        </div>
      </div>

      <div role="tablist" aria-label="Issue kind" className="flex items-center gap-2 overflow-x-auto border-b border-[#E3E3E3] dark:border-border pb-2 text-[12px] leading-[18px]">
        <button type="button" role="tab" aria-selected={!url.code} className={tab(!url.code)} onClick={() => onChange({ code: null })}>
          All issues{all !== undefined && <span className="ml-1.5 tabular-nums">{num(all)}</span>}
        </button>
        {tabs.map((t) => (
          <button key={t.code} type="button" role="tab" aria-selected={url.code === t.code} className={tab(url.code === t.code)} onClick={() => onChange({ code: t.code })}>
            {t.title || codeLabel(t.code)}
            <span className="ml-1.5 tabular-nums">{num(countFor(url.status, t))}</span>
          </button>
        ))}
        {filtered && (
          <button type="button" className="ml-auto h-[32px] rounded-[5px] px-3 text-[12px] font-semibold text-[#000000] dark:text-white hover:bg-[#F6F6F6] dark:hover:bg-muted/50" onClick={onClear}>
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
      <div className="w-full max-w-xs">
        <SearchBox value={q} label="Search rows" placeholder="Search SKU or title" onSearch={(v) => onChange({ q: v || null })} />
      </div>
      <Dropdown label="Row status" value={status ?? ""} onChange={(v) => onChange({ rows: v || null })}>
        <option value="">All rows</option>
        {ROW_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </Dropdown>
    </div>
  );
}
