import { Link } from "react-router-dom";
import { Calendar, Download, Sparkles } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { PageHeader } from "@/components/common/PageHeader";
import { RefreshButton } from "@/components/common/RefreshButton";
import { Button, buttonVariants } from "@/components/ui/button";
import { PricingPagination } from "@/components/pricing/PricingPagination";
import { ListSkeleton, LoadError, StateBox } from "@/components/pricing/PricingStates";
import { IntelDrawer } from "@/components/product-intelligence/IntelDrawer";
import { IntelFilters } from "@/components/product-intelligence/IntelFilters";
import { IntelKpis } from "@/components/product-intelligence/IntelKpis";
import { IntelTable } from "@/components/product-intelligence/IntelTable";
import { ProductKpiStrip } from "@/components/product-intelligence/ProductKpiStrip";
import { PrioritizedOpportunities } from "@/components/product-intelligence/PrioritizedOpportunities";
import { ProductPortfolioCharts } from "@/components/product-intelligence/ProductPortfolioCharts";
import { portfolioCsv } from "@/components/product-intelligence/portfolioCsv";
import { preferredPeriod, preferredPageSize } from "@/lib/preferences";
import { PAGE_SIZES } from "@/components/product-intelligence/intelParams";
import { RANGE_PRESETS, dateKeyInZone, defaultOverviewPreset, useOverviewUrlState } from "@/components/reports/overviewRange";
import { saveBlob } from "@/components/products/list/saveBlob";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { NO_READ_REASON, ACTION_LABELS } from "@/components/product-intelligence/intelFormat";
import { intelFiltered, useIntelUrlState } from "@/components/product-intelligence/intelParams";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useIntelCategories, useIntelItem, useIntelWarehouses, useProductIntelligence } from "@/hooks/useProductIntelligence";
import type { IntelItem, ProductIntelligenceQuery } from "@/types/intelligence";
import { cn } from "@/utils/cn";

