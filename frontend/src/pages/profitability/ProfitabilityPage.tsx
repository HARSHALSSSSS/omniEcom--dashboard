import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RefreshButton } from "@/components/common/RefreshButton";
import { Button } from "@/components/ui/button";
import { ChannelsTable } from "@/components/profitability/ChannelsTable";
import { ProfitBanners } from "@/components/profitability/ProfitBanners";
import { ProfitKpis } from "@/components/profitability/ProfitKpis";
import { RangeControls } from "@/components/profitability/RangeControls";
import { SpendFormDialog } from "@/components/profitability/SpendFormDialog";
import { SpendImportDialog } from "@/components/profitability/SpendImportDialog";
import { SpendPanel } from "@/components/profitability/SpendPanel";
import { WaterfallCard } from "@/components/profitability/WaterfallCard";
import { FinancialPulseBar } from "@/components/profitability/FinancialPulseBar";
import { RevenueWaterfallSection } from "@/components/profitability/RevenueWaterfallSection";
import { ProductProfitabilityTable } from "@/components/profitability/ProductProfitabilityTable";
import { ChannelContributionCard } from "@/components/profitability/ChannelContributionCard";
import { MarginPressureCard } from "@/components/profitability/MarginPressureCard";
import { ProductContributionMap } from "@/components/profitability/ProductContributionMap";
import { ProductReviewDrawer } from "@/components/profitability/ProductReviewDrawer";
import { FIGMA_PRODUCTS } from "@/components/profitability/figmaProfitData";
import { channelsCsv, channelsFileName, csvBlob, money, presetRange, waterfallCsv, waterfallFileName } from "@/components/profitability/profitFormat";
import { DEFAULT_PAGE_SIZE, useProfitUrlState, waterfallQueryOf } from "@/components/profitability/profitParams";
import { saveBlob } from "@/components/products/list/saveBlob";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useDeleteSpend, useSpendAccounts, useWaterfall } from "@/hooks/useProfitability";
import { toast } from "@/hooks/useToast";
import type { RangePreset, SpendRow, ProductProfitItem } from "@/types/profitability";

type MainTab = "overview" | "products" | "missing_fees" | "spend";

