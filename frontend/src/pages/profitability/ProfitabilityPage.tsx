import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
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
import { channelsCsv, channelsFileName, csvBlob, money, presetRange, waterfallCsv, waterfallFileName } from "@/components/profitability/profitFormat";
import { DEFAULT_PAGE_SIZE, useProfitUrlState, waterfallQueryOf } from "@/components/profitability/profitParams";
import { saveBlob } from "@/components/products/list/saveBlob";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useDeleteSpend, useSpendAccounts, useWaterfall } from "@/hooks/useProfitability";
import { toast } from "@/hooks/useToast";
import type { ProfitView, RangePreset, SpendRow } from "@/types/profitability";

const VIEWS: Array<{ id: ProfitView; label: string }> = [
  { id: "waterfall", label: "Waterfall" },
  { id: "spend", label: "Advertising spend" },
];

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
      // a custom range starts from the dates on screen, so it is valid straight away
      const shown = range ?? presetRange("30d", new Date().toISOString().slice(0, 10));
      update({ range: "custom", from: shown.from, to: shown.to });
    } else update({ range: next });
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

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="INTELLIGENCE"
        title="Profitability and unit economics"
        description="Where each rupee of revenue goes: refunds, product cost, marketplace fees, shipping and advertising, with every figure marked actual, estimated or missing."
        actions={
          <>
            {canRead && <RefreshButton onRefresh={() => void waterfall.refetch()} spinning={waterfall.isFetching} />}
            <div role="tablist" aria-label="Profitability view" className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => update({ view: v.id, account: null, q: null })}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${view === v.id ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {!canRead ? (
        <Notice title="You do not have access to profitability." description="Ask an owner or admin to grant you the analytics:read permission." />
      ) : (
        <>
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

          {range === null ? (
            <Notice title="Choose a date range." description={rangeError ?? "Pick a start and an end date."} />
          ) : view === "waterfall" ? (
            waterfall.isError && !data ? (
              <Notice title="Profitability could not be loaded." description={errorMessage(waterfall.error)} onRetry={() => void waterfall.refetch()} />
            ) : (
              <div className={refreshing ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"} aria-busy={refreshing}>
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
