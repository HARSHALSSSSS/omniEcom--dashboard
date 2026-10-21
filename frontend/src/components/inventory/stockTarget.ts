import type { LedgerRow, VariantPanel } from "@/types/inventory";

/** what the Adjust and Transfer dialogs need to know about the variant they act on */
export interface StockTarget {
  variantId: string;
  sku: string;
  title: string;
  available: number;
  /** stock per warehouse (the dialogs check removals and transfers against it) */
  locations: Array<{ warehouseId: string; name: string; available: number }>;
}

export const targetOfRow = (row: LedgerRow): StockTarget => ({
  variantId: row.variantId,
  sku: row.sku,
  title: row.title,
  available: row.available,
  locations: row.warehouses.map((w) => ({ warehouseId: w.warehouseId, name: w.warehouseName, available: w.available })),
});

export const targetOfPanel = (panel: VariantPanel): StockTarget => ({
  variantId: panel.product.variantId,
  sku: panel.product.sku,
  title: panel.product.title,
  available: panel.snapshot.available,
  locations: panel.byLocation.map((l) => ({ warehouseId: l.warehouseId, name: l.name, available: l.available })),
});
