import { inArray, schema, sql, type Tx } from '@oms/database';
import { bandOf, type InventoryFilter, type ReadinessBand } from './list-filters';
import type { Ctx } from './ctx';
import { joined } from './service';
import { enrichListings, FROM, SORTS, where, type TableFilter } from './workspace-data';
import { ATTENTION_STATUSES, SCREEN_STATUS_SQL, SCREEN_STATUSES, type ScreenStatus } from './workspace-domain';
import { rowsWithTable } from './workspace-service';

const L = schema.marketplaceListings;
const STATUS_EXPR = sql.raw(`(${SCREEN_STATUS_SQL})`);
const BATCH = 200;

/** the storage is never asked for a thumbnail here: only the readiness and the channel stock of every listing are wanted */
const noStorage = { presignDownload: async (): Promise<never> => { throw new Error('thumbnails are not needed'); } } as unknown as Ctx['c']['storage'];

export interface ComputedFilter { readiness?: ReadinessBand; inventory?: InventoryFilter }
export const hasComputed = (f: ComputedFilter): boolean => Boolean(f.readiness || f.inventory);

/**
 * The listings table when the readiness band or the channel stock is filtered. Both come from the evaluated table block (readiness is
 * computed from the listing, its product and its stored validation; the channel stock from the central stock, the account policy and the
 * listing's buffer), so the matching listings are evaluated in batches of {@link BATCH}, filtered, counted per tab and then paged.
 * Slower than the SQL path (it reads every listing that passes the cheap filters), hence only used with those two filters.
 */
export async function tableComputed(
  ctx: Ctx, tx: Tx, f: TableFilter, computed: ComputedFilter, page: { page: number; pageSize: number }, sort?: { field: string; direction: 'asc' | 'desc' },
) {
  const expr = SORTS[sort?.field ?? 'updatedAt'] ?? SORTS.updatedAt!;
  const dir = sort ? (sort.direction === 'asc' ? 'asc' : 'desc') : 'desc';
  const candidates = (await tx.execute<{ id: string; s: ScreenStatus }>(
    sql`select l.id, ${STATUS_EXPR} s ${FROM} where ${where(ctx.vendorId, f, { skipScreenStatus: true })} order by ${sql.raw(expr)} ${sql.raw(dir)} nulls last, l.id ${sql.raw(dir)}`,
  )).rows;

  const matching: Array<{ id: string; s: ScreenStatus }> = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    const rows = await joined(tx, ctx.vendorId, inArray(L.id, slice.map((c) => c.id)));
    const blocks = await enrichListings(tx, { storage: noStorage, connectors: ctx.c.connectors }, ctx.vendorId, rows);
    for (const c of slice) {
      const b = blocks.get(c.id);
      if (!b) continue;
      if (computed.readiness && bandOf(b.readiness.percent) !== computed.readiness) continue;
      if (computed.inventory === 'in_stock' && b.stock.sellable <= 0) continue;
      if (computed.inventory === 'out_of_stock' && b.stock.sellable > 0) continue;
      matching.push(c);
    }
  }

  // counts per tab ignore the tab itself, like the SQL path
  const counts = Object.fromEntries(SCREEN_STATUSES.map((s) => [s, 0])) as Record<ScreenStatus, number>;
  for (const c of matching) counts[c.s] += 1;
  const inTab = matching.filter((c) => (!f.screenStatus || c.s === f.screenStatus) && (!f.attention || ATTENTION_STATUSES.includes(c.s)));
  const offset = (page.page - 1) * page.pageSize;
  const ids = inTab.slice(offset, offset + page.pageSize).map((c) => c.id);
  return { items: await rowsWithTable(ctx, tx, ids), total: inTab.length, counts: { all: matching.length, ...counts } };
}
