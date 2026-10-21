import type { EventConsumer, JobHandler } from '@oms/module-kit';
import { manifest } from './manifest';
import { automationRoutes } from './routes';
import { TRIGGERS, handleEvent } from './engine';
import { JOB_AUTOMATION_SCAN, scanAutomation } from './scan';

export { manifest };
export { automationRoutes } from './routes';
export { scanAutomation, localSlot, JOB_AUTOMATION_SCAN } from './scan';
export { TRIGGERS as AUTOMATION_TRIGGERS, ACTIONS as AUTOMATION_ACTIONS, factsOf, render } from './engine';

/** one consumer per trigger event: a failing rule never blocks another trigger */
const consumers: EventConsumer[] = Object.keys(TRIGGERS).map((event) => ({
  event,
  name: `automation.${event}`,
  async handle(e, c) { await handleEvent(c, e); },
}));

/** every few minutes (schedule `automation.scan`): announce SLA-at-risk orders, lower competitor prices and cadence ticks to the rules that listen */
const jobs: JobHandler[] = [{
  queue: 'maintenance',
  name: JOB_AUTOMATION_SCAN,
  async handle(_env, c) { c.logger.debug(await scanAutomation(c), 'automation scan'); },
}];

/**
 * Automation: trigger -> conditions -> whitelisted action, with execution history, approval and rollback. A rule runs at most once per
 * event, is throttled, and (unless the vendor chose `auto`) waits for a person.
 */
export const automationModule = { manifest, routes: automationRoutes, consumers, jobs };
