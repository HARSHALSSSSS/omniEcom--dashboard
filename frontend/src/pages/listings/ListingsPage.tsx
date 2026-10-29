import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { BulkContentEditDialog } from "@/components/listings/flows/BulkContentEditDialog";
import { CreateMasterListingModal } from "@/components/listings/list/CreateMasterListingModal";
import { ListingBulkBar } from "@/components/listings/list/ListingBulkBar";
import { ListingBulkResultsDialog } from "@/components/listings/list/ListingBulkResultsDialog";
import { ListingChannelTabs } from "@/components/listings/list/ListingChannelTabs";
import { ListingFilters } from "@/components/listings/list/ListingFilters";
import { ListingIssues } from "@/components/listings/list/ListingIssues";
import { ListingMatrix } from "@/components/listings/list/ListingMatrix";
import { ListingMenu } from "@/components/listings/list/ListingMenu";
import { ListingReach } from "@/components/listings/list/ListingReach";
import { ListingTabs } from "@/components/listings/list/ListingTabs";
import { ListingsPagination } from "@/components/listings/list/ListingsPagination";
import { EmptyCatalog, EmptyNotListed, NoMatches } from "@/components/listings/list/ListingsStates";
import { ListingsTable } from "@/components/listings/list/ListingsTable";
import { NotListedTable } from "@/components/listings/list/NotListedTable";
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT, isFiltered, queryOf, useListingsUrlState } from "@/components/listings/list/listingParams";
import { ACTION_LABELS, bulkReviewPath, csvOfListings, downloadCsv, notListedKey, viewOfBulk, viewOfCreate, type ResultsView } from "@/components/listings/list/listingFormat";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import {
  listingKeys,
  useBulkListings,
  useChannelSummary,
  useCreateListings,
  useListingChannels,
  useListingFilterOptions,
  useListingsInsights,
  useListingsMatrix,
  useListingsOverview,
  useListingsTable,
  useNotListed,
} from "@/hooks/useListings";
import { toast } from "@/hooks/useToast";
import { formatNumber } from "@/utils/format";
import type { CreateTarget, ListingBulkAction, ListingRow, ListingTab, NotListedRow } from "@/types/listing";
import { ListingDetailDrawer } from "./ListingDetailDrawer";
import { ListingsErrorState } from "./ListingsErrorState";
import { ListingTableRowsSkeleton, ListingsSkeleton } from "./ListingsSkeleton";

/** the API takes at most this many listings per bulk call (the page size never exceeds it) */
const BULK_MAX = 100;
/** master products the matrix starts with; "Show more products" adds {@link MATRIX_STEP} up to the API's {@link MATRIX_MAX} */
const MATRIX_ROWS = 5;
const MATRIX_STEP = 10;
const MATRIX_MAX = 50;

const GHOST_BUTTON = "flex h-9 min-h-[44px] sm:min-h-[36px] cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#BDBDBD] px-3 text-[12px] font-medium text-[#000000] transition-colors hover:bg-neutral-50";

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2 py-1">
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-[10px] font-medium uppercase leading-[12px] tracking-wider text-[#707070]">COMMERCE</span>
        <h1 className="text-[26px] font-semibold leading-[31px] tracking-tight text-[#000000]">Listings</h1>
        <p className="text-[13px] font-normal leading-[16px] text-[#666666]">Manage how your master products appear across every connected marketplace.</p>
      </div>
      {children}
    </header>
  );
}

