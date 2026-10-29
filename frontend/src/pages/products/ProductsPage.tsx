import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useCan } from "@/hooks/useCan";
import {
  useBulkProducts,
  useCatalog,
  useCatalogStats,
  useCategoryOptions,
  useChannelOptions,
  useDeleteProduct,
  useDuplicateProduct,
  useExportCatalog,
} from "@/hooks/useProducts";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { BulkProductAction, BulkResponse, CatalogProduct, CatalogStats, SavedView } from "@/types/product";
import { BulkBar } from "@/components/products/list/BulkBar";
import { BulkResultsDialog } from "@/components/products/list/BulkResultsDialog";
import {
  INVENTORY_OPTIONS,
  PAGE_SIZES,
  SORT_OPTIONS,
  TABS,
  TYPE_OPTIONS,
  paramsOfView,
  useCatalogUrlState,
  viewFiltersOf,
  type CatalogTab,
} from "@/components/products/list/catalogParams";
import { FilterDropdown } from "@/components/products/list/FilterDropdown";
import {
  CardSkeletons,
  EmptyCatalog,
  EmptyTab,
  GRID,
  LoadError,
  NoMatches,
  PRIMARY_BUTTON,
} from "@/components/products/list/ListStates";
import { Pagination } from "@/components/products/list/Pagination";
import { ProductCard } from "@/components/products/list/ProductCard";
import { NO_EDIT_REASON, type RowAction } from "@/components/products/list/listModel";
import { SaveViewPopover, SavedViewsMenu } from "@/components/products/list/SavedViews";
import { saveBlob } from "@/components/products/list/saveBlob";
import { formatNumber } from "@/utils/format";

const IMPORT_SOURCES = [
  { source: "marketplace", label: "Marketplace catalog import" },
  { source: "csv_excel", label: "CSV / Excel import" },
  { source: "erp", label: "Other connected source" },
] as const;

const count = (n: number | undefined) => (n === undefined ? "–" : formatNumber(n));

