import { and, desc, eq, gte, lte, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';

/**
 * Marketing (advertising) spend: what the seller paid for sponsored placements, entered by hand or imported. It feeds the
 * advertising line of profitability. A spend row belongs to a marketplace account or, when it is not attributable, to nobody.
 */
const T = schema.marketingSpend;
const A = schema.marketplaceAccounts;
export type SpendRow = typeof T.$inferSelect;

export const MAX_SPEND_MINOR = 100_000_000_000; // INR 1,000,000,000.00 in one row
const DAY = 86_400_000;

export interface SpendDto { id: string; spendDate: string; accountId: string | null; accountName: string | null; marketplace: string | null; amountMinor: number; currency: string; campaign: string | null; source: string; notes: string | null; createdAt: string; updatedAt: string }

const dto = (r: SpendRow, acc: Map<string, { name: string; marketplace: string }>): SpendDto => ({
  id: r.id, spendDate: r.spendDate, accountId: r.accountId, accountName: r.accountId ? acc.get(r.accountId)?.name ?? null : null, marketplace: r.accountId ? acc.get(r.accountId)?.marketplace ?? null : null,
  amountMinor: r.amountMinor, currency: r.currency, campaign: r.campaign, source: r.source, notes: r.notes, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});

async function accountMap(tx: Tx, vendorId: string) {
  const rs = await tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace, external: A.externalAccountId }).from(A).where(eq(A.vendorId, vendorId));
  return { list: rs, byId: new Map(rs.map((a) => [a.id, { name: a.name, marketplace: a.marketplace }])) };
}

/** a real calendar date, not in the future (tomorrow is tolerated for time zones) and not older than five years */
export function assertSpendDate(d: string): void {
  const t = Date.parse(`${d}T00:00:00Z`);
  const real = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  if (!real) throw new AppError('BAD_REQUEST', 'spendDate must be a real date (YYYY-MM-DD)', { details: { rule: 'invalid_date', field: 'spendDate' } });
  if (t > Date.now() + DAY) throw new AppError('BAD_REQUEST', 'Spend cannot be recorded for a future date', { details: { rule: 'future_date', field: 'spendDate' } });
  if (t < Date.now() - 5 * 366 * DAY) throw new AppError('BAD_REQUEST', 'Spend older than five years cannot be recorded', { details: { rule: 'date_too_old', field: 'spendDate' } });
}

async function assertAccount(tx: Tx, vendorId: string, id: string): Promise<void> {
  const [a] = await tx.select({ id: A.id }).from(A).where(and(eq(A.id, id), eq(A.vendorId, vendorId)));
  if (!a) throw Errors.notFound('Marketplace account', id);
}

export interface SpendFilter { from?: string; to?: string; accountId?: string; unallocated?: boolean; q?: string }
const where = (vendorId: string, f: SpendFilter) => and(
  eq(T.vendorId, vendorId), f.from ? gte(T.spendDate, f.from) : undefined, f.to ? lte(T.spendDate, f.to) : undefined,
  f.accountId ? eq(T.accountId, f.accountId) : undefined, f.unallocated ? sql`${T.accountId} is null` : undefined,
  f.q ? sql`(${T.campaign} ilike ${'%' + f.q.replace(/[%_\\]/g, '\\$&') + '%'} or ${T.notes} ilike ${'%' + f.q.replace(/[%_\\]/g, '\\$&') + '%'})` : undefined,
);

