import { z } from "zod";

export type StockHealthStatus = "healthy" | "low_stock" | "out_of_stock" | "excess";

export interface WarehouseLocationStock {
  warehouseId: string;
  warehouseName: string;
  city: string;
  onHand: number;
  reserved: number;
  available: number;
  safetyStock: number;
}

export interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  category: string;
  imageUrl?: string;
  barcode?: string;
  totalAvailable: number;
  totalReserved: number;
  totalOnHand: number;
  incomingUnits: number;
  coverageDays: number;
  dailyVelocity: number; // units sold per day
  healthStatus: StockHealthStatus;
  lastMovementAt: string;
  channelAllocations: {
    amazon: number;
    flipkart: number;
    meesho: number;
    shopify: number;
    buffer: number;
  };
  warehouses: WarehouseLocationStock[];
}

export interface StockMovement {
  id: string;
  timestamp: string;
  sku: string;
  productTitle: string;
  type: "order_deduction" | "manual_adjustment" | "transfer" | "inward_po" | "return_restock";
  quantityDelta: number;
  resultingAvailable: number;
  warehouseName: string;
  referenceId?: string;
  reason?: string;
  operator: string;
}

export interface InventorySummaryKPIs {
  totalSkus: number;
  totalUnitsAvailable: number;
  healthySkus: number;
  lowStockSkus: number;
  outOfStockSkus: number;
  excessStockSkus: number;
  stockoutRiskCount: number;
  totalValuationPaise: number;
  syncFreshness: string;
}

export const adjustStockSchema = z.object({
  sku: z.string(),
  warehouseId: z.string(),
  reason: z.enum(["audit_correction", "damaged", "shrinkage", "manual_addition"]),
  quantityDelta: z.number().int(),
  notes: z.string().optional(),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const transferStockSchema = z.object({
  sku: z.string(),
  fromWarehouseId: z.string(),
  toWarehouseId: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});
export type TransferStockInput = z.infer<typeof transferStockSchema>;

export const bulkStockOperationSchema = z.object({
  skus: z.array(z.string()),
  operation: z.enum(["set_buffer", "sync_channels", "recalculate_velocity"]),
  bufferPct: z.number().min(0).max(100).optional(),
});
export type BulkStockOperationInput = z.infer<typeof bulkStockOperationSchema>;
