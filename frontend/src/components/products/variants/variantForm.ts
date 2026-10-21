import { z } from "zod";
import type { VariantDetail, VariantWritePayload } from "@/types/variants";
import { bpsToPercent, minorToRupees, percentToBps, rupeesToMinor } from "./variantUtils";

const optionRow = z.object({ name: z.string(), value: z.string() });

const amount = (label: string) =>
  z.string().refine((v) => v.trim() === "" || rupeesToMinor(v) !== null, `${label}: enter an amount like 499 or 499.50`);

/** Everything the drawer edits, as the strings the inputs hold. Rupees and percents are converted exactly on submit. */
export const variantFormSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, "SKU is required")
      .max(64, "At most 64 characters")
      .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, "Use letters, digits and . _ - /"),
    barcode: z
      .string()
      .trim()
      .refine((v) => v === "" || (v.length >= 6 && v.length <= 32 && /^[0-9A-Za-z-]+$/.test(v)), "6 to 32 letters, digits or dashes"),
    options: z.array(optionRow),
    mrp: amount("MRP"),
    selling: amount("Selling price"),
    cost: amount("Cost price"),
    tax: z.string().refine((v) => {
      if (v.trim() === "") return true;
      const bps = percentToBps(v);
      return bps !== null && bps <= 4000;
    }, "GST rate must be between 0 and 40"),
    weight: z.string().refine((v) => v.trim() === "" || (/^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 1_000_000), "Whole grams, 1 to 1,000,000"),
    length: z.string(),
    width: z.string(),
    height: z.string(),
    status: z.enum(["active", "inactive"]),
    leadTime: z.string().refine((v) => v.trim() === "" || (/^\d+$/.test(v.trim()) && Number(v) <= 365), "Whole days, 0 to 365"),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.options.forEach((o, i) => {
      const n = o.name.trim();
      const val = o.value.trim();
      // a name without a value is just a pre-filled option the variant does not use: it is left out
      if (!val) return;
      if (!n) ctx.addIssue({ code: "custom", path: ["options", i, "name"], message: "Option name is required" });
      else if (n.length > 40) ctx.addIssue({ code: "custom", path: ["options", i, "name"], message: "At most 40 characters" });
      else if (seen.has(n.toLowerCase())) ctx.addIssue({ code: "custom", path: ["options", i, "name"], message: "Option names must be unique" });
      seen.add(n.toLowerCase());
      if (val.length > 80) ctx.addIssue({ code: "custom", path: ["options", i, "value"], message: "At most 80 characters" });
    });
    const dims = [v.length, v.width, v.height].map((d) => d.trim());
    const filled = dims.filter(Boolean).length;
    if (filled > 0) {
      (["length", "width", "height"] as const).forEach((key, i) => {
        const d = dims[i] ?? "";
        if (!d) ctx.addIssue({ code: "custom", path: [key], message: "Enter all three sides or none" });
        else if (!/^\d+$/.test(d) || Number(d) < 1 || Number(d) > 100_000) ctx.addIssue({ code: "custom", path: [key], message: "Whole mm, 1 to 100,000" });
      });
    }
  });

export type VariantFormValues = z.infer<typeof variantFormSchema>;

export const emptyForm = (optionNames: string[]): VariantFormValues => ({
  sku: "",
  barcode: "",
  options: (optionNames.length ? optionNames : [""]).map((name) => ({ name, value: "" })),
  mrp: "",
  selling: "",
  cost: "",
  tax: "",
  weight: "",
  length: "",
  width: "",
  height: "",
  status: "active",
  leadTime: "",
});

export function formFromDetail(v: VariantDetail, leadTimeDays: number | null): VariantFormValues {
  const options = Object.entries(v.optionValues).map(([name, value]) => ({ name, value }));
  return {
    sku: v.sku,
    barcode: v.barcode ?? "",
    options: options.length ? options : [{ name: "", value: "" }],
    mrp: minorToRupees(v.mrpMinor),
    selling: minorToRupees(v.sellingPriceMinor),
    cost: minorToRupees(v.costPriceMinor),
    tax: bpsToPercent(v.taxRateBps),
    weight: v.weightGrams === null ? "" : String(v.weightGrams),
    length: v.dimensionsMm ? String(v.dimensionsMm.length) : "",
    width: v.dimensionsMm ? String(v.dimensionsMm.width) : "",
    height: v.dimensionsMm ? String(v.dimensionsMm.height) : "",
    status: v.status,
    leadTime: leadTimeDays === null ? "" : String(leadTimeDays),
  };
}

