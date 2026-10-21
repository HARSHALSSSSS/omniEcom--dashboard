import { Input } from "@/components/ui/input";
import { Field, FIELD_SELECT } from "@/components/procurement/procurementUi";
import { useAccountChoices, useCategoryChoices, useWarehouseChoices } from "@/hooks/useReports";
import type { CatalogEntry, PeriodShortcut, ReportParamSpec } from "@/types/reports";
import { defaultLabel, hasPeriod, modeOf, PERIOD_SPEC_KEYS, specsFor, type ParamValues, type PeriodMode } from "./reportParamsForm";

interface Props {
  idPrefix: string;
  entry: CatalogEntry;
  periods: PeriodShortcut[];
  values: ParamValues;
  onChange: (next: ParamValues) => void;
  errors: Record<string, string | null | undefined>;
  /** a schedule: only relative parameters, and the period is always a preset (every run covers its own period) */
  forSchedule?: boolean;
  disabled?: boolean;
}

const MODE_LABEL: Record<PeriodMode, string> = { range: "Preset period", month: "A calendar month", custom: "Custom dates" };

/** the parameter inputs of one report type, built from the catalog (`GET /reports/catalog`) */
export function ParamFields({ idPrefix, entry, periods, values, onChange, errors, forSchedule = false, disabled }: Props) {
  const specs = specsFor(entry, forSchedule);
  const set = (key: string, value: string) => onChange({ ...values, [key]: value });
  const mode = forSchedule ? "range" : modeOf(values);

  /** the next mode starts empty; a preset falls back to the report's own default period */
  const withMode = (next: PeriodMode) => {
    const cleared: ParamValues = Object.fromEntries(Object.entries(values).filter(([k]) => !PERIOD_SPEC_KEYS.includes(k)));
    if (next === "month") cleared.month = "";
    if (next === "custom") {
      cleared.from = "";
      cleared.to = "";
    }
    onChange(cleared);
  };

  const needsWarehouses = specs.some((s) => s.key === "warehouseId");
  const needsAccounts = specs.some((s) => s.key === "accountId" || s.key === "marketplace");
  const needsCategories = specs.some((s) => s.key === "categoryId");
  const warehouses = useWarehouseChoices(needsWarehouses);
  const accounts = useAccountChoices(needsAccounts);
  const categories = useCategoryChoices(needsCategories);

  const rangeSpec = specs.find((s) => s.key === "range");
  const labelOfRange = (v: string) => periods.find((p) => p.key === v)?.label ?? v;
  const e = (k: string) => errors[k] ?? null;

  const plain = specs.filter((s) => !PERIOD_SPEC_KEYS.includes(s.key));

  const renderPlain = (spec: ReportParamSpec) => {
    const id = `${idPrefix}-${spec.key}`;
    const value = values[spec.key] ?? "";
    const common = { id, disabled, "aria-invalid": Boolean(e(spec.key)) || undefined, "aria-describedby": e(spec.key) ? `${id}-error` : undefined };
    let control: React.ReactNode;
    const select = (options: Array<{ value: string; label: string }>, emptyLabel: string) => (
      <select {...common} className={FIELD_SELECT} value={value} onChange={(ev) => set(spec.key, ev.target.value)}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
    if (spec.type === "enum") {
      control = select(
        (spec.options ?? []).map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) })),
        defaultLabel(spec, (v) => v),
      );
    } else if (spec.key === "warehouseId" && warehouses.data) {
      control = select(warehouses.data, "All warehouses");
    } else if (spec.key === "categoryId" && categories.data) {
      control = select(categories.data, "All categories");
    } else if (spec.key === "accountId" && accounts.data) {
      control = select(accounts.data, "All accounts");
    } else if (spec.key === "marketplace" && accounts.data) {
      const codes = [...new Set(accounts.data.map((a) => a.marketplace))].sort();
      control = select(codes.map((c) => ({ value: c, label: c })), "All marketplaces");
    } else if (spec.type === "date") {
      control = <Input {...common} type="date" value={value} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => set(spec.key, ev.target.value)} error={Boolean(e(spec.key))} className="text-xs" />;
    } else if (spec.type === "integer") {
      control = <Input {...common} inputMode="numeric" value={value} placeholder={spec.default !== null ? String(spec.default) : undefined} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => set(spec.key, ev.target.value)} error={Boolean(e(spec.key))} className="text-xs" autoComplete="off" />;
    } else {
      control = <Input {...common} value={value} placeholder={spec.type === "uuid" ? "Paste an id" : undefined} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => set(spec.key, ev.target.value)} error={Boolean(e(spec.key))} className="text-xs" autoComplete="off" />;
    }
    return (
      <Field key={spec.key} id={id} label={spec.label} hint={spec.description} error={e(spec.key)}>
        {control}
      </Field>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {hasPeriod(entry) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {!forSchedule && (
            <Field id={`${idPrefix}-mode`} label="Period type">
              <select id={`${idPrefix}-mode`} className={FIELD_SELECT} disabled={disabled} value={mode} onChange={(ev) => withMode(ev.target.value as PeriodMode)}>
                {(["range", "month", "custom"] as const).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {mode === "range" && rangeSpec && (
            <Field id={`${idPrefix}-range`} label={rangeSpec.label} hint={forSchedule ? "Every run covers its own period, for example the previous month." : undefined} error={e("range")}>
              <select id={`${idPrefix}-range`} className={FIELD_SELECT} disabled={disabled} value={values.range ?? ""} onChange={(ev) => set("range", ev.target.value)}>
                <option value="">{defaultLabel(rangeSpec, labelOfRange)}</option>
                {(rangeSpec.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {labelOfRange(o)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {mode === "month" && (
            <Field id={`${idPrefix}-month`} label="Month" required error={e("month")}>
              <Input id={`${idPrefix}-month`} type="month" disabled={disabled} value={values.month ?? ""} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => set("month", ev.target.value)} error={Boolean(e("month"))} className="text-xs" aria-describedby={e("month") ? `${idPrefix}-month-error` : undefined} />
            </Field>
          )}
          {mode === "custom" && (
            <>
              <Field id={`${idPrefix}-from`} label="From" required error={e("from")}>
                <Input id={`${idPrefix}-from`} type="date" disabled={disabled} value={values.from ?? ""} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => set("from", ev.target.value)} error={Boolean(e("from"))} className="text-xs" aria-describedby={e("from") ? `${idPrefix}-from-error` : undefined} />
              </Field>
              <Field id={`${idPrefix}-to`} label="To (inclusive)" required error={e("to")}>
                <Input id={`${idPrefix}-to`} type="date" disabled={disabled} value={values.to ?? ""} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => set("to", ev.target.value)} error={Boolean(e("to"))} className="text-xs" aria-describedby={e("to") ? `${idPrefix}-to-error` : undefined} />
              </Field>
            </>
          )}
        </div>
      )}
      {plain.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{plain.map(renderPlain)}</div>}
    </div>
  );
}
