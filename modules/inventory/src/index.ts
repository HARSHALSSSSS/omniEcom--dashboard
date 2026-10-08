import { manifest } from './manifest';
import { inventoryRoutes } from './routes';

export { manifest };
export { inventoryRoutes } from './routes';
export {
  applyMovement, assertStockTargets, availableOf, nextCounter, type MovementInput, type MovementResult, type MovementType, type StockRow,
} from './ledger';
export {
  addIncoming, adjustStock, availabilityFor, commitOrder, ledgerDrift, listStock, markDamaged, receiveReturn, receiveStock, releaseOrder, reservationsForOrder, reserveForOrderItem,
  resolveReturned, setReorderLevel, variantOverview, type Availability, type ReserveInput, type ReserveResult,
} from './service';

/**
 * Inventory: stock per variant per warehouse with an append-only movement ledger. Reservations hold stock for orders;
 * channel quantities (marketplaces) are DERIVED from availability by the Listings module, never edited here.
 */
export const inventoryModule = { manifest, routes: inventoryRoutes };
