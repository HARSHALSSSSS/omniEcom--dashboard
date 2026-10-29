import { useState } from "react";
import { ChevronDown, Info, Trash2 } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import type { WarehouseOption } from "@/api/shipping.api";
import { useCreateRule, useUpdateRule } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import type { MethodKind, RuleInput, ShippingMethod, ShippingRule } from "@/types/shipping";
import { BTN_PRIMARY, BTN_SECONDARY, ShippingDrawer } from "./ShippingDrawer";
import { NO_CONFIGURE_REASON, ruleFieldLabel } from "./shippingFormat";

type FieldType = "string" | "number" | "list";
const FIELD_TYPE: Record<string, FieldType> = {
  marketplace: "string",
  warehouse: "string",
  destinationZone: "string",
  destinationState: "string",
  destinationCity: "string",
  destinationPincode: "string",
  orderValueMinor: "number",
  weightGrams: "number",
  sku: "list",
  product: "list",
};
const FIELD_ORDER = ["marketplace", "warehouse", "destinationZone", "destinationState", "destinationCity", "destinationPincode", "orderValueMinor", "product", "sku", "weightGrams"];
const OPS: Record<FieldType, Array<[string, string]>> = {
  string: [
    ["eq", "Equals"],
    ["ne", "Does not equal"],
    ["contains", "Contains"],
    ["in", "Is one of"],
  ],
  number: [
    ["gt", "Greater than"],
    ["gte", "At least"],
    ["lt", "Less than"],
    ["lte", "At most"],
    ["eq", "Equals"],
    ["ne", "Does not equal"],
  ],
  list: [
    ["contains", "Contains"],
    ["in", "Is one of"],
  ],
};

const firstOp = (field: string): string => OPS[FIELD_TYPE[field] ?? "string"][0]?.[0] ?? "eq";

const SELECT = "h-9 sm:h-8 min-h-[36px] sm:min-h-0 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[11px] font-medium text-black focus:border-black focus:outline-none";
const INPUT = "h-9 sm:h-8 min-h-[36px] sm:min-h-0 w-full rounded-lg border border-[#EAEAEA] bg-white px-3 text-[11px] text-black focus:border-black focus:outline-none";

interface Row {
  key: number;
  field: string;
  op: string;
  value: string;
}

/** a stored condition value as the text the editor shows (rupees, kilograms, comma lists) */
function toText(field: string, value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return field === "orderValueMinor" ? String(value / 100) : field === "weightGrams" ? String(value / 1000) : String(value);
  return value === null || value === undefined ? "" : String(value);
}

/** the editor's text back to what the API stores; null when it is not a usable value */
function fromText(field: string, op: string, text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  const type = FIELD_TYPE[field] ?? "string";
  if (type === "number") {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return field === "orderValueMinor" ? Math.round(n * 100) : field === "weightGrams" ? Math.round(n * 1000) : n;
  }
  if (op === "in") {
    const list = t.split(",").map((x) => x.trim()).filter(Boolean);
    return list.length ? list : null;
  }
  return t;
}

const valueLabel = (field: string): string => (field === "orderValueMinor" ? "Value (amount in the business currency)" : field === "weightGrams" ? "Value (kg)" : "Value");

interface RuleDrawerProps {
  open: boolean;
  /** null: create */
  rule: ShippingRule | null;
  canConfigure: boolean;
  channels: ReadonlyArray<{ code: string; name: string }>;
  warehouses: WarehouseOption[];
  methods: ReadonlyArray<ShippingMethod>;
  /** how many rules exist already, to say where the new one lands */
  count: number;
  onClose: () => void;
}

export function RuleDrawer(props: RuleDrawerProps) {
  if (!props.open) return null;
  return <RuleBody key={props.rule?.id ?? "new"} {...props} />;
}

let rowKey = 0;

