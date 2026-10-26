import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { ITEM_STATUS_LABELS, ITEM_STATUS_TONE, STATUS_LABELS, STATUS_TONE } from "./promoFormat";
import { PAGE_SIZES } from "./promoParams";
import type { PromotionItemStatus, PromotionStatus } from "@/types/promotions";

export function CampaignBadge({ status }: { status: PromotionStatus }) {
  return <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold", STATUS_TONE[status])}>{STATUS_LABELS[status]}</span>;
}

export function ItemBadge({ status }: { status: PromotionItemStatus }) {
  return <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold", ITEM_STATUS_TONE[status])}>{ITEM_STATUS_LABELS[status]}</span>;
}

export function ChannelChips({ channels }: { channels: Array<{ accountId: string; displayName: string }> }) {
  if (channels.length === 0) return <span className="text-[11px] text-muted-foreground">No connected account</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {channels.map((c) => (
        <span key={c.accountId} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">
          {c.displayName}
        </span>
      ))}
    </div>
  );
}

function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
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

export function EmptyCampaigns({ canWrite, onCreate }: { canWrite: boolean; onCreate: () => void }) {
  return (
    <StateBox title="No campaigns yet." description="A campaign puts a discount on the products you choose, on the marketplaces you choose, for the dates you choose. Build one as a draft, check which products can run, then schedule it.">
      {canWrite && (
        <Button size="sm" className="text-xs" onClick={onCreate}>
          Create campaign
        </Button>
      )}
    </StateBox>
  );
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

const NAV = "h-8 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

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

export function PromoPagination({ page, pages, total, pageSize, shown, noun, onPage, onPageSize }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} {noun}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={NAV} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        {windowOfPages(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="text-xs text-muted-foreground" aria-hidden>
              ...
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={`h-7 min-w-[28px] rounded px-1 text-xs font-semibold ${n === page ? "bg-muted" : "hover:bg-muted"}`}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" className={NAV} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
        <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 rounded-lg border border-border bg-card px-2 text-xs font-medium">
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


export function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{children}</span>
    </div>
  );
}
