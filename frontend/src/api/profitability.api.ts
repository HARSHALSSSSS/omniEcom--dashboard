import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ImportUnit,
  SpendAccount,
  SpendPage,
  SpendQuery,
  SpendRow,
  SpendSummary,
  SpendWrite,
  SpendImportResult,
  Waterfall,
  WaterfallQuery,
} from "@/types/profitability";

export function waterfallParams(q: WaterfallQuery): Record<string, string> {
  const out: Record<string, string> = { from: q.from, to: q.to };
  if (q.compare) out.compare = "previous";
  return out;
}

export function spendParams(q: SpendQuery): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = { pageSize: q.pageSize };
  if (q.page > 1) out.page = q.page;
  if (q.from) out.from = q.from;
  if (q.to) out.to = q.to;
  if (q.q) out.q = q.q;
  if (q.account === "none") out.unallocated = true;
  else if (q.account) out.accountId = q.account;
  return out;
}

export const profitabilityApi = {
  waterfall: async (query: WaterfallQuery, signal?: AbortSignal) =>
    unwrap<Waterfall>(await client.get(ENDPOINTS.PROFIT_WATERFALL, { params: waterfallParams(query), signal })),

  profitability: async (query?: { groupBy?: "product" | "marketplace" | "order"; from?: string; to?: string; compare?: "previous" }, signal?: AbortSignal) =>
    unwrap<any>(await client.get(ENDPOINTS.PROFITABILITY, { params: query, signal })),

  spend: async (query: SpendQuery, signal?: AbortSignal) =>
    unwrap<SpendPage>(await client.get(ENDPOINTS.MARKETING_SPEND, { params: spendParams(query), signal })),

  spendSummary: async (range: { from: string; to: string }, signal?: AbortSignal) =>
    unwrap<SpendSummary>(await client.get(ENDPOINTS.MARKETING_SPEND_SUMMARY, { params: range, signal })),

  createSpend: async (body: SpendWrite) => unwrap<SpendRow>(await client.post(ENDPOINTS.MARKETING_SPEND, body)),

  updateSpend: async (id: string, body: Partial<SpendWrite>) => unwrap<SpendRow>(await client.patch(ENDPOINTS.MARKETING_SPEND_ROW(id), body)),

  deleteSpend: async (id: string) => unwrap<{ id: string; deleted: true }>(await client.delete(ENDPOINTS.MARKETING_SPEND_ROW(id))),

  /** the raw CSV text goes as the request body; `dryRun` reports what would change without saving */
  importSpend: async (csv: string, opts: { unit: ImportUnit; dryRun: boolean }) =>
    unwrap<SpendImportResult>(
      await client.post(ENDPOINTS.MARKETING_SPEND_IMPORT, csv, {
        params: { unit: opts.unit, dryRun: opts.dryRun },
        headers: { "Content-Type": "text/csv" },
      }),
    ),

  /** connected marketplace accounts a spend row can belong to */
  accounts: async (): Promise<SpendAccount[]> => {
    const res = await client.get<{ data: SpendAccount[] }>(ENDPOINTS.MARKETPLACE_ACCOUNTS, { params: { limit: 100 } });
    return res.data.data.map((a) => ({ id: a.id, marketplace: a.marketplace, displayName: a.displayName, status: a.status }));
  },
};
