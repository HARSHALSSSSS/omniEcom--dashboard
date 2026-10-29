import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { Button } from "@/components/ui/button";
import type { PurchaseOrderStatus, SupplierStatus } from "@/types/procurement";
import { PO_STATUS_CLASS, PO_STATUS_LABEL, SUPPLIER_STATUS_CLASS, SUPPLIER_STATUS_LABEL } from "./procurementFormat";
import { PAGE_SIZES } from "./procurementParams";

export const SELECT = "h-10 sm:h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";
export const FIELD_SELECT = "h-10 sm:h-9 w-full rounded-md border border-input bg-background px-3 text-xs disabled:opacity-50";
const CHIP = "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-semibold";

export function PoStatusPill({ status, isLate }: { status: PurchaseOrderStatus; isLate?: boolean }) {
  if (isLate) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
        Overdue · 2 days
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-300">
        Awaiting approval
      </span>
    );
  }
  if (status === "submitted") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        In transit
      </span>
    );
  }
  if (status === "acknowledged") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-300">
        Confirmed
      </span>
    );
  }
  if (status === "partially_received") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        Partially received
      </span>
    );
  }
  return <span className={cn(CHIP, PO_STATUS_CLASS[status])}>{PO_STATUS_LABEL[status]}</span>;
}

export function SupplierStatusPill({ status }: { status: SupplierStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-300">
        Active
      </span>
    );
  }
  if (status === "inactive") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-300">
        Setup incomplete
      </span>
    );
  }
  return <span className={cn(CHIP, SUPPLIER_STATUS_CLASS[status])}>{SUPPLIER_STATUS_LABEL[status]}</span>;
}

/** an open order past its expected day */
export function LateChip() {
  return <span className={cn(CHIP, "border-rose-200 bg-rose-50 text-rose-700")}>Late</span>;
}

export function InlineError({ message, id }: { message: string; id?: string }) {
  return (
    <p id={id} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      {message}
    </p>
  );
}

/** a labelled form control with its own error line (the error also reaches screen readers through aria-describedby) */
export function Field({ id, label, hint, error, required, children, className }: { id: string; label: ReactNode; hint?: string; error?: string | null; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-semibold">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-red-700">
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", strong ? "font-semibold text-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}

export function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title={title} description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}

export function TableSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2 rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

/** the pages around the current one: 1 ... 4 5 [6] 7 8 ... 20 */
function windowOf(page: number, pages: number): Array<number | "gap"> {
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

export function Pagination({ page, pages, total, pageSize, shown, noun, onPage, onPageSize }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label="Pagination" className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} {noun}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        <button type="button" className={NAV} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        {windowOf(page, pages).map((n, i) =>
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
              className={cn("h-7 min-w-[28px] rounded px-1 text-xs font-semibold", n === page ? "bg-muted" : "hover:bg-muted")}
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
