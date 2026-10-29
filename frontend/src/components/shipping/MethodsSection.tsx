import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useCarriers, useMethodCapability, usePatchMethod, useShippingMethods, useVerifyCarrier } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { ShippingMethod } from "@/types/shipping";
import { CAP_TEXT, KIND_SUBTITLE, NO_CONFIGURE_REASON, dateOrDash, failedChecks, methodKindLabel } from "./shippingFormat";
import { Notice } from "./shippingUi";

const DETAIL_BTN = "h-9 sm:h-8 min-h-[36px] sm:min-h-0 rounded-lg border border-[#EAEAEA] bg-white px-3 font-normal text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
const ORDER_TYPE: Record<string, string> = { prepaid: "Prepaid", cod: "Cash on delivery" };

function StateLine({ m }: { m: ShippingMethod }) {
  if (m.state === "configured")
    return (
      <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-[#16A34A]">
        <CheckCircle2 className="h-3 w-3 stroke-[2]" aria-hidden />
        <span>Configured · active</span>
      </div>
    );
  if (m.state === "disabled") return <div className="pt-0.5 text-[11px] text-[#666666]">Disabled</div>;
  return (
    <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-[#D97706]">
      <AlertTriangle className="h-3 w-3 stroke-[2]" aria-hidden />
      <span>Requires configuration</span>
    </div>
  );
}

interface MethodsSectionProps {
  canConfigure: boolean;
  embedded: boolean;
  onAddProvider: () => void;
  onConfigure: (method: ShippingMethod) => void;
}

/** the configured shipping methods (master / detail) and the capability matrix, all from the connectors and providers */
export function MethodsSection({ canConfigure, embedded, onAddProvider, onConfigure }: MethodsSectionProps) {
  const methods = useShippingMethods();
  const carriers = useCarriers();
  const patch = usePatchMethod();
  const verify = useVerifyCarrier();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCaps, setShowCaps] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const items = methods.data?.items ?? [];
  const selected = items.find((m) => m.id === selectedId) ?? items[0];
  const capability = useMethodCapability(selected && showCaps === selected.id ? selected.id : null);
  const usage = selected ? carriers.data?.items.find((c) => c.id === selected.id) : undefined;
  const off = !canConfigure;

  const change = (m: ShippingMethod, body: { isDefault?: boolean; active?: boolean }, done: string) =>
    patch.mutate(
      { id: m.id, patch: body },
      {
        onSuccess: () => toast({ title: done, variant: "success" }),
        onError: (e) => toast({ title: "The method could not be changed", description: errorMessage(e), variant: "destructive" }),
      },
    );

  const onVerify = (m: ShippingMethod) =>
    verify.mutate(m.id, {
      onSuccess: (r) => {
        setVerifyNote({ id: m.id, ok: r.ok, text: r.ok ? "The check passed: this method is verified." : failedChecks(r) });
        toast(r.ok ? { title: `${m.name} verified`, variant: "success" } : { title: "The check failed", description: failedChecks(r), variant: "destructive" });
      },
      onError: (e) => toast({ title: "The method could not be verified", description: errorMessage(e), variant: "destructive" }),
    });

  return (
    <section className="space-y-4 border-t border-[#EAEAEA] pt-4" aria-label="Shipping methods">
      {embedded && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[#666666]">ALTERNATE VIEW</span>
          <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
          <span className="text-[11px] font-semibold text-black">Shipping Methods</span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-black">Shipping Methods</h2>
          <p className="text-[11px] text-[#666666]">Configured methods and connector capabilities, without inferred support.</p>
        </div>
        <button type="button" onClick={onAddProvider} disabled={off} title={off ? NO_CONFIGURE_REASON : undefined} className="inline-flex h-9 sm:h-8 min-h-[36px] sm:min-h-0 self-start sm:self-auto items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Plus className="h-3.5 w-3.5 stroke-[1.5] text-[#666666]" />
          <span>Add Provider</span>
        </button>
      </div>

      {methods.isLoading ? (
        <div role="status" aria-label="Loading shipping methods" className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <Skeleton className="h-40 md:col-span-4" />
          <Skeleton className="h-40 md:col-span-8" />
        </div>
      ) : methods.isError ? (
        <Notice role="alert" title="Shipping methods could not be loaded.">
          <p>{errorMessage(methods.error)}</p>
          <button type="button" onClick={() => void methods.refetch()} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-medium text-black hover:bg-neutral-50">
            Retry
          </button>
        </Notice>
      ) : !selected ? (
        <Notice title="No shipping method is set up yet.">
          <p>Add marketplace shipping, seller shipping or a third-party provider to start moving orders.</p>
          {canConfigure ? (
            <button type="button" onClick={onAddProvider} className="h-8 rounded-lg bg-black px-4 text-[12px] font-semibold text-white hover:bg-neutral-800">
              Add Provider
            </button>
          ) : (
            <p>Ask an admin of your business to add one.</p>
          )}
        </Notice>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="space-y-2 border-[#EAEAEA] pr-0 pb-4 border-b md:border-b-0 md:pb-0 md:pr-4 md:col-span-4 md:border-r">
              <h3 className="mb-2 text-[12px] font-semibold text-black">Connected Shipping Methods</h3>
              {items.map((m) => {
                const active = m.id === selected.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(m.id);
                      setShowCaps(null);
                      setVerifyNote(null);
                    }}
                    className={cn("block w-full space-y-1 rounded-lg border p-3 text-left transition-colors", active ? "border-l-4 border-black bg-[#F5F5F5]" : "border-[#EAEAEA] bg-white hover:bg-neutral-50")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-black">{m.name}</span>
                      {active && <ChevronRight className="h-3.5 w-3.5 text-black" aria-hidden />}
                    </div>
                    <p className="text-[11px] text-[#666666]">{KIND_SUBTITLE(m.kind, m.channel?.name, m.label)}</p>
                    <StateLine m={m} />
                  </button>
                );
              })}
              {([
                ["seller", "Seller Shipping", "Merchant managed · connected channels"],
                ["third_party", "Third-party provider", "No verified connector selected"],
              ] as const)
                .filter(([kind]) => !items.some((m) => (kind === "seller" ? m.kind === "seller" : m.kind === "third_party" || m.kind === "custom")))
                .map(([kind, title, text]) => (
                  <button key={kind} type="button" onClick={onAddProvider} disabled={off} title={off ? NO_CONFIGURE_REASON : "Set this method up"} aria-label={`Set up ${title}`} className="block w-full space-y-1 rounded-lg border border-dashed border-[#EAEAEA] bg-white p-3 text-left transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60">
                    <span className="text-[12px] font-semibold text-black">{title}</span>
                    <p className="text-[11px] text-[#666666]">{text}</p>
                    <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-[#D97706]">
                      <AlertTriangle className="h-3 w-3 stroke-[2]" aria-hidden />
                      <span>Requires configuration</span>
                    </div>
                  </button>
                ))}
              <div className="pt-2 text-[10px] text-[#666666]">{methods.data?.summary}</div>
            </div>

            <div className="space-y-3 md:col-span-8">
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-semibold text-black">{selected.name}</span>
                {selected.state === "configured" ? (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-[#16A34A]">
                    <CheckCircle2 className="h-3 w-3 stroke-[2]" aria-hidden />
                    <span>Configured</span>
                  </div>
                ) : selected.state === "disabled" ? (
                  <span className="text-[11px] font-medium text-[#666666]">Disabled</span>
                ) : (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-[#D97706]">
                    <AlertTriangle className="h-3 w-3 stroke-[2]" aria-hidden />
                    <span>Requires configuration</span>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#EAEAEA] bg-white text-[11px]">
                <div className="grid min-w-[420px] sm:min-w-0 grid-cols-12 border-b border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666]">
                  <div className="col-span-4">Property</div>
                  <div className="col-span-8">Configuration</div>
                </div>
                {(
                  [
                    ["Method name", `${selected.name} · ${methodKindLabel(selected.kind)}`],
                    [
                      "Connected marketplace/provider",
                      selected.kind === "marketplace"
                        ? `${selected.channel?.name ?? "Marketplace"} · marketplace-managed${selected.channel?.availability === "coming_soon" ? " · connector coming soon" : ""}`
                        : selected.kind === "seller"
                          ? "Merchant-managed · you hand parcels to the courier yourself"
                          : selected.kind === "custom"
                            ? `${selected.provider?.label ?? selected.label} · you enter the AWB it issues${selected.config.trackingApiUrl ? " · tracking API configured" : " · tracking entered by hand"}`
                            : `${selected.provider?.label ?? selected.label} (${selected.providerCode})`,
                    ],
                    ["Supported order types", selected.supportedOrderTypes.map((t) => ORDER_TYPE[t] ?? t).join(", ") || "—"],
                    ["Status / last successful sync", `${selected.state === "configured" ? "Configured" : selected.state === "disabled" ? "Disabled" : "Requires configuration"} · ${dateOrDash(selected.lastSyncAt)}`],
                    ["Default status", selected.isDefault ? `Default method${selected.preferredFor.length ? ` · preferred for ${selected.preferredFor.map((c) => (c === "*" ? "all orders" : c)).join(", ")}` : ""}` : selected.preferredFor.length ? `Preferred for ${selected.preferredFor.join(", ")}` : "Not the default"],
                    ["Shipments (30 days)", usage ? `${formatNumber(usage.shipmentsLast30d)} shipped · ${formatNumber(usage.inTransit)} in transit` : "—"],
                  ] as const
                ).map(([k, v], i, all) => (
                  <div key={k} className={cn("grid min-w-[420px] sm:min-w-0 grid-cols-12 px-3 py-2.5", i < all.length - 1 && "border-b border-[#EAEAEA]")}>
                    <div className="col-span-4 text-black">{k}</div>
                    <div className="col-span-8 text-black">
                      {v}
                      {k === "Supported order types" && selected.state === "requires_configuration" && <span className="block text-[#D97706]">Requires configuration / capability verification</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px]">
                <button type="button" className={DETAIL_BTN} disabled={off || selected.isDefault || !selected.active || patch.isPending} title={off ? NO_CONFIGURE_REASON : selected.isDefault ? "This is already the default method." : undefined} onClick={() => change(selected, { isDefault: true }, `${selected.name} is now the default`)}>
                  Set as default
                </button>
                <button type="button" className="h-9 sm:h-8 min-h-[36px] sm:min-h-0 rounded-lg border border-black bg-black px-3 font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={off} title={off ? NO_CONFIGURE_REASON : undefined} onClick={() => onConfigure(selected)}>
                  Configure
                </button>
                <button type="button" className={DETAIL_BTN} disabled={off || patch.isPending} title={off ? NO_CONFIGURE_REASON : undefined} onClick={() => change(selected, { active: !selected.active }, selected.active ? `${selected.name} disabled` : `${selected.name} enabled`)}>
                  {selected.active ? "Disable" : "Enable"}
                </button>
                <button type="button" className={DETAIL_BTN} disabled={off || verify.isPending || !selected.active} title={off ? NO_CONFIGURE_REASON : undefined} onClick={() => onVerify(selected)}>
                  {verify.isPending ? "Checking..." : "Verify"}
                </button>
                <button type="button" className={DETAIL_BTN} aria-expanded={showCaps === selected.id} onClick={() => setShowCaps((c) => (c === selected.id ? null : selected.id))}>
                  View capability
                </button>
              </div>

              {verifyNote && verifyNote.id === selected.id && (
                <p role="status" className={cn("rounded-lg border p-3 text-[11px]", verifyNote.ok ? "border-[#DCFCE7] bg-[#F9FEFA] text-[#166534]" : "border-[#FECACA] bg-[#FFF8F8] text-[#B91C1C]")}>
                  {verifyNote.text}
                </p>
              )}

              {showCaps === selected.id && (
                <div className="overflow-hidden rounded-lg border border-[#EAEAEA] bg-white text-[11px]" aria-label="Capability of the selected method">
                  {capability.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : capability.isError || !capability.data ? (
                    <p role="alert" className="p-3 text-[#B91C1C]">
                      The capability could not be loaded. {errorMessage(capability.error)}
                    </p>
                  ) : (
                    <>
                      <div className="border-b border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[10px] text-[#666666]">
                        {capability.data.verified ? `Verified ${dateOrDash(capability.data.verifiedAt)}` : "Not verified yet"} · source {capability.data.source}
                      </div>
                      {capability.data.capabilities.map((c) => (
                        <div key={c.key} className="flex items-center justify-between border-b border-[#EAEAEA] px-3 py-2 last:border-b-0">
                          <span className="font-medium text-black">{({ label: "Shipping label", tracking: "Tracking", dispatchUpdate: "Dispatch update", statusSync: "Status synchronization" } as Record<string, string>)[c.key] ?? c.key}</span>
                          <span className={CAP_TEXT[c.value].tone}>{c.value === "supported" ? "Supported" : c.note}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-4">
            <h3 className="text-[12px] font-semibold text-black">Capability matrix</h3>
            <div className="overflow-x-auto rounded-lg border border-[#EAEAEA] bg-white text-[11px]">
              <div className="grid min-w-[620px] md:min-w-0 grid-cols-12 border-b border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666]">
                <div className="col-span-3">Method</div>
                <div className="col-span-2">Label support</div>
                <div className="col-span-2">Tracking support</div>
                <div className="col-span-2">Dispatch update</div>
                <div className="col-span-3">Status synchronization</div>
              </div>
              {(methods.data?.capabilityMatrix ?? []).map((row, idx) => (
                <div key={`${row.methodId ?? row.method}-${idx}`} className="grid min-w-[620px] md:min-w-0 grid-cols-12 border-b border-[#EAEAEA] px-3 py-2.5 text-black last:border-b-0 hover:bg-neutral-50/50">
                  <div className="col-span-3 font-medium">{row.name}</div>
                  {(["label", "tracking", "dispatchUpdate", "statusSync"] as const).map((k, i) => (
                    <div key={k} className={cn(i === 3 ? "col-span-3" : "col-span-2", CAP_TEXT[row[k]].tone === "text-[#16A34A]" ? "text-[#16A34A]" : "text-[#666666]")}>
                      {CAP_TEXT[row[k]].text}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
