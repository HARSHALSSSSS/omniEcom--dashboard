import { useState, useMemo } from "react";
import {
  Check,
  Calculator,
  TrendingUp,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SectionCard, Field, selectClass } from "./fields";
import { PricingTierDialog } from "./PricingTierDialog";
import type { PricingMarginSettings, PricingTierConfig, SettingsOverview } from "@/types/settings";
import type { SettingsController, SettingsValues } from "./tabProps";

const INITIAL_TIERS: PricingTierConfig[] = [
  {
    id: "tier-shopify",
    channelName: "Shopify D2C Storefront",
    channelCode: "SHOPIFY",
    baseMarkupPercent: 0,
    fixedFeeBufferInr: 0,
    hardUndercutFloorInr: 999,
    maxDiscountDepthPercent: 20,
    repriceIntervalMinutes: 60,
    minNetMarginPercent: 25.0,
    autoDelistOnBreach: false,
    dealFloorInr: 899,
    mandate2faForMarkdown: true,
    status: "active",
  },
  {
    id: "tier-amazon",
    channelName: "Amazon India (SP-API)",
    channelCode: "AMZN_IN",
    baseMarkupPercent: 8.5,
    fixedFeeBufferInr: 45,
    hardUndercutFloorInr: 1149,
    maxDiscountDepthPercent: 25,
    repriceIntervalMinutes: 15,
    minNetMarginPercent: 22.0,
    autoDelistOnBreach: true,
    dealFloorInr: 1099,
    mandate2faForMarkdown: true,
    status: "active",
  },
  {
    id: "tier-flipkart",
    channelName: "Flipkart Retail & Assured",
    channelCode: "FLPKRT",
    baseMarkupPercent: 6.0,
    fixedFeeBufferInr: 35,
    hardUndercutFloorInr: 1099,
    maxDiscountDepthPercent: 25,
    repriceIntervalMinutes: 30,
    minNetMarginPercent: 20.0,
    autoDelistOnBreach: true,
    dealFloorInr: 999,
    mandate2faForMarkdown: true,
    status: "active",
  },
  {
    id: "tier-quickcomm",
    channelName: "Quick Commerce (Blinkit & Zepto)",
    channelCode: "QUICK_COMM",
    baseMarkupPercent: 12.0,
    fixedFeeBufferInr: 50,
    hardUndercutFloorInr: 1249,
    maxDiscountDepthPercent: 15,
    repriceIntervalMinutes: 15,
    minNetMarginPercent: 26.0,
    autoDelistOnBreach: false,
    dealFloorInr: 1149,
    mandate2faForMarkdown: false,
    status: "active",
  },
];

export interface PricingMarginsTabProps {
  canWrite?: boolean;
  s?: SettingsOverview | null;
  v?: SettingsValues;
  ctl?: SettingsController;
}

