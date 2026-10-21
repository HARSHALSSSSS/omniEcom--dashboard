import type { FastifyPluginAsync } from 'fastify';
import { manifest } from './manifest';
import { fulfillmentRoutes } from './routes';
import { fulfillmentQueueRoutes } from './queue-routes';
import { fulfillmentConsumers } from './consumers';

export { manifest };
export { fulfillmentRoutes } from './routes';
export { fulfillmentQueueRoutes } from './queue-routes';
export {
  Work, getFulfillment, itemsOf, moveFulfillment, syncOrderStatus, fulfillmentDetail, fulfillmentTimeline, recordEvent, holdFulfillment, resumeFulfillment, cancelFulfillment, listFulfillments, type FulfillmentRow, type FulfillmentItemRow,
} from './core';
export { listPackages, packageDetail, createPackage, scanPackageItem, closePackage } from './packing';
export { packagesForShipment, attachPackages, markPackagesShipped, type PackageRow } from './packing';
export { createPickList, listPickTasks, pickTask, scanTask } from './picking';
export { startFulfillment, previewRouting, type StartInput } from './start';
export { raiseException, resolveException, listExceptions, toExceptionDto } from './exceptions';
export { workspace as fulfillmentWorkspace, listQueue as listFulfillmentQueue, slaThresholds } from './queue';
export { ACTIONS as FULFILLMENT_ACTIONS, STAGES as FULFILLMENT_STAGES, actionsFor as fulfillmentActionsFor, slaView, stageOf, type ActionView, type FulfillmentAction, type Stage as FulfillmentStage } from './queue-domain';
export { PRE_SHIP, TERMINAL, IN_WAREHOUSE, TRANSITIONS, STATUSES, canTransition, deriveOrderStatus, orderStatusFor, planRouting, barcodeMatches, type FulfillmentStatus } from './domain';

const routes: FastifyPluginAsync = async (app) => {
  await app.register(fulfillmentRoutes);
  await app.register(fulfillmentQueueRoutes);
};

/**
 * Fulfillment: what happens in a warehouse after an order is confirmed. Routing picks the warehouse(s); pick lists and packing
 * drive the fulfillment state machine; the ORDER status is derived from its fulfillments, and the stock reservation follows
 * the routing decision, so this layer stays connected to the inventory and order engines.
 */
export const fulfillmentModule = { manifest, routes, consumers: fulfillmentConsumers };
