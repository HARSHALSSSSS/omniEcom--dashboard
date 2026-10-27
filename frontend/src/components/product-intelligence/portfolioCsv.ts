import { csvCell } from "@/components/procurement/procurementFormat";
import type { IntelItem, IntelPortfolio } from "@/types/intelligence";

const money = (minor: number | null): number | null => (minor === null ? null : Math.round(minor) / 100);
/** the UTF-8 byte order mark that makes Excel read the file as UTF-8 */
const BOM = String.fromCharCode(0xfeff);

/** the Overview as a spreadsheet: the portfolio figures, the top sellers and the products that need a decision (money in main units, rates in percent) */
export function portfolioCsv(p: IntelPortfolio, items: IntelItem[]): string {
  const rows: Array<Array<string | number | null>> = [
    ["Product intelligence", `${p.range.from} to ${p.range.to}`],
    [],
    ["Measure", "Value"],
    ["Net sales (after discounts, before tax and shipping)", money(p.netSalesMinor)],
    ["Orders", p.orders],
    ["Units sold", p.unitsSold],
    ["Average order value", money(p.averageOrderValueMinor)],
    ["Gross profit", money(p.grossProfitMinor)],
    ["Gross margin (%)", p.grossMarginBps === null ? null : p.grossMarginBps / 100],
    ["Products needing a decision", p.prioritizedCount],
    ["Products", p.totalProducts],
    [],
    ["Top products", "SKU", "Net sales", "Share (%)", "Units sold", "In stock", "Days of cover"],
    ...p.salesShare.map((s) => [s.title ?? s.sku, s.sku, money(s.revenueMinor), s.shareBps / 100, s.unitsSold, s.available, s.runwayDays === null ? null : Math.round(s.runwayDays)]),
    [],
    ["Needs a decision", "SKU", "Action", "Why"],
    ...items.filter((i) => i.recommendedAction !== "hold").map((i) => [i.productName, i.sku, i.recommendedAction, i.reasons.map((r) => r.text).join(" ")]),
  ];
  return `${BOM}${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}`;
}
