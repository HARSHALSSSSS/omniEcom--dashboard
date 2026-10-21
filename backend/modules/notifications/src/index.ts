import type { EventConsumer, JobHandler } from '@oms/module-kit';
import { manifest } from './manifest';
import { notificationRoutes } from './routes';
import { SPECS } from './catalog';
import { notifyEvent } from './service';
import { JOB_SCAN_ALERTS, scanAlerts } from './scan';

export { manifest };
export { notificationRoutes } from './routes';
export { notifyEvent, notifyVendor, registerPushProvider, type PushProvider } from './service';
export { SPECS, SCAN_SPECS, TYPE_CATALOG, NOTIFICATION_TYPES, DEFAULT_CHANNELS, CATEGORIES, categoryOfType, type Category } from './catalog';
export { scanAlerts, JOB_SCAN_ALERTS } from './scan';

/** one consumer per source event: a failure of one alert type never blocks another */
const consumers: EventConsumer[] = Object.keys(SPECS).map((event) => ({
  event,
  name: `notifications.${event}`,
  async handle(e, c) { await notifyEvent(c, e); },
}));

/** every few minutes (schedule `notifications.scan-alerts`): dispatch SLA and token expiry alerts that no event announces */
const jobs: JobHandler[] = [{
  queue: 'maintenance',
  name: JOB_SCAN_ALERTS,
  async handle(_env, c) { c.logger.debug(await scanAlerts(c), 'notification alert scan'); },
}];

/**
 * Notifications: order alerts, low stock, failed syncs, listing rejections, returns, disconnected marketplaces and operational
 * exceptions become in-app notifications per user, with e-mail and push (push-ready) per the user's preferences and the vendor's
 * notification rules. Alert storms collapse into one unread notification.
 */
export const notificationsModule = { manifest, routes: notificationRoutes, consumers, jobs };
