import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { ListingBulkBar } from "@/components/listings/list/ListingBulkBar";
import { ListingBulkResultsDialog } from "@/components/listings/list/ListingBulkResultsDialog";
import { ListingDrawer } from "@/components/listings/list/ListingDrawer";
import { ListingFilters } from "@/components/listings/list/ListingFilters";
import { ListingTabs } from "@/components/listings/list/ListingTabs";
import { ListingsPagination } from "@/components/listings/list/ListingsPagination";
import { EmptyListings, EmptyNotListed, LoadError, NoMatches } from "@/components/listings/list/ListingsStates";
import { ListingsTable, TableSkeleton } from "@/components/listings/list/ListingsTable";
import { NotListedTable } from "@/components/listings/list/NotListedTable";
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT, isFiltered, queryOf, useListingsUrlState } from "@/components/listings/list/listingParams";
import { ACTION_LABELS, notListedKey, viewOfBulk, viewOfCreate, type ResultsView } from "@/components/listings/list/listingFormat";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useBulkListings, useCreateListings, useListingChannels, useListingsOverview, useListingsTable, useNotListed } from "@/hooks/useListings";
import { toast } from "@/hooks/useToast";
import type { CreateTarget, ListingBulkAction, ListingRow, ListingTab, NotListedRow } from "@/types/listing";

/** the API takes at most this many listings per bulk call (the page size never exceeds it) */
const BULK_MAX = 100;

