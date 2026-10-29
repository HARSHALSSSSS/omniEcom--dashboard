import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { EXECUTION_LABELS, EXECUTION_TONE, MODE_LABELS, RUN_LABELS, RUN_TONE, STATUS_LABELS, STATUS_TONE } from "./autoFormat";
import { PAGE_SIZES } from "./autoParams";
import type { ExecutionStatus, RuleMode, RuleStatus, RunStatus } from "@/types/automation";

const BADGE = "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-semibold";

export function RuleBadge({ status }: { status: RuleStatus }) {
  return <span className={cn(BADGE, STATUS_TONE[status])}>{STATUS_LABELS[status]}</span>;
}

export function RunBadge({ status }: { status: RunStatus }) {
  return <span className={cn(BADGE, RUN_TONE[status])}>{RUN_LABELS[status]}</span>;
}

export function ExecutionBadge({ status }: { status: ExecutionStatus }) {
  return <span className={cn(BADGE, EXECUTION_TONE[status])}>{EXECUTION_LABELS[status]}</span>;
}

export function ModeBadge({ mode }: { mode: RuleMode }) {
  return <span className={cn(BADGE, mode === "auto" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-border bg-muted text-foreground/80")}>{MODE_LABELS[mode]}</span>;
}

export function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function LoadError({ noun, message, onRetry }: { noun: string; message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title={`${noun} could not be loaded.`} description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}

export function NoMatches({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <StateBox title={`No ${noun} match these filters.`} description="Try a different search or status.">
      <Button variant="outline" size="sm" className="text-xs" onClick={onClear}>
        Clear filters
      </Button>
    </StateBox>
  );
}

export function EmptyRules({ canWrite, onCreate }: { canWrite: boolean; onCreate: () => void }) {
  return (
    <StateBox title="No automation rules yet." description="A rule watches for an event (low stock, a competitor price drop, a failed sync...), checks your conditions and then does one thing for you. New rules start as drafts and ask for approval before they act.">
      {canWrite && (
        <Button size="sm" className="text-xs" onClick={onCreate}>
          Create rule
        </Button>
      )}
    </StateBox>
  );
}

export function EmptyApprovals() {
  return <StateBox title="Nothing is waiting for approval." description="When a rule that needs approval matches an event, its proposed action appears here for you to approve or dismiss." />;
}

export function EmptyRuns({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  if (filtered) return <NoMatches noun="runs" onClear={onClear} />;
  return <StateBox title="No runs yet." description="Every time a rule matches an event the run is recorded here, whether it ran, is waiting for approval, was dismissed or failed." />;
}

export function TableSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-px overflow-hidden rounded-xl border border-border bg-card p-4">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}

function windowOfPages(page: number, pages: number): Array<number | "gap"> {
  const sorted = [...new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

const NAV = "h-9 sm:h-8 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  shown: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export function AutoPagination({ page, pages, total, pageSize, shown, noun, onPage, onPageSize }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label="Pagination" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} {noun}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button type="button" className={NAV} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        {windowOfPages(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground" aria-hidden>
              ...
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={`h-9 sm:h-7 min-w-[36px] sm:min-w-[28px] rounded px-1.5 text-xs font-semibold cursor-pointer ${n === page ? "bg-muted font-bold" : "hover:bg-muted"}`}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" className={NAV} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
        <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-9 sm:h-8 rounded-lg border border-border bg-card px-2 text-xs font-medium cursor-pointer">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-sm min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</span>
      <span className="font-mono text-2xl font-bold text-foreground truncate">{value}</span>
      {hint && <span className={cn("text-[11px] break-words", tone ?? "text-muted-foreground")}>{hint}</span>}
    </div>
  );
}

export function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground break-words">{children}</span>
    </div>
  );
}

export function KeyValues({ values, empty = "None" }: { values: Record<string, unknown> | null | undefined; empty?: string }) {
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return <p className="text-[11px] text-muted-foreground">{empty}</p>;
  return (
    <dl className="grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate font-mono text-muted-foreground" title={k}>
            {k}
          </dt>
          <dd className="break-words font-medium text-foreground">{typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
