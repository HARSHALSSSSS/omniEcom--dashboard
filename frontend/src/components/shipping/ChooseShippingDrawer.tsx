import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, isApiError } from "@/api/errors";
import { useBulkOrders, useSelectMethod, useShippingOptions } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import { formatCurrency } from "@/utils/format";
import type { BulkOrdersResult, MethodKind, ShippingOption } from "@/types/shipping";
import { BTN_PRIMARY, BTN_SECONDARY, OptionCard, ShippingDrawer } from "./ShippingDrawer";
import { KIND_LABEL, NO_WRITE_REASON, destinationText, orDash, weightText } from "./shippingFormat";

const MANAGED = { marketplace: "Marketplace-managed", merchant: "Merchant-managed", provider: "Provider-managed" } as const;
const SOURCE_TEXT: Record<string, string> = {
  rule: "a shipping rule",
  channel_override: "the preference for this marketplace",
  default_preference: "your default shipping preference",
  fallback: "the only method available",
};

const humanize = (s: string): string => s.replace(/_/g, " ");

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="divide-y divide-[#EAEAEA]/80 rounded-lg border border-[#EAEAEA]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
          <span className="text-[#666666]">{k}</span>
          <span className="text-right font-medium text-black">{v}</span>
        </div>
      ))}
    </div>
  );
}

interface ChooseShippingDrawerProps {
  /** one order */
  fulfillmentId: string | null;
  /** or several: one method for all of them */
  bulkIds: string[] | null;
  canWrite: boolean;
  onClose: () => void;
}

