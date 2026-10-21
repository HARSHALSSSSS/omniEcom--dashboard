import { z } from "zod";
import type { ApiError } from "@/api/errors";
import type { SpendRow, SpendWrite } from "@/types/profitability";
import { inputToMinor, isRealDay, minorToInput } from "./profitFormat";

/** the most one row can hold (INR 1,000,000,000.00): the API's own limit */
export const MAX_SPEND_MINOR = 100_000_000_000;
export const NOT_TIED = "";

/** the form keeps what was typed; the amount is parsed into integer paise on save (no float math on money) */
export interface SpendFormValues {
  spendDate: string;
  accountId: string;
  amount: string;
  campaign: string;
  notes: string;
}

export const emptySpendForm = (today: string): SpendFormValues => ({ spendDate: today, accountId: NOT_TIED, amount: "", campaign: "", notes: "" });

export const formFromSpend = (r: SpendRow): SpendFormValues => ({
  spendDate: r.spendDate,
  accountId: r.accountId ?? NOT_TIED,
  amount: minorToInput(r.amountMinor),
  campaign: r.campaign ?? "",
  notes: r.notes ?? "",
});

export const spendFormSchema = z.object({
  spendDate: z.string().refine((v) => isRealDay(v), "Pick a real date"),
  accountId: z.string(),
  amount: z.string().superRefine((v, ctx) => {
    if (v.trim() === "") return ctx.addIssue({ code: "custom", message: "Enter the amount spent (0 means no ads that day)" });
    const minor = inputToMinor(v);
    if (minor === null) return ctx.addIssue({ code: "custom", message: "Use a plain amount with at most two decimals, e.g. 1250.50" });
    if (minor > MAX_SPEND_MINOR) ctx.addIssue({ code: "custom", message: "That is more than one row can hold" });
  }),
  campaign: z.string().trim().max(200, "At most 200 characters"),
  notes: z.string().trim().max(500, "At most 500 characters"),
});

export function toSpendWrite(v: SpendFormValues): SpendWrite {
  return {
    spendDate: v.spendDate,
    accountId: v.accountId === NOT_TIED ? null : v.accountId,
    amountMinor: inputToMinor(v.amount) ?? 0,
    campaign: v.campaign.trim() === "" ? null : v.campaign.trim(),
    notes: v.notes.trim() === "" ? null : v.notes.trim(),
  };
}

const FIELDS: Record<string, keyof SpendFormValues> = { spendDate: "spendDate", accountId: "accountId", amountMinor: "amount", campaign: "campaign", notes: "notes" };

/** API field paths (400 issues, or `details.field` of a rule such as future_date) mapped onto form fields */
export function serverFieldErrors(e: ApiError): Array<{ field: keyof SpendFormValues; message: string }> {
  const out = new Map<keyof SpendFormValues, string>();
  const ruleField = typeof e.details?.field === "string" ? e.details.field : null;
  if (ruleField && FIELDS[ruleField]) out.set(FIELDS[ruleField], e.message);
  for (const [path, message] of Object.entries(e.fields ?? {})) {
    const field = FIELDS[path];
    if (field && !out.has(field)) out.set(field, message);
  }
  return [...out].map(([field, message]) => ({ field, message }));
}
