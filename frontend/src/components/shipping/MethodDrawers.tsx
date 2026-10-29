import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, isApiError } from "@/api/errors";
import { useAddMethod, usePatchMethod, useProviderCatalog, useVerifyCarrier } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import type { CapSet, CapValue, ProviderCatalogEntry, ProviderKind, ShippingMethod } from "@/types/shipping";
import { BTN_PRIMARY, BTN_SECONDARY, OptionCard, ShippingDrawer } from "./ShippingDrawer";
import { CAP_TEXT, NO_CONFIGURE_REASON, failedChecks } from "./shippingFormat";

const FIELD = "h-9 sm:h-8 min-h-[36px] sm:min-h-0 w-full rounded-lg border border-[#EAEAEA] bg-white px-3 text-[11px] text-black focus:border-black focus:outline-none";


const CAP_ROWS: Array<[keyof CapSet, string]> = [
  ["label", "Shipping label"],
  ["tracking", "Tracking"],
  ["dispatchUpdate", "Dispatch update"],
  ["statusSync", "Status synchronization"],
];

/** what a provider can do before it is verified: "Requires configuration" or, when its adapter has no such feature, "Not supported by connector" */
function capsOfProvider(p: ProviderCatalogEntry | undefined): CapSet {
  const c = p?.capabilities;
  const v = (on: boolean | undefined): CapValue => (c && !on ? "not_supported" : "requires_configuration");
  return { label: v(c?.labels), tracking: "requires_configuration", dispatchUpdate: v(c?.manifest), statusSync: v(c?.polling) };
}

