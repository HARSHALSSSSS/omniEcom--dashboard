import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import type { Waterfall } from "@/types/profitability";
import { DASH, missingList, money, percent, rangeLabel, signed } from "./profitFormat";

function Card({ label, value, tone, children }: { label: string; value: string; tone?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <span className="text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <div className={cn("mt-1 text-[28px] font-bold leading-tight", tone ?? "text-foreground")}>{value}</div>
      <div className="mt-1 min-h-4 text-[11px] text-muted-foreground">{children}</div>
    </div>
  );
}

const trend = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "text-muted-foreground" : v > 0 ? "font-medium text-emerald-600" : "font-medium text-red-600");

export function ProfitKpis({ data, loading }: { data: Waterfall | undefined; loading: boolean }) {
  if (!data) {
    return (
      <div role="status" aria-label={loading ? "Loading profitability" : "No figures"} className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[124px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  const cmp = data.comparison;
  const net = data.netContributionMinor;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      <Card label="Gross revenue" value={money(data.grossRevenueMinor)}>
        {cmp ? (
          <span className={trend(cmp.grossRevenue.changePercent)}>
            {cmp.grossRevenue.changePercent === null ? `No comparable revenue in ${rangeLabel(cmp.range)}` : `${signed(cmp.grossRevenue.changePercent, "%")} vs previous period`}
          </span>
        ) : (
          `${data.ordersInRange} orders in this period`
        )}
      </Card>
      <Card label="Net contribution" value={money(net)} tone={net === null ? "text-muted-foreground" : net < 0 ? "text-red-600" : "text-emerald-600"}>
        {net === null ? (
          <span>
            Not a profit figure yet: {missingList(data.missing)} {data.missing.length === 1 ? "is" : "are"} missing. Revenue minus known costs is {money(data.knownPartMinor)}.
          </span>
        ) : cmp ? (
          <span className={trend(cmp.netContribution.changePercent)}>{cmp.netContribution.changePercent === null ? `Previous period: ${money(cmp.previousNetContributionMinor)}` : `${signed(cmp.netContribution.changePercent, "%")} vs previous period`}</span>
        ) : (
          "After refunds, product cost, fees, shipping and advertising"
        )}
      </Card>
      <Card label="Net margin" value={net === null ? DASH : percent(data.netMarginPercent)}>
        {net === null ? "Available once every cost is known" : cmp ? <span className={trend(cmp.netMarginPoints)}>{cmp.netMarginPoints === null ? "No margin to compare in the previous period" : `${signed(cmp.netMarginPoints, " pts")} vs previous period`}</span> : "Net contribution as a share of gross revenue"}
      </Card>
    </div>
  );
}
