import { csvCell } from "@/components/procurement/procurementFormat";
import type { OverviewKpis } from "@/types/reports";

/** the UTF-8 byte order mark that makes Excel read the file as UTF-8 */
const BOM = String.fromCharCode(0xfeff);
const money = (minor: number | null): number | null => (minor === null ? null : Math.round(minor) / 100);
const rate = (bps: number | null): number | null => (bps === null ? null : bps / 100);

/** the Overview as a spreadsheet: totals (with the comparison range), channels and the trend; money in main units (rupees), rates in percent, a UTF-8 BOM so Excel reads it */
export function overviewCsv(d: OverviewKpis, channelName: (code: string) => string): string {
  const rows: Array<Array<string | number | null>> = [
    ["Reports overview", `${d.range.from} to ${d.range.to}`, d.previousRange ? `Compared with ${d.previousRange.from} to ${d.previousRange.to}` : "No comparison"],
    [],
    ["Measure", "This range", "Comparison range"],
    ["Orders", d.totals.orders, d.previous?.orders ?? null],
    ["Units", d.totals.units, d.previous?.units ?? null],
    ["Total of orders (tax and shipping included)", money(d.totals.grossMinor), money(d.previous?.grossMinor ?? null)],
    ["Net sales (after discounts, before tax and shipping)", money(d.totals.netSalesMinor), money(d.previous?.netSalesMinor ?? null)],
    ["Discounts", money(d.totals.discountMinor), money(d.previous?.discountMinor ?? null)],
    ["Tax", money(d.totals.taxMinor), money(d.previous?.taxMinor ?? null)],
    ["Shipping", money(d.totals.shippingMinor), money(d.previous?.shippingMinor ?? null)],
    ["Average order value", money(d.totals.averageOrderValueMinor), money(d.previous?.averageOrderValueMinor ?? null)],
    ["Refunds processed", money(d.refunds.amountMinor), money(d.previousRefunds?.amountMinor ?? null)],
    ["Refunds / gross sales (%)", rate(d.refunds.rateBps), rate(d.previousRefunds?.rateBps ?? null)],
    ["Gross margin (%)", rate(d.margin.marginBps), rate(d.previousMargin?.marginBps ?? null)],
    [],
    ["Channel", "Orders", "Sales", "Share (%)", "Average order value", "Gross margin (%)", "Sales in comparison range"],
    ...d.channels.map((c) => [channelName(c.marketplace), c.orders, money(c.grossMinor), rate(c.shareBps), money(c.averageOrderValueMinor), rate(c.marginBps), money(c.previousGrossMinor)]),
    [],
    ["Bucket (UTC)", "Orders", "Sales"],
    ...d.series.map((s) => [s.bucket.slice(0, 10), s.orders, money(s.grossMinor)]),
  ];
  return `${BOM}${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}`;
}
