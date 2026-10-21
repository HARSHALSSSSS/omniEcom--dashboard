import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { ChannelRow, Component, Waterfall } from "@/types/profitability";
import { BASIS_LABELS, missingList, money, percent } from "./profitFormat";

/** a component's amount; an estimated one carries a marker, a missing one is a dash */
function Cell({ c, tone }: { c: Component; tone?: string }) {
  return (
    <td className={cn("px-4 py-3 text-right font-mono", c.amountMinor === null ? "text-muted-foreground" : tone)}>
      {money(c.amountMinor)}
      {c.basis === "estimated" && (
        <span className="ml-1 font-sans text-[10px] text-amber-700" title={BASIS_LABELS.estimated}>
          est.
        </span>
      )}
    </td>
  );
}

function Row({ c }: { c: ChannelRow }) {
  const net = c.netProfitMinor;
  return (
    <tr className="hover:bg-muted/40">
      <td className="px-4 py-3 font-semibold text-foreground">
        {c.label}
        <span className="block text-[11px] font-normal text-muted-foreground">{c.orders} orders</span>
        {c.missing.length > 0 && <span className="block text-[11px] font-normal text-amber-700">Missing: {missingList(c.missing)}</span>}
      </td>
      <Cell c={c.grossRevenue} tone="text-foreground" />
      <Cell c={c.cogs} />
      <Cell c={c.marketplaceFees} />
      <Cell c={c.shippingCosts} />
      <Cell c={c.returnsImpact} />
      <Cell c={c.advertisingSpend} />
      <td className={cn("px-4 py-3 text-right font-mono font-bold", net === null ? "text-muted-foreground" : net < 0 ? "text-red-600" : "text-emerald-600")}>
        {money(net)}
        {net === null && <span className="block font-sans text-[10px] font-normal">known part {money(c.knownPartMinor)}</span>}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-foreground">{percent(c.netMarginPercent)}</td>
    </tr>
  );
}

interface Props {
  data: Waterfall;
  onExport: () => void;
}

export function ChannelsTable({ data, onExport }: Props) {
  return (
    <section aria-labelledby="channels-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 id="channels-title" className="text-sm font-semibold text-foreground">
            Net margin by marketplace
          </h2>
          <p className="text-[11px] text-muted-foreground">Costs are shown as positive amounts. A dash means the cost is not known for that marketplace.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={onExport} disabled={data.channels.length === 0}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export channels (CSV)
        </Button>
      </div>
      {data.channels.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">No orders in this period, so there is nothing to split by marketplace.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-[11px] font-medium text-muted-foreground">
                <th scope="col" className="px-4 py-3">Channel</th>
                <th scope="col" className="px-4 py-3 text-right">Gross revenue</th>
                <th scope="col" className="px-4 py-3 text-right">Product cost</th>
                <th scope="col" className="px-4 py-3 text-right">Marketplace fees</th>
                <th scope="col" className="px-4 py-3 text-right">Shipping</th>
                <th scope="col" className="px-4 py-3 text-right">Returns and refunds</th>
                <th scope="col" className="px-4 py-3 text-right">Advertising</th>
                <th scope="col" className="px-4 py-3 text-right">Net profit</th>
                <th scope="col" className="px-4 py-3 text-right">Net margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.channels.map((c) => (
                <Row key={c.channel} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
