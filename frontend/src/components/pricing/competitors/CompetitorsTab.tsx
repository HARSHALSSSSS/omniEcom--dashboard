import { useEffect, useState } from "react";
import { Plus, Search, Trash2, Upload } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompetitorPrices, useDeleteCompetitor } from "@/hooks/usePricing";
import { toast } from "@/hooks/useToast";
import { formatDateTime } from "@/utils/format";
import type { CompetitorPrice, PricingChannel } from "@/types/pricing";
import { ListSkeleton, LoadError, SELECT_CLASS, StateBox } from "../PricingStates";
import { PricingPagination } from "../PricingPagination";
import { DEFAULT_PAGE_SIZE, type usePricingUrlState } from "../pricingParams";
import { NO_WRITE_REASON, money } from "../pricingFormat";
import { CompetitorDialog } from "./CompetitorDialog";
import { CompetitorImportDialog } from "./CompetitorImportDialog";

const SOURCE_TEXT: Record<CompetitorPrice["source"], string> = { manual: "Entered", import: "CSV import", api: "Connector" };

interface CompetitorsTabProps {
  url: ReturnType<typeof usePricingUrlState>;
  channels: PricingChannel[];
  canWrite: boolean;
}

/** the competitor prices the match-competitor strategy follows: added by hand or by CSV, never scraped */
export function CompetitorsTab({ url, channels, canWrite }: CompetitorsTabProps) {
  const { competitors: query, update } = url;
  const list = useCompetitorPrices(query);
  const remove = useDeleteCompetitor();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<CompetitorPrice | null>(null);

  const q = query.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => update({ cq: text.trim() }, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [text, q, update]);

  // a page past the end falls back to the last page
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && query.page > d.pages) update({ cpage: String(d.pages) }, { replace: true });
  }, [list.data, query.page, update]);

  const rows = list.data?.items ?? [];
  const filtered = Boolean(query.q || query.accountId || query.latest);

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        toast({ title: "Competitor price deleted" });
      },
      onError: (e) => {
        setDeleting(null);
        toast({ title: "Could not delete the price", description: errorMessage(e), variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Competitor prices</h2>
          <p className="text-xs text-muted-foreground">What competitors charge for your products. You enter these yourself; nothing is scraped.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={!canWrite} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => setImporting(true)}>
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Import CSV
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" disabled={!canWrite} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add price
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Search competitor prices" placeholder="Search by SKU, product or seller..." value={text} onChange={(e) => setText(e.target.value)} className="pl-9 text-xs" />
        </div>
        <select aria-label="Competitor channel" className={SELECT_CLASS} value={query.accountId ?? ""} onChange={(e) => update({ account: e.target.value || null })}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.accountId} value={c.accountId}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[#1D4ED8]" checked={query.latest} onChange={(e) => update({ latest: e.target.checked ? "true" : null })} />
          Latest price per product only
        </label>
      </div>

      {list.isLoading ? (
        <ListSkeleton label="Loading competitor prices" />
      ) : list.isError && !list.data ? (
        <LoadError what="Competitor prices" message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? (
          <StateBox title="No competitor prices match these filters." description="Try a different search or channel.">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => update({ cq: null, account: null, latest: null })}>
              Clear filters
            </Button>
          </StateBox>
        ) : (
          <StateBox title="No competitor prices yet." description="Record what a competitor charges to let the match-competitor strategy follow it, and to see it next to each proposal.">
            {canWrite && (
              <Button size="sm" className="text-xs" onClick={() => setAdding(true)}>
                Add the first price
              </Button>
            )}
          </StateBox>
        )
      ) : (
        <>
          <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${list.isFetching && list.isPlaceholderData ? "opacity-60" : ""}`}>
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Product / SKU
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Seller
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Channel
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Price
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Observed
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Source
                  </th>
                  <th scope="col" className="py-3 pl-3 pr-4 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <span className="block max-w-[260px] truncate font-semibold">{c.productTitle ?? "—"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{c.sku ?? c.variantId}</span>
                    </td>
                    <td className="px-3 py-3">{c.sellerName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-3">{c.accountName ?? <span className="text-muted-foreground">Any channel</span>}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">{money(c.priceMinor, c.currency)}</td>
                    <td className="px-3 py-3">{formatDateTime(c.observedAt)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{SOURCE_TEXT[c.source]}</td>
                    <td className="py-3 pl-3 pr-4 text-right">
                      <Button variant="ghost" size="icon-sm" disabled={!canWrite} title={canWrite ? "Delete this price" : NO_WRITE_REASON} aria-label={`Delete competitor price for ${c.sku ?? c.variantId}`} onClick={() => setDeleting(c)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PricingPagination
            page={list.data?.page ?? query.page}
            pages={list.data?.pages ?? 1}
            total={list.data?.total ?? 0}
            pageSize={query.pageSize}
            shown={rows.length}
            noun="prices"
            onPage={(p) => update({ cpage: p > 1 ? String(p) : null })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      <CompetitorDialog open={adding} channels={channels} onClose={() => setAdding(false)} />
      <CompetitorImportDialog open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this competitor price?"
        description={deleting ? `The ${money(deleting.priceMinor, deleting.currency)} observation for ${deleting.sku ?? "this product"} is removed.` : ""}
        confirmText="Delete price"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