export async function listSpend(tx: Tx, vendorId: string, f: SpendFilter, page: { limit: number; offset: number }) {
  const [rows, [c], acc] = await Promise.all([
    tx.select().from(T).where(where(vendorId, f)).orderBy(desc(T.spendDate), desc(T.createdAt)).limit(page.limit).offset(page.offset),
    tx.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${T.amountMinor}), 0)::bigint` }).from(T).where(where(vendorId, f)),
    accountMap(tx, vendorId),
  ]);
  return { items: rows.map((r) => dto(r, acc.byId)), total: Number(c?.n ?? 0), totalMinor: Number(c?.total ?? 0) };
}

export interface SpendInput { spendDate: string; accountId?: string | null; amountMinor: number; campaign?: string | null; notes?: string | null }

export async function createSpend(tx: Tx, vendorId: string, input: SpendInput, actorId: string | null, source: 'manual' | 'import' | 'api' = 'manual'): Promise<SpendDto> {
  assertSpendDate(input.spendDate);
  if (input.accountId) await assertAccount(tx, vendorId, input.accountId);
  const [row] = await tx.insert(T).values({ vendorId, spendDate: input.spendDate, accountId: input.accountId ?? null, amountMinor: input.amountMinor, campaign: input.campaign ?? null, notes: input.notes ?? null, source, createdBy: actorId }).returning();
  return dto(row!, (await accountMap(tx, vendorId)).byId);
}

export async function getSpend(tx: Tx, vendorId: string, id: string): Promise<SpendRow> {
  const [r] = await tx.select().from(T).where(and(eq(T.id, id), eq(T.vendorId, vendorId)));
  if (!r) throw Errors.notFound('Marketing spend', id);
  return r;
}

export async function updateSpend(tx: Tx, vendorId: string, id: string, patch: Partial<SpendInput>): Promise<{ before: SpendRow; after: SpendDto }> {
  const before = await getSpend(tx, vendorId, id);
  if (patch.spendDate !== undefined) assertSpendDate(patch.spendDate);
  if (patch.accountId) await assertAccount(tx, vendorId, patch.accountId);
  const set: Partial<typeof T.$inferInsert> = {};
  if (patch.spendDate !== undefined) set.spendDate = patch.spendDate;
  if (patch.accountId !== undefined) set.accountId = patch.accountId;
  if (patch.amountMinor !== undefined) set.amountMinor = patch.amountMinor;
  if (patch.campaign !== undefined) set.campaign = patch.campaign;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (Object.keys(set).length === 0) throw new AppError('BAD_REQUEST', 'Nothing to change', { details: { rule: 'empty_patch' } });
  const [row] = await tx.update(T).set(set).where(and(eq(T.id, id), eq(T.vendorId, vendorId))).returning();
  return { before, after: dto(row!, (await accountMap(tx, vendorId)).byId) };
}

export async function deleteSpend(tx: Tx, vendorId: string, id: string): Promise<SpendRow> {
  const before = await getSpend(tx, vendorId, id);
  await tx.delete(T).where(and(eq(T.id, id), eq(T.vendorId, vendorId)));
  return before;
}

export interface SpendTotals { rows: number; totalMinor: number; byMarketplace: Map<string, number>; unallocatedMinor: number }

/** what the profitability screens need: the spend of a date range in total and per marketplace (null account = unallocated) */
export async function advertisingSpend(tx: Tx, vendorId: string, r: { from: string; to: string }): Promise<SpendTotals> {
  const rs = (await tx.execute<{ marketplace: string | null; rows: number; amount: string }>(sql`select a.marketplace, count(*)::int rows, coalesce(sum(m.amount_minor), 0)::bigint amount from marketing_spend m left join marketplace_accounts a on a.id = m.account_id and a.vendor_id = m.vendor_id where m.vendor_id = ${vendorId} and m.spend_date between ${r.from}::date and ${r.to}::date group by 1`)).rows;
  const out: SpendTotals = { rows: 0, totalMinor: 0, byMarketplace: new Map(), unallocatedMinor: 0 };
  for (const x of rs) {
    out.rows += Number(x.rows); out.totalMinor += Number(x.amount);
    if (x.marketplace === null) out.unallocatedMinor += Number(x.amount); else out.byMarketplace.set(x.marketplace, Number(x.amount));
  }
  return out;
}

export async function spendSummary(tx: Tx, vendorId: string, r: { from: string; to: string }) {
  const q = (s: ReturnType<typeof sql>) => tx.execute<Record<string, unknown>>(s).then((x) => x.rows);
  const [byAccount, byCampaign, byDay] = await Promise.all([
    q(sql`select m.account_id, max(a.display_name) name, max(a.marketplace) marketplace, count(*)::int rows, sum(m.amount_minor)::bigint amount from marketing_spend m left join marketplace_accounts a on a.id = m.account_id and a.vendor_id = m.vendor_id where m.vendor_id = ${vendorId} and m.spend_date between ${r.from}::date and ${r.to}::date group by 1 order by amount desc`),
    q(sql`select coalesce(nullif(btrim(campaign), ''), '(no campaign)') campaign, count(*)::int rows, sum(amount_minor)::bigint amount from marketing_spend where vendor_id = ${vendorId} and spend_date between ${r.from}::date and ${r.to}::date group by 1 order by amount desc limit 50`),
    q(sql`select spend_date::text d, sum(amount_minor)::bigint amount from marketing_spend where vendor_id = ${vendorId} and spend_date between ${r.from}::date and ${r.to}::date group by 1 order by 1`),
  ]);
  const total = byAccount.reduce((s, x) => s + Number(x.amount), 0);
  return {
    range: r, rows: byAccount.reduce((s, x) => s + Number(x.rows), 0), totalMinor: total,
    byAccount: byAccount.map((x) => ({ accountId: x.account_id ? String(x.account_id) : null, accountName: x.name ? String(x.name) : null, marketplace: x.marketplace ? String(x.marketplace) : null, rows: Number(x.rows), amountMinor: Number(x.amount) })),
    byCampaign: byCampaign.map((x) => ({ campaign: String(x.campaign), rows: Number(x.rows), amountMinor: Number(x.amount) })),
    byDay: byDay.map((x) => ({ day: String(x.d), amountMinor: Number(x.amount) })),
  };
}

// ------------------------------------------------------------------------------------------------
// CSV import
// ------------------------------------------------------------------------------------------------
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_ROWS = 5_000;

/** minimal RFC 4180 reader (quoted fields, escaped quotes, CRLF, BOM) */
export function parseSpendCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') out.push(row); row = []; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') out.push(row); }
  return out;
}

const CURRENCY_PREFIX = new RegExp(`^(?:inr|rs\\.?|${String.fromCodePoint(0x20b9)})\\s*`, 'i');

/** "1,250.50", "Rs 1250", "INR 99" -> minor units without any floating point; null when it is not a plain amount */
export function parseAmountMinor(raw: string, unit: 'rupees' | 'paise'): number | null {
  const s = raw.trim().replace(CURRENCY_PREFIX, '').replace(/,/g, '');
  if (unit === 'paise') return /^\d{1,13}$/.test(s) ? Number(s) : null;
  const m = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(s);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0') : null;
}

/** YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY (Indian order) -> YYYY-MM-DD, or null */
export function parseSpendDate(raw: string): string | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  const [y, m, d] = iso ? [iso[1]!, iso[2]!, iso[3]!] : dmy ? [dmy[3]!, dmy[2]!.padStart(2, '0'), dmy[1]!.padStart(2, '0')] : [null, null, null];
  if (!y) return null;
  const out = `${y}-${m}-${d}`;
  const t = Date.parse(`${out}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === out ? out : null;
}

