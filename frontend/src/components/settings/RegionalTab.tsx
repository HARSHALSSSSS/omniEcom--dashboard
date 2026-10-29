import { useMemo, useState } from "react";
import { Lock, AlertTriangle, ShieldCheck, Building2, Plus, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, SectionCard, selectClass } from "./fields";
import { fieldId } from "./form";
import type { TabProps } from "./tabProps";
import type { NumberFormat } from "@/types/settings";

const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];
const LOCK_REASON = "Fixed after sign-up, because your orders, prices and reports are recorded in it. Contact support to change it.";

function timeZones(current: string): string[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  return all.includes(current) ? all : [current, ...all];
}

/** how a sample amount reads in each number system, so the seller sees what will change */
function sample(format: NumberFormat, currency: string): string {
  const locale = format === "indian" ? "en-IN" : "en-US";
  try {
    const amount = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(1234567);
    return `${amount} · ${new Intl.NumberFormat(locale).format(98765432)} units`;
  } catch {
    return new Intl.NumberFormat(locale).format(1234567);
  }
}

/** Indian statutory localization, GSTIN entity bindings, and regional formats */
export function RegionalTab({ s, v, ctl }: TabProps) {
  const ro = !ctl.canWrite;
  const lockedCurrency = s.regional.locked.includes("currency");
  const lockedZone = s.regional.locked.includes("timezone");
  const zones = useMemo(() => timeZones(v.timezone), [v.timezone]);
  const currencies = useMemo(
    () => (COMMON_CURRENCIES.includes(v.currency) ? COMMON_CURRENCIES : [v.currency, ...COMMON_CURRENCIES]),
    [v.currency],
  );
  const err = ctl.fieldErrors;

  const navigate = useNavigate();
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [metricUnits, setMetricUnits] = useState("metric");

  const [unlockedZone, setUnlockedZone] = useState(false);
  const [unlockedCurrency, setUnlockedCurrency] = useState(false);
  const [taxJurisdiction, setTaxJurisdiction] = useState("IN");

  const zoneOptions = useMemo(() => {
    const list = zones.map((z) => ({ value: z, label: z }));
    const defaultLabel = s.regional.timezoneLabel || "Asia/Kolkata (UTC+05:30)";
    if (!list.some((item) => item.label === defaultLabel || item.value === defaultLabel)) {
      list.unshift({ value: defaultLabel, label: defaultLabel });
    }
    return list;
  }, [zones, s.regional.timezoneLabel]);

  const currencyOptions = useMemo(() => {
    const list = currencies.map((c) => ({ value: c, label: c }));
    const defaultLabel = s.regional.currencyLabel || "INR (₹)";
    if (!list.some((item) => item.label === defaultLabel || item.value === defaultLabel)) {
      list.unshift({ value: defaultLabel, label: defaultLabel });
    }
    return list;
  }, [currencies, s.regional.currencyLabel]);

  const handleUnlockZone = () => {
    const next = !unlockedZone;
    setUnlockedZone(next);
    if (next && s.regional.locked) {
      s.regional.locked = s.regional.locked.filter((k) => k !== "timezone");
    }
  };

  const handleUnlockCurrency = () => {
    const next = !unlockedCurrency;
    setUnlockedCurrency(next);
    if (next && s.regional.locked) {
      s.regional.locked = s.regional.locked.filter((k) => k !== "currency");
    }
  };

  return (
    <div className="space-y-6">
      {/* Figma Statutory Impact Notice Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-1">
          <p className="font-semibold text-foreground">Statutory Impact Notice</p>
          <p className="text-muted-foreground">
            Changes to state registrations or tax jurisdictions affect live e-invoicing, e-way bill generation, and statutory reporting under the Indian Goods and Services Tax Act. Ensure all registered GSTINs strictly match your legal entity PAN (<span className="font-mono font-medium text-foreground">{s.business.pan ?? "Not Configured"}</span>).
          </p>
        </div>
      </div>

      {/* Section 01: Indian Localization & Operating Formats */}
      <SectionCard
        title="Indian Localization & Operating Formats"
        description="Standard time zone, base operational currency, number grouping, and metric measurement systems."
        aside={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              ctl.setField("currency", "INR");
              ctl.setField("timezone", "Asia/Kolkata");
              ctl.setField("numberFormat", "indian");
              setTaxJurisdiction("IN");
              setDateFormat("DD/MM/YYYY");
              setMetricUnits("metric");
            }}
            disabled={ro}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Restore Defaults
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field id="settings-country" label="Tax Jurisdiction & Country" hint="Determines statutory compliance rules and marketplace gateways.">
            <select
              id="settings-country"
              className={selectClass}
              value={taxJurisdiction}
              disabled={ro}
              onChange={(e) => setTaxJurisdiction(e.target.value)}
            >
              <option value="IN">India (IN) — GST & TCS/TDS Active</option>
              <option value="US">United States (US) — State Sales Tax & Nexus</option>
              <option value="AE">United Arab Emirates (AE) — Federal FTA VAT (5%)</option>
              <option value="GB">United Kingdom (GB) — HMRC VAT Registered</option>
              <option value="SG">Singapore (SG) — IRAS GST Active</option>
              <option value="EU">European Union (EU) — One-Stop Shop (OSS) VAT</option>
              <option value="AU">Australia (AU) — ATO GST Registered</option>
            </select>
          </Field>

          <Field id={fieldId("timezone")} label="Time zone" error={err.timezone} hint={lockedZone && !unlockedZone ? undefined : "Dates, cut-off times and daily reports follow this zone."}>
            <select
              id={fieldId("timezone")}
              className={selectClass}
              value={unlockedZone ? v.timezone : (s.regional.timezoneLabel || v.timezone)}
              disabled={ro || (lockedZone && !unlockedZone)}
              onChange={(e) => ctl.setField("timezone", e.target.value)}
              aria-describedby={lockedZone && !unlockedZone ? "settings-timezone-lock" : undefined}
            >
              {zoneOptions.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
            {lockedZone && (
              <p id="settings-timezone-lock" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" /> {LOCK_REASON}
                <button
                  type="button"
                  onClick={handleUnlockZone}
                  className="ml-2 font-semibold text-primary hover:underline cursor-pointer"
                >
                  {unlockedZone ? "Relock" : "Unlock to change"}
                </button>
              </p>
            )}
          </Field>

          <Field id={fieldId("currency")} label="Operating currency" error={err.currency} hint={lockedCurrency && !unlockedCurrency ? undefined : "Prices and valuations are stored in this currency."}>
            <select
              id={fieldId("currency")}
              className={selectClass}
              value={unlockedCurrency ? v.currency : (s.regional.currencyLabel || v.currency)}
              disabled={ro || (lockedCurrency && !unlockedCurrency)}
              onChange={(e) => ctl.setField("currency", e.target.value)}
              aria-describedby={lockedCurrency && !unlockedCurrency ? "settings-currency-lock" : undefined}
            >
              {currencyOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {lockedCurrency && (
              <p id="settings-currency-lock" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" /> {LOCK_REASON}
                <button
                  type="button"
                  onClick={handleUnlockCurrency}
                  className="ml-2 font-semibold text-primary hover:underline cursor-pointer"
                >
                  {unlockedCurrency ? "Relock" : "Unlock to change"}
                </button>
              </p>
            )}
          </Field>

          <Field id={fieldId("numberFormat")} label="Number format" error={err.numberFormat} hint="Controls display of revenue, units and order counts.">
            <select id={fieldId("numberFormat")} className={selectClass} value={v.numberFormat} disabled={ro} onChange={(e) => ctl.setField("numberFormat", e.target.value as NumberFormat)}>
              <option value="indian">Indian system (lakhs and crores: 1,00,000.00)</option>
              <option value="international">International system (thousands and millions: 100,000.00)</option>
            </select>
          </Field>

          <Field id="settings-date-format" label="Date Representation" hint="Formatted on packing slips, dispatch manifests and audit trails.">
            <select
              id="settings-date-format"
              className={selectClass}
              value={dateFormat}
              disabled={ro}
              onChange={(e) => setDateFormat(e.target.value)}
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY (Indian statutory standard: 26/10/2026)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601: 2026-10-26)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (US format: 10/26/2026)</option>
            </select>
          </Field>

          <Field id="settings-metric-units" label="Physical Metric Units" hint="Standard units sent to marketplace catalog APIs.">
            <select
              id="settings-metric-units"
              className={selectClass}
              value={metricUnits}
              disabled={ro}
              onChange={(e) => setMetricUnits(e.target.value)}
            >
              <option value="metric">Grams / Kilograms / Millimetres (Metric Standard)</option>
              <option value="imperial">Pounds / Ounces / Inches (Imperial)</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-3.5 text-xs">
          <p className="font-semibold text-foreground">Live Regional Formatting Preview</p>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-muted-foreground">
            <div>
              Format: <span className="font-mono font-medium text-foreground">{sample(v.numberFormat, v.currency)}</span>
            </div>
            <div>
              Date sample: <span className="font-mono font-medium text-foreground">{dateFormat === "DD/MM/YYYY" ? "26/10/2026 14:30 IST" : "2026-10-26 14:30"}</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Section 02: Registered GSTIN & State Hub Entities Table (Figma) */}
      <SectionCard
        title="Registered GSTIN & State Hub Entities"
        description="State tax registrations linked to your warehouses, fulfillment centers, and marketplace accounts."
        aside={
          <Button size="sm" onClick={() => navigate("/settings/gstin")} disabled={ro}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add GSTIN Registration
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">GSTIN</th>
                <th className="px-4 py-2.5">State / Jurisdiction</th>
                <th className="px-4 py-2.5">Entity / Trade Name</th>
                <th className="px-4 py-2.5">Principal Place of Business</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.gstins && s.gstins.length > 0 ? (
                s.gstins.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        {g.gstin}
                        {g.isPrimary && (
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                            Primary
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {g.stateName} ({g.stateCode})
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {g.tradeName || g.legalName || s.business.legalName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {g.registeredAddress || "Registered state commercial hub"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={g.status === "active" ? "default" : "outline"}
                        className={g.status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}
                      >
                        {g.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <Building2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    No state GSTIN registrations configured. Click "Add GSTIN Registration" to register your first state entity.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}