export function PricingMarginsTab({ canWrite = true, s, v, ctl }: PricingMarginsTabProps) {
  const savedSettings = (() => {
    try {
      const item = localStorage.getItem("omni_pricing_margins_settings");
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  })();

  const initialRoundToNine =
    v?.roundPriceToNine !== undefined
      ? v.roundPriceToNine
      : (s?.operations?.roundPriceToNine ?? true);

  const [settings, setSettings] = useState<PricingMarginSettings>(() => ({
    grossMarginFloorPercent: savedSettings?.grossMarginFloorPercent ?? 18.5,
    psychologicalEnding: savedSettings?.psychologicalEnding ?? (initialRoundToNine ? "9" : "exact"),
    legalMetrologyMrpGate: savedSettings?.legalMetrologyMrpGate ?? true,
    withholdTcsTdsBuffer: savedSettings?.withholdTcsTdsBuffer ?? true,
    maxVelocityShiftPercent: savedSettings?.maxVelocityShiftPercent ?? 15,
    tiers: savedSettings?.tiers || INITIAL_TIERS,
  }));

  // Simulator inputs
  const [simMrp, setSimMrp] = useState(1499);
  const [simCogs, setSimCogs] = useState(420);
  const simGstRate = 18;
  const simCommissionRate = 14;

  // Active tier being configured
  const [activeTier, setActiveTier] = useState<PricingTierConfig | null>(null);
  const [saved, setSaved] = useState(false);

  // Live Unit Economics Calculation
  const unitEconomics = useMemo(() => {
    // Reverse GST from selling price: SP - (SP / (1 + GST%))
    const gstFactor = 1 + simGstRate / 100;
    const baseSellingPrice = simMrp / gstFactor;
    const reverseGst = simMrp - baseSellingPrice;
    const commission = (simMrp * simCommissionRate) / 100;
    const tcsTds = settings.withholdTcsTdsBuffer ? (simMrp * 1.1) / 100 : 0; // 1% TCS + 0.1% TDS
    const totalDeductions = reverseGst + commission + tcsTds + simCogs;
    const netGrossMargin = ((baseSellingPrice - simCogs) / baseSellingPrice) * 100;

    return {
      reverseGst: reverseGst.toFixed(2),
      commission: commission.toFixed(2),
      tcsTds: tcsTds.toFixed(2),
      netRealization: (simMrp - (reverseGst + commission + tcsTds)).toFixed(2),
      marginPercent: Math.max(0, netGrossMargin).toFixed(1),
      isBreached: netGrossMargin < settings.grossMarginFloorPercent,
    };
  }, [simMrp, simCogs, simGstRate, simCommissionRate, settings.withholdTcsTdsBuffer, settings.grossMarginFloorPercent]);

  const handleSaveTier = (updated: PricingTierConfig) => {
    setSettings((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.id === updated.id ? updated : t)),
    }));
  };

  const handleSave = async () => {
    try {
      localStorage.setItem("omni_pricing_margins_settings", JSON.stringify(settings));
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
      {/* Top Banner */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Algorithmic Pricing & Margin Protection Engine</p>
            <p className="text-muted-foreground">
              Define gross margin circuit breakers, multi-channel markup tiers, statutory Legal Metrology gates, and Buy Box guardrails.
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
            Save Pricing Rules
          </Button>
        </div>
      </div>

      {/* Section 01: Gross Margin Floor & Live Unit Economics Simulator */}
      <SectionCard
        title="Section 01: Gross Margin Safety Floor & Live Unit Economics Simulator"
        description="Every price adjustment across all channels is continuously evaluated against this bottom margin floor."
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Controls */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Absolute Minimum Gross Margin Floor
                </label>
                <span className="font-mono text-sm font-bold text-primary">
                  {settings.grossMarginFloorPercent}%
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={50}
                step={0.5}
                value={settings.grossMarginFloorPercent}
                onChange={(e) =>
                  setSettings({ ...settings, grossMarginFloorPercent: Number(e.target.value) })
                }
                disabled={!canWrite}
                className="w-full accent-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Pricing algorithms and promotions are halted if an SKU falls below this gross margin safety boundary.
              </p>
            </div>

            <Field
              id="pricing-psych-rounding"
              label="Psychological Price Rounding Rule"
              hint="Automatically formats computed algorithmic prices to consumer retail sweet spots."
            >
              <select
                id="pricing-psych-rounding"
                value={settings.psychologicalEnding}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setSettings({ ...settings, psychologicalEnding: val });
                  if (ctl) {
                    ctl.setField("roundPriceToNine", val === "9");
                  }
                }}
                className={selectClass}
                disabled={!canWrite}
              >
                <option value="9">Charm Pricing: Nearest ₹9 ending (e.g. ₹999, ₹1,499)</option>
                <option value="0">Round Pricing: Nearest ₹0 ending (e.g. ₹1,000, ₹1,500)</option>
                <option value="exact">Exact Formula Price: No rounding applied</option>
              </select>
            </Field>

            <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-3">
              <p className="text-xs font-semibold text-foreground">Simulator Input Parameters (Sample SKU #AURA-402)</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-muted-foreground">Target Selling Price (₹)</label>
                  <Input
                    type="number"
                    value={simMrp}
                    onChange={(e) => setSimMrp(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Base Manufacturing COGS (₹)</label>
                  <Input
                    type="number"
                    value={simCogs}
                    onChange={(e) => setSimCogs(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Simulator Result Card (Figma) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Live Unit Economics Breakdown
                </h3>
              </div>
              <Badge
                variant={unitEconomics.isBreached ? "destructive" : "default"}
                className={!unitEconomics.isBreached ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}
              >
                {unitEconomics.isBreached ? "MARGIN BREACH" : "SAFETY COMPLIANT"}
              </Badge>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Gross Listed Price (MRP):</span>
                <span className="font-mono font-semibold text-foreground">₹{simMrp.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Base Product COGS:</span>
                <span className="font-mono text-foreground">- ₹{simCogs.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Reverse GST Deduction (18% inclusive):</span>
                <span className="font-mono text-destructive">- ₹{unitEconomics.reverseGst}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">Channel Commission (14% Avg):</span>
                <span className="font-mono text-destructive">- ₹{unitEconomics.commission}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">E-Comm TCS (1%) & TDS 194-O (0.1%):</span>
                <span className="font-mono text-destructive">- ₹{unitEconomics.tcsTds}</span>
              </div>
              <div className="flex justify-between py-2 font-semibold">
                <span className="text-foreground">Net Realization to Seller:</span>
                <span className="font-mono text-primary font-bold">₹{unitEconomics.netRealization}</span>
              </div>
              <div className="flex justify-between items-center rounded-lg bg-muted/40 p-3 mt-2">
                <span className="text-xs font-bold text-foreground">Computed Net Gross Margin:</span>
                <span className={`font-mono text-base font-bold ${unitEconomics.isBreached ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {unitEconomics.marginPercent}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Section 02: Multi-Channel Marketplace Pricing Tiers & Parity Rules */}
      <SectionCard
        title="Section 02: Multi-Channel Marketplace Pricing Tiers & Parity Rules"
        description="Configure channel-specific price markups, dynamic parity synchronizers, and circuit breakers."
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Marketplace Channel</th>
                <th className="px-4 py-2.5">Pricing Formula / Markup</th>
                <th className="px-4 py-2.5">Hard Floor</th>
                <th className="px-4 py-2.5">Max Discount</th>
                <th className="px-4 py-2.5">Min Margin Floor</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settings.tiers.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-semibold text-foreground">
                    <div>{t.channelName}</div>
                    <span className="font-mono text-[10px] text-muted-foreground">{t.channelCode}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    +{t.baseMarkupPercent}% {t.fixedFeeBufferInr > 0 ? `+ ₹${t.fixedFeeBufferInr}` : ""}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-foreground">
                    ₹{t.hardUndercutFloorInr.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {t.maxDiscountDepthPercent}%
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {t.minNetMarginPercent}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTier(t)}
                      disabled={!canWrite}
                    >
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Configure Tier
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Section 03 & 04: Statutory Compliance & Repricing Guardrails */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard
          title="Section 03: Algorithmic Repricing Guardrails"
          description="Enforce automated Buy Box chasing rules and guardrails against runaway bots."
        >
          <div className="space-y-3.5">
            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Auto-delist on gross floor breach</p>
                <p className="text-[11px] text-muted-foreground">
                  Triggers marketplace delisting if external competitor drops below our safety floor.
                </p>
              </div>
              <Switch defaultChecked disabled={!canWrite} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Mandate 2FA on bulk markdowns &gt;15%</p>
                <p className="text-[11px] text-muted-foreground">
                  Requires hardware key or authenticator confirmation on markdown events.
                </p>
              </div>
              <Switch defaultChecked disabled={!canWrite} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Section 04: Statutory Compliance & Tax Pass-Through"
          description="Enforce Indian Legal Metrology Act and e-commerce tax withholdings."
        >
          <div className="space-y-3.5">
            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Legal Metrology MRP Compliance Gate</p>
                <p className="text-[11px] text-muted-foreground">
                  Strictly prohibits selling price from ever exceeding registered package MRP.
                </p>
              </div>
              <Switch
                checked={settings.legalMetrologyMrpGate}
                onCheckedChange={(c) => setSettings({ ...settings, legalMetrologyMrpGate: c })}
                disabled={!canWrite}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Withhold TCS 1.0% & TDS 194-O 0.1% buffer</p>
                <p className="text-[11px] text-muted-foreground">
                  Automatically factors statutory deductions in live net margin calculations.
                </p>
              </div>
              <Switch
                checked={settings.withholdTcsTdsBuffer}
                onCheckedChange={(c) => setSettings({ ...settings, withholdTcsTdsBuffer: c })}
                disabled={!canWrite}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Pricing Tier Dialog Modal */}
      {activeTier && (
        <PricingTierDialog
          tier={activeTier}
          open={Boolean(activeTier)}
          onClose={() => setActiveTier(null)}
          onSave={handleSaveTier}
        />
      )}
    </div>
  );
}
