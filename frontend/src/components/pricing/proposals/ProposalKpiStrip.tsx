import { formatNumber } from "@/utils/format";
import { bpsText } from "../pricingFormat";

interface ProposalKpiStripProps {
  /** undefined while loading: a dash is shown, never a made-up number */
  pendingCount?: number;
  /** pending proposals whose current margin is under their policy target */
  belowTargetCount?: number;
  /** more pending proposals exist than were counted */
  belowTargetCapped?: boolean;
  /** the strictest margin target among the pending proposals; null = none has a target */
  targetMarginBps?: number | null;
  appliedCount?: number;
}

const num = (n: number | undefined): string => (n === undefined ? "—" : formatNumber(n));

export function ProposalKpiStrip({ pendingCount, belowTargetCount, belowTargetCapped = false, targetMarginBps, appliedCount }: ProposalKpiStripProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* 3 Metric Cards */}
      <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Metric 1: Pending review */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0 self-center" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {num(pendingCount)}
            </span>
            <span className="text-xs font-semibold text-foreground">Pending review</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            Proposed · Approval required
          </p>
        </div>

        {/* Metric 2: Below margin target */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 self-center" />
            <span className="text-2xl font-bold tracking-tight text-amber-600">
              {belowTargetCount === undefined ? "—" : `${formatNumber(belowTargetCount)}${belowTargetCapped ? "+" : ""}`}
            </span>
            <span className="text-xs font-semibold text-foreground">Below margin target</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            {targetMarginBps === null || targetMarginBps === undefined ? "No margin target on pending proposals" : `Target ≥ ${bpsText(targetMarginBps)} · Per channel`}
          </p>
        </div>

        {/* Metric 3: Proposals applied */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0 self-center" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {num(appliedCount)}
            </span>
            <span className="text-xs font-semibold text-foreground">Proposals applied</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            Approved or applied automatically
          </p>
        </div>
      </div>

      {/* Right Box: Review first notice */}
      <div className="lg:col-span-4 rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 shadow-sm flex flex-col justify-center text-xs space-y-1">
        <p className="font-bold text-foreground">Review first. Apply only after approval.</p>
        <p className="text-muted-foreground leading-relaxed text-[11.5px]">
          Proposals are separate from current prices. A price only changes after you approve it.
        </p>
      </div>
    </div>
  );
}
