import { z } from 'zod';
import { CURRENCY_UNITS, DUPLICATE_STRATEGIES } from './catalogue';

export const ImportSettingsSchema = z.object({
  duplicateStrategy: z.enum(DUPLICATE_STRATEGIES),
  assignAllChannels: z.boolean(),
  accountIds: z.array(z.uuid()).max(50),
  autoPublish: z.boolean().describe('Create draft listings for the imported variants (publishing stays with the listings workspace)'),
  warehouseId: z.uuid().nullable().describe('Warehouse that receives the stock column; the default warehouse when empty'),
  defaultCategoryId: z.uuid().nullable().describe('Used for rows without a (recognised) category'),
  currencyUnit: z.enum(CURRENCY_UNITS).describe('Whether price columns are in rupees (499.50) or paise (49950)'),
}).meta({ id: 'ImportSettings' });

export type ImportSettings = z.infer<typeof ImportSettingsSchema>;

export const DEFAULT_SETTINGS: ImportSettings = {
  duplicateStrategy: 'skip', assignAllChannels: false, accountIds: [], autoPublish: false, warehouseId: null, defaultCategoryId: null, currencyUnit: 'rupees',
};

/** stored settings (a partial jsonb) with the defaults filled in */
export const readSettings = (stored: Record<string, unknown>): ImportSettings => {
  const parsed = ImportSettingsSchema.partial().safeParse(stored);
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) } as ImportSettings;
};
