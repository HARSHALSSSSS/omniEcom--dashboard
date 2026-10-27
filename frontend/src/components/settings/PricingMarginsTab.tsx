import { useState } from "react";
import { Calculator, TrendingUp, Settings2 } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useVariantSearch } from "@/hooks/usePricing";
import { usePriceSimulation } from "@/hooks/useSettings";
import { formatINR } from "@/utils/format";
import type { ChannelTier, PriceEnding, PricingTierConfig, SettingsChannel, SettingsOverview } from "@/types/settings";
import { SectionCard, Field, selectClass } from "./fields";
import { PricingTierDialog } from "./PricingTierDialog";
import type { SettingsController, SettingsValues } from "./tabProps";

export interface PricingMarginsTabProps {
  canWrite?: boolean;
  s?: SettingsOverview | null;
  v?: SettingsValues | null;
  ctl?: SettingsController;
}

/** 1% TCS + 0.1% TDS 194-O of the sale value, the buffer the toggle switches on */
export const TCS_TDS_BUFFER_BPS = 110;

const TIER_DEFAULTS: ChannelTier = { baseMarkupBps: 0, fixedFeeBufferMinor: 0, hardFloorMinor: null, maxDiscountBps: 2000, repriceIntervalMinutes: 60, minNetMarginBps: null, autoDelistOnBreach: false, dealFloorMinor: null, mandate2faForMarkdown: false, status: "active" };

/** a channel and its stored tier in the units the dialog edits (percent, rupees; 0 = not set) */
export function tierToConfig(channel: SettingsChannel, tier: ChannelTier | undefined): PricingTierConfig {
  const t = tier ?? TIER_DEFAULTS;
  return {
    id: channel.id,
    channelName: channel.name,
    channelCode: channel.marketplace.toUpperCase(),
    baseMarkupPercent: t.baseMarkupBps / 100,
    fixedFeeBufferInr: t.fixedFeeBufferMinor / 100,
    hardUndercutFloorInr: (t.hardFloorMinor ?? 0) / 100,
    maxDiscountDepthPercent: t.maxDiscountBps / 100,
    repriceIntervalMinutes: t.repriceIntervalMinutes,
    minNetMarginPercent: (t.minNetMarginBps ?? 0) / 100,
    autoDelistOnBreach: t.autoDelistOnBreach,
    dealFloorInr: (t.dealFloorMinor ?? 0) / 100,
    mandate2faForMarkdown: t.mandate2faForMarkdown,
    status: t.status,
  };
}

const bps = (percent: number) => Math.max(0, Math.round((Number(percent) || 0) * 100));
const minor = (inr: number) => Math.max(0, Math.round((Number(inr) || 0) * 100));
export function configToTier(c: PricingTierConfig): ChannelTier {
  return {
    baseMarkupBps: bps(c.baseMarkupPercent),
    fixedFeeBufferMinor: minor(c.fixedFeeBufferInr),
    hardFloorMinor: c.hardUndercutFloorInr > 0 ? minor(c.hardUndercutFloorInr) : null,
    maxDiscountBps: bps(c.maxDiscountDepthPercent),
    repriceIntervalMinutes: Math.round(Number(c.repriceIntervalMinutes) || 60),
    minNetMarginBps: c.minNetMarginPercent > 0 ? bps(c.minNetMarginPercent) : null,
    autoDelistOnBreach: c.autoDelistOnBreach,
    dealFloorMinor: c.dealFloorInr > 0 ? minor(c.dealFloorInr) : null,
    mandate2faForMarkdown: c.mandate2faForMarkdown,
    status: c.status,
  };
}

const pct = (b: number | null) => (b === null ? "-" : `${(b / 100).toFixed(b % 100 === 0 ? 0 : 1)}%`);
const STORED = "Saved with your workspace; the pricing engine does not enforce it yet.";

