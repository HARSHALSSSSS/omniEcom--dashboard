import { Fragment } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { LIFECYCLE_STAGES, type ReturnSignal, type ReturnStage, type ReturnsOverview, type ReturnsSummary } from "@/types/returns";
import { Notice, SectionHeading } from "./design";
import { formatMoney } from "./returnFormat";

interface LifecycleRailProps {
  overview: ReturnsOverview | undefined;
  summary: ReturnsSummary | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  activeStage: ReturnStage | undefined;
  onPickStage: (stage: ReturnStage | null) => void;
}

/** the stages the rail does not show (they are not "on the path") */
const SIDE_STAGES: ReadonlyArray<{ stage: ReturnStage; label: string }> = [
  { stage: "rejected", label: "Rejected" },
  { stage: "cancelled", label: "Cancelled" },
];

function rateCaption(rate: ReturnsSummary["returnRate"], days: number): string {
  if (rate.percent === null) return `No orders in the last ${days} days`;
  const own = `${formatNumber(rate.returnedOrders)} of ${formatNumber(rate.orders)} orders`;
  if (rate.previousPercent === null || rate.deltaPoints === null) return `${own}. No orders in the previous ${days} days to compare`;
  const delta = rate.deltaPoints === 0 ? "no change" : `${rate.deltaPoints > 0 ? "+" : ""}${rate.deltaPoints} pts`;
  return `${own}. Previous ${days} days: ${rate.previousPercent}% (${delta})`;
}

function Glance({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-3.5 shadow-2xs">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">{label}</p>
      <p className={cn("py-1 text-[25px] font-semibold leading-none", tone ?? "text-black")}>{value}</p>
      <span className="text-[10px] text-[#666666]">{caption}</span>
    </div>
  );
}

/** the four numbers of the screen: requests, inspections waiting, return rate, refund exposure (the window is chosen in the header) */
export function GlanceTiles({ summary }: { summary: ReturnsSummary }) {
  const { requests, pendingInspections: insp, returnRate, refundExposure: exposure } = summary;
  const days = summary.window.days;
  return (
    <div aria-label="Returns at a glance" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Glance label={`Return requests (${days}D)`} value={formatNumber(requests.total)} caption={`${formatNumber(requests.today)} today, ${formatNumber(requests.open)} open`} />
      <Glance
        label="Awaiting warehouse inspection"
        value={formatNumber(insp.count)}
        tone={insp.count > 0 ? "text-[#D97706]" : undefined}
        caption={insp.overdue > 0 ? `${formatNumber(insp.overdue)} overdue (over ${insp.overdueAfterHours} h)` : "None overdue"}
      />
      <Glance label={`Return rate (${days}D)`} value={returnRate.percent === null ? "—" : `${returnRate.percent}%`} caption={rateCaption(returnRate, days)} />
      <Glance
        label="Refund exposure"
        value={formatMoney(exposure.amountMinor, exposure.currency)}
        caption={`${formatNumber(exposure.count)} ${exposure.count === 1 ? "return" : "returns"}, ${formatNumber(exposure.actionableCount)} ready to refund${exposure.mixedCurrencies ? ". Largest currency shown" : ""}`}
      />
    </div>
  );
}

