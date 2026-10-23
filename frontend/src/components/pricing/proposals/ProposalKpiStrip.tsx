interface ProposalKpiStripProps {
  pendingCount?: number;
  belowTargetCount?: number;
  appliedCount?: number;
}

export function ProposalKpiStrip({
  pendingCount = 3,
  belowTargetCount = 2,
  appliedCount = 0,
}: ProposalKpiStripProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* 3 Metric Cards */}
      <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Metric 1: Pending review */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {pendingCount}
            </span>
            <span className="text-xs font-semibold text-foreground">Pending review</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            Proposed · Approval required
          </p>
        </div>

        {/* Metric 2: Below margin target */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-amber-600">
              {belowTargetCount}
            </span>
            <span className="text-xs font-semibold text-foreground">Below margin target</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            Target ≥ 30% · Per channel
          </p>
        </div>

        {/* Metric 3: Proposals applied */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {appliedCount}
            </span>
            <span className="text-xs font-semibold text-foreground">Proposals applied</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            No live price changes
          </p>
        </div>
      </div>

      {/* Right Box: Review first notice */}
      <div className="lg:col-span-4 rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 shadow-sm flex flex-col justify-center text-xs space-y-1">
        <p className="font-bold text-foreground">Review first. Apply only after approval.</p>
        <p className="text-muted-foreground leading-relaxed text-[11.5px]">
          Proposals are separate from current prices. No approvals or live updates have occurred.
        </p>
      </div>
    </div>
  );
}
