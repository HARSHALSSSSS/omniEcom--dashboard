import { and, asc, eq, or, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';

const V = schema.savedViews;

export const VIEW_LIMIT_PER_SCREEN = 50;
export const MAX_FILTER_BYTES = 8 * 1024;

/**
 * Filter keys each list screen understands. Saved views store ONLY these (the UI replays them as query parameters), which keeps a view
 * small, reviewable and free of anything that is not a filter.
 */
export const VIEW_FILTER_KEYS: Record<(typeof schema.VIEW_SCREENS)[number], readonly string[]> = {
  products: ['q', 'status', 'categoryId', 'channel', 'inventory', 'productType', 'needsAttention'],
  inventory: ['q', 'warehouse', 'channel', 'health', 'stockMin', 'stockMax', 'movement', 'signal'],
  orders: ['q', 'marketplace', 'status', 'slaState', 'payment', 'fulfillment', 'attention', 'date'],
  returns: ['tab', 'q', 'marketplace', 'signal', 'inspectionStatus', 'refundStatus', 'disposition'],
};
type Screen = (typeof schema.VIEW_SCREENS)[number];

const isScalar = (v: unknown): v is string | number | boolean => (typeof v === 'string' && v.length <= 200) || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

/** allow-listed keys, scalar values or short arrays of scalars, at most 8 KB of JSON */
export function validateFilters(screen: Screen, filters: Record<string, unknown>): Record<string, unknown> {
  const allowed = VIEW_FILTER_KEYS[screen];
  const issues: Array<{ path: string; message: string }> = [];
  for (const [k, v] of Object.entries(filters)) {
    if (!allowed.includes(k)) issues.push({ path: `filters.${k}`, message: `not a filter of the ${screen} screen (allowed: ${allowed.join(', ')})` });
    else if (!(isScalar(v) || (Array.isArray(v) && v.length <= 50 && v.every(isScalar)))) issues.push({ path: `filters.${k}`, message: 'must be a string, number, boolean or a list of them (max 200 characters each)' });
  }
  if (issues.length === 0 && Buffer.byteLength(JSON.stringify(filters)) > MAX_FILTER_BYTES) issues.push({ path: 'filters', message: `too large (max ${MAX_FILTER_BYTES} bytes)` });
  if (issues.length) throw Errors.validation({ issues });
  return filters;
}

export interface Actor { userId: string; isAdmin: boolean }
type Row = typeof V.$inferSelect;
const toDto = (r: Row, a: Actor) => ({
  id: r.id, screen: r.screen as Screen, name: r.name, filters: r.filters, sort: r.sort, shared: r.shared, createdBy: r.createdBy, mine: r.createdBy === a.userId,
  canEdit: r.createdBy === a.userId || a.isAdmin, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), version: r.version,
});
export type ViewDto = ReturnType<typeof toDto>;

export async function listViews(tx: Tx, vendorId: string, a: Actor, screen?: Screen): Promise<ViewDto[]> {
  const rows = await tx.select().from(V)
    .where(and(eq(V.vendorId, vendorId), screen ? eq(V.screen, screen) : undefined, or(eq(V.createdBy, a.userId), eq(V.shared, true))))
    .orderBy(asc(V.screen), asc(V.name), asc(V.id)).limit(500);
  return rows.map((r) => toDto(r, a));
}

async function load(tx: Tx, vendorId: string, id: string, a: Actor, forWrite: boolean): Promise<Row> {
  const [r] = await tx.select().from(V).where(and(eq(V.vendorId, vendorId), eq(V.id, id)));
  // a private view of somebody else does not exist for this caller (404, not 403: do not reveal it)
  if (!r || (r.createdBy !== a.userId && !r.shared && !a.isAdmin)) throw Errors.notFound('Saved view', id);
  if (forWrite && r.createdBy !== a.userId && !a.isAdmin) throw new AppError('FORBIDDEN', 'Only the creator of a view (or an administrator) can change it');
  return r;
}

async function assertNameFree(tx: Tx, vendorId: string, screen: string, createdBy: string, name: string, exceptId?: string): Promise<void> {
  const [dup] = await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), eq(V.screen, screen), eq(V.createdBy, createdBy), eq(V.name, name)));
  if (dup && dup.id !== exceptId) throw Errors.conflict(`You already have a ${screen} view named "${name}"`, { rule: 'saved_view_name_taken' });
}

export async function createView(tx: Tx, vendorId: string, a: Actor, input: { screen: Screen; name: string; filters: Record<string, unknown>; sort?: string | null; shared?: boolean }): Promise<ViewDto> {
  const filters = validateFilters(input.screen, input.filters);
  // serialise concurrent creates of one user+screen so the limit cannot be raced past
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`views:${vendorId}:${a.userId}:${input.screen}`}))`);
  const [c] = await tx.select({ c: sql<number>`count(*)::int` }).from(V).where(and(eq(V.vendorId, vendorId), eq(V.screen, input.screen), eq(V.createdBy, a.userId)));
  if ((c?.c ?? 0) >= VIEW_LIMIT_PER_SCREEN) throw Errors.conflict(`At most ${VIEW_LIMIT_PER_SCREEN} saved views per screen`, { rule: 'saved_view_limit', limit: VIEW_LIMIT_PER_SCREEN });
  await assertNameFree(tx, vendorId, input.screen, a.userId, input.name);
  const [row] = await tx.insert(V).values({ vendorId, screen: input.screen, name: input.name, filters, sort: input.sort ?? null, shared: input.shared ?? false, createdBy: a.userId }).returning();
  return toDto(row!, a);
}

export async function updateView(tx: Tx, vendorId: string, a: Actor, id: string, patch: { name?: string; filters?: Record<string, unknown>; sort?: string | null; shared?: boolean }): Promise<{ before: ViewDto; after: ViewDto }> {
  const cur = await load(tx, vendorId, id, a, true);
  if (patch.name !== undefined) await assertNameFree(tx, vendorId, cur.screen, cur.createdBy, patch.name, cur.id);
  const filters = patch.filters !== undefined ? validateFilters(cur.screen as Screen, patch.filters) : undefined;
  const [row] = await tx.update(V).set({
    ...(patch.name !== undefined ? { name: patch.name } : {}), ...(filters ? { filters } : {}), ...(patch.sort !== undefined ? { sort: patch.sort } : {}), ...(patch.shared !== undefined ? { shared: patch.shared } : {}),
    version: sql`${V.version} + 1`, updatedAt: new Date(),
  }).where(and(eq(V.vendorId, vendorId), eq(V.id, id))).returning();
  return { before: toDto(cur, a), after: toDto(row!, a) };
}

export async function deleteView(tx: Tx, vendorId: string, a: Actor, id: string): Promise<ViewDto> {
  const cur = await load(tx, vendorId, id, a, true);
  await tx.delete(V).where(and(eq(V.vendorId, vendorId), eq(V.id, id)));
  return toDto(cur, a);
}