function SingleBody({ fulfillmentId, canWrite, onClose }: { fulfillmentId: string; canWrite: boolean; onClose: () => void }) {
  const options = useShippingOptions(fulfillmentId);
  const select = useSelectMethod();
  const [kind, setKind] = useState<MethodKind | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const data = options.data;

  // start from what is already confirmed, else from the recommendation, else the first usable method
  useEffect(() => {
    if (!data) return;
    const first = data.options.find((o) => o.available);
    const start = data.selection?.confirmed ? data.selection.kind : (data.recommendation?.kind ?? first?.kind ?? null);
    setKind(start);
    setProviderId(data.selection?.confirmed && data.selection.kind === start ? data.selection.providerId : (data.recommendation?.kind === start ? data.recommendation.providerId : null));
  }, [data]);

  const chosen: ShippingOption | undefined = data?.options.find((o) => o.kind === kind);
  const rec = data?.recommendation ?? null;
  const locked = data?.status === "label_pending" || data?.status === "ready_to_dispatch";
  const confirmedSame = Boolean(data?.selection?.confirmed && data.selection.kind === kind);

  const confirm = () => {
    if (!data || !kind) return;
    const followed = rec?.kind === kind && (!rec.providerId || !providerId || rec.providerId === providerId);
    select.mutate(
      { fulfillmentId, input: { kind, providerId: kind === "third_party" ? providerId : null, source: followed ? "recommended" : "manual_override" } },
      {
        onSuccess: () => {
          toast({ title: `Confirmed ${chosen?.name ?? KIND_LABEL[kind]} for ${data.order.number}`, variant: "success" });
          onClose();
        },
        onError: (e) => toast({ title: "The selection could not be confirmed", description: isApiError(e) && e.rule === "method_unavailable" ? "That method is not available for this order any more." : errorMessage(e), variant: "destructive" }),
      },
    );
  };

  const o = data?.order;
  return (
    <>
      <ShippingDrawer
        open
        eyebrow="Choose Shipping"
        title={o ? `Choose Shipping — ${o.number}` : "Choose Shipping"}
        subtitle={data?.selection?.confirmed ? "Selection confirmed · you can still change it before a label is created" : "Selection preview · not yet confirmed"}
        onClose={onClose}
        footer={
          <>
            <button type="button" onClick={confirm} disabled={!canWrite || !data || !chosen?.available || locked || select.isPending || confirmedSame} title={canWrite ? undefined : NO_WRITE_REASON} className={`${BTN_PRIMARY} flex-1`}>
              {select.isPending ? "Confirming..." : confirmedSame ? "Selection confirmed" : "Confirm Selection"}
            </button>
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              Cancel
            </button>
          </>
        }
      >
        {options.isLoading ? (
          <div role="status" aria-label="Loading shipping options" className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : options.isError || !data || !o ? (
          <div role="alert" className="space-y-2 text-[12px]">
            <p className="text-[#666666]">The shipping options could not be loaded. {errorMessage(options.error)}</p>
            <button type="button" onClick={() => void options.refetch()} className={BTN_SECONDARY}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <Facts
              rows={[
                ["Marketplace", o.marketplace.name],
                ["Destination", [destinationText(o.destination), o.destination.pincode].filter((x) => x && x !== "—").join(" · ") || "—"],
                ["Warehouse", o.warehouse.name],
                ["Product / SKU", `${orDash(o.product)} / ${orDash(o.sku)}${o.skus.length > 1 ? ` (+${o.skus.length - 1} more)` : ""}`],
                ["Weight", weightText(o.weightGrams)],
                ["Order value", formatCurrency(o.valueMinor, o.currency)],
              ]}
            />

            {locked && (
              <p role="status" className="rounded-lg border border-[#FDE68A] bg-[#FFFBF5] p-3 text-[11px] text-[#92400E]">
                A label was already created for this order. Cancel the shipment first if you want to change the shipping method.
              </p>
            )}

            <div className="space-y-3">
              <h4 className="text-[12px] font-semibold text-black">Available Shipping</h4>
              <div role="radiogroup" aria-label="Available shipping" className="space-y-3">
                {data.options.map((opt) => {
                  const selected = kind === opt.kind;
                  const isRec = opt.recommended;
                  return (
                    <OptionCard
                      key={opt.kind}
                      selected={selected}
                      disabled={!opt.available || locked}
                      tone={isRec ? "green" : "dark"}
                      onSelect={() => {
                        setKind(opt.kind);
                        setProviderId(opt.kind === "third_party" ? (rec?.kind === "third_party" ? rec.providerId : null) : null);
                      }}
                      title={opt.name}
                      badge={isRec ? <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-medium text-[#2563EB]">☉ Recommended</span> : undefined}
                    >
                      <p className="pl-6 text-[11px] text-[#666666]">
                        {opt.available ? `Available · ${MANAGED[opt.managedBy]}` : `Not available${opt.reason ? ` · ${humanize(opt.reason)}` : ""}`}
                      </p>
                      {selected && opt.available && (
                        <p className="pl-6 text-[11px] font-medium text-[#16A34A]">{data.selection?.confirmed && data.selection.kind === opt.kind ? "Selected · confirmed" : "Selected · awaiting confirmation"}</p>
                      )}
                      {selected && opt.kind === "third_party" && opt.providers.length > 1 && (
                        <label className="block space-y-1 pl-6 pt-1 text-[11px] text-[#666666]">
                          <span>Provider</span>
                          <select
                            aria-label="Provider"
                            value={providerId ?? ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setProviderId(e.target.value || null)}
                            className="h-8 w-full rounded-lg border border-[#EAEAEA] bg-white px-2 text-[11px] text-black"
                          >
                            <option value="">Default provider</option>
                            {opt.providers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </OptionCard>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[12px] font-semibold text-black">Why this method?</h4>
              {rec && kind === rec.kind ? (
                <>
                  <p className="text-[11px] text-[#666666]">{rec.why}</p>
                  <div className="flex items-center gap-2 rounded-lg border border-[#DCEBFE] bg-[#EFF6FF] p-3 text-[11px] text-[#1E40AF]">
                    <Info className="h-4 w-4 shrink-0 text-[#2563EB]" />
                    <span>
                      {rec.name} matches {SOURCE_TEXT[rec.source] ?? "the configured preference"}.
                    </span>
                  </div>
                </>
              ) : rec ? (
                <p className="text-[11px] text-[#666666]">This is a manual override: {rec.name} is the recommended method for this order.</p>
              ) : (
                <p className="text-[11px] text-[#666666]">No method is recommended for this order. Choose the one you want to use.</p>
              )}
            </div>

            <p className="pt-2 text-[10px] text-[#888888]">Availability comes from your connected marketplaces and shipping methods. Verify a method's capability before relying on labels or tracking.</p>
          </>
        )}
      </ShippingDrawer>
    </>
  );
}

function BulkBody({ ids, canWrite, onClose }: { ids: string[]; canWrite: boolean; onClose: () => void }) {
  const bulk = useBulkOrders();
  const [kind, setKind] = useState<MethodKind>("marketplace");
  const [result, setResult] = useState<BulkOrdersResult | null>(null);

  const confirm = () =>
    bulk.mutate(
      { ids, action: "assign_method", params: { kind } },
      {
        onSuccess: (res) => {
          setResult(res);
          if (res.failed === 0) {
            toast({ title: `${KIND_LABEL[kind]} assigned`, description: `${res.succeeded} ${res.succeeded === 1 ? "order" : "orders"} updated.`, variant: "success" });
            onClose();
          }
        },
        onError: (e) => toast({ title: "The shipping method could not be assigned", description: errorMessage(e), variant: "destructive" }),
      },
    );

  const failures = result?.results.filter((r) => !r.ok) ?? [];
  return (
    <ShippingDrawer
      open
      eyebrow="Choose Shipping"
      title={`Choose Shipping — ${ids.length} orders selected`}
      subtitle="One method for every selected order · where it is available"
      onClose={onClose}
      footer={
        result ? (
          <button type="button" onClick={onClose} className={`${BTN_PRIMARY} flex-1`}>
            Done
          </button>
        ) : (
          <>
            <button type="button" onClick={confirm} disabled={!canWrite || bulk.isPending} title={canWrite ? undefined : NO_WRITE_REASON} className={`${BTN_PRIMARY} flex-1`}>
              {bulk.isPending ? "Assigning..." : "Confirm Selection"}
            </button>
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              Cancel
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3" role="status">
          <p className="text-[12px] font-semibold text-black">
            {result.succeeded} of {result.requested} orders updated, {result.failed} could not be changed.
          </p>
          <ul className="divide-y divide-[#EAEAEA] rounded-lg border border-[#EAEAEA]">
            {failures.map((f) => (
              <li key={f.fulfillmentId} className="px-3 py-2 text-[11px]">
                <p className="font-semibold text-black">{f.number ?? f.fulfillmentId}</p>
                <p className="text-[#666666]">{f.message ?? "It could not be processed."}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Shipping method for the selected orders" className="space-y-3">
          {(["marketplace", "seller", "third_party"] as const).map((k) => (
            <OptionCard key={k} selected={kind === k} onSelect={() => setKind(k)} title={KIND_LABEL[k]}>
              <p className="pl-6 text-[11px] text-[#666666]">{k === "marketplace" ? "Use each order's connected marketplace method." : k === "seller" ? "Ship it yourself, merchant-managed." : "Use your configured third-party provider."}</p>
            </OptionCard>
          ))}
          <p className="text-[10px] text-[#888888]">Orders for which the method is not available are skipped and listed afterwards.</p>
        </div>
      )}
    </ShippingDrawer>
  );
}

/** Choose Shipping: the options of one order (or one method for several), with the recommendation and why */
export function ChooseShippingDrawer({ fulfillmentId, bulkIds, canWrite, onClose }: ChooseShippingDrawerProps) {
  if (bulkIds && bulkIds.length > 0) return <BulkBody key={bulkIds.join(",")} ids={bulkIds} canWrite={canWrite} onClose={onClose} />;
  if (fulfillmentId) return <SingleBody key={fulfillmentId} fulfillmentId={fulfillmentId} canWrite={canWrite} onClose={onClose} />;
  return null;
}
