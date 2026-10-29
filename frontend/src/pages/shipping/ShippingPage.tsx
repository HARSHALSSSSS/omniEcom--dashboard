import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AddProviderDrawer, ConfigureMethodDrawer } from "@/components/shipping/MethodDrawers";
import { ChooseShippingDrawer } from "@/components/shipping/ChooseShippingDrawer";
import { LabelPreviewDialog } from "@/components/shipping/LabelPreviewDialog";
import { ManifestsDialog } from "@/components/shipping/ManifestsDialog";
import { MethodsSection } from "@/components/shipping/MethodsSection";
import { OrdersSection } from "@/components/shipping/OrdersSection";
import { AttentionBand, AvailabilityComparison, DecisionField, ExceptionMatrix, PulseRail } from "@/components/shipping/OverviewSection";
import { RuleDrawer } from "@/components/shipping/RuleDrawer";
import { RulesSection } from "@/components/shipping/RulesSection";
import { PickupSlotDrawer } from "@/components/shipping/PickupSlotDrawer";
import { ShipmentDrawer } from "@/components/shipping/ShipmentDrawer";
import { ShipmentsSection } from "@/components/shipping/ShipmentsSection";
import { ShippingHeader } from "@/components/shipping/ShippingHeader";
import { ShippingWelcome } from "@/components/shipping/ShippingStates";
import { TrackingSection } from "@/components/shipping/TrackingSection";
import { decisionQueryOf, isFiltered, isOrdersFiltered, isTrackingFiltered, shipmentsQueryOf, trackingQueryOf, useShippingUrlState } from "@/components/shipping/shippingParams";
import { saveBlob } from "@/components/products/list/saveBlob";
import { shippingApi } from "@/api/shipping.api";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { SHIPPING_KEYS, useShippingExceptions, useShippingMethods, useShippingOverview, useShippingRules, useShippingSync, useShippingWarehouses, useSyncTracking } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import type { DecisionItem, ExceptionCategory, ShippingMethod, ShippingRule } from "@/types/shipping";