function RuleBody({ rule, canConfigure, channels, warehouses, methods, count, onClose }: RuleDrawerProps) {
  const create = useCreateRule();
  const update = useUpdateRule();
  const [name, setName] = useState(rule?.name ?? "");
  const [enabled, setEnabled] = useState(rule ? rule.status === "enabled" : true);
  // the design's fixed first two conditions: Marketplace equals / AND Warehouse equals (empty = any). The first of each that is a plain "equals" is shown there when editing.
  const topOf = (field: "marketplace" | "warehouse"): string => {
    const c = rule?.conditions.find((x) => x.field === field && x.op === "eq" && typeof x.value === "string");
    return c ? (c.value as string) : "";
  };
  const [marketplace, setMarketplace] = useState(() => topOf("marketplace"));
  const [warehouse, setWarehouse] = useState(() => topOf("warehouse"));
  const [rows, setRows] = useState<Row[]>(() => {
    if (!rule) return [{ key: ++rowKey, field: "orderValueMinor", op: "gt", value: "" }];
    let skipMk = topOf("marketplace") !== "";
    let skipWh = topOf("warehouse") !== "";
    return rule.conditions
      .filter((c) => {
        if (skipMk && c.field === "marketplace" && c.op === "eq" && typeof c.value === "string") return (skipMk = false);
        if (skipWh && c.field === "warehouse" && c.op === "eq" && typeof c.value === "string") return (skipWh = false);
        return true;
      })
      .map((c) => ({ key: ++rowKey, field: c.field, op: c.op, value: toText(c.field, c.value) }));
  });
  const [prefer, setPrefer] = useState<string>(rule ? (rule.then.prefer.providerId ? `third_party:${rule.then.prefer.providerId}` : rule.then.prefer.kind) : "marketplace");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const thirdParty = methods.filter((m) => m.kind === "third_party");
  const patchRow = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (field: string) => setRows((prev) => [...prev, { key: ++rowKey, field, op: firstOp(field), value: "" }]);

  const nameOk = name.trim().length >= 2;
  const parsed = rows.map((r) => ({ field: r.field, op: r.op, value: fromText(r.field, r.op, r.value) }));
  const top = [...(marketplace ? [{ field: "marketplace", op: "eq", value: marketplace }] : []), ...(warehouse ? [{ field: "warehouse", op: "eq", value: warehouse }] : [])];
  const valuesOk = parsed.every((p) => p.value !== null) && top.length + parsed.length > 0;
  const busy = create.isPending || update.isPending;

  const save = () => {
    setTouched(true);
    setError(null);
    if (!nameOk || !valuesOk) return;
    const [kind, providerId] = prefer.split(":") as [MethodKind, string | undefined];
    const input: RuleInput = { name: name.trim(), enabled, conditions: [...top, ...parsed], then: { prefer: { kind, providerId: providerId ?? null } } };
    const done = {
      onSuccess: () => {
        toast({ title: rule ? "Rule saved" : "Rule created", variant: "success" });
        onClose();
      },
      onError: (e: unknown) => setError(isApiError(e) && e.fields ? Object.values(e.fields).join(" ") : errorMessage(e)),
    };
    if (rule) update.mutate({ id: rule.id, input }, done);
    else create.mutate(input, done);
  };

  return (
    <ShippingDrawer
      open
      eyebrow="Create / edit rule"
      title={rule ? "Edit Shipping Rule" : "Create Shipping Rule"}
      subtitle="Choose a condition before configuring its value."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={save} disabled={!canConfigure || busy} title={canConfigure ? undefined : NO_CONFIGURE_REASON} className={BTN_PRIMARY}>
            {busy ? "Saving..." : "Save Rule"}
          </button>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Cancel
          </button>
        </>
      }
    >
      <label className="block space-y-1.5 text-[11px] text-[#666666]">
        <span>Rule name</span>
        <input aria-label="Rule name" value={name} maxLength={120} placeholder="e.g. Flipkart · Mumbai preference" onChange={(e) => setName(e.target.value)} className={`${INPUT} h-9 text-[12px]`} />
        {touched && !nameOk && <span className="block text-[10px] text-[#DC2626]">Give the rule a name of at least 2 characters.</span>}
      </label>

      <span className="block text-[10px] font-bold uppercase tracking-wider text-[#666666]">WHEN</span>

      <div className="space-y-1.5">
        <label className="text-[11px] text-[#666666]" htmlFor="rule-marketplace">
          Marketplace · Equals
        </label>
        <div className="relative">
          <select id="rule-marketplace" aria-label="Marketplace" value={marketplace} onChange={(e) => setMarketplace(e.target.value)} className="h-9 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[12px] font-medium text-black focus:border-black focus:outline-none">
            <option value="">Any marketplace</option>
            {channels.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
            {marketplace && !channels.some((c) => c.code === marketplace) && <option value={marketplace}>{marketplace}</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#666666]" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-[#666666]" htmlFor="rule-warehouse">
          AND Warehouse · Equals
        </label>
        <div className="relative">
          <select id="rule-warehouse" aria-label="Warehouse" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="h-9 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[12px] font-medium text-black focus:border-black focus:outline-none">
            <option value="">Any warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.code}>
                {w.name}
              </option>
            ))}
            {warehouse && !warehouses.some((w) => w.code === warehouse) && <option value={warehouse}>{warehouse}</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#666666]" />
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const type = FIELD_TYPE[r.field] ?? "string";
          const bad = touched && fromText(r.field, r.op, r.value) === null;
          return (
            <div key={r.key} className="space-y-3 rounded-xl border border-[#EAEAEA] bg-[#FAF9F7] p-3.5" role="group" aria-label={`Condition ${i + 1}`}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium text-[#666666]">AND Condition field</label>
                <button
                  type="button"
                  aria-label={`Remove condition ${i + 1}`}
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  className="rounded p-1 text-[#DC2626] hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="relative">
                <select
                  aria-label={`Field ${i + 1}`}
                  value={r.field}
                  onChange={(e) => patchRow(r.key, { field: e.target.value, op: firstOp(e.target.value), value: "" })}
                  className={SELECT}
                >
                  {FIELD_ORDER.map((f) => (
                    <option key={f} value={f}>
                      {ruleFieldLabel(f)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-[#666666]" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[#666666]">Condition</label>
                <div className="relative">
                  <select aria-label={`Operator ${i + 1}`} value={r.op} onChange={(e) => patchRow(r.key, { op: e.target.value, value: "" })} className={SELECT}>
                    {OPS[type].map(([op, text]) => (
                      <option key={op} value={op}>
                        {text}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-[#666666]" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[#666666]">{valueLabel(r.field)}</label>
                {r.field === "destinationZone" && (r.op === "eq" || r.op === "ne") ? (
                  <div className="relative">
                    <select aria-label={`Value ${i + 1}`} value={r.value} onChange={(e) => patchRow(r.key, { value: e.target.value })} className={SELECT}>
                      <option value="">Choose…</option>
                      <option value="local">Local (same city)</option>
                      <option value="regional">Regional (same postal region)</option>
                      <option value="national">National</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-[#666666]" />
                  </div>
                ) : (r.field === "marketplace" || r.field === "warehouse") && r.op === "eq" ? (
                  <div className="relative">
                    <select aria-label={`Value ${i + 1}`} value={r.value} onChange={(e) => patchRow(r.key, { value: e.target.value })} className={SELECT}>
                      <option value="">Choose…</option>
                      {r.field === "marketplace"
                        ? channels.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.name}
                            </option>
                          ))
                        : warehouses.map((w) => (
                            <option key={w.id} value={w.code}>
                              {w.name}
                            </option>
                          ))}
                      {r.value && !(r.field === "marketplace" ? channels.some((c) => c.code === r.value) : warehouses.some((w) => w.code === r.value)) && <option value={r.value}>{r.value}</option>}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-[#666666]" />
                  </div>
                ) : (
                  <input
                    aria-label={`Value ${i + 1}`}
                    value={r.value}
                    inputMode={type === "number" ? "decimal" : undefined}
                    placeholder={r.op === "in" ? "Comma separated, e.g. MH, GJ" : undefined}
                    onChange={(e) => patchRow(r.key, { value: e.target.value })}
                    className={INPUT}
                  />
                )}
                {bad && <span className="block text-[10px] text-[#DC2626]">{type === "number" ? "Enter a number." : "Enter a value."}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {touched && top.length + rows.length === 0 && <p className="text-[10px] text-[#DC2626]">Choose a marketplace or a warehouse, or add a condition.</p>}

      <div className="space-y-2 pt-1">
        <span className="block text-[11px] font-semibold text-black">Add a condition</span>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_ORDER.map((f) => (
            <button key={f} type="button" onClick={() => addRow(f)} className="rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1 text-[11px] text-[#666666] transition-colors hover:border-black hover:text-black">
              {ruleFieldLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-[#EAEAEA] pt-3">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-[#666666]">THEN</span>
        <div className="space-y-1.5">
          <label className="text-[11px] text-[#666666]" htmlFor="prefer-method">
            Preferred shipping method
          </label>
          <div className="relative">
            <select
              id="prefer-method"
              value={prefer}
              onChange={(e) => setPrefer(e.target.value)}
              className="h-9 w-full appearance-none rounded-lg border border-[#EAEAEA] bg-white px-3 pr-8 text-[12px] font-medium text-black focus:border-black focus:outline-none"
            >
              <option value="marketplace">Marketplace shipping</option>
              <option value="seller">Seller shipping</option>
              <option value="third_party">Third-party provider (any)</option>
              {thirdParty.map((m) => (
                <option key={m.id} value={`third_party:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#666666]" />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-black">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-3 w-3 accent-black" />
          Enable this rule
        </label>

        <div className="flex items-center gap-2 rounded-lg border border-[#EAEAEA] bg-[#FAF9F7] p-3 text-[11px] text-[#666666]">
          <Info className="h-4 w-4 shrink-0 text-[#666666]" />
          <span>Manual override remains available where supported.{!rule && ` The new rule is evaluated last (priority ${count + 1}).`}</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-[#FECACA] bg-[#FFF8F8] p-3 text-[11px] text-[#B91C1C]">
          {error}
        </p>
      )}
    </ShippingDrawer>
  );
}
