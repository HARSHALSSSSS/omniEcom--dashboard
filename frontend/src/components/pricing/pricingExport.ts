import { pricingApi } from "@/api/pricing.api";
import type { PriceProposal, PriceTableQuery, PriceTableRow, ProposalsQuery } from "@/types/pricing";
import { downloadText, priceTableCsv, proposalsCsv } from "./pricingFormat";

/** the API pages at 100; the list endpoints stop at 10 000 rows */
export const EXPORT_PAGE_SIZE = 100;
export const EXPORT_ROW_CAP = 10_000;

export interface ExportResult {
  count: number;
  /** more rows matched than were exported */
  capped: boolean;
  fileName: string;
}

/** pricing-<view>-YYYY-MM-DD.csv (local date) */
export function exportFileName(view: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `pricing-${view}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`;
}

async function collect<T>(fetchPage: (page: number) => Promise<{ items: T[]; pages: number; total: number }>): Promise<{ rows: T[]; total: number }> {
  const rows: T[] = [];
  let total = 0;
  for (let page = 1; rows.length < EXPORT_ROW_CAP; page++) {
    const res = await fetchPage(page);
    total = res.total;
    rows.push(...res.items);
    if (page >= res.pages) break;
  }
  return { rows: rows.slice(0, EXPORT_ROW_CAP), total };
}

/** the Overview's price table with its current search, channel, state filter and sort */
export async function exportPriceTable(query: Omit<PriceTableQuery, "page" | "pageSize">): Promise<ExportResult> {
  const { rows, total } = await collect<PriceTableRow>((page) => pricingApi.priceTable({ ...query, page, pageSize: EXPORT_PAGE_SIZE }));
  const fileName = exportFileName("overview");
  downloadText(fileName, priceTableCsv(rows));
  return { count: rows.length, capped: total > rows.length, fileName };
}

/** the proposals of the current tab and filters */
export async function exportProposals(query: ProposalsQuery): Promise<ExportResult> {
  const { rows, total } = await collect<PriceProposal>((page) => pricingApi.proposals({ ...query, page, pageSize: EXPORT_PAGE_SIZE }));
  const fileName = exportFileName("proposals");
  downloadText(fileName, proposalsCsv(rows));
  return { count: rows.length, capped: total > rows.length, fileName };
}

export const exportToast = (r: ExportResult, noun: string): { title: string; description: string } => ({
  title: "Export ready",
  description: `${r.count} ${r.count === 1 ? noun : `${noun}s`} saved to ${r.fileName}.${r.capped ? ` Only the first ${EXPORT_ROW_CAP.toLocaleString("en-IN")} rows were exported: narrow the filters to export the rest.` : ""}`,
});