export default function ProductIntelligencePage() {
  const url = useIntelUrlState();
  const { tab, query, open, update, clearFilters } = url;
  const canRead = useCan("analytics:read");
  const list = useProductIntelligence(query, canRead);
  const categories = useIntelCategories(canRead);
  const warehouses = useIntelWarehouses(canRead);
  const shell = useWorkspaceStore((st) => st.shell);
  const timezone = shell?.business.timezone ?? "Asia/Kolkata";
  const currency = shell?.business.currency ?? "INR";
  const range = useOverviewUrlState(dateKeyInZone(new Date(), timezone), defaultOverviewPreset(preferredPeriod()));
  // the Overview asks for the portfolio of the chosen dates together with the products in priority order (one call)
  const overviewQuery: ProductIntelligenceQuery = { action: undefined, categoryId: undefined, warehouseId: undefined, q: undefined, sort: "priority", page: 1, pageSize: 10, portfolio: { from: range.state.from, to: range.state.to } };
  const overview = useProductIntelligence(overviewQuery, canRead && tab === "overview" && range.state.problem === null);
  const lookup = useIntelItem(open, canRead && Boolean(open));

  if (!canRead) {
    return (
      <div className="w-full space-y-6 pb-24">
        <PageHeader eyebrow="INTELLIGENCE" title="Product Intelligence" />
        <StateBox title="You do not have access to product intelligence." description={NO_READ_REASON} />
      </div>
    );
  }

  const data = list.data;
  const filtered = intelFiltered(query);
  const selected = open ? (data?.items.find((i) => i.variantId === open) ?? overview.data?.items.find((i) => i.variantId === open) ?? lookup.data?.items[0] ?? null) : null;
  const portfolio = range.state.problem === null ? (overview.data?.portfolio ?? undefined) : undefined;

  const handleInspect = (item: { variantId: string | null }) => {
    if (item.variantId) update({ open: item.variantId });
  };
  const exportOverview = () => {
    if (!portfolio) return;
    saveBlob(new Blob([portfolioCsv(portfolio, overview.data?.items ?? [])], { type: "text/csv;charset=utf-8" }), `product-intelligence-${portfolio.range.from}-to-${portfolio.range.to}.csv`);
    toast({ title: "Overview downloaded", description: `${portfolio.range.from} to ${portfolio.range.to}.`, variant: "success" });
  };

  const body = () => {
    if (list.isLoading && !data) return <ListSkeleton label="Loading recommendations" />;
    if (!data) return <LoadError what="Product recommendations" message={errorMessage(list.error)} onRetry={() => void list.refetch()} />;
    if (data.items.length === 0) {
      if (data.variantsAnalysed === 0) {
        return (
          <StateBox title="There is nothing to analyse yet." description="Recommendations appear once you have products with stock or sales. Add your first product to get started.">
            <Link to={ROUTES.PRODUCTS_NEW} className={cn(buttonVariants({ size: "sm" }), "text-xs")}>
              Add a product
            </Link>
          </StateBox>
        );
      }
      const what = query.action ? `No variants are recommended for “${ACTION_LABELS[query.action]}”.` : "No variants match your filters.";
      return (
        <StateBox title={what} description="Try another action, search or filter.">
          <Button variant="outline" size="sm" className="text-xs" onClick={clearFilters}>
            Clear filters
          </Button>
        </StateBox>
      );
    }
    return (
      <div className="space-y-3">
        <IntelTable items={data.items} selectedVariantId={open} onOpen={(item) => update({ open: item.variantId })} />
        <PricingPagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          pageSize={data.pageSize}
          shown={data.items.length}
          noun="variants"
          onPage={(p) => update({ page: p > 1 ? String(p) : null })}
          onPageSize={(s) => update({ size: s === preferredPageSize(PAGE_SIZES, 25) ? null : String(s) })}
        />
      </div>
    );
  };

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="INTELLIGENCE"
        title="Product Intelligence"
        description="See what drives sales, spot product risks and decide what to review next."
        actions={
          <div className="flex items-center gap-2">
            {tab === "overview" && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={!portfolio} onClick={exportOverview}>
                <Download className="h-3.5 w-3.5" />
                Export overview
              </Button>
            )}
            <RefreshButton onRefresh={() => void list.refetch()} spinning={list.isFetching} />
          </div>
        }
      />

      {/* Top Tab Bar (Overview | All products) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
        <div role="tablist" aria-label="Product Intelligence View Modes" className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "overview"}
            onClick={() => update({ tab: "overview" })}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-xs font-medium transition-all",
              tab === "overview"
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            onClick={() => update({ tab: "all" })}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-xs font-medium transition-all",
              tab === "all"
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All products
          </button>
        </div>
      </div>

      {tab === "overview" ? (
        <>
          {/* Date range: real dates in the business time zone, kept in the URL. (The earlier channel and category selects had no data behind them: the portfolio is for the whole business.) */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <select aria-label="Date range" value={range.state.preset} onChange={(e) => range.setPreset(e.target.value as (typeof RANGE_PRESETS)[number]["id"])} className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground">
                {RANGE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {range.state.preset === "custom" && (
                <span className="inline-flex items-center gap-1.5">
                  <input type="date" aria-label="From date" value={range.state.from} onChange={(e) => range.setCustom(e.target.value, range.state.to)} className="rounded-lg border border-border bg-background px-3 py-1.5" />
                  <span className="text-muted-foreground">to</span>
                  <input type="date" aria-label="To date" value={range.state.to} onChange={(e) => range.setCustom(range.state.from, e.target.value)} className="rounded-lg border border-border bg-background px-3 py-1.5" />
                </span>
              )}
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {range.state.problem ? "No dates chosen" : `${range.state.from} to ${range.state.to}`} · {currency} · {timezone}
            </span>
          </div>

          {range.state.problem ? (
            <div role="alert" className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
              {range.state.problem}
            </div>
          ) : overview.isError && !overview.data ? (
            <LoadError what="The product overview" message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />
          ) : (
            <>
              <ProductKpiStrip portfolio={portfolio} loading={overview.isLoading} currency={currency} timezone={timezone} />

              {portfolio && portfolio.totalProducts === 0 ? (
                <StateBox title="There is nothing to analyse yet." description="Recommendations appear once you have products with stock or sales. Add your first product to get started.">
                  <Link to={ROUTES.PRODUCTS_NEW} className={cn(buttonVariants({ size: "sm" }), "text-xs")}>
                    Add a product
                  </Link>
                </StateBox>
              ) : (
                <>
                  <PrioritizedOpportunities items={overview.data?.items ?? []} loading={overview.isLoading} onInspect={(item: IntelItem) => handleInspect(item)} />

                  {/* the real list with its columns (velocity, margin, cover, competitor, action): the first products by priority, the rest on All products */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-foreground">Product performance</h2>
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => update({ tab: "all" })}>
                        View all products
                      </Button>
                    </div>
                    {overview.isLoading && !overview.data ? <ListSkeleton label="Loading products" /> : <IntelTable items={(overview.data?.items ?? []).slice(0, 6)} selectedVariantId={open} onOpen={(item) => update({ open: item.variantId })} />}
                  </div>

                  <ProductPortfolioCharts portfolio={portfolio} loading={overview.isLoading} onInspect={handleInspect} />
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Category Actions */}
          <IntelKpis data={data} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} onAction={(a) => update({ action: a })} />

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3" aria-hidden />
            Rule-based from your own data. Nothing here is generated by AI, and no action goes live without your review.
          </div>

          {/* Filter and Search Bar */}
          <IntelFilters
            query={query}
            counts={data?.summary}
            categories={categories.data ?? []}
            warehouses={warehouses.data ?? []}
            filtered={filtered}
            onAction={(a) => update({ action: a })}
            onSearch={(q) => update({ q }, { replace: true })}
            onCategory={(id) => update({ category: id })}
            onWarehouse={(id) => update({ warehouse: id })}
            onSort={(s) => update({ sort: s === "priority" ? null : s })}
            onClear={clearFilters}
          />

          {/* Catalog Performance Table */}
          {body()}
        </>
      )}

      <IntelDrawer item={selected} onClose={() => update({ open: null })} />
    </div>
  );
}
