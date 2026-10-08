import { manifest } from './manifest';
import { warehouseRoutes } from './routes';

export { manifest };
export { warehouseRoutes, WarehouseSchema } from './routes';
export { allocationOrder, createWarehouse, getWarehouseRow, listWarehouses, toWarehouseDto, type WarehouseRow } from './service';

/** Warehouses: vendor fulfilment locations (default / priority / activation). Stock itself lives in the Inventory module. */
export const warehousesModule = { manifest, routes: warehouseRoutes };
