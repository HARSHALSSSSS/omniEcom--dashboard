/* eslint-disable react-refresh/only-export-components -- the shared look (class strings, colour maps) lives next to the components that use it */
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { InspectionStatus, RefundStatus, ReturnStage } from "@/types/returns";
import { PAGE_SIZES } from "./returnParams";

/** the button looks of the Returns design */
export const BTN_LIGHT = "inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-semibold text-[#000000] shadow-2xs transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_DARK = "inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#111111] bg-[#111111] px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60";
export const DRAWER_BTN_DARK = "h-[34px] rounded-lg border border-[#EAEAEA] bg-[#111111] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50";
export const DRAWER_BTN_LIGHT = "h-[34px] rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-semibold text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
export const TABLE_WRAP = "w-full overflow-x-auto rounded-lg border border-[#EAEAEA] bg-white";
export const SELECT_SM = "h-[28px] cursor-pointer rounded-md border border-[#EAEAEA] bg-white px-2 text-[11px] font-medium text-black outline-none transition-colors hover:border-[#CCCCCC] focus:border-black";
export const SELECT_MD = "h-[34px] rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-semibold text-black outline-none hover:bg-neutral-50 focus:border-black disabled:opacity-50";
export const FIELD_INPUT = "h-[36px] w-full rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black placeholder:text-[#999999] focus:border-black focus:outline-none";

/** the status colours of the design */
export const STAGE_COLOR: Record<ReturnStage, string> = {
  requested: "text-[#0A0A0A]",
  approved: "text-[#16A34A]",
  in_transit: "text-[#2563EB]",
  received: "text-[#D97706]",
  inspecting: "text-[#D97706]",
  resolution: "text-[#D97706]",
  refunded: "text-[#16A34A]",
  closed: "text-[#16A34A]",
  rejected: "text-[#DC2626]",
  cancelled: "text-[#666666]",
};

export const INSPECTION_COLOR: Record<InspectionStatus, string> = {
  not_started: "text-[#666666]",
  in_progress: "text-[#2563EB] font-medium",
  requires_review: "text-[#D97706] font-medium",
  passed: "text-[#16A34A] font-medium",
  failed: "text-[#DC2626] font-medium",
};

export const REFUND_COLOR: Record<RefundStatus, string> = {
  not_applicable: "text-[#666666]",
  pending: "text-[#D97706] font-medium",
  ready: "text-[#16A34A] font-medium",
  processing: "text-[#2563EB] font-medium",
  processed: "text-[#16A34A] font-medium",
  failed: "text-[#DC2626] font-medium",
};

export function dispositionColor(disposition: string): string {
  if (disposition === "sellable") return "text-[#16A34A] font-medium";
  if (disposition === "damaged" || disposition === "rejected" || disposition === "write_off") return "text-[#DC2626] font-medium";
  if (disposition === "quarantine" || disposition === "repair" || disposition === "mixed") return "text-[#D97706] font-medium";
  return "text-[#666666]";
}

/**
 * A slide-in panel with the dimmed backdrop of the design. It is a dialog (Escape and a click outside close it, focus moves in),
 * which the static design did not do.
 */
export function DrawerShell({ label, onClose, size = "md", children, footer }: { label: string; onClose: () => void; /** md is 536px wide, lg 580px (the create form) */ size?: "md" | "lg"; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-['Inter',sans-serif]">
      <div onClick={onClose} aria-hidden className="animate-in fade-in fixed inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity duration-200" />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "animate-in slide-in-from-right fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-[#EAEAEA] bg-white text-[#0A0A0A] shadow-2xl outline-none transition-transform duration-300 ease-out",
          size === "md" ? "max-w-[536px] sm:w-[536px]" : "max-w-[580px] sm:w-[580px]",
        )}
      >
        {children}
        {footer}
      </aside>
    </div>
  );
}

export function CloseButton({ onClick, label = "Close drawer" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#666666] transition-colors hover:bg-neutral-100 hover:text-black">
      <X className="h-4 w-4 stroke-[1.5]" />
    </button>
  );
}

