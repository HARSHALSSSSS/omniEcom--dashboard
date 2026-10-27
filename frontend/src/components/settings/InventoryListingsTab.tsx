import { useState } from "react";
import { Link } from "react-router-dom";
import { Boxes, Barcode } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useChannelPolicies, useSaveChannelPolicy } from "@/hooks/useSettings";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ChannelInventoryPolicy, SettingsOverview } from "@/types/settings";
import { SectionCard, Field, selectClass } from "./fields";
import type { SettingsController, SettingsValues } from "./tabProps";

export interface InventoryListingsTabProps {
  canWrite?: boolean;
  s?: SettingsOverview | null;
  v?: SettingsValues | null;
  ctl?: SettingsController;
}

/** an example SKU made from the saved formula: [BRAND] from the business name, [CAT3] a category, [SEQ6] the next number */
export function skuPreview(template: string, separator: string, casing: "uppercase" | "lowercase" | "as_is", brandName: string): string {
  const brand = brandName.replace(/[^A-Za-z0-9]/g, "").slice(0, 4) || "BRND";
  const out = template
    .replace(/\[BRAND\]/g, brand)
    .replace(/\[CAT3\]/g, "CAT")
    .replace(/\[SEQ6\]/g, "000001")
    .replace(/-/g, separator);
  return casing === "uppercase" ? out.toUpperCase() : casing === "lowercase" ? out.toLowerCase() : out;
}

const GATE_NOTE = "A gate that is switched on blocks publishing a listing whose product lacks that attribute. Gates that are off change nothing, and nothing is switched on until you save it.";

