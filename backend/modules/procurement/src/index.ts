import type { FastifyPluginAsync } from 'fastify';
import { manifest } from './manifest';
import { supplierRoutes } from './supplier-routes';
import { purchaseOrderRoutes } from './po-routes';

export { manifest };
export { createDraftPurchaseOrder } from './orders';

const routes: FastifyPluginAsync = async (app) => {
  await app.register(supplierRoutes);
  await app.register(purchaseOrderRoutes);
};

/**
 * Procurement: suppliers and their price lists, purchase orders (draft, approve, acknowledge, receive in parts, cancel) and the
 * overview. Approving a PO announces `incoming` stock to the inventory ledger; receiving moves it on hand or to damaged.
 */
export const procurementModule = { manifest, routes };
