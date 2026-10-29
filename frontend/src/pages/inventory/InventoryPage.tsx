import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Bookmark, Download, SlidersHorizontal } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";
import { useCan } from "@/hooks/useCan";
import { useChannelOptions } from "@/hooks/useProducts";
import { useAllocations, useDeleteGroup, useDraftTransfers, useExportInventory, useGroups, useInventoryKpis, useInventoryLedger, useInventoryOverview, useSelectionCount, useWarehouses } from "@/hooks/useInventory";
import { saveBlob } from "@/components/products/list/saveBlob";
import { AdvisoryBanner } from "@/components/inventory/AdvisoryBanner";
import { BulkBar } from "@/components/inventory/BulkActions";
import { ChannelConstellation } from "@/components/inventory/ChannelConstellation";
import { ChannelSyncButton } from "@/components/inventory/ChannelSyncButton";
import { DraftTransfers } from "@/components/inventory/DraftTransfers";
import { EmptyInventory } from "@/components/inventory/EmptyInventory";
import { FilterBar } from "@/components/inventory/FilterBar";
import { InventoryDrawer } from "@/components/inventory/InventoryDrawer";
import { EmptyLedger, LedgerError, LedgerPagination, LedgerTable } from "@/components/inventory/LedgerTable";
import { InlineError } from "@/components/inventory/inventoryUi";
import { RecentMovements } from "@/components/inventory/RecentMovements";
import { SignalsRail, StockHorizon } from "@/components/inventory/RiskInstruments";
import { SaveViewDialog } from "@/components/inventory/SavedFilters";
import { StockDistribution } from "@/components/inventory/StockDistribution";
import { StockPulse } from "@/components/inventory/StockPulse";
import { TransferDialog } from "@/components/inventory/TransferDialog";
import { HEALTH_OPTIONS, hasActiveFilters, useInventoryUrlState } from "@/components/inventory/inventoryParams";
import { NO_VIEWS_REASON, NO_WRITE_REASON, ONE_WAREHOUSE_REASON } from "@/components/inventory/inventoryLabels";
import { targetOfCatalogVariant, targetOfRow, type StockTarget } from "@/components/inventory/stockTarget";
import { filterBody, type BulkSelection, type InventoryGroup, type LedgerRow } from "@/types/inventory";
import { formatINR, formatNumber } from "@/utils/format";

const SYNC_REASON = "Syncing channels needs both inventory and listings write access.";

type SelectMode = "recommended" | "custom" | "all_matching";

