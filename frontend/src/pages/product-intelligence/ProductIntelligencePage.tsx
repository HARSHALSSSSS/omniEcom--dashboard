import { Link, useNavigate } from "react-router-dom";
import { Calendar, ChevronDown, Download, MoreHorizontal, Sparkles } from "lucide-react";
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
import { ProductPerformanceTable } from "@/components/product-intelligence/ProductPerformanceTable";
import { NO_READ_REASON, ACTION_LABELS } from "@/components/product-intelligence/intelFormat";
import { intelFiltered, useIntelUrlState } from "@/components/product-intelligence/intelParams";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useIntelCategories, useIntelWarehouses, useProductIntelligence } from "@/hooks/useProductIntelligence";
import { cn } from "@/utils/cn";

export default function ProductIntelligencePage() {
  const navigate = useNavigate();
  const url = useIntelUrlState();
  const { tab, query, open, update, clearFilters } = url;
  const canRead = useCan("analytics:read");
  const list = useProductIntelligence(query, canRead);
  const categories = useIntelCategories(canRead);
  const warehouses = useIntelWarehouses(canRead);

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
  const selected = open ? (data?.items.find((i) => i.variantId === open) ?? null) : null;

  const handleInspect = (sku: string, title: string) => {
    navigate(`${ROUTES.AI_ASSISTANT}?sku=${sku}&product=${encodeURIComponent(title)}&context=stock_risk`);
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
          onPageSize={(s) => update({ size: s === 25 ? null : String(s) })}
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
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Export overview
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            <RefreshButton onRefresh={() => void list.refetch()} spinning={list.isFetching} />
          </div>
        }
      />

      {/* Top Tab Bar matching Figma (Overview | All products | Watchlist) */}
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
          <button
            type="button"
            role="tab"
            aria-selected={tab === "watchlist"}
            onClick={() => update({ tab: "watchlist" })}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-xs font-medium transition-all",
              tab === "watchlist"
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Watchlist
          </button>
        </div>

        <span className="text-xs text-muted-foreground">Illustrative data · Not synced or verified</span>
      </div>

      {tab === "overview" ? (
        <>
          {/* Global Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted/50"
              >
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>01–30 Sep 2026</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <select
                aria-label="Filter channels"
                className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground"
                defaultValue="All channels"
              >
                <option value="All channels">All channels</option>
                <option value="Amazon">Amazon</option>
                <option value="Flipkart">Flipkart</option>
                <option value="Shopify">Shopify</option>
              </select>
              <select
                aria-label="Filter categories"
                className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground"
                defaultValue="All categories"
              >
                <option value="All categories">All categories</option>
                <option value="Textiles">Textiles</option>
                <option value="Dining">Dining</option>
                <option value="Lighting">Lighting</option>
                <option value="Decor">Decor</option>
                <option value="Storage">Storage</option>
              </select>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              INR (₹) · Asia/Kolkata
            </span>
          </div>

          {/* 5-KPI Metric Strip */}
          <ProductKpiStrip />

          {/* 3 Prioritized Opportunities Alert Cards */}
          <PrioritizedOpportunities onInspectProduct={handleInspect} />

          {/* Product Performance Table with 6 products, Signal pills and Summary */}
          <ProductPerformanceTable onInspectProduct={handleInspect} />

          {/* Bottom Visual Analytics: Where sales come from & Portfolio at a glance */}
          <ProductPortfolioCharts onInspectTopRisk={() => handleInspect("NL-THR-002", "Cotton throw")} />
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
