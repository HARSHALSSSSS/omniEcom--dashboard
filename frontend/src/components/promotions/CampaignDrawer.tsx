import { useEffect, useMemo, useState } from "react";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { useCampaignProducts, useEvaluateCampaign, usePromotionCampaign, useRemoveCampaignProducts } from "@/hooks/usePromotions";
import { toast } from "@/hooks/useToast";
import { formatNumber } from "@/utils/format";
import { PROMOTION_ITEM_STATUSES, type PromotionCampaignDetail, type PromotionItemStatus, type PromotionLifecycleAction } from "@/types/promotions";
import { ACTION_LABELS, END_REASON_LABELS, ITEM_STATUS_LABELS, TYPE_LABELS, WRITE_REASON, allowedActions, describeTerms, formatBps, isDraft, money, whenOf, windowOf } from "./promoFormat";
import { CampaignBadge, ChannelChips, Line, PromoPagination } from "./PromoUi";
import { ProductsTable } from "./ProductsTable";

const PAGE_SIZE = 10;

interface Props {
  campaignId: string | null;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: (c: PromotionCampaignDetail) => void;
  onLifecycle: (c: PromotionCampaignDetail, action: PromotionLifecycleAction) => void;
  onDuplicate: (c: PromotionCampaignDetail) => void;
  onDelete: (c: PromotionCampaignDetail) => void;
  onAddProducts: (c: PromotionCampaignDetail) => void;
}

function Velocity({ c }: { c: PromotionCampaignDetail }) {
  const v = c.velocity;
  if (v.liftBps === null) {
    return <span className="text-muted-foreground">Not enough data yet (needs a full day of sales and at least 5 baseline units)</span>;
  }
  return (
    <span title={`${formatNumber(v.promoUnits)} units in ${v.promoDays.toFixed(1)} days vs ${formatNumber(v.baselineUnits)} units in the ${v.baselineDays} days before`}>
      {v.liftBps > 0 ? "+" : ""}
      {formatBps(v.liftBps)}
    </span>
  );
}

function CampaignProducts({ c, canWrite, onAddProducts }: { c: PromotionCampaignDetail; canWrite: boolean; onAddProducts: Props["onAddProducts"] }) {
  const [status, setStatus] = useState<PromotionItemStatus | undefined>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const list = useCampaignProducts(c.id, { status, page, pageSize: PAGE_SIZE });
  const remove = useRemoveCampaignProducts();
  const evaluate = useEvaluateCampaign();
  const draft = isDraft(c);
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);

  useEffect(() => setSelected(new Set()), [page, status, c.id]);
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) setPage(d.pages);
  }, [list.data, page]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () => setSelected((prev) => (rows.length > 0 && rows.every((r) => prev.has(r.variantId)) ? new Set() : new Set(rows.map((r) => r.variantId))));

  const removeSelected = () =>
    remove.mutate(
      { id: c.id, variantIds: [...selected] },
      {
        onSuccess: (res) => {
          setSelected(new Set());
          toast({ title: `${res.removed} product${res.removed === 1 ? "" : "s"} removed`, description: `${res.total} left in the campaign.`, variant: "success" });
        },
        onError: (e) => toast({ title: "Could not remove products", description: errorMessage(e), variant: "destructive" }),
      },
    );

  const recheck = () =>
    evaluate.mutate(c.id, {
      onSuccess: () => toast({ title: "Products re-checked", description: "Prices, listings, margin floors and other campaigns were read again.", variant: "success" }),
      onError: (e) => toast({ title: "Could not re-check products", description: errorMessage(e), variant: "destructive" }),
    });

  const counts = list.data?.counts;
  const off = !canWrite;
  return (
    <section className="space-y-3" aria-label="Campaign products">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">Products {counts ? `(${formatNumber(counts.all)})` : ""}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Product status" value={status ?? ""} onChange={(e) => { setStatus((e.target.value || undefined) as PromotionItemStatus | undefined); setPage(1); }} className="h-8 rounded-lg border border-border bg-card px-2 text-xs">
            <option value="">All statuses</option>
            {PROMOTION_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ITEM_STATUS_LABELS[s]}
                {counts ? ` (${counts[s]})` : ""}
              </option>
            ))}
          </select>
          {draft && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={off || c.itemCounts.total === 0} title={off ? WRITE_REASON : undefined} loading={evaluate.isPending} onClick={recheck}>
                Re-check
              </Button>
              <Button size="sm" className="h-8 text-xs" disabled={off} title={off ? WRITE_REASON : undefined} onClick={() => onAddProducts(c)}>
                Add products
              </Button>
            </>
          )}
        </div>
      </div>

      {draft && selected.size > 0 && (
        <div role="toolbar" aria-label="Product actions" className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
          <span className="font-semibold">{selected.size} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={off} loading={remove.isPending} onClick={removeSelected}>
            Remove from campaign
          </Button>
          <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {list.isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading products...
        </p>
      ) : list.isError && !list.data ? (
        <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
          {errorMessage(list.error)}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {status ? "No products with this status." : draft ? "No products yet. Add the products this campaign should discount." : "This campaign has no products."}
        </p>
      ) : (
        <>
          <ProductsTable rows={rows} refreshing={list.isFetching && list.isPlaceholderData} showCampaign={false} selected={draft && canWrite ? selected : undefined} onToggle={draft && canWrite ? toggle : undefined} onToggleAll={toggleAll} />
          {(list.data?.pages ?? 1) > 1 && (
            <PromoPagination page={list.data?.page ?? page} pages={list.data?.pages ?? 1} total={list.data?.total ?? 0} pageSize={PAGE_SIZE} shown={rows.length} noun="products" onPage={setPage} onPageSize={() => undefined} />
          )}
        </>
      )}
    </section>
  );
}