function CapabilityTable({ caps }: { caps: CapSet }) {
  return (
    <div className="space-y-2 pt-1">
      <h4 className="text-[12px] font-semibold text-black">Capabilities</h4>
      <div className="divide-y divide-[#EAEAEA]/80 rounded-lg border border-[#EAEAEA]">
        {CAP_ROWS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between px-3 py-2 text-[11px]">
            <span className="font-medium text-black">{label}</span>
            <span className={CAP_TEXT[caps[key]].tone}>{CAP_TEXT[caps[key]].text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pending() {
  return (
    <div className="flex items-center gap-1.5 pl-6 pt-0.5 text-[10px] font-medium text-[#D97706]">
      <AlertTriangle className="h-3 w-3 stroke-[2]" aria-hidden />
      <span>Requires configuration</span>
    </div>
  );
}

function ConfigFields({ provider, values, onChange }: { provider: ProviderCatalogEntry; values: Record<string, string>; onChange: (key: string, value: string) => void }) {
  if (provider.configFields.length === 0) return null;
  return (
    <div className="space-y-3 rounded-xl border border-[#EAEAEA] bg-[#FAF9F7] p-3.5">
      {provider.configFields.map((f) => (
        <label key={f.key} className="block space-y-1 text-[10px] font-medium text-[#666666]">
          <span>
            {f.key}
            {f.required ? " *" : ""}
          </span>
          <input aria-label={f.key} type={f.secret ? "password" : "text"} autoComplete={f.secret ? "new-password" : "off"} value={values[f.key] ?? ""} required={f.required} onChange={(e) => onChange(f.key, e.target.value)} className={FIELD} />
          <span className="block text-[10px] font-normal text-[#888888]">{f.description}</span>
        </label>
      ))}
    </div>
  );
}

const cleanConfig = (values: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(values)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => [k, v.trim()]),
  );

interface AddProviderDrawerProps {
  open: boolean;
  canConfigure: boolean;
  /** connected marketplaces (from the overview) */
  channels: ReadonlyArray<{ code: string; name: string }>;
  methods: ReadonlyArray<ShippingMethod>;
  onClose: () => void;
}

/** Add Provider / Choose Shipping Method: marketplace shipping, seller shipping or a third-party courier from the catalogue */
export function AddProviderDrawer({ open, canConfigure, channels, methods, onClose }: AddProviderDrawerProps) {
  const catalog = useProviderCatalog(open && canConfigure);
  const add = useAddMethod();
  const [kind, setKind] = useState<ProviderKind>("marketplace");
  const [channelCode, setChannelCode] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addedChannels = new Set(methods.filter((m) => m.kind === "marketplace").map((m) => m.channel?.code));
  const freeChannels = channels.filter((c) => !addedChannels.has(c.code));
  const sellerAdded = methods.some((m) => m.kind === "seller");
  const addedProviders = new Set(methods.filter((m) => m.kind === "third_party").map((m) => m.providerCode));
  const providers = (catalog.data ?? []).filter((p) => !addedProviders.has(p.code) && p.code !== "manual" && p.code !== "custom");
  // the template of a logistics provider the seller configures (its name is the display name, so the name field is not asked twice)
  const customEntry = catalog.data?.find((p) => p.code === "custom");
  const customFields = customEntry ? { ...customEntry, configFields: customEntry.configFields.filter((f) => f.key !== "carrierName") } : undefined;

  const channel = channelCode || freeChannels[0]?.code || "";
  const code = providerCode || providers[0]?.code || "";
  const selectedProvider = providers.find((p) => p.code === code);

  const missing = kind === "third_party" ? (selectedProvider?.configFields ?? []).filter((f) => f.required && !values[f.key]?.trim()) : [];
  const customMissing = (customFields?.configFields ?? []).filter((f) => f.required && !customValues[f.key]?.trim());
  const ready = kind === "marketplace" ? Boolean(channel) : kind === "seller" ? !sellerAdded : kind === "custom" ? customName.trim().length >= 2 && Boolean(customFields) && customMissing.length === 0 : Boolean(selectedProvider) && missing.length === 0;

  const close = () => {
    setError(null);
    onClose();
  };

  const submit = () => {
    setError(null);
    add.mutate(
      {
        kind,
        ...(kind === "marketplace" ? { channelCode: channel } : {}),
        ...(kind === "third_party" ? { providerCode: code } : {}),
        label: (kind === "custom" ? customName : label).trim() || undefined,
        config: kind === "third_party" ? cleanConfig(values) : kind === "custom" ? cleanConfig(customValues) : {},
      },
      {
        onSuccess: (res) => {
          if (res.verify.ok) {
            toast({ title: `${res.method.name} added`, description: "The check passed: it is ready to use.", variant: "success" });
            close();
          } else {
            setError(`${res.method.name} was added but its check failed. ${failedChecks(res.verify)} Fix the settings and verify it again from the list.`);
          }
        },
        onError: (e) => setError(isApiError(e) && e.status === 409 ? (e.rule === "marketplace_not_connected" ? "Connect this marketplace first." : "This shipping method is already added.") : errorMessage(e)),
      },
    );
  };

  const caps: CapSet =
    kind === "third_party" ? capsOfProvider(selectedProvider) : kind === "custom" ? capsOfProvider(customEntry) : { label: "requires_configuration", tracking: "requires_configuration", dispatchUpdate: "requires_configuration", statusSync: "requires_configuration" };

  return (
    <ShippingDrawer
      open={open}
      eyebrow="Add Provider"
      title="Choose Shipping Method"
      subtitle="Options depend on available connector capabilities."
      onClose={close}
      footer={
        <>
          <button type="button" onClick={submit} disabled={!canConfigure || !ready || add.isPending} title={canConfigure ? undefined : NO_CONFIGURE_REASON} className={BTN_PRIMARY}>
            {add.isPending ? "Adding..." : "Configure method"}
          </button>
          <button type="button" onClick={close} className={BTN_SECONDARY}>
            Cancel
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Shipping method type" className="space-y-3">
        <OptionCard selected={kind === "marketplace"} onSelect={() => setKind("marketplace")} title="Marketplace shipping">
          <p className="pl-6 text-[11px] text-[#666666]">Use a connected marketplace method.</p>
          {freeChannels.length === 0 && <p className="pl-6 text-[11px] text-[#666666]">{channels.length === 0 ? "No marketplace is connected yet." : "Every connected marketplace already has its shipping method."}</p>}
          {kind === "marketplace" && freeChannels.length > 0 && (
            <label className="block space-y-1 pl-6 pt-1 text-[11px] text-[#666666]" onClick={(e) => e.stopPropagation()}>
              <span>Marketplace</span>
              <select aria-label="Marketplace" value={channel} onChange={(e) => setChannelCode(e.target.value)} className={FIELD}>
                {freeChannels.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Pending />
        </OptionCard>

        <OptionCard selected={kind === "seller"} onSelect={() => setKind("seller")} title="Seller shipping">
          <p className="pl-6 text-[11px] text-[#666666]">{sellerAdded ? "Seller shipping is already added." : "Configure merchant-managed shipping."}</p>
          <Pending />
        </OptionCard>

        <OptionCard selected={kind === "third_party"} onSelect={() => setKind("third_party")} title="Supported third-party provider">
          {catalog.isLoading && canConfigure ? (
            <Skeleton className="ml-6 h-8 w-[calc(100%-1.5rem)]" />
          ) : catalog.isError ? (
            <p role="alert" className="pl-6 text-[11px] text-[#DC2626]">
              The providers could not be loaded. {errorMessage(catalog.error)}
            </p>
          ) : providers.length === 0 ? (
            <p className="pl-6 text-[11px] text-[#666666]">Choose only after connector verification. No verified provider listed.</p>
          ) : (
            <p className="pl-6 text-[11px] text-[#666666]">Choose only after connector verification.</p>
          )}
          {kind === "third_party" && providers.length > 0 && (
            <label className="block space-y-1 pl-6 pt-1 text-[11px] text-[#666666]" onClick={(e) => e.stopPropagation()}>
              <span>Provider</span>
              <select
                aria-label="Provider"
                value={code}
                onChange={(e) => {
                  setProviderCode(e.target.value);
                  setValues({});
                }}
                className={FIELD}
              >
                {providers.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
              {selectedProvider && <span className="block text-[10px] text-[#888888]">{selectedProvider.description}</span>}
            </label>
          )}
          <Pending />
        </OptionCard>

        <OptionCard selected={kind === "custom"} onSelect={() => setKind("custom")} title="Configured logistics provider">
          <p className="pl-6 text-[11px] text-[#666666]">A courier or fleet you set up yourself: its name, its tracking page and, if it has one, a tracking API. You enter the AWB it issues.</p>
          {kind === "custom" && (
            <label className="block space-y-1 pl-6 pt-1 text-[11px] text-[#666666]" onClick={(e) => e.stopPropagation()}>
              <span>Provider name *</span>
              <input aria-label="Provider name" value={customName} maxLength={80} placeholder="e.g. Shree Fleet" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setCustomName(e.target.value)} className={FIELD} />
            </label>
          )}
          <Pending />
        </OptionCard>
      </div>

      {kind === "third_party" && selectedProvider && <ConfigFields provider={selectedProvider} values={values} onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))} />}
      {kind === "custom" &&
        (catalog.isLoading && canConfigure ? (
          <Skeleton className="h-24 w-full" />
        ) : customFields ? (
          <ConfigFields provider={customFields} values={customValues} onChange={(k, v) => setCustomValues((prev) => ({ ...prev, [k]: v }))} />
        ) : (
          <p role="alert" className="text-[11px] text-[#DC2626]">
            The settings of a configured logistics provider could not be loaded.
          </p>
        ))}

      {kind !== "custom" && (
        <label className="block space-y-1 text-[11px] text-[#666666]">
          <span>Display name (optional)</span>
          <input aria-label="Display name" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className={FIELD} />
        </label>
      )}

      <CapabilityTable caps={caps} />

      {error && (
        <p role="alert" className="rounded-lg border border-[#FECACA] bg-[#FFF8F8] p-3 text-[11px] text-[#B91C1C]">
          {error}
        </p>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-[#EAEAEA] bg-[#FAF9F7] p-3 text-[11px] text-[#666666]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#666666]" />
        <span>Supported only after verification. A capability the connector does not offer reads "Not supported by connector".</span>
      </div>
    </ShippingDrawer>
  );
}

interface ConfigureMethodDrawerProps {
  method: ShippingMethod | null;
  canConfigure: boolean;
  onClose: () => void;
}

/** change a method's display name, order types and settings; a changed setting has to be verified again, so it is checked right after saving */
export function ConfigureMethodDrawer({ method, canConfigure, onClose }: ConfigureMethodDrawerProps) {
  if (!method) return null;
  return <ConfigureBody key={method.id} method={method} canConfigure={canConfigure} onClose={onClose} />;
}

function ConfigureBody({ method, canConfigure, onClose }: { method: ShippingMethod; canConfigure: boolean; onClose: () => void }) {
  const catalog = useProviderCatalog(method.kind !== "marketplace");
  const patch = usePatchMethod();
  const verify = useVerifyCarrier();
  const [label, setLabel] = useState(method.label);
  const [types, setTypes] = useState<string[]>(method.supportedOrderTypes);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(method.config).map(([k, v]) => [k, String(v ?? "")])));
  const [error, setError] = useState<string | null>(null);

  const entry = catalog.data?.find((p) => p.code === (method.kind === "seller" ? "manual" : method.kind === "custom" ? "custom" : method.providerCode));
  const toggle = (t: string) => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const missing = (entry?.configFields ?? []).filter((f) => f.required && !values[f.key]?.trim());
  const busy = patch.isPending || verify.isPending;

  const save = () => {
    setError(null);
    patch.mutate(
      { id: method.id, patch: { label: label.trim() || undefined, supportedOrderTypes: types, ...(entry && entry.configFields.length > 0 ? { config: cleanConfig(values) } : {}) } },
      {
        onSuccess: () =>
          verify.mutate(method.id, {
            onSuccess: (r) => {
              if (r.ok) {
                toast({ title: "Settings saved and verified", variant: "success" });
                onClose();
              } else setError(`The settings were saved but the check failed. ${failedChecks(r)}`);
            },
            onError: (e) => setError(`The settings were saved but the check could not run. ${errorMessage(e)}`),
          }),
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <ShippingDrawer
      open
      eyebrow="Configure"
      title={`Configure ${method.name}`}
      subtitle="A changed setting has to be verified again; it is checked right after saving."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={save} disabled={!canConfigure || busy || types.length === 0 || missing.length > 0} title={canConfigure ? undefined : NO_CONFIGURE_REASON} className={BTN_PRIMARY}>
            {busy ? "Saving..." : "Save and verify"}
          </button>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Cancel
          </button>
        </>
      }
    >
      <label className="block space-y-1 text-[11px] text-[#666666]">
        <span>Display name</span>
        <input aria-label="Display name" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className={FIELD} />
      </label>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] text-[#666666]">Supported order types</legend>
        <div className="flex gap-4 text-[12px] text-black">
          {[
            ["prepaid", "Prepaid"],
            ["cod", "Cash on delivery"],
          ].map(([id, text]) => (
            <label key={id} className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={types.includes(id as string)} onChange={() => toggle(id as string)} className="h-3 w-3 accent-black" />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      {method.kind === "marketplace" ? (
        <p className="rounded-lg border border-[#EAEAEA] bg-[#FAF9F7] p-3 text-[11px] text-[#666666]">Marketplace shipping has no settings of its own: it follows the connected {method.channel?.name ?? "marketplace"} account.</p>
      ) : catalog.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : catalog.isError ? (
        <p role="alert" className="text-[11px] text-[#DC2626]">
          The settings could not be loaded. {errorMessage(catalog.error)}
        </p>
      ) : entry ? (
        <ConfigFields provider={entry} values={values} onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))} />
      ) : null}

      {error && (
        <p role="alert" className="rounded-lg border border-[#FECACA] bg-[#FFF8F8] p-3 text-[11px] text-[#B91C1C]">
          {error}
        </p>
      )}
    </ShippingDrawer>
  );
}
