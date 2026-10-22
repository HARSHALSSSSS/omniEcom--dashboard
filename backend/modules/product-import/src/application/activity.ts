import { eq, type Tx } from '@oms/database';
import { LIMITS } from '../domain/catalogue';
import { S } from './store';

/**
 * Compact per-session activity feed and revalidation progress.
 * Both live in `import_sessions.stats` (jsonb) under reserved keys, so no table is needed: the feed keeps the newest
 * `LIMITS.activityEvents` events, the progress object is replaced as a whole. Writers (validation job, commit job, issue
 * resolution) never run at the same time on one session, and every write locks the session row first.
 */
export type ActivityKind = 'row_validated' | 'row_warning' | 'row_error' | 'row_created' | 'row_updated' | 'row_skipped' | 'row_failed' | 'issue_resolved' | 'stage';

export interface NewActivity { kind: ActivityKind; rowNumber?: number | null; sku?: string | null; title?: string | null; message: string }
interface StoredActivity { i: number; t: number; k: ActivityKind; r?: number; s?: string; ti?: string; m: string }

export interface RevalidationChange { rowNumber: number; field: string; from: string | null; to: string | null; outcome: 'passed' | 'still_failing' }
export interface RevalidationState { status: 'idle' | 'running' | 'complete' | 'failed'; total: number; checked: number; current: string | null; changes: RevalidationChange[] }

const EVENTS = '__activity';
const SEQ = '__activitySeq';
const REVAL = '__revalidation';

type Bag = Record<string, unknown>;
const bag = (stats: unknown): Bag => (stats ?? {}) as Bag;
const clip = (v: string | null | undefined, n: number): string | undefined => (v ? v.slice(0, n) : undefined);

/** append events to the feed (newest kept, oldest dropped). Call inside the transaction that did the work. */
export async function appendActivity(tx: Tx, sessionId: string, events: NewActivity[]): Promise<void> {
  if (events.length === 0) return;
  const [row] = await tx.select({ stats: S.stats }).from(S).where(eq(S.id, sessionId)).for('update');
  if (!row) return;
  const stats = bag(row.stats);
  const kept = Array.isArray(stats[EVENTS]) ? (stats[EVENTS] as StoredActivity[]) : [];
  let seq = typeof stats[SEQ] === 'number' ? (stats[SEQ] as number) : 0;
  const now = Date.now();
  const added: StoredActivity[] = events.map((e) => ({
    i: ++seq, t: now, k: e.kind, ...(e.rowNumber ? { r: e.rowNumber } : {}), ...(clip(e.sku, 64) ? { s: clip(e.sku, 64) } : {}), ...(clip(e.title, 120) ? { ti: clip(e.title, 120) } : {}), m: e.message.slice(0, 240),
  }));
  const next = [...kept, ...added].slice(-LIMITS.activityEvents);
  await tx.update(S).set({ stats: { ...stats, [EVENTS]: next, [SEQ]: seq } as unknown as Record<string, number> }).where(eq(S.id, sessionId));
}

export function readActivity(stats: unknown, q: { limit: number; before?: string }) {
  const all = Array.isArray(bag(stats)[EVENTS]) ? (bag(stats)[EVENTS] as StoredActivity[]) : [];
  const before = q.before === undefined ? Number.POSITIVE_INFINITY : Number(q.before);
  const older = all.filter((e) => e.i < before).sort((a, b) => b.i - a.i);
  const page = older.slice(0, q.limit);
  return {
    items: page.map((e) => ({ id: String(e.i), at: new Date(e.t).toISOString(), kind: e.k, rowNumber: e.r ?? null, sku: e.s ?? null, title: e.ti ?? null, message: e.m })),
    nextBefore: older.length > q.limit ? String(page[page.length - 1]!.i) : null,
  };
}

export function readRevalidation(stats: unknown): RevalidationState | null {
  const r = bag(stats)[REVAL];
  return r && typeof r === 'object' ? (r as RevalidationState) : null;
}

/** replace (or patch) the revalidation progress of a session; the current stats are re-read so concurrent counters survive */
export async function setRevalidation(tx: Tx, sessionId: string, patch: Partial<RevalidationState> | null): Promise<void> {
  const [row] = await tx.select({ stats: S.stats }).from(S).where(eq(S.id, sessionId)).for('update');
  if (!row) return;
  const stats = bag(row.stats);
  const current = readRevalidation(stats);
  const next = patch === null ? undefined : { status: 'idle', total: 0, checked: 0, current: null, changes: [], ...current, ...patch };
  const out = { ...stats };
  if (next === undefined) delete out[REVAL]; else out[REVAL] = next;
  await tx.update(S).set({ stats: out as unknown as Record<string, number> }).where(eq(S.id, sessionId));
}