/** one campaign: terms, window, results from real orders, velocity lift, its products, and every action its state allows */
export function CampaignDrawer({ campaignId, canWrite, busy, onClose, onEdit, onLifecycle, onDuplicate, onDelete, onAddProducts }: Props) {
  const query = usePromotionCampaign(campaignId);
  const c = query.data;
  if (!campaignId) return null;
  const off = !canWrite || busy;
  const reason = canWrite ? undefined : WRITE_REASON;

  return (
    <ContextDrawer
      open
      onClose={onClose}
      className="sm:max-w-[680px]"
      title={c?.name ?? "Campaign"}
      badge={c ? <CampaignBadge status={c.status} /> : undefined}
      description={c ? `${c.code} · ${TYPE_LABELS[c.type]}` : undefined}
      footer={
        c ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            {isDraft(c) && (
              <Button size="sm" variant="outline" className="text-xs" disabled={off} title={reason} onClick={() => onEdit(c)}>
                Edit
              </Button>
            )}
            {allowedActions(c.status).map((a) => (
              <Button key={a} size="sm" variant={ACTION_LABELS[a].destructive ? "outline" : "default"} className="text-xs" disabled={off} title={reason} onClick={() => onLifecycle(c, a)}>
                {ACTION_LABELS[a].verb}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="text-xs" disabled={off} title={reason} onClick={() => onDuplicate(c)}>
              Duplicate
            </Button>
            {isDraft(c) && (
              <Button size="sm" variant="outline" className="text-xs text-destructive" disabled={off} title={reason} onClick={() => onDelete(c)}>
                Delete draft
              </Button>
            )}
            <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading campaign...
        </p>
      ) : query.isError || !c ? (
        <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>{errorMessage(query.error, "This campaign could not be loaded.")}</p>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-6 text-xs">
          {c.description && <p className="text-muted-foreground">{c.description}</p>}
          <div className="space-y-2">
            <Line label="Discount">{describeTerms(c)}</Line>
            <Line label="Window">{windowOf(c)}</Line>
            <Line label="Channels">
              <ChannelChips channels={c.channels} />
            </Line>
            <Line label="Budget">{c.budgetMinor > 0 ? `${money(c.budgetMinor, c.currency)}${c.budgetUsedBps === null ? "" : ` · ${formatBps(c.budgetUsedBps)} used`}` : "No limit"}</Line>
            {c.minOrderMinor > 0 && <Line label="Minimum order">{money(c.minOrderMinor, c.currency)}</Line>}
            {c.endReason && <Line label="Ended because">{END_REASON_LABELS[c.endReason] ?? c.endReason}</Line>}
          </div>

          <section className="space-y-2" aria-label="Results">
            <h3 className="text-xs font-semibold text-foreground">Results</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Revenue", money(c.revenueMinor, c.currency)],
                ["Units moved", formatNumber(c.unitsMoved)],
                ["Orders", formatNumber(c.ordersCount)],
                ["Discount given", money(c.spendMinor, c.currency)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                  <div className="mt-1 font-mono text-sm font-bold">{value}</div>
                </div>
              ))}
            </div>
            <Line label="Velocity lift">
              <Velocity c={c} />
            </Line>
            <p className="text-[11px] text-muted-foreground">{c.statsUpdatedAt ? `Results updated ${whenOf(c.statsUpdatedAt)}.` : "Results appear once the campaign has run."}</p>
          </section>

          <CampaignProducts c={c} canWrite={canWrite} onAddProducts={onAddProducts} />
        </div>
      )}
    </ContextDrawer>
  );
}
