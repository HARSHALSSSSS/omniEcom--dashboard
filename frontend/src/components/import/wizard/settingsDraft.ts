import type { DuplicateStrategy, ImportOptions, ImportSettings } from "@/types/import";

/** what the seller picks in "Duplicate handling" (the design's three choices) */
export type DuplicateChoice = "update" | "create_only" | "ask";

/**
 * "Update matching products" -> update; "Ask me when a match is found" -> ask (each match becomes a decision in the review);
 * "Create new products only" -> skip: rows whose SKU already exists are left untouched, only new products are created.
 * The other API strategies (create_new, create_variant_for_new_sku) have no design option: none is selected for them.
 */
export const choiceToStrategy = (choice: DuplicateChoice): DuplicateStrategy => (choice === "update" ? "update" : choice === "ask" ? "ask" : "skip");
export const strategyToChoice = (strategy: DuplicateStrategy): DuplicateChoice | null =>
  strategy === "update" ? "update" : strategy === "ask" ? "ask" : strategy === "skip" ? "create_only" : null;

/** the settings of an import with the three optional switches resolved (they default to on) */
export type SettingsDraft = ImportSettings & { includeImages: boolean; includeQuantities: boolean; matchVariants: boolean };

export function toDraft(settings: ImportSettings): SettingsDraft {
  return { ...settings, includeImages: settings.includeImages ?? true, includeQuantities: settings.includeQuantities ?? true, matchVariants: settings.matchVariants ?? true };
}

/** the draft listings need an account (or all accounts) before the settings can be saved */
export const settingsIncomplete = (d: SettingsDraft): boolean => d.autoPublish && !d.assignAllChannels && d.accountIds.length === 0;

export const draftFromOptions = (options: ImportOptions | undefined): SettingsDraft | null => (options ? toDraft(options.defaults) : null);

const KEYS: Array<keyof SettingsDraft> = ["duplicateStrategy", "assignAllChannels", "autoPublish", "warehouseId", "defaultCategoryId", "currencyUnit", "includeImages", "includeQuantities", "matchVariants"];

/** only what differs from the saved settings (undefined when nothing does) */
export function draftPatch(draft: SettingsDraft, saved: ImportSettings): Partial<ImportSettings> | undefined {
  const base = toDraft(saved);
  const patch: Record<string, unknown> = {};
  for (const key of KEYS) if (draft[key] !== base[key]) patch[key] = draft[key];
  const accounts = draft.autoPublish && !draft.assignAllChannels ? draft.accountIds : [];
  if (accounts.length !== base.accountIds.length || !accounts.every((id) => base.accountIds.includes(id))) patch.accountIds = accounts;
  return Object.keys(patch).length > 0 ? (patch as Partial<ImportSettings>) : undefined;
}
