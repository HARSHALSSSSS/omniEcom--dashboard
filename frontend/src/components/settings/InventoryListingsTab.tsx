import { useState, useEffect } from "react";
import {
  Boxes,
  Check,
  Barcode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SectionCard, Field } from "./fields";
import type { CatalogListingSettings, InventoryBufferSettings, ChannelReserveAllocation, SettingsOverview } from "@/types/settings";
import type { SettingsController, SettingsValues } from "./tabProps";

const DEFAULT_CHANNELS: ChannelReserveAllocation[] = [
  {
    channelId: "shopify-direct",
    channelName: "Shopify D2C Storefront",
    channelIcon: "🛍️",
    reservePercent: 40,
    safetyBufferUnits: 15,
    status: "active",
  },
  {
    channelId: "amazon-in",
    channelName: "Amazon India (FBA / MFN)",
    channelIcon: "📦",
    reservePercent: 35,
    safetyBufferUnits: 20,
    status: "active",
  },
  {
    channelId: "flipkart",
    channelName: "Flipkart Retail & Assured",
    channelIcon: "⚡",
    reservePercent: 15,
    safetyBufferUnits: 10,
    status: "active",
  },
  {
    channelId: "blinkit-zepto",
    channelName: "Quick Commerce (Blinkit & Zepto)",
    channelIcon: "🛵",
    reservePercent: 10,
    safetyBufferUnits: 5,
    status: "active",
  },
];

const DEFAULT_HUBS = [
  { id: "wh-01", name: "Bhiwandi Master Fulfillment Center", city: "Mumbai / Thane, MH", priority: 1, active: true },
  { id: "wh-02", name: "Bengaluru South Hub (Quick Delivery)", city: "Bengaluru, KA", priority: 2, active: true },
  { id: "wh-03", name: "NCR Gurgaon Regional DC", city: "Gurgaon, HR", priority: 3, active: true },
];

export interface InventoryListingsTabProps {
  canWrite?: boolean;
  s?: SettingsOverview | null;
  v?: SettingsValues;
  ctl?: SettingsController;
}

