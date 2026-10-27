import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatINR, formatNumber } from "@/utils/format";
import type { OverviewKpis } from "@/types/reports";

interface Delta {
  text: string;
  tone: "up" | "down" | "flat" | "none";
  note: string;
}

const NONE: Delta = { text: "No comparison", tone: "none", note: "" };

/** the change of a figure against the comparison range, as a percentage of the earlier value */
function percentDelta(cur: number, prev: number | undefined, note: string): Delta {
  if (prev === undefined) return NONE;
  if (prev <= 0) return { text: cur > 0 ? "New" : "No change", tone: cur > 0 ? "up" : "flat", note: "Nothing to compare with" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return { text: "No change", tone: "flat", note };
  return { text: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, tone: pct > 0 ? "up" : "down", note };
}

/** the change of a rate in percentage points */
function pointDelta(curBps: number | null, prevBps: number | null | undefined, note: string, upIsGood: boolean): Delta {
  if (prevBps === undefined) return NONE;
  if (curBps === null || prevBps === null) return { text: "—", tone: "none", note: "Not known for both periods" };
  const pp = (curBps - prevBps) / 100;
  if (Math.abs(pp) < 0.05) return { text: "No change", tone: "flat", note };
  const good = pp > 0 === upIsGood;
  return { text: `${pp > 0 ? "+" : ""}${pp.toFixed(1)} pp`, tone: good ? "up" : "down", note };
}

function DeltaLine({ delta }: { delta: Delta }) {
  const color = delta.tone === "up" ? "text-emerald-600" : delta.tone === "down" ? "text-rose-600" : "text-muted-foreground";
  const Icon = delta.tone === "up" ? ArrowUpRight : delta.tone === "down" ? ArrowDownRight : Minus;
  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${color}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{delta.text}</span>
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  delta: Delta;
  note: string;
}

function Tile({ label, value, delta, note }: TileProps) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="font-mono text-2xl font-extrabold text-foreground">{value}</div>
      <DeltaLine delta={delta} />
      <p className="text-[11px] text-muted-foreground">{delta.note && delta.tone !== "none" ? `${delta.note} · ${note}` : note}</p>
    </div>
  );
}

const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);

/** the five numbers of the period, each against the comparison range when there is one; margin shows a dash while product costs are missing */
export function ReportsOverviewKpiStrip({ data }: { data: OverviewKpis }) {
  const { totals: t, previous: p, refunds, previousRefunds, margin, previousMargin } = data;
  const cmp = data.previousRange ? "vs previous range" : "";
  const compared = data.compare !== "none";

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">COMMERCE PERFORMANCE</span>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Tile
          label="Net sales"
          value={formatINR(t.netSalesMinor, true)}
          delta={compared ? percentDelta(t.netSalesMinor, p?.netSalesMinor, cmp) : NONE}
          note={p ? `vs ${formatINR(p.netSalesMinor, true)} before` : "After discounts, before tax and shipping"}
        />
        <Tile label="Orders" value={formatNumber(t.orders)} delta={compared ? percentDelta(t.orders, p?.orders, cmp) : NONE} note={p ? `vs ${formatNumber(p.orders)} before` : `${formatNumber(t.units)} units`} />
        <Tile
          label="Average order value"
          value={t.orders > 0 ? formatINR(t.averageOrderValueMinor) : "—"}
          delta={compared ? percentDelta(t.averageOrderValueMinor, p?.averageOrderValueMinor, cmp) : NONE}
          note="Total of orders ÷ orders"
        />
        <Tile
          label="Refunds / gross sales"
          value={pct(refunds.rateBps)}
          delta={compared ? pointDelta(refunds.rateBps, previousRefunds ? previousRefunds.rateBps : undefined, cmp, false) : NONE}
          note={`${formatINR(refunds.amountMinor, true)} refunded`}
        />
        <Tile
          label="Gross margin"
          value={pct(margin.marginBps)}
          delta={compared ? pointDelta(margin.marginBps, previousMargin ? previousMargin.marginBps : undefined, cmp, true) : NONE}
          note={margin.marginBps === null ? "Needs product costs on your products" : margin.completeness === "complete" ? `${formatINR(margin.contributionMinor ?? 0, true)} contribution` : `Costs known for ${Math.round(margin.coverage * 100)}% of revenue`}
        />
      </div>
    </div>
  );
}
