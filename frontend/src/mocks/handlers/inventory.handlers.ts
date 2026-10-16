import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import {
  initialInventoryKPIs,
  initialInventoryItems,
  initialStockMovements,
} from "@/mocks/data/inventory.data";
import { InventoryItem, StockMovement } from "@/types/inventory";

let inventoryItems: InventoryItem[] = [...initialInventoryItems];
const stockMovements: StockMovement[] = [...initialStockMovements];

export const inventoryHandlers = [
  // Summary KPIs
  http.get(ENDPOINTS.INVENTORY_SUMMARY, async () => {
    await delay(150);
    const healthy = inventoryItems.filter((i) => i.healthStatus === "healthy").length;
    const low = inventoryItems.filter((i) => i.healthStatus === "low_stock").length;
    const out = inventoryItems.filter((i) => i.healthStatus === "out_of_stock").length;
    const excess = inventoryItems.filter((i) => i.healthStatus === "excess").length;

    return HttpResponse.json({
      data: {
        ...initialInventoryKPIs,
        healthySkus: healthy,
        lowStockSkus: low,
        outOfStockSkus: out,
        excessStockSkus: excess,
        totalSkus: inventoryItems.length,
      },
    });
  }),

  // Inventory Ledger / Table
  http.get(ENDPOINTS.INVENTORY_LEDGER, async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");

    let filtered = [...inventoryItems];
    if (status && status !== "all") {
      filtered = filtered.filter((i) => i.healthStatus === status);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          i.barcode?.toLowerCase().includes(q),
      );
    }

    return HttpResponse.json({
      data: filtered,
      meta: { total: filtered.length },
    });
  }),

  // Stock Movements / Activity
  http.get(ENDPOINTS.INVENTORY_MOVEMENTS, async () => {
    await delay(150);
    return HttpResponse.json({
      data: stockMovements,
      meta: { total: stockMovements.length },
    });
  }),

  // Adjust stock
  http.post(ENDPOINTS.INVENTORY_ADJUST, async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as {
      sku: string;
      warehouseId: string;
      reason: string;
      quantityDelta: number;
      notes?: string;
    };

    inventoryItems = inventoryItems.map((item) => {
      if (item.sku === body.sku) {
        const newAvailable = Math.max(0, item.totalAvailable + body.quantityDelta);
        const newOnHand = Math.max(0, item.totalOnHand + body.quantityDelta);
        const health =
          newAvailable === 0
            ? "out_of_stock"
            : newAvailable <= 15
              ? "low_stock"
              : "healthy";

        return {
          ...item,
          totalAvailable: newAvailable,
          totalOnHand: newOnHand,
          healthStatus: health,
          lastMovementAt: new Date().toISOString(),
        };
      }
      return item;
    });

    const targetItem = inventoryItems.find((i) => i.sku === body.sku);

    const newMovement: StockMovement = {
      id: `mov-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      sku: body.sku,
      productTitle: targetItem?.title ?? body.sku,
      type: "manual_adjustment",
      quantityDelta: body.quantityDelta,
      resultingAvailable: targetItem?.totalAvailable ?? 0,
      warehouseName: "Delhi Central Hub",
      reason: body.reason,
      operator: "Abhishek Sharma (Merchant Owner)",
    };
    stockMovements.unshift(newMovement);

    return HttpResponse.json({
      data: {
        success: true,
        item: targetItem,
        movement: newMovement,
      },
    });
  }),

  // Transfer stock
  http.post(ENDPOINTS.INVENTORY_TRANSFER, async ({ request }) => {
    await delay(350);
    const body = (await request.json()) as {
      sku: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
    };

    const targetItem = inventoryItems.find((i) => i.sku === body.sku);

    const newMovement: StockMovement = {
      id: `mov-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      sku: body.sku,
      productTitle: targetItem?.title ?? body.sku,
      type: "transfer",
      quantityDelta: body.quantity,
      resultingAvailable: targetItem?.totalAvailable ?? 0,
      warehouseName: "Inter-Warehouse Transfer",
      operator: "Logistics Dispatcher",
    };
    stockMovements.unshift(newMovement);

    return HttpResponse.json({
      data: { success: true, movement: newMovement },
    });
  }),

  // Inventory sync trigger across channels
  http.post(ENDPOINTS.INVENTORY_SYNC, async () => {
    await delay(450);
    return HttpResponse.json({
      data: {
        success: true,
        syncedChannels: ["amazon", "flipkart", "meesho", "shopify"],
        syncedSkusCount: inventoryItems.length,
        timestamp: new Date().toISOString(),
      },
    });
  }),
];