export function PricingMarginsTab({ canWrite = true, s, v, ctl }: PricingMarginsTabProps) {
  const pricing = v?.ext.pricing;
  const edit = canWrite && Boolean(ctl && v);
  const channels = s?.channels ?? [];

  const [activeTier, setActiveTier] = useState<PricingTierConfig | null>(null);

  // simulator inputs: a real variant, a real channel, an optional price to test
  const [search, setSearch] = useState("");
  const [variant, setVariant] = useState<{ id: string; sku: string; productTitle: string } | null>(null);
  const [accountId, setAccountId] = useState("");
  const [priceText, setPriceText] = useState("");
  const options = useVariantSearch(variant ? "" : search);
  const priceMinor = priceText.trim() && Number(priceText) > 0 ? Math.round(Number(priceText) * 100) : undefined;
  const sim = usePriceSimulation({ variantId: variant?.id, accountId: accountId || undefined, priceMinor }, Boolean(variant));

  if (!pricing || !s) return null;
  const err = ctl?.fieldErrors["ext:pricing"];
  const setPricing = (patch: Partial<typeof pricing>) => ctl?.setExt("pricing", { ...pricing, ...patch });
  const floorOn = pricing.marginFloorBps !== null;

  const saveTier = (c: PricingTierConfig) => setPricing({ channelTiers: { ...pricing.channelTiers, [c.id]: configToTier(c) } });

  // the margin and the money lines come from the server; the unsaved floor and withholding switch are applied on top so the seller sees their effect before saving
  const d = sim.data;
  const withholdMinor = d ? Math.round((d.priceMinor * pricing.withholdBufferBps) / 10_000) : 0;
  const netMinor = d && d.breakdown.feeMinor !== null ? d.priceMinor - (d.breakdown.gstMinor ?? 0) - d.breakdown.feeMinor - withholdMinor : null;
  const breached = d && d.marginBps !== null && pricing.marginFloorBps !== null ? d.marginBps < pricing.marginFloorBps : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Pricing & Margin Protection</p>
            <p className="text-muted-foreground">The workspace margin floor, price endings, channel tiers and statutory gates. Save with the bar at the top.</p>
          </div>
        </div>
      </div>

      {err && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
          {err}
        </p>
      )}

      <SectionCard title="Section 01: Gross Margin Safety Floor & Live Unit Economics Simulator" description="The margin every price is judged against when no pricing policy sets a stricter target.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="margin-floor-on" className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <input id="margin-floor-on" type="checkbox" className="h-4 w-4 accent-black" checked={floorOn} disabled={!edit} onChange={(e) => setPricing({ marginFloorBps: e.target.checked ? 2000 : null })} />
                  Minimum gross margin floor
                </label>
                <span className="font-mono text-sm font-bold text-primary">{floorOn ? `${(pricing.marginFloorBps ?? 0) / 100}%` : "Not set"}</span>
              </div>
              <input
                type="range"
                aria-label="Margin floor"
                min={5}
                max={50}
                step={0.5}
                value={floorOn ? (pricing.marginFloorBps ?? 0) / 100 : 20}
                onChange={(e) => setPricing({ marginFloorBps: Math.round(Number(e.target.value) * 100) })}
                disabled={!edit || !floorOn}
                className="w-full accent-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Where no active pricing policy sets a margin target, this is the target: Pricing, Profitability and Product Intelligence flag anything below it. A policy that asks for more always wins. With no floor and no policy there is no target.
              </p>
            </div>

            <Field id="pricing-psych-rounding" label="Psychological Price Rounding Rule" hint="Applied to the prices the pricing engine proposes, only where the margin floor, maximum discount and MRP still hold.">
              <select
                id="pricing-psych-rounding"
                value={pricing.priceEnding}
                onChange={(e) => {
                  const ending = e.target.value as PriceEnding;
                  setPricing({ priceEnding: ending });
                  ctl?.setField("roundPriceToNine", ending === "nine");
                }}
                className={selectClass}
                disabled={!edit}
              >
                <option value="nine">Charm pricing: nearest price ending in 9 (e.g. 999, 1,499)</option>
                <option value="zero">Round pricing: nearest price ending in 0 (e.g. 1,000, 1,500)</option>
                <option value="exact">Exact formula price: no rounding</option>
              </select>
            </Field>

            <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3.5">
              <p className="text-xs font-semibold text-foreground">Simulator: pick a real product</p>
              {variant ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs">
                  <span>
                    <span className="font-semibold">{variant.productTitle}</span> <span className="font-mono text-muted-foreground">{variant.sku}</span>
                  </span>
                  <button type="button" className="font-semibold text-muted-foreground hover:text-foreground" onClick={() => { setVariant(null); setSearch(""); }}>
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Input aria-label="Find a product" placeholder="Search by SKU, barcode or product name" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" />
                  {search.trim().length >= 2 && options.isLoading && <p className="text-[11px] text-muted-foreground">Searching...</p>}
                  {search.trim().length >= 2 && options.data?.length === 0 && <p className="text-[11px] text-muted-foreground">No product matches.</p>}
                  {(options.data ?? []).map((o) => (
                    <button key={o.id} type="button" className="block w-full rounded-md border border-border bg-card px-3 py-1.5 text-left text-xs hover:bg-muted/40" onClick={() => setVariant(o)}>
                      {o.productTitle} <span className="font-mono text-muted-foreground">{o.sku}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label htmlFor="sim-channel" className="text-[11px] text-muted-foreground">Channel (for its fees)</label>
                  <select id="sim-channel" className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">No channel (no marketplace fees)</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sim-price" className="text-[11px] text-muted-foreground">Price to test (leave empty for the current price)</label>
                  <Input id="sim-price" type="number" min={0} value={priceText} onChange={(e) => setPriceText(e.target.value)} className="h-8 font-mono text-xs" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Live Unit Economics Breakdown</h3>
              </div>
              {d && breached !== null && (
                <Badge variant={breached ? "destructive" : "default"} className={!breached ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}>
                  {breached ? "BELOW FLOOR" : "ABOVE FLOOR"}
                </Badge>
              )}
            </div>

            {!variant ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Choose a product to see its real unit economics: its cost, the channel's fees and your saved rules.</p>
            ) : sim.isLoading ? (
              <p role="status" className="py-8 text-center text-xs text-muted-foreground">Calculating...</p>
            ) : sim.isError || !d ? (
              <p role="alert" className="py-8 text-center text-xs text-destructive">{errorMessage(sim.error, "Could not calculate this price.")}</p>
            ) : (
              <div className="space-y-2.5 text-xs">
                <Line label="Listed price" value={formatINR(d.priceMinor)} />
                <Line label="Product cost" value={d.breakdown.costMinor === null ? "Not recorded" : `- ${formatINR(d.breakdown.costMinor)}`} />
                <Line label={d.variant.gstRateBps === null ? "GST inside the price" : `GST inside the price (${d.variant.gstRateBps / 100}%)`} value={d.breakdown.gstMinor === null ? "No GST rate on the product" : `- ${formatINR(d.breakdown.gstMinor)}`} />
                <Line
                  label={d.account ? `${d.account.name} commission` : "Marketplace commission"}
                  value={d.account === null ? "No channel chosen" : d.breakdown.feeMinor === null ? "No fee profile for this channel" : `- ${formatINR(d.breakdown.feeMinor)}`}
                />
                <Line label="TCS / TDS withholding buffer" value={pricing.withholdBufferBps > 0 ? `- ${formatINR(withholdMinor)}` : "Off"} />
                <div className="flex justify-between py-2 font-semibold">
                  <span className="text-foreground">Net realization to seller:</span>
                  <span className="font-mono font-bold text-primary">{netMinor === null ? "Needs the channel's fees" : formatINR(netMinor)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-xs font-bold text-foreground">Margin after cost and fees:</span>
                  <span className={`font-mono text-base font-bold ${breached ? "text-destructive" : "text-foreground"}`}>{d.marginBps === null ? "Needs a cost price" : `${(d.marginBps / 100).toFixed(1)}%`}</span>
                </div>
                {d.floorPriceMinor !== null && <p className="text-[11px] text-muted-foreground">Lowest price that still earns the target margin ({pct(d.rules.effectiveTargetBps)}): {formatINR(d.floorPriceMinor)}.</p>}
                {d.exceedsMrp && <p role="alert" className="text-[11px] font-medium text-destructive">This price is above the MRP of {formatINR(d.variant.mrpMinor ?? 0)}, which the Legal Metrology gate does not allow.</p>}
                <p className="text-[10px] text-muted-foreground">The margin is worked out by the server with the same rules as price proposals and the Pricing screen. The floor and the withholding switch shown here are the ones on this page, saved or not.</p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Section 02: Multi-Channel Marketplace Pricing Tiers & Parity Rules" description={`One tier per connected marketplace account. ${STORED}`}>
        {channels.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No marketplace account is connected yet. Tiers appear here once you connect one.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Marketplace Channel</th>
                  <th className="px-4 py-2.5">Markup</th>
                  <th className="px-4 py-2.5">Hard Floor</th>
                  <th className="px-4 py-2.5">Max Discount</th>
                  <th className="px-4 py-2.5">Min Margin</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channels.map((ch) => {
                  const t = pricing.channelTiers[ch.id];
                  return (
                    <tr key={ch.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div>{ch.name}</div>
                        <span className="font-mono text-[10px] text-muted-foreground">{ch.marketplace.toUpperCase()}</span>
                      </td>
                      <td className="px-4 py-3 font-mono">{t ? `+${pct(t.baseMarkupBps)}${t.fixedFeeBufferMinor > 0 ? ` + ${formatINR(t.fixedFeeBufferMinor)}` : ""}` : "Not set"}</td>
                      <td className="px-4 py-3 font-mono">{t?.hardFloorMinor ? formatINR(t.hardFloorMinor) : "-"}</td>
                      <td className="px-4 py-3 font-mono">{t ? pct(t.maxDiscountBps) : "-"}</td>
                      <td className="px-4 py-3 font-mono">{t ? pct(t.minNetMarginBps) : "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setActiveTier(tierToConfig(ch, t))} disabled={!edit}>
                          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Configure Tier
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard title="Section 03: Algorithmic Repricing Guardrails" description={`Guardrails against runaway automatic price changes. ${STORED}`}>
          <div className="space-y-3.5">
            <Toggle title="Auto-delist on gross floor breach" text="Delist when a competitor price pulls us under the safety floor." checked={pricing.autoDelistOnBreach} disabled={!edit} onChange={(c) => setPricing({ autoDelistOnBreach: c })} />
            <Toggle title="Require 2FA on bulk markdowns over 15%" text="Ask for a second confirmation on large markdowns." checked={pricing.mandate2faBulkMarkdown} disabled={!edit} onChange={(c) => setPricing({ mandate2faBulkMarkdown: c })} />
            <Field id="max-velocity-shift" label="Maximum price shift from sales velocity (%)" hint="The most a velocity rule may move a price in one step.">
              <Input id="max-velocity-shift" type="number" min={0} max={100} step={0.5} value={pricing.maxVelocityShiftBps / 100} onChange={(e) => setPricing({ maxVelocityShiftBps: bps(Number(e.target.value)) })} disabled={!edit} className="h-8 w-28 font-mono text-xs" />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Section 04: Statutory Compliance & Tax Pass-Through" description="Indian Legal Metrology and e-commerce tax withholdings.">
          <div className="space-y-3.5">
            <Toggle title="Legal Metrology MRP compliance gate" text="Never propose a price above the product's MRP. Applied by the pricing engine." checked={pricing.legalMetrologyMrpGate} disabled={!edit} onChange={(c) => setPricing({ legalMetrologyMrpGate: c })} />
            <Toggle title="Withhold TCS 1.0% & TDS 194-O 0.1% buffer" text="Counts the statutory deductions in the simulator's net realization." checked={pricing.withholdBufferBps > 0} disabled={!edit} onChange={(c) => setPricing({ withholdBufferBps: c ? TCS_TDS_BUFFER_BPS : 0 })} />
          </div>
        </SectionCard>
      </div>

      {activeTier && <PricingTierDialog tier={activeTier} open onClose={() => setActiveTier(null)} onSave={saveTier} />}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function Toggle({ title, text, checked, disabled, onChange }: { title: string; text: string; checked: boolean; disabled: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{text}</p>
      </div>
      <Switch aria-label={title} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
