import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Layers, X } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import {
  useBulkVariants,
  useDeleteVariant,
  useVariantCounts,
  useVariantGrid,
  useVariantsHeader,
} from "@/hooks/useVariants";
import { variantsApi } from "@/api/variants.api";
import { errorMessage, isApiError } from "@/api/errors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/QueryBoundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkBar } from "@/components/products/variants/BulkBar";
import { StockDialog, type StockMode } from "@/components/products/variants/StockDialog";
import { VariantDrawer } from "@/components/products/variants/VariantDrawer";
import { VariantGridTable, type RowAction } from "@/components/products/variants/VariantGridTable";
import { VariantTabs } from "@/components/products/variants/VariantTabs";
import { VariantToolbar } from "@/components/products/variants/VariantToolbar";
import { VariantsHeader } from "@/components/products/variants/VariantsHeader";
import { useVariantsUrlState } from "@/components/products/variants/useVariantsUrlState";
import { buildVariantsCsv, downloadText } from "@/components/products/variants/variantUtils";
import type { VariantBulkAction, VariantGridItem } from "@/types/variants";
import { formatNumber } from "@/utils/format";

interface Report {
  title: string;
  failures: { sku: string; message: string }[];
}

const ACTION_DONE: Record<VariantBulkAction, string> = { archive: "archived", activate: "activated", delete: "deleted" };

