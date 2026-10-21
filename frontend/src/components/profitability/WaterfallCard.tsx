import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { Waterfall, WaterfallStep } from "@/types/profitability";
import { BASIS_LABELS, BASIS_TONE, coveragePercent, money, percent, rangeLabel, signed } from "./profitFormat";

function BasisBadge({ step }: { step: WaterfallStep }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold", BASIS_TONE[step.basis])}>
      {BASIS_LABELS[step.basis]}
      {step.basis === "estimated" && step.coverage < 1 ? ` (${coveragePercent(step.coverage)} known)` : ""}
    </span>
  );
}

function amountTone(step: WaterfallStep): string {
  if (step.amountMinor === null) return "text-muted-foreground";
  if (step.type === "subtotal") return step.amountMinor < 0 ? "text-red-600" : "text-foreground";
  return step.type === "negative" ? "text-red-600" : "text-emerald-600";
}

function StepRow({ step, index, revenue, compare }: { step: WaterfallStep; index: number; revenue: number; compare: boolean }) {
  const subtotal = step.type === "subtotal";
  const width = step.amountMinor === null || revenue <= 0 ? 0 : Math.min(100, (Math.abs(step.amountMinor) / revenue) * 100);
  const change = step.change?.changePercent;
  return (
    <li className={cn("grid grid-cols-[2rem_1fr_auto] items-start gap-x-3 gap-y-1 py-3.5 text-[13px]", subtotal && "rounded-lg bg-muted/60 px-3 font-semibold")} data-testid={`step-${step.key}`}>
      <span className="pt-0.5 font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(subtotal ? "font-bold text-foreground" : "font-normal text-foreground/90")}>{step.label}</span>
          <BasisBadge step={step} />
          {step.shareOfRevenuePercent !== null && <span className="text-[11px] font-normal text-muted-foreground">{percent(step.shareOfRevenuePercent)} of revenue</span>}
        </div>
        <p className="text-[11px] font-normal text-muted-foreground">{step.tooltip}</p>
        <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
          <div className={cn("h-full rounded", step.type === "negative" ? "bg-red-400" : step.type === "subtotal" ? "bg-foreground/70" : "bg-emerald-500")} style={{ width: `${width}%` }} />
        </div>
      </div>
      <div className="text-right">
        <div className={cn("font-mono font-semibold", amountTone(step))}>{money(step.amountMinor)}</div>
        {compare && (
          <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
            was {money(step.previousAmountMinor)}
            {change !== null && change !== undefined && <span className="ml-1">({signed(change, "%")})</span>}
          </div>
        )}
      </div>
    </li>
  );
}

interface Props {
  data: Waterfall;
  onExport: () => void;
}

/** the P&L bridge exactly as the API returns it: each step with its amount, basis and where the number comes from */
export function WaterfallCard({ data, onExport }: Props) {
  const compare = data.comparison !== null;
  return (
    <section aria-labelledby="waterfall-title" className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 id="waterfall-title" className="text-base font-semibold text-foreground">
            Profit and loss waterfall
          </h2>
          <p className="text-xs text-muted-foreground">
            From gross revenue down to net contribution, {rangeLabel(data.range)}.
            {data.comparison ? ` Compared with ${rangeLabel(data.comparison.range)}.` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={onExport}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export waterfall (CSV)
        </Button>
      </div>
      <ol className="divide-y divide-border">
        {data.steps.map((s, i) => (
          <StepRow key={s.key} step={s} index={i} revenue={data.grossRevenueMinor} compare={compare} />
        ))}
      </ol>
    </section>
  );
}