const minorOrNull = (s: string): number | null => (s.trim() === "" ? null : rupeesToMinor(s));

/** the full write model of a (validated) form: money in minor units, empty text = null */
export function payloadFromForm(v: VariantFormValues): Required<VariantWritePayload> {
  const optionValues: Record<string, string> = {};
  for (const o of v.options) if (o.name.trim() && o.value.trim()) optionValues[o.name.trim()] = o.value.trim();
  const dims = [v.length, v.width, v.height].map((d) => d.trim());
  return {
    sku: v.sku.trim(),
    barcode: v.barcode.trim() === "" ? null : v.barcode.trim(),
    optionValues,
    currency: "INR",
    mrpMinor: minorOrNull(v.mrp),
    sellingPriceMinor: minorOrNull(v.selling),
    costPriceMinor: minorOrNull(v.cost),
    taxRateBps: v.tax.trim() === "" ? null : percentToBps(v.tax),
    weightGrams: v.weight.trim() === "" ? null : Number(v.weight),
    dimensionsMm: dims.every(Boolean) ? { length: Number(dims[0]), width: Number(dims[1]), height: Number(dims[2]) } : null,
    status: v.status,
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sortedEntries = (o: Record<string, string>) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b));

/** PATCH body: only the fields that differ from what the server holds (a PATCH never resets untouched fields) */
export function diffFromDetail(v: VariantFormValues, base: VariantDetail): VariantWritePayload {
  const next = payloadFromForm(v);
  const patch: VariantWritePayload = {};
  if (next.sku !== base.sku) patch.sku = next.sku;
  if (next.barcode !== base.barcode) patch.barcode = next.barcode;
  if (!sameJson(sortedEntries(next.optionValues), sortedEntries(base.optionValues))) patch.optionValues = next.optionValues;
  if (next.mrpMinor !== base.mrpMinor) patch.mrpMinor = next.mrpMinor;
  if (next.sellingPriceMinor !== base.sellingPriceMinor) patch.sellingPriceMinor = next.sellingPriceMinor;
  if (next.costPriceMinor !== base.costPriceMinor) patch.costPriceMinor = next.costPriceMinor;
  if (next.taxRateBps !== base.taxRateBps) patch.taxRateBps = next.taxRateBps;
  if (next.weightGrams !== base.weightGrams) patch.weightGrams = next.weightGrams;
  if (!sameJson(next.dimensionsMm, base.dimensionsMm)) patch.dimensionsMm = next.dimensionsMm;
  if (next.status !== base.status) patch.status = next.status;
  return patch;
}

/** create body: unset optional values are left out instead of sent as null */
export function createPayload(v: VariantFormValues): VariantWritePayload {
  const full = payloadFromForm(v);
  const out: VariantWritePayload = { sku: full.sku, optionValues: full.optionValues, currency: "INR", status: full.status };
  if (full.barcode !== null) out.barcode = full.barcode;
  if (full.mrpMinor !== null) out.mrpMinor = full.mrpMinor;
  if (full.sellingPriceMinor !== null) out.sellingPriceMinor = full.sellingPriceMinor;
  if (full.costPriceMinor !== null) out.costPriceMinor = full.costPriceMinor;
  if (full.taxRateBps !== null) out.taxRateBps = full.taxRateBps;
  if (full.weightGrams !== null) out.weightGrams = full.weightGrams;
  if (full.dimensionsMm !== null) out.dimensionsMm = full.dimensionsMm;
  return out;
}

/** "" = leave alone / empty, number = days. For an edit: undefined when it did not change. */
export function leadTimeChange(text: string, before: number | null): number | null | undefined {
  const next = text.trim() === "" ? null : Number(text);
  return next === before ? undefined : next;
}

/** server field path (from details.issues / details.errors / details.field) -> the form field it belongs to */
export function serverFieldToForm(path: string): keyof VariantFormValues | "options" | null {
  const head = path.split(/[.[]/)[0] ?? path;
  switch (head) {
    case "sku":
      return "sku";
    case "barcode":
      return "barcode";
    case "optionValues":
      return "options";
    case "mrpMinor":
      return "mrp";
    case "sellingPriceMinor":
      return "selling";
    case "costPriceMinor":
      return "cost";
    case "taxRateBps":
      return "tax";
    case "weightGrams":
      return "weight";
    case "dimensionsMm":
      return "length";
    case "status":
      return "status";
    case "leadTimeDays":
      return "leadTime";
    default:
      return null;
  }
}
