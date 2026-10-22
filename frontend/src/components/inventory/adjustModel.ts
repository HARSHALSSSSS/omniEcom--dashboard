import { formatNumber } from "@/utils/format";
import type { AdjustDirection, AdjustmentType, BulkParams } from "@/types/inventory";

export const ADJUST_TYPES: ReadonlyArray<{ id: AdjustmentType; label: string; reason: string }> = [
  { id: "damage", label: "Damage", reason: "Damaged units" },
  { id: "return", label: "Return", reason: "Customer return" },
  { id: "correction", label: "Correction", reason: "Cycle count correction" },
  { id: "manual", label: "Manual adjustment", reason: "Manual adjustment" },
  { id: "shrinkage", label: "Shrinkage", reason: "Inventory shrinkage" },
  { id: "other", label: "Other", reason: "" },
];

export interface AdjustFormState {
  type: AdjustmentType;
  direction: AdjustDirection;
  qty: string;
  reason: string;
  note: string;
  /** return only: sellable immediately instead of held for inspection */
  restock: boolean;
}

export const initialAdjustState = (): AdjustFormState => ({ type: "damage", direction: "decrease", qty: "", reason: "Damaged units", note: "", restock: false });

/** picking a type fills in its default reason and the direction that usually goes with it */
export function withType(state: AdjustFormState, type: AdjustmentType): AdjustFormState {
  const previous = ADJUST_TYPES.find((t) => t.id === state.type)?.reason ?? "";
  const next = ADJUST_TYPES.find((t) => t.id === type)?.reason ?? "";
  const keepReason = state.reason.trim() !== "" && state.reason !== previous;
  return { ...state, type, direction: type === "damage" || type === "shrinkage" ? "decrease" : "increase", reason: keepReason ? state.reason : next };
}

/** a return always adds units and shrinkage (a loss) always removes them; every other type has a direction */
export const hasDirection = (type: AdjustmentType) => type !== "return" && type !== "shrinkage";
export const effectiveDirection = (s: AdjustFormState): AdjustDirection => (s.type === "return" ? "increase" : s.type === "shrinkage" ? "decrease" : s.direction);

export const parseQty = (qty: string): number => (/^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN);

/** what is wrong with the quantity, or null; `availableHere` null = not known (bulk: the server checks each product) */
export function qtyProblem(s: AdjustFormState, availableHere: number | null): string | null {
  if (s.qty.trim() === "") return null;
  const n = parseQty(s.qty);
  if (!Number.isInteger(n) || n < 1) return "Enter a whole number of units, 1 or more";
  if (n > 10_000_000) return "That is too many units";
  if (availableHere !== null && effectiveDirection(s) === "decrease" && n > availableHere) return `Only ${formatNumber(availableHere)} units are available to remove in this warehouse`;
  return null;
}

export function noteProblem(s: AdjustFormState): string | null {
  return s.type === "other" && s.note.trim() === "" ? "Add a note to say what this adjustment is" : null;
}

export const reasonProblem = (s: AdjustFormState): string | null => (s.reason.trim().length < 2 ? "Give a reason of at least 2 characters" : null);

export function isAdjustReady(s: AdjustFormState, availableHere: number | null): boolean {
  return s.qty.trim() !== "" && qtyProblem(s, availableHere) === null && noteProblem(s) === null && reasonProblem(s) === null;
}

/** the fields every adjustment body shares (single product and bulk) */
export function adjustFields(s: AdjustFormState): Required<Pick<BulkParams, "type" | "quantity" | "reason">> & Pick<BulkParams, "direction" | "note" | "disposition"> {
  return {
    type: s.type,
    quantity: parseQty(s.qty),
    reason: s.reason.trim(),
    ...(hasDirection(s.type) ? { direction: s.direction } : {}),
    ...(s.note.trim() ? { note: s.note.trim() } : {}),
    ...(s.type === "return" ? { disposition: s.restock ? ("restock" as const) : ("hold" as const) } : {}),
  };
}

