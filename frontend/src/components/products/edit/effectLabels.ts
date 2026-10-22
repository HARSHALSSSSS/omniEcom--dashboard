import type { ImpactEffect } from "@/types/productEdit";

/** how a channel's effect reads in the impact panel and the save-impact dialog */
export const EFFECT_LABEL: Record<ImpactEffect, string> = {
  name_inherited: "Name inherited",
  description_inherited: "Description inherited",
  brand_inherited: "Brand inherited",
  attribute_inherited: "Attributes inherited",
  type_inherited: "Product type inherited",
  may_need_remapping: "May need remapping",
  independent: "Independently managed",
  not_live: "Not live",
  unaffected: "Unaffected",
};
