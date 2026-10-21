import type { PickerVariant, ProductSelection } from "@/types/promotions";

export type SelectionMode = "variants" | "categories" | "all";

export interface SelectorValue {
  mode: SelectionMode;
  variants: PickerVariant[];
  categoryIds: string[];
}

export const EMPTY_SELECTION: SelectorValue = { mode: "variants", variants: [], categoryIds: [] };

export const isEmptySelection = (v: SelectorValue): boolean => v.mode !== "all" && (v.mode === "variants" ? v.variants.length === 0 : v.categoryIds.length === 0);

/** the API's selection for the picked mode; undefined when nothing is picked */
export function toSelection(v: SelectorValue): ProductSelection | undefined {
  if (v.mode === "all") return { allActive: true };
  if (v.mode === "categories") return v.categoryIds.length ? { categoryIds: v.categoryIds } : undefined;
  return v.variants.length ? { variantIds: v.variants.map((x) => x.id) } : undefined;
}