/** the eight stages of the lifecycle with their live queue counts; a stage narrows the ledger below */
export function LifecycleRail({ overview, summary, loading, error, onRetry, activeStage, onPickStage }: LifecycleRailProps) {
  if (error && !overview) {
    return (
      <Notice
        role="alert"
        tone="error"
        title="The return stages could not be loaded."
        description={error}
        action={
          <button type="button" onClick={onRetry} className="rounded-lg border border-[#FCA5A5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#991B1B] hover:bg-[#FEF2F2]">
            Retry
          </button>
        }
      />
    );
  }
  if (loading && !overview) return <div role="status" aria-label="Loading return stages" className="h-[110px] w-full animate-pulse rounded-lg bg-[#F5F5F5]" />;

  const stages = overview?.stages ?? {};
  const countOf = (key: string) => stages[key]?.count ?? 0;
  const sideCount = (stage: ReturnStage) => summary?.stages.find((s) => s.stage === stage)?.count ?? 0;

  return (
    <section className="space-y-3">
      <SectionHeading title="Every return, one controlled path" description="Return Request → Receive → Inspect → Decide → Refund → Inventory Disposition → Close" />

      <div role="group" aria-label="Returns by stage" className="flex flex-wrap items-center justify-between gap-2 border-y border-[#EAEAEA] py-4">
        {LIFECYCLE_STAGES.map((st, i) => {
          const count = countOf(st.key);
          const entry = stages[st.key];
          const active = activeStage === st.stage;
          const amber = st.key === "inspecting" || st.key === "resolution";
          const hint =
            st.key === "inspecting" ? `${formatNumber(entry?.needReview ?? 0)} need review` : st.key === "resolution" ? `${formatNumber(entry?.refundPending ?? 0)} refund pending` : st.hint;
          return (
            <Fragment key={st.key}>
              {i > 0 && <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#666666]" />}
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onPickStage(active ? null : st.stage)}
                className={cn("min-w-[100px] flex-1 cursor-pointer space-y-0.5 rounded-md py-1 pl-2 text-left transition-colors hover:bg-neutral-50", active && "bg-[#F5F8FE] ring-1 ring-[#BAE6FD]")}
              >
                <span className="block text-[11px] font-semibold text-black">{st.label}</span>
                <span className={cn("block py-1 text-[25px] font-semibold leading-none", amber ? "text-[#D97706]" : st.key === "closed" ? "text-[#16A34A]" : "text-black")}>{formatNumber(count)}</span>
                <span className={cn("block text-[10px]", amber ? "font-medium text-[#D97706]" : "text-[#666666]")}>{hint}</span>
              </button>
            </Fragment>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#666666]">
        <span>{overview?.stagesNote ?? "Stage counts are independent operational queues; closed totals cover the last 30 days."}</span>
        {summary && (
          <span className="flex items-center gap-2">
            {SIDE_STAGES.map((s) => {
              const active = activeStage === s.stage;
              return (
                <button
                  key={s.stage}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPickStage(active ? null : s.stage)}
                  className={cn("cursor-pointer hover:text-black hover:underline", active && "font-semibold text-black underline")}
                >
                  {s.label} {formatNumber(sideCount(s.stage))}
                </button>
              );
            })}
          </span>
        )}
      </div>
    </section>
  );
}

const SIGNAL_TEXT: Record<ReturnSignal, (n: number) => string> = {
  awaiting_inspection: (n) => `${n} ${n === 1 ? "return" : "returns"} awaiting inspection`,
  refunds_pending: (n) => `${n} ${n === 1 ? "refund" : "refunds"} pending`,
  inventory_discrepancy: (n) => `${n} ${n === 1 ? "return has" : "returns have"} an inventory discrepancy`,
  high_value_review: (n) => `${n} high-value ${n === 1 ? "return needs" : "returns need"} review`,
};

const SIGNAL_ORDER: readonly ReturnSignal[] = ["awaiting_inspection", "refunds_pending", "inventory_discrepancy", "high_value_review"];

/** the four attention signals with live counts; one narrows the ledger below */
export function SignalRail({ overview, activeSignal, onPick }: { overview: ReturnsOverview | undefined; activeSignal: ReturnSignal | undefined; onPick: (signal: ReturnSignal | null) => void }) {
  const counts = new Map((overview?.attention ?? []).map((a) => [a.key, a.count]));
  return (
    <section aria-label="Needs attention" className="space-y-2.5 rounded-xl border border-[#EAEAEA] bg-[#FFFBF5] p-3.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold text-black">Needs Attention</span>
        <span className="text-[11px] text-[#D97706]">Filter returns below ↓</span>
      </div>
      <div className="flex flex-wrap items-center gap-6 text-[12px]">
        {SIGNAL_ORDER.map((key) => {
          const active = activeSignal === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(active ? null : key)}
              className={cn("flex cursor-pointer items-center gap-1.5 text-left transition-colors", active ? "font-semibold text-[#D97706] underline" : "text-black hover:text-[#D97706]")}
            >
              <AlertCircle aria-hidden className="h-3.5 w-3.5 stroke-[2] text-[#D97706]" />
              <span>{SIGNAL_TEXT[key](counts.get(key) ?? 0)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[#666666]">Signals may overlap on the same return. Select a signal to narrow the ledger.</p>
    </section>
  );
}
