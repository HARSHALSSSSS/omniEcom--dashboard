import { schema, sql, type SQL } from '@oms/database';
import { RETURN_STAGES, type ReturnStage } from './domain';

const R = schema.returnOrders;

/** the stage of a return as SQL; the same cases as `returnStage` in domain.ts, so a stage filter and the `stage` field of a row always agree */
const inWarehouse = sql`${R.status} in ('received','inspecting')`;
const decided = sql`${R.inspectionStatus} in ('passed','failed')`;
const processed = sql`${R.refundStatus} = 'processed'`;
export const STAGE_PREDICATES: Record<ReturnStage, SQL> = {
  requested: sql`${R.status} = 'requested'`,
  approved: sql`${R.status} = 'approved'`,
  in_transit: sql`${R.status} in ('pickup_scheduled','picked_up','in_transit')`,
  received: sql`(${inWarehouse} and not ${processed} and not ${decided} and ${R.inspectionStatus} = 'not_started' and ${R.status} = 'received')`,
  inspecting: sql`(${inWarehouse} and not ${processed} and not ${decided} and not (${R.inspectionStatus} = 'not_started' and ${R.status} = 'received'))`,
  resolution: sql`(${inWarehouse} and ${decided} and not ${processed})`,
  refunded: sql`(${inWarehouse} and ${processed})`,
  closed: sql`${R.status} = 'completed'`,
  rejected: sql`${R.status} = 'rejected'`,
  cancelled: sql`${R.status} = 'cancelled'`,
};

export const isStage = (s: string): s is ReturnStage => (RETURN_STAGES as readonly string[]).includes(s);

export const LEDGER_SORTS = ['-requestedAt', 'requestedAt', '-refundAmount', 'refundAmount'] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number];

/** ORDER BY of the ledger; the id keeps pages stable when values tie */
export function ledgerOrder(sort: LedgerSort | undefined): SQL[] {
  switch (sort) {
    case 'requestedAt': return [sql`${R.createdAt} asc`, sql`${R.id} asc`];
    case '-refundAmount': return [sql`${R.refundAmountMinor} desc nulls last`, sql`${R.id} desc`];
    case 'refundAmount': return [sql`${R.refundAmountMinor} asc nulls last`, sql`${R.id} asc`];
    default: return [sql`${R.createdAt} desc`, sql`${R.id} desc`];
  }
}