export default function ListingsPage() {
  const navigate = useNavigate();
  const url = useListingsUrlState();
  const { update, clearFilters, filters, sort, page, pageSize } = url;
  const canWrite = useCan("listings:write");

  const productMode = Boolean(filters.productId);
  const notListedTab = filters.tab === "not_listed" && !productMode;
  const query = queryOf(url);

  const queryClient = useQueryClient();
  const [matrixRows, setMatrixRows] = useState(MATRIX_ROWS);
  const [createOpen, setCreateOpen] = useState(false);
  const [editIds, setEditIds] = useState<string[] | null>(null);

  const channels = useListingChannels();
  const channelSummary = useChannelSummary();
  const filterOptions = useListingFilterOptions(!productMode);
  const overview = useListingsOverview({ marketplace: filters.marketplace, accountId: filters.accountId }, !productMode);
  const matrix = useListingsMatrix(matrixRows, !productMode);
  const insights = useListingsInsights(!productMode);
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
    return { all: o.totals.listings, ...o.byScreenStatus, draft: o.byStatus.draft ?? 0, not_listed: o.byScreenStatus.not_listed ?? o.totals.notListed };
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

  const exportRows = (subset: ListingRow[], name: string) => {
    if (subset.length === 0) return;
    downloadCsv(name, csvOfListings(subset));
    toast({ title: "Export downloaded", description: `Exported ${subset.length} ${subset.length === 1 ? "listing" : "listings"} to CSV.`, variant: "success" });
  };

  const running: ListingBulkAction | "create" | null = creator.isPending ? "create" : bulk.isPending && bulk.variables && !busyId ? bulk.variables.action : null;
  const firstLoad = list.isLoading && !table.data && !notListed.data;
  const listError = list.isError && !list.data;
  const empty = (notListedTab ? variants.length : rows.length) === 0;
  const refreshing = list.isFetching && list.isPlaceholderData;
  const catalogEmpty = !notListedTab && !productMode && !filtered && !list.isLoading && !listError && total === 0;
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const shown = notListedTab ? variants.length : rows.length;
  const first = total === 0 ? 0 : ((list.data?.page ?? page) - 1) * pageSize + 1;
  const last = ((list.data?.page ?? page) - 1) * pageSize + shown;

  if (firstLoad) return <ListingsSkeleton />;
  if (listError) return <ListingsErrorState onRetry={() => void list.refetch()} isRetrying={list.isRefetching} message={errorMessage(list.error)} />;

  if (catalogEmpty) {
    return (
      <div className="flex w-full flex-col items-start gap-4 pb-24 font-['Inter',sans-serif] text-[#000000]">
        <Header />
        <EmptyCatalog masterProducts={insights.data?.masterProducts} channels={channels.data} onCreate={() => setCreateOpen(true)} />
        <CreateMasterListingModal open={createOpen} onClose={() => setCreateOpen(false)} channels={channels.data} canWrite={canWrite} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-3 pb-24 font-['Inter',sans-serif] text-[#000000]">
      <Header>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex h-9 min-h-[44px] sm:min-h-[36px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#666666] bg-white px-3 sm:px-4 text-[12px] font-semibold text-[#000000] shadow-none transition-colors hover:bg-neutral-50 flex-1 sm:flex-initial"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.2]" aria-hidden />
            Create listing
          </button>

          <button
            type="button"
            disabled={bulk.isPending}
            onClick={() => (selected.size > 0 && !notListedTab ? runBulk("publish", [...selected]) : navigate(ROUTES.LISTINGS_PUBLISH))}
            className="flex h-9 min-h-[44px] sm:min-h-[36px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#000000] px-3 sm:px-4 text-[12px] font-semibold text-[#FFFFFF] transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 flex-1 sm:flex-initial"
          >
            {running === "publish" ? "Publishing…" : "Publish products"}
          </button>

          <ListingMenu
            label="More"
            buttonClassName={GHOST_BUTTON}
            items={[
              { label: "Import CSV catalog", onSelect: () => navigate(ROUTES.PRODUCTS_IMPORT) },
              { label: "Export listings (CSV)", onSelect: () => exportRows(rows, "listings.csv"), disabled: notListedTab || rows.length === 0, title: notListedTab ? "Switch to a listings tab to export" : undefined },
              { label: "Marketplace channels", onSelect: () => navigate(ROUTES.MARKETPLACE_HUB) },
            ]}
          />
        </div>
      </Header>

      {productMode && (
        <div className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] px-4 py-2.5 text-[12px]">
          <span>
            Showing the listings of <strong className="font-semibold">{productTitle ?? "one product"}</strong> only.
          </span>
          <button type="button" onClick={() => update({ productId: null })} className="h-7 min-h-[44px] sm:min-h-[28px] cursor-pointer rounded-lg border border-[#BDBDBD] bg-white px-3 text-[12px] font-medium hover:bg-neutral-50 self-start sm:self-auto inline-flex items-center">
            Show all listings
          </button>
        </div>
      )}

      {!productMode && matrix.data && matrix.data.items.length > 0 && matrix.data.channels.length > 0 && (
        <ListingMatrix
          matrix={matrix.data}
          loading={matrix.isFetching}
          onShowMore={matrixRows < MATRIX_MAX ? () => setMatrixRows((n) => Math.min(MATRIX_MAX, n + MATRIX_STEP)) : undefined}
          onShowFewer={matrixRows > MATRIX_ROWS ? () => setMatrixRows(MATRIX_ROWS) : undefined}
        />
      )}

      {!productMode && <ListingReach insights={insights.data} onReview={() => update({ tab: "needs_review" })} />}

      <section className="w-full space-y-3 pt-1">
        <ListingChannelTabs marketplace={filters.marketplace} summary={channelSummary.data} onChange={(code) => update({ marketplace: code, account: null })} />
        <ListingTabs active={filters.tab} counts={counts} hideNotListed={productMode} onChange={(tab) => update({ tab })} />
        <ListingFilters
          filters={filters}
          sort={sort}
          channels={channels.data}
          variantsOnly={notListedTab}
          hideSort={productMode}
          hideCatalogFilters={productMode}
          filterOptions={filterOptions.data}
          onSearch={(q) => update({ q }, { replace: true })}
          onCategory={(id) => update({ category: id })}
          onReadiness={(band) => update({ readiness: band })}
          onInventory={(inventory) => update({ inventory })}
          onPotential={(potential) => update({ potential })}
          onProductStatus={(status) => update({ productStatus: status })}
          onMarketplace={(code) => update({ marketplace: code, account: null })}
          onAccount={(id) => update({ account: id })}
          onStatus={(status) => update({ status })}
          onContent={(state) => update({ content: state })}
          onSource={(source) => update({ source })}
          onAttention={(on) => update({ attention: on ? "true" : null })}
          onSort={(s) => update({ sort: s === DEFAULT_SORT ? null : s })}
          onClear={clearFilters}
        />
      </section>

      {!productMode && insights.data && (
        <ListingIssues issues={insights.data.issues} active={filters.issue} onToggle={(issue) => update({ issue })} onFilter={() => update({ attention: "true", tab: null })} />
      )}

      <section className="w-full space-y-0 pt-1">
        <div className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 pb-2">
          <h2 className="text-[18px] font-semibold leading-[22px] text-[#000000]">{notListedTab ? "Products to list" : "Listings"}</h2>
          <span className="text-[12px] font-normal leading-[15px] text-[#666666]">
            Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
          </span>
        </div>

        {selected.size > 0 && (
          <ListingBulkBar
            count={selected.size}
            max={BULK_MAX}
            mode={notListedTab ? "variants" : "listings"}
            canWrite={canWrite}
            busy={bulk.isPending || creator.isPending}
            running={running}
            onAction={(action) => runBulk(action, [...selected])}
            onCreate={() => runCreate(variants.filter((v) => selected.has(notListedKey(v))).map(targetOf))}
            onEdit={() => setEditIds([...selected])}
            onExport={() => exportRows(selectedRows, `selected_listings_${selectedRows.length}.csv`)}
            onAudit={() => navigate(ROUTES.LISTINGS_READINESS)}
            onFullReview={() => navigate(bulkReviewPath([...selected].slice(0, BULK_MAX)))}
            onToggleAll={toggleAll}
            onClear={() => setSelected(new Set())}
          />
        )}

        {list.isLoading ? (
          <div role="status" aria-label="Loading listings" className="w-full border-y border-[#EAEAEA]">
            <ListingTableRowsSkeleton />
          </div>
        ) : empty ? (
          notListedTab && !filters.q && !filters.marketplace && !filters.accountId ? <EmptyNotListed hasAccounts={hasAccounts} /> : <NoMatches onClear={clearFilters} />
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
                shown={shown}
                noun={notListedTab ? "products to list" : "listings"}
                onPage={(p) => update({ page: p > 1 ? String(p) : null })}
                onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
              />
            )}
          </>
        )}

        {selected.size > 0 && !notListedTab && (
          <div className="mt-3 flex w-full flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] p-3.5 text-[12px] font-normal text-[#666666]">
            <span>
              {formatNumber(selected.size)} of {formatNumber(total)} listings selected. Review listing readiness before publishing.
            </span>
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-[44px] sm:min-h-0 cursor-pointer text-xs font-medium text-black hover:underline inline-flex items-center">
              Clear selection
            </button>
          </div>
        )}
      </section>

      <ListingDetailDrawer listingId={quickId} onClose={() => setQuickId(null)} />
      <CreateMasterListingModal open={createOpen} onClose={() => setCreateOpen(false)} channels={channels.data} canWrite={canWrite} />
      <BulkContentEditDialog
        open={editIds !== null}
        listingIds={editIds ?? []}
        onClose={() => setEditIds(null)}
        onDone={() => {
          setEditIds(null);
          setSelected(new Set());
          void queryClient.invalidateQueries({ queryKey: listingKeys.all });
        }}
      />
      <ListingBulkResultsDialog view={results} onClose={() => setResults(null)} />
    </div>
  );
}