export default function ShippingPage() {
  const url = useShippingUrlState();
  const { update, view, drawerId, panel } = url;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canWrite = useCan("shipping:write");
  const canConfigure = useCan("shipping:configure");
  const canReadRules = useCan("rules:read");

  const overview = useShippingOverview();
  const methods = useShippingMethods();
  const warehouses = useShippingWarehouses();
  const exceptions = useShippingExceptions(url.exceptions);
  const [ruleDrawer, setRuleDrawer] = useState<{ rule: ShippingRule | null } | null>(null);
  const rules = useShippingRules(ruleDrawer !== null && canReadRules);
  const sync = useShippingSync();
  const syncTracking = useSyncTracking();
  const [exporting, setExporting] = useState(false);

  const [chooseId, setChooseId] = useState<string | null>(null);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);
  const [previewLabelId, setPreviewLabelId] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<ShippingMethod | null>(null);
  /** the Book slot drawer: open, with what the row it came from already says */
  const [slotDrawer, setSlotDrawer] = useState<{ warehouseId: string; methodId: string | null } | "open" | null>(null);

  const shipmentsQuery = shipmentsQueryOf(url);

  const channels = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of overview.data?.availabilityComparison ?? []) seen.set(row.channel.code, row.channel.name);
    return [...seen.entries()].map(([code, name]) => ({ code, name }));
  }, [overview.data]);

  const hasMethods = (methods.data?.items.length ?? 0) > 0;
  const noMethodsYet = methods.data !== undefined && !hasMethods;

  const printOne = (id: string) => {
    setPreviewLabelId(id);
  };
  const labelBusyId = null;

  /** the drawer loads the shipment by its id (the second argument is kept for the callers: it is not needed any more) */
  const openShipment = (id: string, _hint?: string | null) => update({ drawer: `shipment:${id}` }, { keepPage: true });

  const openExceptions = () => {
    update({ view: "overview", exceptions: "1" }, { keepPage: true });
    setTimeout(() => document.getElementById("exception-matrix-section")?.scrollIntoView?.({ behavior: "smooth" }), 150);
  };

  const exportExceptions = async () => {
    setExporting(true);
    try {
      const file = await shippingApi.exportExceptions();
      saveBlob(file.blob, file.fileName);
    } catch (e) {
      toast({ title: "The export failed", description: errorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const onExceptionAction = (cat: ExceptionCategory, index: number | null) => {
    const order = index === null ? undefined : cat.orders[index];
    switch (cat.key) {
      case "no_method_selected":
        if (order?.fulfillmentId) setChooseId(order.fulfillmentId);
        else update({ view: "orders", ostatus: "needs_decision" });
        break;
      case "label_unavailable":
      case "connector_capability_limit":
        update({ view: "methods" });
        break;
      case "tracking_not_received":
        update({ view: "tracking", ...(order ? { tq: order.number } : {}) });
        break;
      case "sla_risk":
        update({ view: "orders", ...(order ? { oq: order.number } : { osla: cat.orders.some((o) => o.detail === "breached") ? "breached" : "at_risk" }) });
        break;
      case "shipping_sync_failed": {
        const ids = (order ? [order.shipmentId] : cat.orders.map((o) => o.shipmentId)).filter((x): x is string => Boolean(x));
        syncTracking.mutate(ids.length ? ids : undefined, {
          onSuccess: (r) => toast({ title: r.failed > 0 ? "Retry finished with failures" : "Tracking retried", description: `${r.processed} checked, ${r.updated} updated${r.failed ? `, ${r.failed} failed` : ""}.`, variant: r.failed > 0 ? "destructive" : "success" }),
          onError: (e) => toast({ title: "The retry failed", description: errorMessage(e), variant: "destructive" }),
        });
        break;
      }
    }
  };

  const closeChoose = useCallback(() => {
    setChooseId(null);
    setBulkIds(null);
  }, []);
  const closePanel = useCallback(() => update({ panel: null }, { keepPage: true, replace: true }), [update]);
  const openAddProvider = () => update({ panel: "carriers" }, { keepPage: true });

  const ordersProps = {
    query: decisionQueryOf(url),
    filters: url.orders,
    filtered: isOrdersFiltered(url.orders),
    channels,
    warehouses: warehouses.data ?? [],
    canWrite,
    hasMethods,
    onUpdate: update,
    onClear: url.clearOrderFilters,
    onChoose: setChooseId,
    onBulkAssign: setBulkIds,
    onPrintLabel: printOne,
    onBookSlot: (item: DecisionItem) => setSlotDrawer({ warehouseId: item.pickup.warehouseId, methodId: item.pickup.methodId }),
    onTrack: (item: DecisionItem) => update({ view: "tracking", tq: item.number }),
    onSetupMethods: () => update({ view: "methods" }),
  };
  const methodsProps = { canConfigure, onAddProvider: openAddProvider, onConfigure: setConfiguring };
  const rulesProps = { canRead: canReadRules, canConfigure, onCreate: () => setRuleDrawer({ rule: null }), onEdit: (rule: ShippingRule) => setRuleDrawer({ rule }) };
  const trackingProps = {
    query: trackingQueryOf(url),
    filters: url.tracking,
    filtered: isTrackingFiltered(url.tracking),
    channels,
    canWrite,
    onUpdate: update,
    onClear: url.clearTrackingFilters,
    onOpenShipment: openShipment,
  };

  return (
    <div className="w-full space-y-6 pb-24 text-foreground">
      <ShippingHeader
        view={view}
        onView={(v) => update({ view: v }, { keepPage: true })}
        canWrite={canWrite}
        canConfigure={canConfigure}
        sync={{ job: sync.job, starting: sync.starting, startError: sync.startError ? errorMessage(sync.startError) : null }}
        refreshing={overview.isFetching && !overview.isLoading && !sync.running}
        overview={overview.data}
        onSync={sync.start}
        onDismissSync={sync.dismiss}
        onViewExceptions={openExceptions}
        onRules={() => (canConfigure ? setRuleDrawer({ rule: null }) : update({ view: "rules" }, { keepPage: true }))}
        onAddProvider={openAddProvider}
        onManifests={() => update({ panel: "manifests" }, { keepPage: true })}
        onPickupSlots={() => setSlotDrawer("open")}
        onRefresh={() => void queryClient.invalidateQueries({ queryKey: SHIPPING_KEYS.all })}
      />

      {noMethodsYet && view !== "shipments" ? (
        <ShippingWelcome canConfigure={canConfigure} onConfigure={openAddProvider} onMarketplaces={() => navigate(ROUTES.MARKETPLACE_HUB)} />
      ) : view === "overview" ? (
        <section className="space-y-7" aria-label="Shipping overview">
          <PulseRail overview={overview} />
          <DecisionField overview={overview} onReview={() => update({ view: "rules" }, { keepPage: true })} />
          <AvailabilityComparison overview={overview} />
          <AttentionBand overview={overview} open={url.exceptions} onToggle={() => update({ exceptions: url.exceptions ? null : "1" }, { keepPage: true })} />
          {url.exceptions && <ExceptionMatrix attentionTotal={overview.data?.attention.total ?? 0} report={exceptions} exporting={exporting} onExport={() => void exportExceptions()} onAction={onExceptionAction} />}
        </section>
      ) : view === "orders" ? (
        <OrdersSection {...ordersProps} embedded={false} />
      ) : view === "methods" ? (
        <MethodsSection {...methodsProps} embedded={false} />
      ) : view === "rules" ? (
        <RulesSection {...rulesProps} embedded={false} />
      ) : view === "tracking" ? (
        <TrackingSection {...trackingProps} embedded={false} />
      ) : (
        <ShipmentsSection
          query={shipmentsQuery}
          filters={url.filters}
          tab={url.tab}
          page={url.page}
          pageSize={url.pageSize}
          days={url.days}
          filtered={isFiltered(url.filters)}
          warehouses={warehouses.data ?? []}
          canWrite={canWrite}
          canConfigure={canConfigure}
          labelBusyId={labelBusyId}
          onUpdate={update}
          onClear={url.clearFilters}
          onOpenShipment={(id) => openShipment(id, null)}
          onLabel={printOne}
          onSetupCarrier={openAddProvider}
        />
      )}

      <ChooseShippingDrawer fulfillmentId={chooseId} bulkIds={bulkIds} canWrite={canWrite} onClose={closeChoose} />
      <AddProviderDrawer open={panel === "carriers"} canConfigure={canConfigure} channels={channels} methods={methods.data?.items ?? []} onClose={closePanel} />
      <ConfigureMethodDrawer method={configuring} canConfigure={canConfigure} onClose={() => setConfiguring(null)} />
      <RuleDrawer
        open={ruleDrawer !== null}
        rule={ruleDrawer?.rule ?? null}
        canConfigure={canConfigure}
        channels={channels}
        warehouses={warehouses.data ?? []}
        methods={methods.data?.items ?? []}
        count={rules.data?.total ?? 0}
        onClose={() => setRuleDrawer(null)}
      />
      <ShipmentDrawer
        shipmentId={drawerId}
        canWrite={canWrite}
        labelBusy={false}
        onClose={() => update({ drawer: null }, { keepPage: true, replace: true })}
        onLabel={printOne}
      />
      <PickupSlotDrawer open={slotDrawer !== null} canWrite={canWrite} preset={slotDrawer === "open" ? null : slotDrawer} methods={methods.data?.items ?? []} warehouses={warehouses.data ?? []} onClose={() => setSlotDrawer(null)} />
      <ManifestsDialog open={panel === "manifests"} onClose={closePanel} />
      <LabelPreviewDialog shipmentId={previewLabelId} onClose={() => setPreviewLabelId(null)} />
    </div>
  );
}
