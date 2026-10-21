import type { FastifyPluginAsync } from 'fastify';
import { manifest } from './manifest';
import { reportRoutes } from './routes';
import { exportRoutes } from './export-routes';
import { scheduleRoutes } from './schedule-routes';
import { reportJobs } from './jobs';

export { manifest };
export { reportRoutes } from './routes';
export { exportRoutes } from './export-routes';
export { scheduleRoutes } from './schedule-routes';
export { reportJobs, JOB_RUN_SCHEDULES } from './jobs';
export { JOB_GENERATE } from './runs';
export { salesReport, ordersReport, inventoryReport, productsReport, marketplacesReport, returnsReport, fulfillmentReport } from './queries';
// the pure pieces (file writers, schedule arithmetic, GST and settlement rules) are exported so they can be tested and reused
export { renderCsv } from './csv';
export { buildXlsx } from './xlsx';
export { buildPdf } from './pdf';
export { readZip, writeZip, crc32 } from './zip';
export { computeNextRun, cadenceLabel } from './schedules';
export { relativeWindow, resolveWindow } from './params';
export { formatMinor, formatMinorIndian, splitProportional } from './money';
export { deriveRateBps, groupLines, invoiceRows, creditNoteLines } from './gst/calc';
export { stateCodeOf } from './gst/state';
export { settleOrder } from './builders/settlement-audit';
export { unitCost } from './builders/inventory-valuation';
export { REPORT_DEFS, REPORT_TYPES } from './catalog';
export type { ReportDocument, Sheet, Column, Cell } from './tabular';

const routes: FastifyPluginAsync = async (app) => {
  await app.register(reportRoutes);
  await app.register(exportRoutes);
  await app.register(scheduleRoutes);
};

/**
 * Reports: tenant-scoped read aggregates (sales, orders, inventory, products, marketplaces, returns, fulfillment) plus exports as
 * csv / xlsx / pdf files (GST register, settlement audit, inventory valuation and the standard reports), a run history with
 * authenticated downloads, and scheduled reports delivered by notification and e-mail.
 */
export const reportsModule = { manifest, routes, jobs: reportJobs };
