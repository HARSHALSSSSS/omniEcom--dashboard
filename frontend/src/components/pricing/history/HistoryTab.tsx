import { Download } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { usePriceHistory } from "@/hooks/usePricing";
import { formatDateTime, formatINR } from "@/utils/format";
import { PRICE_FIELDS, type PriceField, type PricingChannel } from "@/types/pricing";
import { ListSkeleton, LoadError, SELECT_CLASS, StateBox } from "../PricingStates";
import type { usePricingUrlState } from "../pricingParams";
import { FIELD_LABELS, SOURCE_LABELS, downloadText, historyCsv } from "../pricingFormat";

interface HistoryTabProps {
  url: ReturnType<typeof usePricingUrlState>;
  channels: PricingChannel[];
}

/** the append-only log of every price change (who, when, why), newest first */
export function HistoryTab({ url, channels }: HistoryTabProps) {
  const { history: query, update } = url;
  const list = usePriceHistory(query);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = Boolean(query.accountId || query.field);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Price audit log</h2>
          <p className="text-xs text-muted-foreground">Every price change made here or through a marketplace listing. Entries are never edited or deleted.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={rows.length === 0} onClick={() => downloadText("price-history.csv", historyCsv(rows))}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export loaded rows
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="History channel" className={SELECT_CLASS} value={query.accountId ?? ""} onChange={(e) => update({ account: e.target.value || null })}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.accountId} value={c.accountId}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Price field" className={SELECT_CLASS} value={query.field ?? ""} onChange={(e) => update({ field: (e.target.value as PriceField) || null })}>
          <option value="">All price types</option>
          {PRICE_FIELDS.map((f) => (
            <option key={f} value={f}>
              {FIELD_LABELS[f]}
            </option>
          ))}
        </select>
        {filtered && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => update({ account: null, field: null })}>
            Clear filters
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <ListSkeleton label="Loading price history" />
      ) : list.isError && rows.length === 0 ? (
        <LoadError what="The price history" message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <StateBox title={filtered ? "No price changes match these filters." : "No price changes yet."} description="Approved proposals, bulk updates and edits to a channel price all appear here." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  {["When", "Product / SKU", "Channel", "Type", "Change", "Source", "By"].map((c) => (
                    <th key={c} scope="col" className="px-3 py-3 first:pl-4">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap py-3 pl-4 pr-3">{formatDateTime(r.createdAt)}</td>
                    <td className="px-3 py-3">
                      <span className="block max-w-[240px] truncate font-semibold">{r.productTitle ?? "—"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{r.sku ?? r.variantId}</span>
                    </td>
                    <td className="px-3 py-3">{r.marketplaceAccountId ? (r.accountName ?? "—") : <span className="text-muted-foreground">All channels</span>}</td>
                    <td className="px-3 py-3">{FIELD_LABELS[r.field]}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {r.oldPriceMinor === null ? "—" : formatINR(r.oldPriceMinor)} → <strong>{r.newPriceMinor === null ? "removed" : formatINR(r.newPriceMinor)}</strong>
                    </td>
                    <td className="px-3 py-3">
                      {SOURCE_LABELS[r.source]}
                      {r.reason && <span className="block max-w-[200px] truncate text-[11px] text-muted-foreground" title={r.reason}>{r.reason}</span>}
                    </td>
                    <td className="px-3 py-3">{r.actorName ?? <span className="text-muted-foreground">System</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {rows.length} {rows.length === 1 ? "change" : "changes"} loaded{list.hasNextPage ? "" : ", this is the oldest"}
            </span>
            {list.hasNextPage && (
              <Button variant="outline" size="sm" className="text-xs" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                Load older changes
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