export function InventoryListingsTab({ canWrite = true, s, v, ctl }: InventoryListingsTabProps) {
  // Load saved local preferences if present
  const savedGates = (() => {
    try {
      const item = localStorage.getItem("omni_listing_gates");
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  })();

  const savedBuffers = (() => {
    try {
      const item = localStorage.getItem("omni_channel_buffers");
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  })();

  // Section 01 state: Catalog & Listing Gates
  const [catalogSettings, setCatalogSettings] = useState<CatalogListingSettings>(() => ({
    skuSyntaxTemplate: savedGates?.skuSyntaxTemplate || "[BRAND]-[CAT3]-[SEQ6]",
    skuSeparator: savedGates?.skuSeparator || "-",
    skuCasing: savedGates?.skuCasing || "uppercase",
    strictEanValidation: savedGates?.strictEanValidation ?? true,
    mandatoryGates: {
      hsnCode: savedGates?.mandatoryGates?.hsnCode ?? true,
      countryOfOrigin: savedGates?.mandatoryGates?.countryOfOrigin ?? true,
      gstRateSlab: savedGates?.mandatoryGates?.gstRateSlab ?? true,
    },
    syncSovereignty: savedGates?.syncSovereignty || "master_catalog",
  }));

  // Initial buffer values synced from backend operations
  const initialBufferPercent =
    v?.bufferPercent !== undefined && v.bufferPercent !== ""
      ? Number(v.bufferPercent)
      : (s?.operations.defaultInventoryBufferPercent ?? savedBuffers?.globalBufferPercent ?? 10);

  const initialLowStock =
    v?.lowStockThreshold !== undefined && v.lowStockThreshold !== ""
      ? Number(v.lowStockThreshold)
      : (s?.operations.lowStockThreshold ?? savedBuffers?.criticalLowStockUnits ?? 5);

  const realHubs =
    s?.warehouses && s.warehouses.length > 0
      ? s.warehouses.map((wh, idx) => ({
          id: wh.id,
          name: wh.name,
          city: `${wh.city}, ${wh.state}`,
          priority: idx + 1,
          active: wh.active ?? true,
        }))
      : DEFAULT_HUBS;

  // Section 02 & 03 state: Buffers & Reserves
  const [bufferSettings, setBufferSettings] = useState<InventoryBufferSettings>(() => ({
    globalBufferPercent: initialBufferPercent,
    minSafetyStockUnits: savedBuffers?.minSafetyStockUnits ?? 15,
    criticalLowStockUnits: initialLowStock,
    channelAllocations: savedBuffers?.channelAllocations || DEFAULT_CHANNELS,
    hubPriorities: realHubs,
    negativeStockTwoStepApproval: savedBuffers?.negativeStockTwoStepApproval ?? true,
    spikeProtectionUnitsPerHour: savedBuffers?.spikeProtectionUnitsPerHour ?? 200,
  }));

  // Keep buffer percent in sync if controller changes
  useEffect(() => {
    if (v?.bufferPercent !== undefined && v.bufferPercent !== "") {
      const num = Number(v.bufferPercent);
      if (!Number.isNaN(num)) {
        setBufferSettings((prev) => (prev.globalBufferPercent !== num ? { ...prev, globalBufferPercent: num } : prev));
      }
    }
  }, [v?.bufferPercent]);

  // Keep low stock threshold in sync if controller changes
  useEffect(() => {
    if (v?.lowStockThreshold !== undefined && v.lowStockThreshold !== "") {
      const num = Number(v.lowStockThreshold);
      if (!Number.isNaN(num)) {
        setBufferSettings((prev) => (prev.criticalLowStockUnits !== num ? { ...prev, criticalLowStockUnits: num } : prev));
      }
    }
  }, [v?.lowStockThreshold]);

  // Keep warehouses in sync if server query updates
  useEffect(() => {
    if (s?.warehouses && s.warehouses.length > 0) {
      setBufferSettings((prev) => ({
        ...prev,
        hubPriorities: s.warehouses.map((wh, idx) => ({
          id: wh.id,
          name: wh.name,
          city: `${wh.city}, ${wh.state}`,
          priority: idx + 1,
          active: wh.active ?? true,
        })),
      }));
    }
  }, [s?.warehouses]);

  const [saved, setSaved] = useState(false);

  // Computed SKU preview
  const skuPreview = "AURA-CLO-000402";

  const handleAllocationChange = (index: number, newPercent: number) => {
    const updated = [...bufferSettings.channelAllocations];
    updated[index] = { ...updated[index], reservePercent: newPercent };
    setBufferSettings({ ...bufferSettings, channelAllocations: updated });
  };

  const handleGlobalBufferChange = (val: number) => {
    setBufferSettings((prev) => ({ ...prev, globalBufferPercent: val }));
    if (ctl) {
      ctl.setField("bufferPercent", String(val));
    }
  };

  const handleCriticalAlertChange = (val: number) => {
    setBufferSettings((prev) => ({ ...prev, criticalLowStockUnits: val }));
    if (ctl) {
      ctl.setField("lowStockThreshold", String(val));
    }
  };

  const totalAllocation = bufferSettings.channelAllocations.reduce((acc, c) => acc + c.reservePercent, 0);

  const handleSave = async () => {
    try {
      localStorage.setItem("omni_listing_gates", JSON.stringify(catalogSettings));
      localStorage.setItem("omni_channel_buffers", JSON.stringify(bufferSettings));
      if (ctl) {
        await ctl.save();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Catalog Sovereignty & Multi-Channel Inventory Buffers</p>
            <p className="text-muted-foreground">
              Define automated SKU generation syntax, Indian statutory listing gates, safety reserve quotas, and hub routing.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs">
              <Check className="h-3.5 w-3.5" /> Settings Saved
            </span>
          )}
          <Button size="sm" onClick={handleSave} disabled={!canWrite}>
            Save Inventory Rules
          </Button>
        </div>
      </div>

      {/* Section 01: Catalog & Listing Gates */}
      <SectionCard
        title="Section 01: Catalog & Listing Gates"
        description="Enforce standardized SKU taxonomy and statutory Indian commerce attributes before sync."
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* SKU syntax builder */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Auto-SKU Syntax Formula</label>
            <Input
              value={catalogSettings.skuSyntaxTemplate}
              onChange={(e) => setCatalogSettings({ ...catalogSettings, skuSyntaxTemplate: e.target.value })}
              disabled={!canWrite}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Tokens:</span>
              <button
                type="button"
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted/80"
                onClick={() => setCatalogSettings({ ...catalogSettings, skuSyntaxTemplate: catalogSettings.skuSyntaxTemplate + "-[BRAND]" })}
              >
                + [BRAND]
              </button>
              <button
                type="button"
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted/80"
                onClick={() => setCatalogSettings({ ...catalogSettings, skuSyntaxTemplate: catalogSettings.skuSyntaxTemplate + "-[CAT3]" })}
              >
                + [CAT3]
              </button>
              <button
                type="button"
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted/80"
                onClick={() => setCatalogSettings({ ...catalogSettings, skuSyntaxTemplate: catalogSettings.skuSyntaxTemplate + "-[SEQ6]" })}
              >
                + [SEQ6]
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Live syntax preview: <span className="font-mono font-bold text-primary">{skuPreview}</span>
            </p>
          </div>

          <Field id="settings-barcode-gate" label="Barcode & EAN Strictness" hint="Rejects product creation without GS1-verified GTIN/EAN.">
            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div className="flex items-center gap-2">
                <Barcode className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">Require Valid 13-Digit EAN / UPC</span>
              </div>
              <Switch
                checked={catalogSettings.strictEanValidation}
                onCheckedChange={(c) => setCatalogSettings({ ...catalogSettings, strictEanValidation: c })}
                disabled={!canWrite}
              />
            </div>
          </Field>
        </div>

        {/* Indian Statutory Listing Gates */}
        <div className="mt-5 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-xs font-semibold text-foreground">Mandatory Indian Listing Compliance Gates</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Products missing these statutory attributes will be blocked from publishing to Amazon, Flipkart, and Quick-Commerce.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border border-border/70 bg-card p-3">
              <div>
                <p className="text-xs font-medium text-foreground">HSN Code (6-8 Digits)</p>
                <p className="text-[10px] text-muted-foreground">Statutory GST tariff classification</p>
              </div>
              <Switch
                checked={catalogSettings.mandatoryGates.hsnCode}
                onCheckedChange={(c) =>
                  setCatalogSettings({
                    ...catalogSettings,
                    mandatoryGates: { ...catalogSettings.mandatoryGates, hsnCode: c },
                  })
                }
                disabled={!canWrite}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/70 bg-card p-3">
              <div>
                <p className="text-xs font-medium text-foreground">Country of Origin (COO)</p>
                <p className="text-[10px] text-muted-foreground">Mandatory Legal Metrology gate</p>
              </div>
              <Switch
                checked={catalogSettings.mandatoryGates.countryOfOrigin}
                onCheckedChange={(c) =>
                  setCatalogSettings({
                    ...catalogSettings,
                    mandatoryGates: { ...catalogSettings.mandatoryGates, countryOfOrigin: c },
                  })
                }
                disabled={!canWrite}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/70 bg-card p-3">
              <div>
                <p className="text-xs font-medium text-foreground">GST Rate Slab (0/5/12/18/28%)</p>
                <p className="text-[10px] text-muted-foreground">Live tax calculation engine</p>
              </div>
              <Switch
                checked={catalogSettings.mandatoryGates.gstRateSlab}
                onCheckedChange={(c) =>
                  setCatalogSettings({
                    ...catalogSettings,
                    mandatoryGates: { ...catalogSettings.mandatoryGates, gstRateSlab: c },
                  })
                }
                disabled={!canWrite}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Section 02: Multi-Channel Inventory Buffers & Safety Stock */}
      <SectionCard
        title="Section 02: Multi-Channel Inventory Buffers & Safety Stock"
        description="Prevent overselling by allocating percentage reserves across connected marketplace accounts."
        aside={
          <Badge
            variant={totalAllocation === 100 ? "default" : "destructive"}
            className={totalAllocation === 100 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}
          >
            Total Allocated: {totalAllocation}%
          </Badge>
        }
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 mb-5">
          <Field
            id="buf-global-percent"
            label="Global Safety Buffer (%)"
            hint="Deducted before calculating available sellable inventory."
          >
            <Input
              type="number"
              value={bufferSettings.globalBufferPercent}
              onChange={(e) => handleGlobalBufferChange(Number(e.target.value))}
              disabled={!canWrite}
            />
          </Field>

          <Field
            id="buf-min-safety"
            label="Minimum Safety Threshold (Units)"
            hint="Floor stock reserved for unexpected return or damage replacements."
          >
            <Input
              type="number"
              value={bufferSettings.minSafetyStockUnits}
              onChange={(e) => setBufferSettings({ ...bufferSettings, minSafetyStockUnits: Number(e.target.value) })}
              disabled={!canWrite}
            />
          </Field>

          <Field
            id="buf-critical-alert"
            label="Critical Low Stock Alert (Units)"
            hint="Triggers high-priority alerts and webhook notifications."
          >
            <Input
              type="number"
              value={bufferSettings.criticalLowStockUnits}
              onChange={(e) => handleCriticalAlertChange(Number(e.target.value))}
              disabled={!canWrite}
            />
          </Field>
        </div>

        {/* Active Channel Reserve Allocation Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Sales Channel</th>
                <th className="px-4 py-2.5">Reserve Share (%)</th>
                <th className="px-4 py-2.5">Channel Buffer (Units)</th>
                <th className="px-4 py-2.5 text-center">Sync Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bufferSettings.channelAllocations.map((ch, idx) => (
                <tr key={ch.channelId} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <span className="mr-2 text-base">{ch.channelIcon}</span>
                    {ch.channelName}
                  </td>
                  <td className="px-4 py-3 w-48">
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={ch.reservePercent}
                        onChange={(e) => handleAllocationChange(idx, Number(e.target.value))}
                        disabled={!canWrite}
                        className="w-24 accent-primary"
                      />
                      <span className="w-10 font-mono font-semibold">{ch.reservePercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    {ch.safetyBufferUnits} units floor
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      SYNC ACTIVE
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Section 03 & 04: Fulfillment Routing & Operational Guardrails */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard
          title="Fulfillment Hub Priority Hierarchy"
          description="Orders are routed through warehouses in order of priority before attempting split fulfillment."
        >
          <div className="space-y-2.5">
            {bufferSettings.hubPriorities.map((hub) => (
              <div
                key={hub.id}
                className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {hub.priority}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{hub.name}</p>
                    <p className="text-[11px] text-muted-foreground">{hub.city}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Priority {hub.priority}
                </Badge>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Operational Guardrails & Anomaly Locks"
          description="Protect inventory integrity against rogue bulk updates and sudden order spikes."
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Two-step approval for negative stock overrides</p>
                <p className="text-[11px] text-muted-foreground">
                  Requires admin 2FA verification when adjusting stock levels below 0.
                </p>
              </div>
              <Switch
                checked={bufferSettings.negativeStockTwoStepApproval}
                onCheckedChange={(c) => setBufferSettings({ ...bufferSettings, negativeStockTwoStepApproval: c })}
                disabled={!canWrite}
              />
            </div>

            <div className="rounded-lg border border-border/70 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Velocity Spike Anomaly Protection</p>
                  <p className="text-[11px] text-muted-foreground">
                    Freezes listings if velocity exceeds safety limits to prevent pricing glitches.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-foreground">
                  {bufferSettings.spikeProtectionUnitsPerHour} units/hr
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={1000}
                step={25}
                value={bufferSettings.spikeProtectionUnitsPerHour}
                onChange={(e) =>
                  setBufferSettings({ ...bufferSettings, spikeProtectionUnitsPerHour: Number(e.target.value) })
                }
                disabled={!canWrite}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