export default function VariantsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canWrite = useCan("products:write");
  const canStock = useCan("inventory:write");

  const url = useVariantsUrlState();
  const { params } = url;
  const header = useVariantsHeader(id);
  const grid = useVariantGrid(id, params);
  const counts = useVariantCounts(id);
  const bulk = useBulkVariants(id);
  const remove = useDeleteVariant(id);

  const paramsKey = JSON.stringify(params);
  const [picked, setPicked] = useState<{ key: string; ids: string[] }>({ key: paramsKey, ids: [] });
  const selected = useMemo(() => new Set(picked.key === paramsKey ? picked.ids : []), [picked, paramsKey]);
  const setSelected = (ids: string[]) => setPicked({ key: paramsKey, ids });

  const [drawer, setDrawer] = useState<{ variantId: string | null; leadTimeDays: number | null } | null>(null);
  const [stock, setStock] = useState<{ variant: VariantGridItem; mode: StockMode } | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [exporting, setExporting] = useState(false);

  const page = grid.data;
  const items = useMemo(() => page?.items ?? [], [page]);
  const skuOf = useMemo(() => new Map(items.map((i) => [i.id, i.sku])), [items]);

  // deleting / archiving the last row of the last page leaves an empty page behind: step back
  useEffect(() => {
    if (page && page.items.length === 0 && page.total > 0 && params.page > page.pages) url.setPage(Math.max(page.pages, 1));
  }, [page, params.page, url]);

  const productPath = `${ROUTES.PRODUCTS}/${id}`;
  const anyFilter = !!params.q || !!params.channel || !!params.inventory || Object.keys(params.options).length > 0 || params.tab !== "all";

  const runBulk = async (ids: string[], action: VariantBulkAction) => {
    setReport(null);
    try {
      const res = await bulk.mutateAsync({ ids, action });
      const failures = res.results
        .filter((r) => !r.ok)
        .map((r) => ({ sku: (r.id ? skuOf.get(r.id) : undefined) ?? skuOf.get(ids[r.index] ?? "") ?? `Variant ${r.index + 1}`, message: r.error?.message ?? "Failed" }));
      setSelected([]);
      if (res.summary.succeeded > 0) {
        toast({ title: `${formatNumber(res.summary.succeeded)} ${res.summary.succeeded === 1 ? "variant" : "variants"} ${ACTION_DONE[action]}`, variant: "success" });
      }
      if (failures.length) setReport({ title: `${formatNumber(failures.length)} of ${formatNumber(res.summary.total)} could not be ${ACTION_DONE[action]}`, failures });
    } catch (e) {
      toast({ title: "Bulk action failed", description: errorMessage(e), variant: "destructive" });
    }
  };

  const onRowAction = (action: RowAction, item: VariantGridItem) => {
    switch (action) {
      case "edit":
        setDrawer({ variantId: item.id, leadTimeDays: item.leadTimeDays });
        break;
      case "adjust":
      case "receive":
        setStock({ variant: item, mode: action });
        break;
      case "archive":
      case "activate":
        void runBulk([item.id], action);
        break;
      case "delete":
        setConfirm({ ids: [item.id], label: item.sku });
        break;
    }
  };

  const confirmDelete = async () => {
    if (!confirm) return;
    const { ids } = confirm;
    const only = ids.length === 1 ? ids[0] : undefined;
    if (only) {
      setReport(null);
      try {
        await remove.mutateAsync(only);
        setSelected([...selected].filter((s) => s !== only));
        toast({ title: "Variant deleted", variant: "success" });
      } catch (e) {
        setReport({ title: "The variant could not be deleted", failures: [{ sku: skuOf.get(only) ?? "Variant", message: errorMessage(e) }] });
      }
    } else {
      await runBulk(ids, "delete");
    }
    setConfirm(null);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: VariantGridItem[] = [];
      for (let p = 1; p <= 100; p++) {
        const res = await variantsApi.grid(id, { ...params, page: p, pageSize: 100 });
        all.push(...res.items);
        if (p >= res.pages) break;
      }
      downloadText(`${(header.data?.productCode ?? "product").replace(/[^A-Za-z0-9._-]/g, "_")}-variants.csv`, buildVariantsCsv(all));
      toast({ title: "Export ready", description: `${formatNumber(all.length)} ${all.length === 1 ? "variant" : "variants"} exported to CSV.`, variant: "success" });
    } catch (e) {
      toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (header.isError && isApiError(header.error) && header.error.status === 404) {
    return (
      <EmptyState
        title="Product not found"
        description="This product does not exist or was removed."
        actionLabel="Back to products"
        onAction={() => navigate(ROUTES.PRODUCTS)}
      />
    );
  }

  const noVariantsAtAll = counts.data?.all === 0 && !anyFilter && page?.total === 0;

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">
      <VariantsHeader
        header={header.data}
        loading={header.isPending}
        canWrite={canWrite}
        exporting={exporting}
        onProducts={() => navigate(ROUTES.PRODUCTS)}
        onProduct={() => navigate(productPath)}
        onAdd={() => setDrawer({ variantId: null, leadTimeDays: null })}
        onImport={() => navigate(ROUTES.PRODUCTS_IMPORT)}
        onExport={() => void exportCsv()}
      />

      {header.isError && (
        <div role="alert" className="w-full flex items-center justify-between rounded-lg border border-[#F2B8B5] bg-[#FDE7E7] p-3 text-[12px] text-[#B42318]">
          <span>{errorMessage(header.error, "Could not load the product.")}</span>
          <Button size="sm" variant="outline" onClick={() => void header.refetch()}>
            Try again
          </Button>
        </div>
      )}

      <div className="w-full flex flex-col items-start gap-3">
        <VariantTabs active={params.tab} counts={counts.data} onChange={url.setTab} />
        <VariantToolbar
          params={params}
          header={header.data}
          onSearch={url.setQ}
          onOption={url.setOption}
          onChannel={url.setChannel}
          onInventory={url.setInventory}
          onClear={url.clearFilters}
          bulk={
            canWrite ? (
              <BulkBar
                count={selected.size}
                busy={bulk.isPending}
                onClear={() => setSelected([])}
                onAction={(action) => {
                  const ids = [...selected];
                  if (action === "delete") setConfirm({ ids, label: `${formatNumber(ids.length)} variants` });
                  else void runBulk(ids, action);
                }}
              />
            ) : null
          }
        />
      </div>

      {report && (
        <div role="alert" className="w-full rounded-lg border border-[#F5C26B] bg-[#FFF8E6] p-3 text-[12px] text-[#7A4B00]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden /> {report.title}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => setReport(null)} className="p-0.5 rounded hover:bg-[#FFEFC2] cursor-pointer">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <ul className="mt-2 list-disc pl-6 space-y-0.5">
            {report.failures.map((f, i) => (
              <li key={`${f.sku}-${i}`}>
                <span className="font-medium">{f.sku}</span>: {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {grid.isPending ? (
        <div className="w-full flex flex-col gap-2 rounded-[12px] border border-[#EAEAEA] p-4" aria-busy="true" aria-label="Loading variants">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : grid.isError && !page ? (
        <div role="alert" className="w-full flex flex-col items-start gap-3 rounded-[12px] border border-[#F2B8B5] bg-[#FDE7E7] p-4 text-[12px] text-[#B42318]">
          <span>{errorMessage(grid.error, "Could not load the variants.")}</span>
          <Button size="sm" variant="outline" onClick={() => void grid.refetch()}>
            Try again
          </Button>
        </div>
      ) : noVariantsAtAll ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="This product has no variants yet"
          description={canWrite ? "Variants are the sellable SKUs of a product, such as each colour and size." : "Variants are the sellable SKUs of a product. Ask someone with edit access to add the first one."}
          actionLabel={canWrite ? "Add your first variant" : undefined}
          onAction={canWrite ? () => setDrawer({ variantId: null, leadTimeDays: null }) : undefined}
          className="w-full"
        />
      ) : page && page.items.length === 0 && page.total === 0 ? (
        <EmptyState
          title="No variants match"
          description="Try a different search or clear the filters."
          actionLabel="Clear filters"
          onAction={() => {
            url.clearFilters();
            url.setTab("all");
          }}
          className="w-full"
        />
      ) : page ? (
        <VariantGridTable
          page={page}
          sort={params.sort}
          onSort={url.setSort}
          selected={selected}
          onToggle={(vid) => setSelected(selected.has(vid) ? [...selected].filter((s) => s !== vid) : [...selected, vid])}
          onToggleAll={(checked) => setSelected(checked ? page.items.map((i) => i.id) : [])}
          canWrite={canWrite}
          canStock={canStock}
          busy={grid.isFetching}
          onAction={onRowAction}
          onPage={url.setPage}
        />
      ) : null}

      <VariantDrawer
        open={drawer !== null}
        variantId={drawer?.variantId ?? null}
        leadTimeDays={drawer?.leadTimeDays ?? null}
        productId={id}
        optionNames={Object.keys(header.data?.options ?? {})}
        readOnly={!canWrite}
        onClose={() => setDrawer(null)}
      />

      <StockDialog productId={id} variant={stock?.variant ?? null} mode={stock?.mode ?? "adjust"} onClose={() => setStock(null)} />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm && confirm.ids.length > 1 ? "Delete variants?" : "Delete variant?"}
        description={`Delete ${confirm?.label ?? ""}? This removes the SKU from the product. Variants with reserved stock or live listings cannot be deleted, and a product keeps at least one active variant.`}
        confirmText="Delete"
        variant="destructive"
        loading={remove.isPending || bulk.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