export default function InventoryPage() {
  const { filters, sort, page, pageSize, drawerVariantId, update, clearFilters } = useInventoryUrlState();
  const canWrite = useCan("inventory:write");
  const canSync = useCan("listings:write") && canWrite;
  const canSaveViews = useCan("views:write");

  const kpis = useInventoryKpis(filters.warehouse);
  const overview = useInventoryOverview(filters.warehouse);
  const ledger = useInventoryLedger({ ...filters, page, pageSize, sort: sort || undefined });
  const rows = ledger.data?.items ?? [];
  const allocations = useAllocations(rows.map((r) => r.variantId));
  const warehouses = useWarehouses();
  const channels = useChannelOptions();
  const groups = useGroups();
  const drafts = useDraftTransfers();
  const draftCount = drafts.data?.length ?? 0;
  const exporter = useExportInventory();
  const deleteGroup = useDeleteGroup();

  const warehouseList = warehouses.data ?? [];
  const multiWarehouse = warehouseList.length > 1;
  const groupList = groups.data ?? [];

  // the side drawer shows the product context (?drawer=variant:<id>) or, in its place, the Adjust stock form
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<StockTarget | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<StockTarget | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);

  // search: typing is debounced into the URL (and kept out of the history)
  const [searchText, setSearchText] = useState(filters.q ?? "");
  const searchTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (searchTimer.current === undefined) setSearchText(filters.q ?? "");
  }, [filters.q]);
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);
  const onSearch = (value: string) => {
    setSearchText(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = undefined;
      update({ q: value.trim() || null }, { replace: true });
    }, 300);
  };
  const resetFilters = () => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = undefined;
    setSearchText("");
    clearFilters();
  };

  // a filter that shrinks the result can leave the URL on a page that no longer exists
  useEffect(() => {
    if (ledger.data && ledger.data.items.length === 0 && ledger.data.total > 0 && page > 1) update({ page: null }, { replace: true });
  }, [ledger.data, page, update]);

  // selection: the rows ticked, kept with the filters they were ticked under (a new filter starts a new selection)
  const filterKey = JSON.stringify(filters);
  const [sel, setSel] = useState<{ key: string; ids: string[]; mode: SelectMode }>({ key: filterKey, ids: [], mode: "custom" });
  const current = sel.key === filterKey ? sel : { key: filterKey, ids: [] as string[], mode: "custom" as SelectMode };
  const selectedIds = new Set(current.ids);
  const allMatching = current.mode === "all_matching";
  const count = useSelectionCount(filters, allMatching);
  const selectedCount = allMatching ? (count.data?.total ?? ledger.data?.total ?? 0) : selectedIds.size;
  const choose = (ids: string[], mode: SelectMode) => setSel({ key: filterKey, ids, mode });
  const selection: BulkSelection = allMatching ? { mode: "all_matching", filters: filterBody(filters) } : { mode: "ids", ids: current.ids };

  const onToggle = (row: LedgerRow) => {
    const base = allMatching ? rows.map((r) => r.variantId) : current.ids;
    choose(base.includes(row.variantId) ? base.filter((id) => id !== row.variantId) : [...base, row.variantId], "custom");
  };
  const allVisible = rows.length > 0 && rows.every((r) => allMatching || selectedIds.has(r.variantId));
  const onToggleAll = () => choose(allVisible ? [] : rows.map((r) => r.variantId), "custom");
  const recommended = rows.filter((r) => r.health !== "healthy");

  const onExport = () =>
    exporter.mutate(filters, {
      onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
      onError: (e) => toast({ title: "Export failed", description: errorMessage(e, "The stock could not be exported."), variant: "destructive" }),
    });

  const onDeleteGroup = (group: InventoryGroup) =>
    deleteGroup.mutate(group.id, {
      onSuccess: () => {
        update({ group: null });
        toast({ title: "Group deleted", description: `${group.name} was removed. The products stay.`, variant: "success" });
      },
      onError: (e) => toast({ title: "Could not delete the group", description: errorMessage(e), variant: "destructive" }),
    });

  const filtered = hasActiveFilters(filters);
  const openDrawer = (variantId: string) => update({ drawer: `variant:${variantId}` }, { keepPage: true });
  const closeDrawer = () => {
    setAdjustOpen(false);
    if (drawerVariantId) update({ drawer: null }, { replace: true });
  };
  const openAdjust = (target: StockTarget | null) => {
    setAdjustTarget(target);
    setAdjustOpen(true);
  };
  const openTransfer = (target: StockTarget | null) => {
    setTransferTarget(target);
    setTransferOpen(true);
  };
  const scrollToLedger = () => {
    requestAnimationFrame(() => {
      document.getElementById("inventory-ledger")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  const data = overview.data;
  // one location (simple mode): the whole stock sits in it, so the distribution shows that single location at 100%
  const distribution =
    data?.distribution ??
    (data?.mode === "simple" && data.location ? { byWarehouse: [{ warehouseId: data.location.id ?? "home", name: data.location.name, units: data.pulse.available, sharePct: 100, demandSharePct: null }], insight: null } : undefined);
  const onboarding = data !== undefined && data.ledger.total === 0 && !filtered;
  const valuation = kpis.data ? formatINR(kpis.data.valuation.amountMinor, true) : null;

  const warehouseName = warehouseList.find((w) => w.id === filters.warehouse)?.name;
  const channelName = channels.data?.find((c) => c.code === filters.channel)?.name ?? filters.channel;
  const healthName = HEALTH_OPTIONS.find((h) => h.id === filters.health)?.label;
  const nameOf = (kind: "warehouse" | "channel", id: string) => (kind === "warehouse" ? warehouseList.find((w) => w.id === id)?.name : channels.data?.find((c) => c.code === id)?.name) ?? id;
  const summary = [filters.q ? `Matching "${filters.q}"` : "All products", warehouseName ?? "All warehouses", channelName ?? "All channels", healthName ?? "Any health"].join(" · ");

  const secondary = "box-border flex h-[34px] cursor-pointer flex-row items-center gap-[7px] rounded-lg border border-[#EAEAEA] bg-white px-3 py-0 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex w-full flex-col items-start gap-7 pb-24 font-['Inter',sans-serif] text-[#000000]">
      <div className="flex w-full flex-col items-start gap-2">
        <div className="flex min-h-[53px] w-full flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col items-start gap-[3px]">
            <span className="text-[10px] font-medium uppercase leading-[12px] tracking-wider text-[#707070]">INVENTORY WORKSPACE</span>
            <h1 className="m-0 p-0 text-[26px] font-semibold leading-[145%] text-[#000000]">Inventory Control Room</h1>
          </div>

          <div className="flex h-[34px] flex-row items-center gap-2">
            <ChannelSyncButton allowed={canSync} disabledReason={SYNC_REASON} />
            <span title={canWrite ? undefined : NO_WRITE_REASON}>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => openAdjust(null)}
                className="box-border flex h-[34px] cursor-pointer flex-row items-center gap-[7px] rounded-lg border border-black bg-black px-3 py-0 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 stroke-[1.5px] text-white" aria-hidden />
                <span className="text-[12px] font-semibold leading-[145%] text-white">Adjust stock</span>
              </button>
            </span>
            <span title={!canWrite ? NO_WRITE_REASON : !multiWarehouse ? ONE_WAREHOUSE_REASON : undefined}>
              <button type="button" disabled={!canWrite || !multiWarehouse} onClick={() => openTransfer(null)} className={secondary}>
                <ArrowRightLeft className="h-3.5 w-3.5 stroke-[1.5px] text-[#666666]" aria-hidden />
                <span className="text-[12px] font-normal leading-[145%] text-[#000000]">Transfer stock</span>
              </button>
            </span>
            {draftCount > 0 && (
              <button type="button" onClick={() => document.getElementById("draft-transfers")?.scrollIntoView?.({ behavior: "smooth", block: "start" })} className={secondary}>
                <span className="text-[12px] font-normal leading-[145%] text-[#000000]">Drafts ({draftCount})</span>
              </button>
            )}
          </div>
        </div>

        <p className="m-0 w-full text-[12px] font-normal leading-[145%] text-[#666666]">Master inventory as the source of truth with real-time operations across all channels.</p>
        {!canWrite && (
          <p className="m-0 w-full rounded-lg border border-[#EAEAEA] bg-neutral-50 px-3 py-2 text-xs text-[#666666]" role="note">
            {NO_WRITE_REASON}
          </p>
        )}
      </div>

      {onboarding && data ? (
        <EmptyInventory mode={data.mode} locationName={data.location?.name ?? null} />
      ) : (
        <>
          {overview.isError && !data ? (
            <div className="w-full space-y-2">
              <InlineError message={`The stock overview could not be loaded. ${errorMessage(overview.error)}`} />
              <Button variant="outline" size="sm" onClick={() => void overview.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <StockPulse pulse={data?.pulse} valuation={valuation} />

              <div className="h-[1px] w-full bg-[#EAEAEA]" />

              <div className="flex w-full flex-col items-start gap-10 lg:flex-row">
                <StockHorizon items={data?.horizon.items} scaleMax={data?.horizon.scaleMaxDays ?? 20} onOpen={openDrawer} />
                <SignalsRail
                  signals={data?.signals}
                  active={filters.signal}
                  onSelect={(signal) => {
                    update({ signal, status: null });
                    if (signal) scrollToLedger();
                  }}
                />
              </div>

              <AdvisoryBanner
                advisory={data?.advisory}
                reorder={kpis.data?.reorder}
                onOpen={openDrawer}
                onReviewRisk={() => {
                  update({ signal: "stockout_risk", status: null });
                  scrollToLedger();
                }}
                onReviewLowStock={() => {
                  update({ status: "low_stock", signal: null });
                  scrollToLedger();
                }}
              />
            </>
          )}

          <ChannelConstellation canSync={canSync} />

          <StockDistribution distribution={distribution} loading={overview.isPending} />

          <section id="inventory-ledger" aria-label="Inventory ledger" className="flex w-full scroll-mt-6 flex-col items-start gap-3">
            <div className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[20px] font-semibold tracking-tight text-[#111111]">Inventory ledger</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={exporter.isPending}
                  onClick={onExport}
                  className="flex cursor-pointer flex-row items-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 text-[#111111] shadow-2xs transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5 stroke-[1.75px] text-[#555555]" aria-hidden />
                  <span className="text-[13px] font-medium">{exporter.isPending ? "Exporting..." : "Export CSV"}</span>
                </button>
                <span title={canSaveViews ? undefined : NO_VIEWS_REASON}>
                  <button
                    type="button"
                    disabled={!canSaveViews}
                    onClick={() => setSaveViewOpen(true)}
                    className="flex cursor-pointer flex-row items-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 text-[#111111] shadow-2xs transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Bookmark className="h-3.5 w-3.5 stroke-[1.75px] text-[#555555]" aria-hidden />
                    <span className="text-[13px] font-medium">Save view</span>
                  </button>
                </span>
              </div>
            </div>

            <div className="flex w-full flex-row flex-wrap items-center justify-between gap-2 text-[12px] text-[#737373]">
              <span>{summary}</span>
              {ledger.data && (
                <span>
                  {formatNumber(ledger.data.total)} {ledger.data.total === 1 ? "product" : "products"}
                </span>
              )}
            </div>

            <FilterBar
              searchText={searchText}
              onSearch={onSearch}
              filters={filters}
              sort={sort}
              warehouses={warehouseList}
              channels={channels.data ?? []}
              groups={groupList}
              statusCounts={kpis.data?.health}
              update={update}
              onClear={resetFilters}
              canWrite={canWrite}
              onDeleteGroup={onDeleteGroup}
              canSaveViews={canSaveViews}
              onSaveView={() => setSaveViewOpen(true)}
            />

            <div className="flex w-full flex-row flex-wrap items-center gap-3 pt-1">
              <span className="text-[12px] text-[#737373]">Select products:</span>
              {(
                [
                  ["recommended", "Recommended"],
                  ["custom", "Custom"],
                  ["all_matching", "All matching"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={current.mode === id}
                  disabled={rows.length === 0}
                  onClick={() => {
                    if (id === "recommended") choose(recommended.map((r) => r.variantId), "recommended");
                    else if (id === "all_matching") choose([], "all_matching");
                    else choose(allMatching ? [] : current.ids, "custom");
                  }}
                  className={`cursor-pointer rounded-md px-3 py-1 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    current.mode === id ? "bg-[#F0F0F0] font-semibold text-[#111111]" : "bg-transparent text-[#555555] hover:text-[#111111]"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="ml-2 text-[12px] text-[#737373]">{current.mode === "recommended" && recommended.length === 0 ? "Nothing on this page needs attention" : "Select rows to reveal stock operations"}</span>
            </div>

            {ledger.isError && !ledger.data ? (
              <LedgerError message={errorMessage(ledger.error)} onRetry={() => void ledger.refetch()} />
            ) : ledger.data && ledger.data.total === 0 ? (
              <EmptyLedger filtered={filtered} onClear={resetFilters} />
            ) : (
              <>
                <LedgerTable
                  rows={rows}
                  loading={ledger.isPending}
                  allocations={allocations.data}
                  allocationsLoading={allocations.isPending && rows.length > 0}
                  sort={sort}
                  onSort={(s) => update({ sort: s })}
                  canWrite={canWrite}
                  multiWarehouse={multiWarehouse}
                  selected={selectedIds}
                  allMatching={allMatching}
                  onToggle={onToggle}
                  onToggleAll={onToggleAll}
                  onOpen={(row) => openDrawer(row.variantId)}
                  onAdjust={(row) => openAdjust(targetOfRow(row))}
                  onTransfer={(row) => openTransfer(targetOfRow(row))}
                />
                <span className="text-[12px] text-[#737373]">Channel sync reflects each product. Product-level issues can exist while a channel is healthy.</span>
                {ledger.data && <LedgerPagination data={ledger.data} onPage={(p) => update({ page: p === 1 ? null : String(p) }, { keepPage: true })} onPageSize={(s) => update({ size: String(s) })} />}
              </>
            )}

            {selectedCount > 0 && (
              <BulkBar count={selectedCount} selection={selection} warehouses={warehouseList} multiWarehouse={multiWarehouse} groups={groupList} canWrite={canWrite} canSync={canSync} onClear={() => choose([], "custom")} />
            )}
          </section>

          <DraftTransfers warehouses={warehouseList} canWrite={canWrite} />

          <RecentMovements items={data?.recentMovements} warehouseId={filters.warehouse} />
        </>
      )}

      <InventoryDrawer
        variantId={drawerVariantId}
        adjustOpen={adjustOpen}
        adjustTarget={adjustTarget}
        warehouses={warehouseList}
        canWrite={canWrite}
        multiWarehouse={multiWarehouse}
        onClose={closeDrawer}
        onAdjust={openAdjust}
        onTransfer={openTransfer}
        onPickAdjust={(row) => setAdjustTarget(targetOfRow(row))}
        onPickAdjustCatalog={(variant) => setAdjustTarget(targetOfCatalogVariant(variant))}
        onAdjustCancel={() => setAdjustOpen(false)}
        onAdjustDone={closeDrawer}
      />

      <TransferDialog
        open={transferOpen && multiWarehouse}
        target={transferTarget}
        warehouses={warehouseList}
        onPick={(row) => setTransferTarget(targetOfRow(row))}
        onClose={() => {
          setTransferOpen(false);
          setTransferTarget(null);
        }}
      />

      <SaveViewDialog open={saveViewOpen} filters={filters} sort={sort} nameOf={nameOf} onClose={() => setSaveViewOpen(false)} />
    </div>
  );
}