const tabCount = (tab: CatalogTab, stats: CatalogStats | undefined) => {
  if (!stats) return undefined;
  return tab === "attention" ? stats.tabs.needsAttention : stats.tabs[tab];
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const url = useCatalogUrlState();
  const { tab, filters, sort, page, pageSize, update, clearFilters, search } = url;

  const canWrite = useCan("products:write");
  const canDelete = useCan("products:delete");
  const canImport = useCan("imports:write");
  const canSaveView = useCan("views:write");

  // ---- data
  const statsFilters = useMemo(
    () => ({ q: filters.q, categoryId: filters.categoryId, channel: filters.channel, inventory: filters.inventory, productType: filters.productType }),
    [filters.q, filters.categoryId, filters.channel, filters.inventory, filters.productType],
  );
  const kpi = useCatalogStats({});
  const tabStats = useCatalogStats(statsFilters);
  const list = useCatalog({ ...filters, page, pageSize, sort: sort || undefined });
  const categories = useCategoryOptions();
  const channels = useChannelOptions();

  const bulk = useBulkProducts();
  const duplicate = useDuplicateProduct();
  const remove = useDeleteProduct();
  const exporter = useExportCatalog();

  // ---- local UI state
  const [searchText, setSearchText] = useState(filters.q ?? "");
  const searchTimer = useRef<number | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const importRoot = useRef<HTMLDivElement>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResponse | null>(null);
  const [toDelete, setToDelete] = useState<CatalogProduct | null>(null);

  // the URL is the source of truth: back, a saved view or "clear" rewrite the search box
  useEffect(() => {
    if (searchTimer.current === undefined) setSearchText(filters.q ?? "");
  }, [filters.q]);
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  // a selection belongs to one page of one filter set
  useEffect(() => setSelected([]), [search]);

  useEffect(() => {
    if (!importOpen) return;
    const onDown = (e: MouseEvent) => {
      if (importRoot.current && !importRoot.current.contains(e.target as Node)) setImportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [importOpen]);

  const onSearch = (value: string) => {
    setSearchText(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = undefined;
      update({ q: value.trim() || null }, { replace: true });
    }, 300);
  };
  const clearSearch = () => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = undefined;
    setSearchText("");
    update({ q: null });
  };
  const resetFilters = () => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = undefined;
    setSearchText("");
    clearFilters();
  };

  // ---- derived
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const titles = useMemo(() => new Map(items.map((p) => [p.id, p.title])), [items]);
  const categoryLabel = (id: string) => categories.data?.find((c) => c.id === id)?.label ?? "Selected category";
  const channelLabel = (code: string) => channels.data?.find((c) => c.code === code)?.name ?? code;
  const inventoryLabel = (id: string) => INVENTORY_OPTIONS.find((o) => o.id === id)?.label ?? id;
  const typeLabel = (id: string) => TYPE_OPTIONS.find((o) => o.id === id)?.label ?? id;
  const sortLabel = SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "Last updated";

  const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (filters.inventory) chips.push({ key: "inventory", label: `Inventory: ${inventoryLabel(filters.inventory)}`, onClear: () => update({ inventory: null }) });
  if (filters.categoryId) chips.push({ key: "category", label: `Category: ${categoryLabel(filters.categoryId)}`, onClear: () => update({ category: null }) });
  if (filters.channel) chips.push({ key: "channel", label: `Channel: ${channelLabel(filters.channel)}`, onClear: () => update({ channel: null }) });
  if (filters.productType) chips.push({ key: "type", label: `Type: ${typeLabel(filters.productType)}`, onClear: () => update({ type: null }) });
  const hasFilters = chips.length > 0 || Boolean(filters.q);

  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? "";
  const savedSummary = [
    `Filters · ${[tab !== "all" ? tabLabel : null, filters.q ? `Search: ${filters.q}` : null, ...chips.map((c) => c.label)].filter(Boolean).join(" · ") || "None"}`,
    `Sort · ${sortLabel}`,
  ];

  // ---- actions
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = items.length > 0 && selected.length === items.length;

  const runBulk = (action: BulkProductAction) => {
    if (selected.length === 0) return;
    bulk.mutate(
      { ids: selected, action },
      {
        onSuccess: (res) => {
          const failedIds = res.results.filter((r) => !r.ok && r.id).map((r) => r.id as string);
          if (res.action === "check_publish_readiness" || res.summary.failed > 0) {
            setBulkResult(res);
            // what did not go through stays selected so it can be retried or looked at
            if (res.action !== "check_publish_readiness") setSelected(failedIds);
            return;
          }
          const done = { archive: "archived", unarchive: "unarchived", duplicate: "duplicated as drafts" } as const;
          toast({ title: "Done", description: `${res.summary.succeeded} ${res.summary.succeeded === 1 ? "product" : "products"} ${done[res.action]}.`, variant: "success" });
          setSelected([]);
        },
        onError: (e) => toast({ title: "Bulk action failed", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  const onRowAction = (action: RowAction, product: CatalogProduct) => {
    if (action === "delete") {
      setToDelete(product);
      return;
    }
    if (action === "duplicate") {
      duplicate.mutate(product.id, {
        onSuccess: (copy) => toast({ title: "Product duplicated", description: `Created the draft ${copy.productCode}.`, variant: "success" }),
        onError: (e) => toast({ title: "Could not duplicate the product", description: errorMessage(e), variant: "destructive" }),
      });
      return;
    }
    bulk.mutate(
      { ids: [product.id], action },
      {
        onSuccess: (res) => {
          const failed = res.results.find((r) => !r.ok);
          if (failed) toast({ title: `Could not ${action} the product`, description: failed.error?.message ?? "Try again.", variant: "destructive" });
          else toast({ title: action === "archive" ? "Product archived" : "Product unarchived", description: product.title, variant: "success" });
        },
        onError: (e) => toast({ title: `Could not ${action} the product`, description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    const target = toDelete;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Product deleted", description: target.title, variant: "success" });
        setSelected((prev) => prev.filter((id) => id !== target.id));
        setToDelete(null);
      },
      onError: (e) => {
        toast({ title: "Could not delete the product", description: errorMessage(e), variant: "destructive" });
        setToDelete(null);
      },
    });
  };

  const onExport = () =>
    exporter.mutate(
      {
        query: { ...filters, sort: sort || undefined },
        onQueued: () => toast({ title: "Large export", description: "Preparing the file in the background. The download starts when it is ready." }),
      },
      {
        onSuccess: ({ blob, fileName }) => {
          saveBlob(blob, fileName);
          toast({ title: "Export ready", description: fileName, variant: "success" });
        },
        onError: (e) =>
          toast({
            title: "Export failed",
            description: isApiError(e) && e.status === 413 ? "More than 50,000 rows match. Narrow the filters and try again." : errorMessage(e),
            variant: "destructive",
          }),
      },
    );

  const applyView = (view: SavedView) => update(paramsOfView(view));

  // ---- render
  const kpiCard = (value: number | undefined, label: string, color: string, first = false) => (
    <div className={`flex-1 min-w-[100px] sm:min-w-0 shrink-0 sm:shrink flex flex-col items-start gap-1 ${first ? "" : "pl-4 sm:pl-6 border-l border-[#EAEAEA]"}`}>
      <span className="text-[26px] font-semibold leading-[38px] text-[#000000]">{count(value)}</span>
      <span className={`text-[12px] font-normal leading-[17px] ${color}`}>{label}</span>
    </div>
  );

  const empty = list.data && items.length === 0;

  return (
    <div className="relative w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000]">
      <div className="w-full flex flex-col items-start gap-6">
        <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-2">
          <div className="flex-1 flex flex-col items-start gap-1.5">
            <span className="text-[10px] font-medium leading-[12px] uppercase text-[#707070]">Catalog</span>
            <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">Products</h1>
            <p className="text-[13px] font-normal leading-[19px] text-[#666666]">
              Manage your master catalog, variants and product information from one place.
            </p>
          </div>

          <div className="flex flex-row items-center gap-2 w-full sm:w-auto justify-start sm:justify-end shrink-0">
            <div className="relative" ref={importRoot}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={importOpen}
                disabled={!canImport}
                title={canImport ? undefined : "You do not have permission to import products"}
                onClick={() => setImportOpen((o) => !o)}
                className="box-border flex flex-row justify-center items-center px-4 h-[36px] min-h-[44px] sm:min-h-[36px] w-[86px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#FFFFFF]"
              >
                Import
              </button>

              {importOpen && (
                <div role="menu" aria-label="Import products" className="absolute right-0 top-[42px] z-50 w-[240px] max-w-[calc(100vw-32px)] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_16px_rgba(0,0,0,0.08)] p-2 flex flex-col gap-1 text-left">
                  <div className="px-3 pt-1.5 pb-2 text-[10px] font-medium leading-[14px] uppercase text-[#666666] tracking-wider">IMPORT PRODUCTS</div>
                  {IMPORT_SOURCES.map((s) => (
                    <button
                      key={s.source}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setImportOpen(false);
                        navigate(`${ROUTES.PRODUCTS_IMPORT}?source=${s.source}`);
                      }}
                      className="w-full px-3 py-2 text-[13px] font-normal leading-[19px] text-[#000000] rounded-[6px] hover:bg-[#F5F5F5] text-left transition-colors cursor-pointer"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!canWrite}
              title={canWrite ? undefined : NO_EDIT_REASON}
              onClick={() => navigate(ROUTES.PRODUCTS_NEW)}
              className={`${PRIMARY_BUTTON} min-h-[44px] sm:min-h-[36px]`}
            >
              + Create product
            </button>
          </div>
        </div>

        {/* catalog totals (never narrowed by the filters) */}
        <div className="w-full flex flex-row items-start py-1 gap-4 sm:gap-6 overflow-x-auto scrollbar-none pb-2 sm:pb-0" aria-busy={kpi.isPending} aria-label="Catalog totals">
          {kpiCard(kpi.data?.products, "Products", "text-[#9F06FE]", true)}
          {kpiCard(kpi.data?.variants, "Variants", "text-[#008FE1]")}
          {kpiCard(kpi.data?.activeVariants, "Active", "text-[#509F06]")}
          {kpiCard(kpi.data?.draft, "Draft", "text-[#FF7300]")}
          {kpiCard(kpi.data?.needsAttention, "Need attention", "text-[#FC090D]")}
        </div>
      </div>

      <div className="w-full flex flex-col items-start gap-4">
        <div role="tablist" aria-label="Product views" className="w-full flex flex-row items-start gap-5 sm:gap-7 border-b border-[#EAEAEA] h-[42px] overflow-x-auto scrollbar-none shrink-0">
          {TABS.map((t) => {
            const active = tab === t.id;
            const n = tabCount(t.id, tabStats.data);
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update({ tab: t.id })}
                className={`flex flex-row items-center px-0.5 gap-2 h-[42px] transition-all shrink-0 whitespace-nowrap ${active ? "border-b-2 border-[#000000]" : "text-[#666666] hover:text-[#000000]"}`}
              >
                <span className={`text-[12px] ${active ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"}`}>{t.label}</span>
                {n !== undefined && <span className="text-[11px] font-normal text-[#666666]">{formatNumber(n)}</span>}
              </button>
            );
          })}
        </div>

        <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="flex-1 box-border flex flex-row items-center px-3 h-[40px] min-h-[44px] sm:min-h-[40px] bg-[#FFFFFF] border border-[#BDBDBD] rounded-[8px] gap-2.5 transition-all focus-within:border-[#000000] focus-within:ring-1 focus-within:ring-[#000000]/10">
            <div className="h-4 w-4 rounded-full border border-[#666666] flex items-center justify-center shrink-0" aria-hidden>
              <div className="h-1.5 w-1.5 rounded-full border border-[#666666]" />
            </div>
            <input
              type="search"
              aria-label="Search products"
              placeholder="Search by product name, SKU, barcode..."
              value={searchText}
              onChange={(e) => onSearch(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-[13px] leading-[19px] text-[#000000] placeholder-[#666666] border-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 shadow-none"
            />
            {!searchText && <span className="text-[11px] font-normal text-[#666666] tracking-tight shrink-0" aria-hidden>⌘ K</span>}
          </div>
          {searchText && (
            <button type="button" onClick={clearSearch} className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer shrink-0 transition-colors self-end sm:self-auto py-1 sm:py-0">
              Clear search
            </button>
          )}
        </div>

        <div className="w-full flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 lg:gap-0 min-h-[34px] relative">
          <div className="flex flex-row flex-wrap items-center gap-2 w-full lg:w-auto">
            <FilterDropdown
              label="Category"
              heading="Category"
              allLabel="All categories"
              value={filters.categoryId ?? null}
              options={categories.data ?? []}
              emptyNote={categories.isPending ? "Loading categories..." : categories.isError ? "Categories could not be loaded." : "No categories yet."}
              width={260}
              onChange={(id) => update({ category: id })}
            />
            <FilterDropdown
              label="Channel"
              heading="Channels"
              allLabel="All channels"
              value={filters.channel ?? null}
              options={(channels.data ?? []).map((c) => ({ id: c.code, label: c.name }))}
              emptyNote={channels.isPending ? "Loading channels..." : channels.isError ? "Channels could not be loaded." : "No connected channels yet."}
              width={196}
              onChange={(id) => update({ channel: id })}
            />
            <FilterDropdown
              label="Inventory"
              heading="Inventory"
              allLabel="Any inventory"
              value={filters.inventory ?? null}
              options={INVENTORY_OPTIONS}
              width={224}
              onChange={(id) => update({ inventory: id })}
              footer={
                <>
                  <div className="h-[1px] bg-[#EAEAEA] my-1" />
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.INVENTORY)}
                    className="w-full h-[34px] flex items-center justify-between px-2 rounded-[4px] text-[12px] text-[#000000] hover:bg-[#F5F5F5]"
                  >
                    <span>Advanced inventory filters</span>
                    <span className="text-[12px] text-[#666666]" aria-hidden>→</span>
                  </button>
                </>
              }
            />
            <FilterDropdown label="Product type" heading="Product type" allLabel="All types" value={filters.productType ?? null} options={TYPE_OPTIONS} width={196} onChange={(id) => update({ type: id })} />
          </div>

          <div className="flex flex-row flex-wrap items-center justify-between sm:justify-start lg:justify-end gap-3 sm:gap-4 text-[12px] font-medium text-[#000000] w-full lg:w-auto pt-1 lg:pt-0 border-t lg:border-t-0 border-[#EAEAEA]">
            <SavedViewsMenu canSave={canSaveView} onApply={applyView} onSave={() => setSaveViewOpen(true)} />
            <button
              type="button"
              onClick={onExport}
              disabled={exporter.isPending || !list.data}
              className="hover:text-[#666666] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 py-1 sm:py-0 min-h-[44px] sm:min-h-0 inline-flex items-center"
            >
              {exporter.isPending ? "Exporting..." : "Export CSV"}
            </button>
            <FilterDropdown
              plain
              label="Last updated"
              heading="Sort by"
              value={sort || null}
              options={SORT_OPTIONS.filter((o) => o.id !== "")}
              allLabel="Last updated"
              align="right"
              width={224}
              onChange={(id) => update({ sort: id })}
            />
          </div>
        </div>

        {chips.length > 0 && (
          <div className="w-full flex flex-row flex-wrap items-center gap-3 min-h-[26px]">
            {chips.map((chip) => (
              <div key={chip.key} className="flex flex-row items-center px-2 py-1 gap-2 bg-[#F5F5F5] rounded-[4px] text-[11px] font-medium text-[#000000]">
                <span>{chip.label}</span>
                <button type="button" onClick={chip.onClear} aria-label={`Remove filter ${chip.label}`} className="hover:opacity-70 transition-opacity">
                  <X className="h-3 w-3 text-[#666666]" aria-hidden />
                </button>
              </div>
            ))}
            <button type="button" onClick={resetFilters} className="text-[12px] font-medium text-[#000000] hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="w-full flex flex-col items-start gap-1">
        <div className="w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0 text-[12px]">
          <div className="flex items-center gap-3">
            <span className="font-medium text-[#000000]">Master products are your single source of truth.</span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected(allSelected ? [] : items.map((p) => p.id))}
                className="text-[11px] font-medium text-[#666666] hover:text-[#000000] underline cursor-pointer"
              >
                {allSelected ? "Deselect all" : `Select all (${items.length})`}
              </button>
            )}
          </div>
          <span className="text-[11px] font-normal text-[#666666]">Master Product → Variants → Channel Listings</span>
        </div>
        <div className="text-[11px] font-normal text-[#666666]">Channel listings inherit core product information while allowing marketplace-specific content.</div>
      </div>

      {list.isError ? (
        <LoadError message={errorMessage(list.error, "Check your connection and try again.")} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <CardSkeletons count={Math.min(pageSize, 8)} />
      ) : empty ? (
        hasFilters ? (
          <NoMatches onClear={resetFilters} />
        ) : tab !== "all" ? (
          <EmptyTab label={tabLabel} />
        ) : (
          <EmptyCatalog canCreate={canWrite} reason={NO_EDIT_REASON} onCreate={() => navigate(ROUTES.PRODUCTS_NEW)} onImport={() => navigate(ROUTES.PRODUCTS_IMPORT)} />
        )
      ) : (
        <>
          {selected.length > 0 && (
            <BulkBar
              count={selected.length}
              canWrite={canWrite}
              busy={bulk.isPending}
              onAction={runBulk}
              onEdit={() => navigate(`${ROUTES.PRODUCTS}/${selected[0]}/edit`)}
              onClear={() => setSelected([])}
            />
          )}

          <div className={GRID}>
            {items.map((p) => (
              <ProductCard key={p.id} product={p} selected={selected.includes(p.id)} canWrite={canWrite} canDelete={canDelete} onToggle={toggle} onAction={onRowAction} />
            ))}
          </div>

          <Pagination
            page={list.data.page}
            pages={list.data.pages}
            total={list.data.total}
            pageSize={list.data.pageSize}
            shown={items.length}
            onPage={(n) => update({ page: n > 1 ? String(n) : null })}
            onPageSize={(n) => update({ size: n === PAGE_SIZES[1] ? null : String(n) })}
          />
        </>
      )}

      {saveViewOpen && (
        <SaveViewPopover
          lines={savedSummary}
          filters={viewFiltersOf(filters)}
          sort={sort || null}
          onClose={() => setSaveViewOpen(false)}
        />
      )}

      <BulkResultsDialog response={bulkResult} titles={titles} onClose={() => setBulkResult(null)} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this product?"
        description={`"${toDelete?.title ?? ""}" and its variants are removed from your catalog. Archive it instead to hide it and keep the history reachable.`}
        confirmText="Delete product"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