export interface ImportResult { rows: number; created: number; updated: number; unchanged: number; failed: number; dryRun: boolean; errors: Array<{ row: number; field: string | null; message: string }> }

/**
 * Applies a spend CSV (columns date, account, amount, campaign, optional notes). A row is identified by (date, account, campaign):
 * importing the same file again changes nothing, importing a corrected amount updates the row. Each row stands on its own.
 */
export async function importSpend(tx: Tx, vendorId: string, csv: string, o: { unit: 'rupees' | 'paise'; dryRun: boolean; actorId: string | null }): Promise<ImportResult> {
  const table = parseSpendCsv(csv);
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const pick = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const idx = { date: pick('date', 'spend_date'), amount: pick('amount', 'spend', 'amount_inr'), account: pick('account', 'account_id', 'marketplace_account', 'channel'), campaign: pick('campaign', 'campaign_name'), notes: pick('notes', 'note') };
  for (const need of ['date', 'amount'] as const) if (idx[need] < 0) throw new AppError('BAD_REQUEST', `Missing required column "${need}"`, { details: { rule: 'missing_column', column: need } });
  const body = table.slice(1);
  if (body.length > IMPORT_MAX_ROWS) throw new AppError('PAYLOAD_TOO_LARGE', `At most ${IMPORT_MAX_ROWS} rows per file`);

  const acc = await accountMap(tx, vendorId);
  const resolve = (v: string): { id: string | null } | { error: string } => {
    const k = v.trim().toLowerCase();
    if (!k) return { id: null };
    const exact = acc.list.filter((a) => a.id.toLowerCase() === k || a.name.toLowerCase() === k || (a.external ?? '').toLowerCase() === k);
    const hits = exact.length ? exact : acc.list.filter((a) => a.marketplace.toLowerCase() === k);
    if (hits.length === 1) return { id: hits[0]!.id };
    return { error: hits.length === 0 ? `Unknown account "${v.trim()}"` : `"${v.trim()}" matches ${hits.length} accounts: use the account name or id` };
  };
  const cell = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
  const result: ImportResult = { rows: body.length, created: 0, updated: 0, unchanged: 0, failed: 0, dryRun: o.dryRun, errors: [] };
  const fail = (row: number, field: string | null, message: string) => { result.failed++; if (result.errors.length < 100) result.errors.push({ row, field, message }); };

  const parsed: Array<{ line: number; date: string; accountId: string | null; amount: number; campaign: string | null; notes: string | null }> = [];
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const line = i + 2;
    const date = parseSpendDate(cell(cells, idx.date));
    if (!date) return fail(line, 'date', 'Date must be YYYY-MM-DD or DD/MM/YYYY');
    try { assertSpendDate(date); } catch (e) { return fail(line, 'date', e instanceof AppError ? e.message : 'Invalid date'); }
    const amount = parseAmountMinor(cell(cells, idx.amount), o.unit);
    if (amount === null || amount > MAX_SPEND_MINOR) return fail(line, 'amount', o.unit === 'rupees' ? 'Amount must be a number with at most two decimals' : 'Amount must be a whole number of paise');
    const a = resolve(cell(cells, idx.account));
    if ('error' in a) return fail(line, 'account', a.error);
    const campaign = cell(cells, idx.campaign).slice(0, 200) || null;
    const key = `${date}|${a.id ?? ''}|${(campaign ?? '').toLowerCase()}`;
    if (seen.has(key)) return fail(line, null, 'Duplicate of an earlier row in this file (same date, account and campaign)');
    seen.add(key);
    parsed.push({ line, date, accountId: a.id, amount, campaign, notes: cell(cells, idx.notes).slice(0, 500) || null });
  });

  if (parsed.length) {
    const from = parsed.reduce((m, p) => (p.date < m ? p.date : m), parsed[0]!.date);
    const to = parsed.reduce((m, p) => (p.date > m ? p.date : m), parsed[0]!.date);
    const existing = await tx.select().from(T).where(and(eq(T.vendorId, vendorId), gte(T.spendDate, from), lte(T.spendDate, to)));
    const byKey = new Map(existing.map((e) => [`${e.spendDate}|${e.accountId ?? ''}|${(e.campaign ?? '').toLowerCase()}`, e]));
    for (const p of parsed) {
      const cur = byKey.get(`${p.date}|${p.accountId ?? ''}|${(p.campaign ?? '').toLowerCase()}`);
      if (cur && cur.amountMinor === p.amount) { result.unchanged++; continue; }
      if (cur) { result.updated++; if (!o.dryRun) await tx.update(T).set({ amountMinor: p.amount, source: 'import', ...(p.notes ? { notes: p.notes } : {}) }).where(and(eq(T.id, cur.id), eq(T.vendorId, vendorId))); continue; }
      result.created++;
      if (!o.dryRun) await tx.insert(T).values({ vendorId, spendDate: p.date, accountId: p.accountId, amountMinor: p.amount, campaign: p.campaign, notes: p.notes, source: 'import', createdBy: o.actorId });
    }
  }
  return result;
}
