import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useSpendRows, useSpendSummary } from "@/hooks/useProfitability";
import { formatNumber } from "@/utils/format";
import type { DateRange, SpendAccount, SpendRow } from "@/types/profitability";
import { WRITE_REASON, money, rangeLabel, spendAccountLabel } from "./profitFormat";
import { NO_ACCOUNT, PAGE_SIZES, spendQueryOf, type ProfitUrlState } from "./profitParams";

const SELECT = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";
const NAV = "h-8 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

interface Props {
  state: ProfitUrlState;
  range: DateRange;
  accounts: SpendAccount[];
  canWrite: boolean;
  onAdd: () => void;
  onImport: () => void;
  onEdit: (row: SpendRow) => void;
  onDelete: (row: SpendRow) => void;
  onSearch: (q: string) => void;
  onAccount: (account: string | null) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onClear: () => void;
}

/** totals and the rows of advertising spend in the selected range, with filters, paging and the write actions */
export function SpendPanel({ state, range, accounts, canWrite, onAdd, onImport, onEdit, onDelete, onSearch, onAccount, onPage, onPageSize, onClear }: Props) {
  const query = spendQueryOf(state);
  const list = useSpendRows(query);
  const summary = useSpendSummary(range);
  const rows = list.data?.items ?? [];
  const filtered = Boolean(state.q || state.account);
  const q = state.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  // a page past the end (rows deleted, an old link) falls back to the last page
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && state.page > d.pages) onPage(d.pages);
  }, [list.data, state.page, onPage]);

  const total = list.data?.total ?? 0;
  const page = list.data?.page ?? state.page;
  const pages = list.data?.pages ?? 1;
  const first = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
  const accountOptions = state.account && state.account !== NO_ACCOUNT && !accounts.some((a) => a.id === state.account) ? [...accounts, { id: state.account, displayName: "Selected account", marketplace: "", status: "" }] : accounts;

  return (
    <section aria-labelledby="spend-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="spend-title" className="text-base font-semibold text-foreground">
            Advertising spend
          </h2>
          <p className="text-xs text-muted-foreground">Recorded spend for {rangeLabel(range)} feeds the advertising step of the waterfall. Until at least one row exists the step is missing, and a recorded 0 counts as known.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs" disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onClick={onImport}>
            Import CSV
          </Button>
          <Button size="sm" className="text-xs" disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onClick={onAdd}>
            Record spend
          </Button>
        </div>
      </div>

      {summary.isError && !summary.data ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          Spend totals could not be loaded: {errorMessage(summary.error)}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void summary.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">Total spend</span>
            {summary.data ? (
              <>
                <div className="mt-1 text-2xl font-bold text-foreground">{money(summary.data.totalMinor)}</div>
                <div className="text-[11px] text-muted-foreground">{formatNumber(summary.data.rows)} {summary.data.rows === 1 ? "row" : "rows"} recorded</div>
              </>
            ) : (
              <Skeleton className="mt-2 h-8 w-32" />
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">By account</span>
            {summary.data ? (
              summary.data.byAccount.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No spend recorded in this range.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {summary.data.byAccount.slice(0, 5).map((a) => (
                    <li key={a.accountId ?? "none"} className="flex justify-between gap-2">
                      <span className="truncate">{a.accountName ?? "Not tied to an account"}</span>
                      <span className="font-mono">{money(a.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <Skeleton className="mt-2 h-14 w-full" />
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">By campaign</span>
            {summary.data ? (
              summary.data.byCampaign.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No campaign names recorded.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {summary.data.byCampaign.slice(0, 5).map((c) => (
                    <li key={c.campaign} className="flex justify-between gap-2">
                      <span className="truncate">{c.campaign}</span>
                      <span className="font-mono">{money(c.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <Skeleton className="mt-2 h-14 w-full" />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search campaign or notes" placeholder="Search campaign or notes" value={text} onChange={(e) => setText(e.target.value)} className="h-9 pl-8 text-xs" />
        </div>
        <select aria-label="Account" className={SELECT} value={state.account ?? ""} onChange={(e) => onAccount(e.target.value || null)}>
          <option value="">All accounts</option>
          <option value={NO_ACCOUNT}>Not tied to an account</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </select>
        {filtered && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <div role="status" aria-label="Loading spend" className="space-y-px rounded-xl border border-border bg-card p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="my-2 h-9 w-full" />
          ))}
        </div>
      ) : list.isError && !list.data ? (
        <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-8 text-center">
          <h3 className="text-sm font-semibold">Spend could not be loaded.</h3>
          <p className="text-xs text-muted-foreground">{errorMessage(list.error)}</p>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-8 text-center">
          <h3 className="text-sm font-semibold">{filtered ? "No spend matches these filters." : "No advertising spend recorded in this range."}</h3>
          <p className="max-w-lg text-xs text-muted-foreground">
            {filtered ? "Try a different search or account." : "Record what you paid for sponsored placements, or import a CSV, to see the advertising step and a net contribution."}
          </p>
          {filtered ? (
            <Button variant="outline" size="sm" className="text-xs" onClick={onClear}>
              Clear filters
            </Button>
          ) : (
            canWrite && (
              <Button size="sm" className="text-xs" onClick={onAdd}>
                Record spend
              </Button>
            )
          )}
        </div>
      ) : (
        <>
          <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm ${list.isFetching && list.isPlaceholderData ? "opacity-60" : ""}`}>
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-[11px] font-medium text-muted-foreground">
                  <th scope="col" className="px-4 py-3">Date</th>
                  <th scope="col" className="px-4 py-3">Account</th>
                  <th scope="col" className="px-4 py-3">Campaign</th>
                  <th scope="col" className="px-4 py-3 text-right">Amount</th>
                  <th scope="col" className="px-4 py-3">Source</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono">{r.spendDate}</td>
                    <td className="px-4 py-3">{spendAccountLabel(r)}</td>
                    <td className="px-4 py-3">
                      {r.campaign ?? <span className="text-muted-foreground">No campaign</span>}
                      {r.notes && <span className="block text-[11px] text-muted-foreground">{r.notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{money(r.amountMinor)}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{r.source}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} aria-label={`Edit spend of ${r.spendDate}${r.campaign ? ` ${r.campaign}` : ""}`} onClick={() => onEdit(r)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} aria-label={`Delete spend of ${r.spendDate}${r.campaign ? ` ${r.campaign}` : ""}`} onClick={() => onDelete(r)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Showing {formatNumber(first)}-{formatNumber(first + rows.length - 1)} of {formatNumber(total)} rows
            </span>
            <div className="flex items-center gap-2">
              <button type="button" className={NAV} disabled={page <= 1} onClick={() => onPage(page - 1)}>
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pages}
              </span>
              <button type="button" className={NAV} disabled={page >= pages} onClick={() => onPage(page + 1)}>
                Next
              </button>
              <select aria-label="Rows per page" className={SELECT} value={state.pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
