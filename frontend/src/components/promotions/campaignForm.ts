import { z } from "zod";
import type { ApiError } from "@/api/errors";
import { PROMOTION_TYPES, type CampaignWrite, type PromotionCampaign } from "@/types/promotions";
import { bpsToInput, isoToLocalInput, localInputToIso, minorToInput, parseBps, parseMinor } from "./promoFormat";

/** the form keeps everything as the seller typed it; strings are parsed into integers on save (no float math on money) */
export interface CampaignFormValues {
  name: string;
  code: string;
  description: string;
  type: (typeof PROMOTION_TYPES)[number];
  percent: string;
  flat: string;
  buyQuantity: string;
  getQuantity: string;
  minOrder: string;
  budget: string;
  startsAt: string;
  endsAt: string;
  accountIds: string[];
}

export const EMPTY_FORM: CampaignFormValues = {
  name: "",
  code: "",
  description: "",
  type: "percentage_discount",
  percent: "",
  flat: "",
  buyQuantity: "",
  getQuantity: "",
  minOrder: "",
  budget: "",
  startsAt: "",
  endsAt: "",
  accountIds: [],
};

const WHOLE = /^\d{1,2}$/;

export const campaignFormSchema = z
  .object({
    name: z.string().trim().min(1, "Give the campaign a name").max(120, "At most 120 characters"),
    code: z
      .string()
      .trim()
      .refine((v) => v === "" || (v.length >= 3 && v.length <= 32 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v)), "3 to 32 letters, digits, - or _"),
    description: z.string().trim().max(1000, "At most 1000 characters"),
    type: z.enum(PROMOTION_TYPES),
    percent: z.string(),
    flat: z.string(),
    buyQuantity: z.string(),
    getQuantity: z.string(),
    minOrder: z.string(),
    budget: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    accountIds: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const add = (path: keyof CampaignFormValues, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    const usesPercent = v.type === "percentage_discount" || v.type === "bundle";
    if (usesPercent) {
      const bps = parseBps(v.percent);
      if (v.percent.trim() === "") add("percent", "Enter the discount percentage");
      else if (bps === null) add("percent", "Use a number with at most two decimals");
      else if (bps < 1 || bps > 9500) add("percent", "Between 0.01% and 95%");
    }
    if (v.type === "flat_discount") {
      const minor = parseMinor(v.flat);
      if (v.flat.trim() === "") add("flat", "Enter the amount off");
      else if (minor === null) add("flat", "Use an amount with at most two decimals");
      else if (minor < 1) add("flat", "Must be more than zero");
    }
    if (v.type === "bogo" || v.type === "bundle") {
      const [min, max] = v.type === "bundle" ? [2, 10] : [1, 10];
      const buy = WHOLE.test(v.buyQuantity.trim()) ? Number(v.buyQuantity) : null;
      if (buy === null || buy < min || buy > max) add("buyQuantity", v.type === "bundle" ? "A bundle has 2 to 10 items" : "Between 1 and 10");
      if (v.type === "bogo") {
        const get = WHOLE.test(v.getQuantity.trim()) ? Number(v.getQuantity) : null;
        if (get === null || get < 1 || get > 10) add("getQuantity", "Between 1 and 10");
      }
    }
    if (v.minOrder.trim() !== "" && parseMinor(v.minOrder) === null) add("minOrder", "Use an amount with at most two decimals");
    if (v.budget.trim() !== "" && parseMinor(v.budget) === null) add("budget", "Use an amount with at most two decimals");
    const start = v.startsAt ? localInputToIso(v.startsAt) : null;
    const end = v.endsAt ? localInputToIso(v.endsAt) : null;
    if (v.startsAt && !start) add("startsAt", "Enter a valid date and time");
    if (v.endsAt && !end) add("endsAt", "Enter a valid date and time");
    if (start && end && Date.parse(end) <= Date.parse(start)) add("endsAt", "The end must be after the start");
  });

export function formFromCampaign(c: PromotionCampaign): CampaignFormValues {
  return {
    name: c.name,
    code: c.code,
    description: c.description ?? "",
    type: c.type,
    percent: c.valueBps === null ? "" : bpsToInput(c.valueBps),
    flat: c.valueMinor === null ? "" : minorToInput(c.valueMinor),
    buyQuantity: c.buyQuantity === null ? "" : String(c.buyQuantity),
    getQuantity: c.getQuantity === null ? "" : String(c.getQuantity),
    minOrder: c.minOrderMinor > 0 ? minorToInput(c.minOrderMinor) : "",
    budget: c.budgetMinor > 0 ? minorToInput(c.budgetMinor) : "",
    startsAt: isoToLocalInput(c.startsAt),
    endsAt: isoToLocalInput(c.endsAt),
    accountIds: c.accountIds,
  };
}

/** the request body; unused discount fields are sent as null so a type change starts clean */
export function toCampaignWrite(v: CampaignFormValues): CampaignWrite {
  const percent = v.type === "percentage_discount" || v.type === "bundle";
  return {
    name: v.name.trim(),
    ...(v.code.trim() ? { code: v.code.trim() } : {}),
    description: v.description.trim() || null,
    type: v.type,
    valueBps: percent ? parseBps(v.percent) : null,
    valueMinor: v.type === "flat_discount" ? parseMinor(v.flat) : null,
    buyQuantity: v.type === "bogo" || v.type === "bundle" ? Number(v.buyQuantity) : null,
    getQuantity: v.type === "bogo" ? Number(v.getQuantity) : null,
    minOrderMinor: v.minOrder.trim() ? (parseMinor(v.minOrder) ?? 0) : 0,
    budgetMinor: v.budget.trim() ? (parseMinor(v.budget) ?? 0) : 0,
    startsAt: v.startsAt ? localInputToIso(v.startsAt) : null,
    endsAt: v.endsAt ? localInputToIso(v.endsAt) : null,
    accountIds: v.accountIds,
  };
}

/** server field names to the form's field names (the discount value has one input per type) */
export function formFieldOf(path: string): keyof CampaignFormValues | null {
  switch (path) {
    case "valueBps":
      return "percent";
    case "valueMinor":
      return "flat";
    case "minOrderMinor":
      return "minOrder";
    case "budgetMinor":
      return "budget";
    case "name":
    case "code":
    case "description":
    case "buyQuantity":
    case "getQuantity":
    case "startsAt":
    case "endsAt":
    case "accountIds":
    case "type":
      return path;
    default:
      return null;
  }
}

/** field errors from a 400/422 (`details.issues`) as form errors, plus the duplicate-code conflict */
export function serverFieldErrors(e: ApiError): Array<{ field: keyof CampaignFormValues; message: string }> {
  const out: Array<{ field: keyof CampaignFormValues; message: string }> = [];
  for (const [path, message] of Object.entries(e.fields ?? {})) {
    const field = formFieldOf(path);
    if (field) out.push({ field, message });
  }
  if (e.rule === "duplicate_code") out.push({ field: "code", message: "This code is already used by another campaign" });
  if (e.rule === "invalid_window") out.push({ field: "endsAt", message: "The end must be after the start" });
  return out;
}
