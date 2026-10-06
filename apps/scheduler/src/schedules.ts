/**
 * Central schedule catalogue (single source of truth). Business schedules are added by their module's
 * stage, e.g. Stage 3: `sync-orders-fanout` (every 5 min: enqueue one sync job per active marketplace account).
 */
export interface ScheduleDef {
  id: string;
  queue: 'maintenance' | 'syncMarketplace' | 'notifications' | 'heavy';
  job: string;
  /** fixed interval in ms OR a cron pattern (evaluated in Asia/Kolkata) */
  every?: number;
  cron?: string;
  data?: unknown;
}

export const SCHEDULES: ScheduleDef[] = [
  // Stage 2: rotate marketplace tokens that expire within 15 minutes (connectors module)
  { id: 'maintenance:refresh-marketplace-tokens', queue: 'maintenance', job: 'marketplace.refresh-expiring-tokens', every: 5 * 60 * 1000 },
  { id: 'maintenance:purge-idempotency-keys', queue: 'maintenance', job: 'purge-idempotency-keys', every: 60 * 60 * 1000 },
  { id: 'maintenance:purge-refresh-tokens', queue: 'maintenance', job: 'purge-refresh-tokens', cron: '30 3 * * *' },
  { id: 'maintenance:purge-published-outbox', queue: 'maintenance', job: 'purge-published-outbox', cron: '45 3 * * *' },
];
