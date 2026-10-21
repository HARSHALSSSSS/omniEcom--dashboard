import { useMemo } from "react";
import { Lock } from "lucide-react";
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

/** currency, time zone and number system. Locked fields are shown disabled with the reason. */
export function RegionalTab({ s, v, ctl }: TabProps) {
  const ro = !ctl.canWrite;
  const lockedCurrency = s.regional.locked.includes("currency");
  const lockedZone = s.regional.locked.includes("timezone");
  const zones = useMemo(() => timeZones(v.timezone), [v.timezone]);
  const currencies = COMMON_CURRENCIES.includes(v.currency) ? COMMON_CURRENCIES : [v.currency, ...COMMON_CURRENCIES];
  const err = ctl.fieldErrors;

  return (
    <div className="space-y-6">
      <SectionCard title="Currency and time zone" description="Used for prices, order totals, reports and every date and time you see.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field id={fieldId("currency")} label="Operating currency" error={err.currency} hint={lockedCurrency ? undefined : "Prices are stored in this currency."}>
            {lockedCurrency ? (
              <input id={fieldId("currency")} type="text" readOnly disabled value={s.regional.currencyLabel} className="flex h-9 w-full rounded-md border border-input bg-muted/40 px-3 py-1 text-sm" aria-describedby="settings-currency-lock" />
            ) : (
              <select id={fieldId("currency")} className={selectClass} value={v.currency} disabled={ro} onChange={(e) => ctl.setField("currency", e.target.value)}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            {lockedCurrency && (
              <p id="settings-currency-lock" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" /> {LOCK_REASON}
              </p>
            )}
          </Field>
          <Field id={fieldId("timezone")} label="Time zone" error={err.timezone} hint={lockedZone ? undefined : "Dates, cut-off times and daily reports follow this zone."}>
            {lockedZone ? (
              <input id={fieldId("timezone")} type="text" readOnly disabled value={s.regional.timezoneLabel} className="flex h-9 w-full rounded-md border border-input bg-muted/40 px-3 py-1 text-sm" aria-describedby="settings-timezone-lock" />
            ) : (
              <select id={fieldId("timezone")} className={selectClass} value={v.timezone} disabled={ro} onChange={(e) => ctl.setField("timezone", e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            )}
            {lockedZone && (
              <p id="settings-timezone-lock" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" /> {LOCK_REASON}
              </p>
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Number system" description="How large amounts and quantities are grouped and abbreviated across dashboards, tables and reports.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field id={fieldId("numberFormat")} label="Number format" error={err.numberFormat}>
            <select id={fieldId("numberFormat")} className={selectClass} value={v.numberFormat} disabled={ro} onChange={(e) => ctl.setField("numberFormat", e.target.value as NumberFormat)}>
              <option value="indian">Indian system (lakhs and crores)</option>
              <option value="international">International system (thousands and millions)</option>
            </select>
          </Field>
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium text-foreground">Preview</p>
            <p aria-live="polite" className="mt-1 font-mono text-muted-foreground">
              {sample(v.numberFormat, v.currency)}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
