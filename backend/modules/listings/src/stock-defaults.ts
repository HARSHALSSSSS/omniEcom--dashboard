import { eq, schema, type Tx } from '@oms/database';
import { resolveSettings } from '@oms/mod-vendors';

/** the workspace stock cushions of Settings > Inventory: a share of the stock and a floor of units kept back from every channel */
export interface StockDefaults { bufferPercent: number; minSafetyUnits: number }

export async function stockDefaults(tx: Tx, vendorId: string): Promise<StockDefaults> {
  const [v] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const s = resolveSettings(v?.settings);
  return { bufferPercent: s.operations.defaultInventoryBufferPercent, minSafetyUnits: s.inventory.minSafetyStockUnits };
}

/** what the channels may share: available stock less the global buffer percent, less the minimum safety units (never below zero) */
export const afterWorkspaceBuffer = (available: number, d: StockDefaults): number =>
  Math.max(0, Math.floor((Math.max(0, available) * (100 - Math.min(100, Math.max(0, d.bufferPercent)))) / 100) - Math.max(0, d.minSafetyUnits));