/** the loading, error and empty looks of a table or a drawer */
export function Notice({ title, description, tone = "neutral", action, role }: { title: string; description?: string; tone?: "neutral" | "error"; action?: ReactNode; role?: "alert" | "status" }) {
  return (
    <div role={role} className={cn("flex flex-col items-center justify-center gap-1.5 rounded-lg border px-6 py-10 text-center", tone === "error" ? "border-[#FCA5A5] bg-[#FEF2F2]" : "border-[#EAEAEA] bg-white")}>
      <p className={cn("text-[13px] font-semibold", tone === "error" ? "text-[#991B1B]" : "text-black")}>{title}</p>
      {description && <p className={cn("max-w-[520px] text-[12px]", tone === "error" ? "text-[#991B1B]" : "text-[#666666]")}>{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-px overflow-hidden rounded-lg border border-[#EAEAEA] bg-white p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="my-2 h-8 w-full animate-pulse rounded bg-[#F5F5F5]" />
      ))}
    </div>
  );
}

/** 1 ... 4 5 [6] 7 8 ... 20 */
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

interface DesignPaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  shown: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** extra text after the count (the design adds "open" and a note) */
  suffix?: ReactNode;
}

/** the footer of every table: range, rows per page and numbered pages */
export function DesignPagination({ page, pages, total, pageSize, shown, noun, onPage, onPageSize, suffix }: DesignPaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + shown;
  return (
    <nav aria-label={`${noun} pagination`} className="flex flex-col justify-between gap-3 pt-1 text-[11px] sm:flex-row sm:items-center">
      <span className="text-[11px] text-[#666666]" aria-live="polite">
        Showing{" "}
        <span className="font-semibold text-black">
          {formatNumber(first)}–{formatNumber(last)}
        </span>{" "}
        of <span className="font-semibold text-black">{formatNumber(total)}</span> {noun}
        {suffix}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-[#666666]">
          <span>Rows per page:</span>
          <select aria-label={`${noun} per page`} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className={SELECT_SM}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className={cn("flex h-7 w-7 items-center justify-center rounded-md border border-[#EAEAEA] transition-colors", page <= 1 ? "cursor-not-allowed bg-[#FAFAFA] text-[#BDBDBD]" : "cursor-pointer text-[#666666] hover:bg-neutral-100 hover:text-black")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {windowOf(page, pages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-[#666666]">
                ...
              </span>
            ) : (
              <button
                key={n}
                type="button"
                aria-label={`Page ${n}`}
                aria-current={n === page ? "page" : undefined}
                onClick={() => onPage(n)}
                className={cn("flex h-7 min-w-[28px] cursor-pointer items-center justify-center rounded-md px-2 text-[11px] transition-colors", n === page ? "bg-[#111111] font-semibold text-white shadow-xs" : "border border-[#EAEAEA] text-[#666666] hover:bg-neutral-50 hover:text-black")}
              >
                {n}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            aria-label="Next page"
            className={cn("flex h-7 w-7 items-center justify-center rounded-md border border-[#EAEAEA] transition-colors", page >= pages ? "cursor-not-allowed bg-[#FAFAFA] text-[#BDBDBD]" : "cursor-pointer text-[#666666] hover:bg-neutral-100 hover:text-black")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </nav>
  );
}

/** a section title and one-line description */
export function SectionHeading({ title, description, level = 2 }: { title: string; description?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div>
      <H className={level === 2 ? "text-[18px] font-semibold leading-[26px] text-black" : "text-[16px] font-semibold leading-[24px] text-black"}>{title}</H>
      {description && <p className="text-[12px] leading-[17px] text-[#666666]">{description}</p>}
    </div>
  );
}

/** a labelled value row of a drawer */
export function KeyValue({ label, children, strong = true }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-[12px]">
      <span className="w-36 shrink-0 text-[#666666]">{label}</span>
      <span className={cn("min-w-0 flex-1 text-left text-black", strong && "font-medium")}>{children}</span>
    </div>
  );
}