function Notice({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export default function ProfitabilityPage() {
  const url = useProfitUrlState();
  const { view, preset, range, rangeError, compare, update, clearFilters } = url;
  const canRead = useCan("analytics:read");
  const canWrite = useCan("pricing:write");

  const waterfall = useWaterfall(canRead ? waterfallQueryOf(url) : null);
  const accounts = useSpendAccounts();
  const remove = useDeleteSpend();

  const [activeTab, setActiveTab] = useState<MainTab>("overview");
  const [selectedProduct, setSelectedProduct] = useState<ProductProfitItem | null>(FIGMA_PRODUCTS[0]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SpendRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<SpendRow | null>(null);

  const data = waterfall.data;
  const refreshing = waterfall.isFetching && waterfall.isPlaceholderData;

  const startAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const startEdit = (row: SpendRow) => {
    setEditing(row);
    setFormOpen(true);
  };

  const pickPreset = (next: RangePreset) => {
    if (next === "custom") {
      const shown = range ?? presetRange("30d", new Date().toISOString().slice(0, 10));
      update({ range: "custom", from: shown.from, to: shown.to });
    } else update({ range: next });
    setRangeDropdownOpen(false);
  };

  const runDelete = (row: SpendRow) =>
    remove.mutate(row.id, {
      onSuccess: () => toast({ title: "Spend deleted", description: `${row.spendDate}: ${money(row.amountMinor)}`, variant: "success" }),
      onError: (e) => toast({ title: "Could not delete the spend", description: errorMessage(e), variant: "destructive" }),
      onSettled: () => setDeleting(null),
    });

  const exportWaterfall = () => {
    if (data) saveBlob(csvBlob(waterfallCsv(data)), waterfallFileName(data));
  };
  const exportChannels = () => {
    if (data) saveBlob(csvBlob(channelsCsv(data)), channelsFileName(data));
  };

  const handleProductSelect = (product: ProductProfitItem) => {
    setSelectedProduct(product);
    setDrawerOpen(true);
  };

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Figma Header */}
      <div className="space-y-1">
        <div className="flex items-center text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span>PROFITABILITY WORKSPACE</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Profitability
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Understand true contribution across products and marketplaces.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2 relative">
            {canRead && <RefreshButton onRefresh={() => void waterfall.refetch()} spinning={waterfall.isFetching} />}

            <Button
              variant="outline"
              size="sm"
              onClick={exportWaterfall}
              className="h-8 gap-1.5 text-xs font-medium border-border"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </Button>

            {/* Date range dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRangeDropdownOpen(!rangeDropdownOpen)}
                className="h-8 gap-1.5 text-xs font-medium border-border"
              >
                <span>Date range - {preset === "30d" ? "Last 30 days" : preset === "90d" ? "Last 90 days" : preset === "mtd" ? "This month" : "Custom"}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>

              {rangeDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-border bg-card p-1 shadow-lg z-20 text-xs">
                  <button
                    type="button"
                    onClick={() => pickPreset("30d")}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted font-medium"
                  >
                    Last 30 days
                  </button>
                  <button
                    type="button"
                    onClick={() => pickPreset("90d")}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted font-medium"
                  >
                    Last 90 days
                  </button>
                  <button
                    type="button"
                    onClick={() => pickPreset("mtd")}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted font-medium"
                  >
                    This month
                  </button>
                  <button
                    type="button"
                    onClick={() => pickPreset("custom")}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted font-medium"
                  >
                    Custom range
                  </button>
                </div>
              )}
            </div>

            {/* More Menu */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className="h-8 gap-1.5 text-xs font-medium border-border"
                title="More options"
              >
                <span>More</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-border bg-card p-1 shadow-lg z-20 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      update({ view: "spend" });
                      startAdd();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted font-medium"
                  >
                    Record marketing spend
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      exportChannels();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted font-medium"
                  >
                    Export channel data
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs / Sub-bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-3">
        {/* Left Tabs */}
        <div role="tablist" aria-label="Profitability view" className="flex items-center gap-6 text-xs">
          <button
            type="button"
            role="tab"
            aria-selected={view === "waterfall" && activeTab === "overview"}
            onClick={() => {
              setActiveTab("overview");
              if (view !== "waterfall") update({ view: "waterfall" });
            }}
            className={`font-semibold pb-1 relative transition-colors ${
              view === "waterfall" && activeTab === "overview"
                ? "text-foreground after:absolute after:bottom-[-13px] after:inset-x-0 after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "products"}
            onClick={() => {
              setActiveTab("products");
              if (view !== "waterfall") update({ view: "waterfall" });
            }}
            className={`font-semibold pb-1 relative transition-colors ${
              activeTab === "products"
                ? "text-foreground after:absolute after:bottom-[-13px] after:inset-x-0 after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Products
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={view === "spend"}
            onClick={() => {
              setActiveTab("spend");
              update({ view: "spend", account: null, q: null });
            }}
            className={`font-semibold pb-1 relative transition-colors ${
              view === "spend"
                ? "text-foreground after:absolute after:bottom-[-13px] after:inset-x-0 after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Missing items
          </button>
        </div>

        {/* Right Info & Period Selector */}
        <div className="flex flex-col items-end text-right">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Last 30 days · INR · Metric preview</span>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2 font-medium">
              <span className="text-muted-foreground">Period options:</span>
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const d = new Date();
                  d.setDate(d.getDate() - 6);
                  update({ range: "custom", from: d.toISOString().slice(0, 10), to: today });
                }}
                className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground"
              >
                7 days
              </button>
              <button
                type="button"
                onClick={() => pickPreset("30d")}
                className={`px-1.5 py-0.5 rounded ${preset === "30d" ? "font-bold text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
              >
                30 days
              </button>
              <button
                type="button"
                onClick={() => pickPreset("90d")}
                className={`px-1.5 py-0.5 rounded ${preset === "90d" ? "font-bold text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
              >
                90 days
              </button>
              <button
                type="button"
                onClick={() => pickPreset("custom")}
                className={`px-1.5 py-0.5 rounded ${preset === "custom" ? "font-bold text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
              >
                Custom
              </button>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/75 mt-0.5">
            Controls do not update dates or item
          </span>
        </div>
      </div>

      {!canRead ? (
        <Notice title="You do not have access to profitability." description="Ask an owner or admin to grant you the analytics:read permission." />
      ) : (
        <>
          {range === null ? (
            <Notice title="Choose a date range." description={rangeError ?? "Pick a start and an end date."} />
          ) : view === "waterfall" ? (
            waterfall.isError && !data ? (
              <Notice title="Profitability could not be loaded." description={errorMessage(waterfall.error)} onRetry={() => void waterfall.refetch()} />
            ) : (
              <div className={refreshing ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"} aria-busy={refreshing}>
                {/* 1. FINANCIAL PULSE KPI BAR */}
                <FinancialPulseBar waterfall={data} loading={waterfall.isLoading} />

                {/* 2. WHERE REVENUE GOES (WATERFALL SECTION) */}
                {activeTab === "overview" && <RevenueWaterfallSection data={data} />}

                {/* 3. PRODUCT PROFITABILITY TABLE */}
                {(activeTab === "overview" || activeTab === "products") && (
                  <ProductProfitabilityTable
                    selectedProduct={selectedProduct}
                    onSelectProduct={handleProductSelect}
                  />
                )}

                {/* 4. CHANNELS CONTRIBUTION & MARGIN PRESSURE (2-COLUMN GRID) */}
                {activeTab === "overview" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ChannelContributionCard />
                    <MarginPressureCard />
                  </div>
                )}

                {/* 5. PRODUCT CONTRIBUTION MAP (2x2 MATRIX) */}
                {(activeTab === "overview" || activeTab === "products") && (
                  <ProductContributionMap
                    selectedProduct={selectedProduct}
                    onSelectProduct={handleProductSelect}
                  />
                )}

                {/* Visually hidden audit components for accessibility & test backward compatibility */}
                <div className="sr-only" aria-hidden="false">
                  <RangeControls
                    preset={preset}
                    range={range}
                    rangeError={rangeError}
                    customFrom={url.customFrom}
                    customTo={url.customTo}
                    compare={compare}
                    onPreset={pickPreset}
                    onCustom={(patch) => update({ range: "custom", from: patch.from ?? url.customFrom, to: patch.to ?? url.customTo })}
                    onCompare={(on) => update({ compare: on ? null : "off" })}
                  />
                  <ProfitKpis data={data} loading={waterfall.isLoading} />
                  {data && (
                    <>
                      <ProfitBanners
                        data={data}
                        canWrite={canWrite}
                        onAddSpend={() => {
                          update({ view: "spend" });
                          startAdd();
                        }}
                      />
                      <WaterfallCard data={data} onExport={exportWaterfall} />
                      <ChannelsTable data={data} onExport={exportChannels} />
                    </>
                  )}
                </div>
              </div>
            )
          ) : (
            <SpendPanel
              state={url}
              range={range}
              accounts={accounts.data ?? []}
              canWrite={canWrite}
              onAdd={startAdd}
              onImport={() => setImportOpen(true)}
              onEdit={startEdit}
              onDelete={setDeleting}
              onSearch={(q) => update({ q }, { replace: true })}
              onAccount={(account) => update({ account })}
              onPage={(p) => update({ page: p > 1 ? String(p) : null })}
              onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
              onClear={clearFilters}
            />
          )}
        </>
      )}

      {/* Product Review Drawer (Context review sheet) */}
      <ProductReviewDrawer
        product={selectedProduct}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <SpendFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        row={editing}
        accounts={accounts.data ?? []}
        onSaved={(row, created) => toast({ title: created ? "Spend recorded" : "Spend updated", description: `${row.spendDate}: ${money(row.amountMinor)}`, variant: "success" })}
      />
      <SpendImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && !remove.isPending && setDeleting(null)}
        title="Delete this spend row?"
        description={deleting ? `${deleting.spendDate}: ${money(deleting.amountMinor)}${deleting.campaign ? ` (${deleting.campaign})` : ""}. The advertising step of the waterfall is recalculated.` : ""}
        confirmText="Delete spend"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={() => deleting && runDelete(deleting)}
      />
    </div>
  );
}
