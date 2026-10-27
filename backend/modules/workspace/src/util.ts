import { sql, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { resolveSettings } from '@oms/mod-vendors';

/** Small helpers shared by the workspace read models (raw, vendor-scoped SQL; every query filters vendor_id explicitly on top of RLS). */
export type Row = Record<string, unknown>;
export const rows = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> => (await tx.execute<Row>(q)).rows;
export const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
export const pct = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
export const inList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

export const DAY_MS = 86_400_000;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const addDays = (d: string, k: number): string => new Date(Date.parse(d) + k * DAY_MS).toISOString().slice(0, 10);
export const isRealDay = (d: string): boolean => DAY_RE.test(d) && !Number.isNaN(Date.parse(d)) && new Date(Date.parse(d)).toISOString().slice(0, 10) === d;

/** YYYY-MM-DD of `at` in a business time zone (falls back to UTC for an unknown zone) */
export function dayIn(tz: string, at = new Date()): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); } catch { return at.toISOString().slice(0, 10); }
}

/** marketplace code -> display name (the channel catalogue of onboarding; unknown codes are title-cased) */
const NAMES: Record<string, string> = { amazon_in: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', snapdeal: 'Snapdeal', meesho: 'Meesho', shopify: 'Shopify', mock: 'Sandbox marketplace' };
export const marketplaceName = (code: string): string => NAMES[code] ?? code.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** the signed-in principal's user id (workspace data that belongs to a person needs a user, not an API key) */
export function userIdOf(req: { ctx: { principal?: { actorType: string; actorId: string } | null } }): string {
  const p = req.ctx.principal;
  if (!p || p.actorType !== 'user') throw new AppError('FORBIDDEN', 'This belongs to a signed-in user');
  return p.actorId;
}

/** Vendor facts every workspace read needs: time zone, currency, low-stock fallback, SLA band. */
export async function vendorFacts(tx: Tx, vendorId: string) {
  const [v] = await rows(tx, sql`select id, display_name, plan, team_size, timezone, currency, settings from vendors where id = ${vendorId}`);
  const settings = ((v?.settings ?? {}) as Record<string, unknown>);
  const inv = (settings.inventory ?? {}) as { mode?: string; defaultLeadTimeDays?: number };
  const sla = (settings.sla ?? {}) as { atRiskMinutes?: number };
  return {
    id: vendorId, name: String(v?.display_name ?? ''), plan: String(v?.plan ?? 'free'), teamSize: (v?.team_size as string | null) ?? null,
    timezone: String(v?.timezone ?? 'UTC'), currency: String(v?.currency ?? 'INR').trim(),
    lowStockThreshold: Number(settings.lowStockThreshold ?? 5), defaultLeadDays: Number(inv.defaultLeadTimeDays ?? 7), numberFormat: resolveSettings(settings).numberFormat, preferences: resolveSettings(settings).preferences, inventoryMode: (inv.mode ?? null) as 'simple' | 'warehouse' | null, atRiskMinutes: Number(sla.atRiskMinutes ?? 90),
  };
}
export type VendorFacts = Awaited<ReturnType<typeof vendorFacts>>;

export const ACTIVE_ISSUE = sql`('open','in_progress')`;