export function InventoryListingsTab({ canWrite = true, s, v, ctl }: InventoryListingsTabProps) {
  const shell = useWorkspaceStore((st) => st.shell);
  const canPolicy = useCan("marketplace_accounts:write");
  const canReadPolicy = useCan("listings:read");
  const saveChannel = useSaveChannelPolicy();

  const catalog = v?.ext.catalog;
  const inv = v?.ext.inventory;
  const edit = canWrite && Boolean(ctl && v);
  const channels = s?.channels ?? [];
  const { policies, loading: policiesLoading, failed: policiesFailed } = useChannelPolicies(channels.map((c) => c.id), canReadPolicy);

  // the seller's unsaved edits of each channel row (reserve share and unit buffer); saved per row through the channel policy
  const [drafts, setDrafts] = useState<Record<string, { allocationPercent: number; safetyBuffer: number }>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  if (!s || !v || !catalog || !inv) return null;
  const err = ctl?.fieldErrors;

  const setCatalog = (patch: Partial<typeof catalog>) => ctl?.setExt("catalog", { ...catalog, ...patch });
  const setGates = (patch: Partial<typeof catalog.gates>) => setCatalog({ gates: { ...catalog.gates, ...patch } });
  const setInv = (patch: Partial<typeof inv>) => ctl?.setExt("inventory", { ...inv, ...patch });

  const rowOf = (id: string, p: ChannelInventoryPolicy | undefined) => drafts[id] ?? { allocationPercent: p?.allocationPercent ?? 100, safetyBuffer: p?.safetyBuffer ?? 0 };
  const totalAllocation = channels.reduce((acc, c) => acc + rowOf(c.id, policies.get(c.id)).allocationPercent, 0);

  const saveRow = (accountId: string) => {
    const d = drafts[accountId];
    if (!d) return;
    setRowError((e) => ({ ...e, [accountId]: "" }));
    saveChannel.mutate(
      { accountId, body: { allocationPercent: d.allocationPercent, safetyBuffer: d.safetyBuffer } },
      {
        onSuccess: () => toast({ title: "Channel stock rule saved", description: "Every live listing of this channel is being re-computed.", variant: "success" }),
        onError: (e) => setRowError((x) => ({ ...x, [accountId]: errorMessage(e, "Could not save this channel.") })),
      },
    );
  };

  const separator = catalog.skuSeparator;
  const preview = skuPreview(catalog.skuTemplate, separator, catalog.skuCasing, shell?.business?.name ?? s.business.displayName);
  const hubs = [...s.warehouses];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Catalog Sovereignty & Multi-Channel Inventory Buffers</p>
            <p className="text-muted-foreground">SKU syntax, statutory listing gates, stock cushions and channel reserves. Save with the bar at the top; channel reserves save per row.</p>
          </div>
        </div>
      </div>

      {[err?.["ext:catalog"], err?.["ext:inventory"]].filter(Boolean).map((m) => (
        <p key={m} role="alert" className="rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
          {m}
        </p>
      ))}

      <SectionCard title="Section 01: Catalog & Listing Gates" description="Standardised SKU taxonomy and statutory attributes before sync.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="sku-formula" className="text-xs font-medium text-foreground">
              Auto-SKU Syntax Formula
            </label>
            <Input id="sku-formula" value={catalog.skuTemplate} onChange={(e) => setCatalog({ skuTemplate: e.target.value })} disabled={!edit} maxLength={60} className="font-mono text-xs" />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Tokens:</span>
              {["[BRAND]", "[CAT3]", "[SEQ6]"].map((t) => (
                <button key={t} type="button" disabled={!edit} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted/80 disabled:opacity-50" onClick={() => setCatalog({ skuTemplate: `${catalog.skuTemplate}-${t}` })}>
                  + {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Field id="sku-separator" label="Separator">
                <select id="sku-separator" className={selectClass} value={catalog.skuSeparator} disabled={!edit} onChange={(e) => setCatalog({ skuSeparator: e.target.value as "-" | "_" | "/" })}>
                  <option value="-">Hyphen (-)</option>
                  <option value="_">Underscore (_)</option>
                  <option value="/">Slash (/)</option>
                </select>
              </Field>
              <Field id="sku-casing" label="Letter case">
                <select id="sku-casing" className={selectClass} value={catalog.skuCasing} disabled={!edit} onChange={(e) => setCatalog({ skuCasing: e.target.value as "uppercase" | "lowercase" | "as_is" })}>
                  <option value="uppercase">UPPERCASE</option>
                  <option value="lowercase">lowercase</option>
                  <option value="as_is">As typed</option>
                </select>
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Example from this formula: <span className="font-mono font-bold text-primary">{preview}</span>
            </p>
            <p className="text-[11px] text-muted-foreground" data-testid="sku-enforcement">
              {s.catalog.skuTemplateSet
                ? "Enforced: a new or changed SKU must follow this formula. Existing SKUs are left alone, and imports only get a warning."
                : "Not enforced yet: a formula is enforced only after you save one. Until then any SKU is accepted."}
            </p>
          </div>

          <div className="space-y-4">
            <Field id="settings-barcode-gate" label="Barcode & EAN Strictness" hint="When on, a new or changed barcode must be a valid EAN / UPC (correct check digit). Existing barcodes are left alone, and imports only get a warning.">
              <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
                <div className="flex items-center gap-2">
                  <Barcode className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Require a valid 13-digit EAN / UPC</span>
                </div>
                <Switch aria-label="Require a valid EAN" checked={catalog.strictEan} onCheckedChange={(c) => setCatalog({ strictEan: c })} disabled={!edit} />
              </div>
            </Field>
            <Field id="sync-sovereignty" label="Catalog sync sovereignty" hint="Which side wins when the master catalog and a marketplace disagree. Saved for later enforcement.">
              <select id="sync-sovereignty" className={selectClass} value={catalog.syncSovereignty} disabled={!edit} onChange={(e) => setCatalog({ syncSovereignty: e.target.value as "master_catalog" | "channel_autonomous" })}>
                <option value="master_catalog">Master catalog wins</option>
                <option value="channel_autonomous">Each channel keeps its own values</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-xs font-semibold text-foreground">Mandatory Listing Compliance Gates</p>
          <p className="mb-3 text-[11px] text-muted-foreground">Attributes a product must have before it is published. {GATE_NOTE}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { key: "hsnCode" as const, title: "HSN Code (6-8 Digits)", text: "Statutory GST tariff classification" },
              { key: "countryOfOrigin" as const, title: "Country of Origin (COO)", text: "Mandatory Legal Metrology gate" },
              { key: "gstRateSlab" as const, title: "GST Rate Slab (0/5/12/18/28%)", text: "Tax rate on the product" },
            ].map((g) => (
              <div key={g.key} className="flex items-center justify-between rounded-md border border-border/70 bg-card p-3">
                <div>
                  <p className="text-xs font-medium text-foreground">{g.title}</p>
                  <p className="text-[10px] text-muted-foreground">{g.text}</p>
                </div>
                <Switch aria-label={g.title} checked={catalog.gates[g.key]} onCheckedChange={(c) => setGates({ [g.key]: c })} disabled={!edit} />
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Section 02: Multi-Channel Inventory Buffers & Safety Stock"
        description="Stock kept back before channels share what is left, and how much each connected marketplace account may sell."
        aside={
          channels.length > 0 ? (
            <Badge variant={totalAllocation <= 100 ? "default" : "destructive"} className={totalAllocation <= 100 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""} title={totalAllocation > 100 ? "Together the channels may sell more than you hold" : undefined}>
              Total allocated: {totalAllocation}%
            </Badge>
          ) : undefined
        }
      >
        <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Field id="settings-bufferPercent" label="Global Safety Buffer (%)" error={err?.bufferPercent} hint="Held back from the stock before any channel sells. Applied to every channel quantity.">
            <Input id="settings-bufferPercent" type="number" min={0} max={100} value={v.bufferPercent} onChange={(e) => ctl?.setField("bufferPercent", e.target.value)} disabled={!edit} error={!!err?.bufferPercent} />
          </Field>
          <Field id="buf-min-safety" label="Minimum Safety Stock (Units)" hint="Units always held back from every channel, for returns or damage replacements.">
            <Input id="buf-min-safety" type="number" min={0} value={inv.minSafetyStockUnits} onChange={(e) => setInv({ minSafetyStockUnits: Math.max(0, Math.round(Number(e.target.value) || 0)) })} disabled={!edit} />
          </Field>
          <Field id="settings-lowStockThreshold" label="Critical Low Stock Alert (Units)" error={err?.lowStockThreshold} hint="A SKU at or under this raises a low-stock alert.">
            <Input id="settings-lowStockThreshold" type="number" min={0} value={v.lowStockThreshold} onChange={(e) => ctl?.setField("lowStockThreshold", e.target.value)} disabled={!edit} error={!!err?.lowStockThreshold} />
          </Field>
        </div>

        {channels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">No marketplace account is connected yet.</p>
            <p className="mt-1">Channel stock reserves appear here once you connect a marketplace.</p>
            <Link to={ROUTES.MARKETPLACE_HUB} className="mt-2 inline-block font-semibold text-foreground underline">
              Connect a marketplace
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Sales Channel</th>
                  <th className="px-4 py-2.5">Share of stock it may sell (%)</th>
                  <th className="px-4 py-2.5">Channel buffer (units)</th>
                  <th className="px-4 py-2.5 text-center">Sync</th>
                  <th className="px-4 py-2.5 text-right">Save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channels.map((ch) => {
                  const p = policies.get(ch.id);
                  const row = rowOf(ch.id, p);
                  const dirty = Boolean(drafts[ch.id]) && Boolean(p) && (row.allocationPercent !== p?.allocationPercent || row.safetyBuffer !== p?.safetyBuffer);
                  const editable = canPolicy && Boolean(p);
                  return (
                    <tr key={ch.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {ch.name}
                        <div className="font-mono text-[10px] font-normal text-muted-foreground">{ch.marketplace}</div>
                      </td>
                      <td className="w-56 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            aria-label={`Share of stock for ${ch.name}`}
                            min={0}
                            max={100}
                            value={row.allocationPercent}
                            onChange={(e) => setDrafts((d) => ({ ...d, [ch.id]: { ...row, allocationPercent: Number(e.target.value) } }))}
                            disabled={!editable}
                            className="w-24 accent-primary"
                          />
                          <span className="w-10 font-mono font-semibold">{row.allocationPercent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          aria-label={`Channel buffer for ${ch.name}`}
                          min={0}
                          className="h-8 w-24 font-mono text-xs"
                          value={row.safetyBuffer}
                          onChange={(e) => setDrafts((d) => ({ ...d, [ch.id]: { ...row, safetyBuffer: Math.max(0, Math.round(Number(e.target.value) || 0)) } }))}
                          disabled={!editable}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={p?.mode === "paused" ? "text-amber-700" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}>
                          {!p ? (policiesLoading ? "..." : "-") : p.mode === "paused" ? "PAUSED" : "SYNC ON"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={!editable || !dirty || saveChannel.isPending} onClick={() => saveRow(ch.id)}>
                          Save
                        </Button>
                        {rowError[ch.id] && (
                          <p role="alert" className="mt-1 text-[11px] text-destructive">
                            {rowError[ch.id]}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {policiesFailed && <p role="alert" className="mt-2 text-[11px] text-destructive">Some channel stock rules could not be loaded.</p>}
        {channels.length > 0 && !canPolicy && <p className="mt-2 text-[11px] text-muted-foreground">Only an administrator can change a channel's stock rule.</p>}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard title="Fulfillment Hub Priority Hierarchy" description="Warehouses in the order orders are routed through them.">
          {hubs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">No warehouse yet.</p>
              <p className="mt-1">Stock is held in warehouses; add stock from Inventory to create the first one.</p>
              <Link to={ROUTES.INVENTORY} className="mt-2 inline-block font-semibold text-foreground underline">
                Open Inventory
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {hubs.map((hub, i) => (
                <div key={hub.id} className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{hub.name}</p>
                      <p className="text-[11px] text-muted-foreground">{[hub.code, hub.city].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {hub.status === "active" ? (hub.isDefault ? "Default" : `Priority ${i + 1}`) : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Operational Guardrails & Anomaly Locks" description={`Protect stock against rogue bulk updates and sudden order spikes. Saved with your workspace; these two are stored preferences that nothing enforces yet.`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Two-step approval for negative stock overrides</p>
                <p className="text-[11px] text-muted-foreground">Ask for a second approval when stock is adjusted below 0.</p>
              </div>
              <Switch aria-label="Two-step approval for negative stock" checked={inv.negativeStockTwoStepApproval} onCheckedChange={(c) => setInv({ negativeStockTwoStepApproval: c })} disabled={!edit} />
            </div>

            <div className="space-y-2 rounded-lg border border-border/70 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Velocity spike protection</p>
                  <p className="text-[11px] text-muted-foreground">Pause listings when units sold per hour exceed this limit.</p>
                </div>
                <span className="font-mono text-xs font-bold text-foreground">{inv.spikeProtectionUnitsPerHour} units/hr</span>
              </div>
              <input type="range" aria-label="Spike limit" min={50} max={1000} step={25} value={Math.min(1000, Math.max(50, inv.spikeProtectionUnitsPerHour))} onChange={(e) => setInv({ spikeProtectionUnitsPerHour: Number(e.target.value) })} disabled={!edit} className="w-full accent-primary" />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