export default function ListingsPage() {
  const navigate = useNavigate();
  const url = useListingsUrlState();
  const { update, clearFilters, filters, sort, page, pageSize } = url;
  const canWrite = useCan("listings:write");

  const productMode = Boolean(filters.productId);
  const notListedTab = filters.tab === "not_listed" && !productMode;
  const query = queryOf(url);

  const channels = useListingChannels();
  const overview = useListingsOverview({ marketplace: filters.marketplace, accountId: filters.accountId }, !productMode);
  const table = useListingsTable(query, !notListedTab);
  const notListed = useNotListed(query, notListedTab);
  const bulk = useBulkListings();
  const creator = useCreateListings();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<ResultsView | null>(null);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = notListedTab ? notListed : table;
  const rows = useMemo<ListingRow[]>(() => table.data?.items ?? [], [table.data]);
  const variants = useMemo<NotListedRow[]>(() => notListed.data?.items ?? [], [notListed.data]);
  const quickRow = rows.find((r) => r.id === quickId) ?? null;

  const queryKey = JSON.stringify(query);
  // a selection belongs to the page it was made on
  useEffect(() => setSelected(new Set()), [queryKey]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [list.data, page, update]);

  const counts = useMemo<Partial<Record<ListingTab, number>> | undefined>(() => {
    if (productMode) return table.data?.counts;
    const o = overview.data;
    if (!o) return undefined;
    return { all: o.totals.listings, ...o.byScreenStatus, not_listed: o.byScreenStatus.not_listed ?? o.totals.notListed };
  }, [productMode, table.data, overview.data]);

  const hasAccounts = (channels.data?.accounts ?? []).some((a) => a.status === "active");
  const filtered = isFiltered(filters);
  const total = list.data?.total ?? 0;
  const productTitle = rows[0]?.productTitle;

  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const ids = useMemo(() => (notListedTab ? variants.map(notListedKey) : rows.map((r) => r.id)), [notListedTab, variants, rows]);
  const toggleAll = useCallback(() => setSelected((prev) => (ids.length > 0 && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids))), [ids]);

  const runBulk = (action: ListingBulkAction, targets: string[], single = false) => {
    if (single) setBusyId(targets[0] ?? null);
    bulk.mutate(
      { action, ids: targets },
      {
        onSuccess: (res) => {
          setResults(viewOfBulk(action, res));
          // what failed stays selected so it can be retried or looked at
          setSelected(new Set(res.results.filter((r) => !r.ok).map((r) => r.id)));
        },
        onError: (e) => toast({ title: `${ACTION_LABELS[action]} failed`, description: errorMessage(e), variant: "destructive" }),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const runCreate = (targets: Array<CreateTarget>) =>
    creator.mutate(targets, {
      onSuccess: (outcomes) => {
        setResults(viewOfCreate(outcomes));
        setSelected(new Set(outcomes.filter((o) => !o.ok).map((o) => o.key)));
      },
      onError: (e) => toast({ title: "Could not create listings", description: errorMessage(e), variant: "destructive" }),
    });

  const targetOf = (r: NotListedRow): CreateTarget => ({ variantId: r.variantId, accountId: r.accountId, label: `${r.sku} · ${r.marketplaceName}` });
  const busyKey = creator.isPending && creator.variables?.length === 1 ? `${creator.variables[0]?.variantId}:${creator.variables[0]?.accountId}` : null;

  const loadingList = list.isLoading;
  const listError = list.isError && !list.data;
  const empty = (notListedTab ? variants.length : rows.length) === 0;
  const refreshing = list.isFetching && list.isPlaceholderData;

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="COMMERCE CATALOG"
        title="Listings Management"
        description="Unified status matrix and multi-channel publication studio across your connected marketplaces."
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.PRODUCTS_IMPORT)}>
              Import Products
            </Button>
            <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => navigate(ROUTES.PRODUCTS_NEW)}>
              Create Product
            </Button>
          </div>
        }
      />

      {productMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs">
          <span>
            Showing the listings of <strong className="font-semibold">{productTitle ?? "one product"}</strong> only.
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => update({ productId: null })}>
            Show all listings
          </Button>
        </div>
      )}

      <ListingTabs active={filters.tab} counts={counts} hideNotListed={productMode} onChange={(tab) => update({ tab })} />

      <ListingFilters
        filters={filters}
        sort={sort}
        channels={channels.data}
        variantsOnly={notListedTab}
        filtered={filtered}
        hideSort={productMode}
        onSearch={(q) => update({ q }, { replace: true })}
        onMarketplace={(code) => update({ marketplace: code, account: null })}
        onAccount={(id) => update({ account: id })}
        onStatus={(status) => update({ status })}
        onContent={(state) => update({ content: state })}
        onSource={(source) => update({ source })}
        onAttention={(on) => update({ attention: on ? "true" : null })}
        onSort={(s) => update({ sort: s === DEFAULT_SORT ? null : s })}
        onClear={clearFilters}
      />

      {selected.size > 0 && (
        <ListingBulkBar
          count={selected.size}
          max={BULK_MAX}
          mode={notListedTab ? "variants" : "listings"}
          canWrite={canWrite}
          busy={bulk.isPending || creator.isPending}
          onAction={(action) => runBulk(action, [...selected])}
          onCreate={() => runCreate(variants.filter((v) => selected.has(notListedKey(v))).map(targetOf))}
          onClear={() => setSelected(new Set())}
        />
      )}

      {loadingList ? (
        <TableSkeleton rows={8} />
      ) : listError ? (
        <LoadError message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : empty ? (
        notListedTab && !filters.q && !filters.marketplace && !filters.accountId ? (
          <EmptyNotListed hasAccounts={hasAccounts} />
        ) : filtered ? (
          <NoMatches onClear={clearFilters} />
        ) : (
          <EmptyListings />
        )
      ) : (
        <>
          {notListedTab ? (
            <NotListedTable
              rows={variants}
              selected={selected}
              canWrite={canWrite}
              refreshing={refreshing}
              busyKey={busyKey}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onCreate={(r) => runCreate([targetOf(r)])}
            />
          ) : (
            <ListingsTable
              rows={rows}
              selected={selected}
              canWrite={canWrite}
              refreshing={refreshing}
              busyId={bulk.isPending ? busyId : null}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onQuickView={(r) => setQuickId(r.id)}
              onAction={(r, action) => runBulk(action, [r.id], true)}
            />
          )}
          {!productMode && (
            <ListingsPagination
              page={list.data?.page ?? page}
              pages={list.data?.pages ?? 1}
              total={total}
              pageSize={pageSize}
              shown={notListedTab ? variants.length : rows.length}
              noun={notListedTab ? "products to list" : "listings"}
              onPage={(p) => update({ page: p > 1 ? String(p) : null })}
              onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
            />
          )}
        </>
      )}

      <ListingDrawer row={quickRow} onClose={() => setQuickId(null)} />
      <ListingBulkResultsDialog view={results} onClose={() => setResults(null)} />
    </div>
  );
}
