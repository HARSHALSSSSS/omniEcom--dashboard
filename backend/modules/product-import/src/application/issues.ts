import { and, asc, eq, escapeLike, ilike, or, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { ISSUE_INFO, type IssueAction, type Suggestion } from '../domain/catalogue';
import { toCsv } from '../domain/tabular';
import { formatMoney } from '../domain/normalise';
import { readSettings } from '../domain/settings';
import { loadCategoryIndex } from './validation';
import { I, R, S, getSession, isBusy, issueTitle, pack, unpack, type IssueRecord, type RowRecord, type SessionRow } from './store';

export interface IssueFilter { code?: string; severity?: 'error' | 'warning'; status?: 'open' | 'resolved' | 'ignored'; q?: string }

const describeFix = (s: Suggestion | null): string | null => (s ? (s.kind === 'skip_row' ? 'Skip this row' : s.label ?? s.value ?? null) : null);

export function toIssueDto(i: IssueRecord, row: Pick<RowRecord, 'data' | 'raw'> | null, unit: 'rupees' | 'paise') {
  const stored = row ? unpack(row) : null;
  const d = stored?.data;
  const suggestion = (i.suggestion as Suggestion | null) ?? null;
  const resolution = i.resolution as { label?: string; value?: string; action?: string } | null;
  return {
    id: i.id, rowNumber: i.rowNumber, code: i.code, type: i.code, title: issueTitle(i.code), description: i.message, severity: i.severity as 'error' | 'warning',
    field: i.field, affectedFields: i.field ? [i.field] : [], sourceValue: i.value, suggestion, suggestedFix: describeFix(suggestion),
    currentFix: i.status === 'open' ? null : resolution?.action === 'ignore' ? 'Ignored' : resolution?.label ?? resolution?.value ?? null,
    status: i.status as 'open' | 'resolved' | 'ignored', resolution, resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    productData: {
      sku: d?.sku ?? undefined, title: d?.title ?? undefined, category: d?.categoryLabel ?? undefined,
      price: d?.sellingPriceMinor !== undefined ? Number(formatMoney(d.sellingPriceMinor, 'rupees')) : undefined, barcode: d?.barcode ?? undefined, imageUrl: d?.imageUrl ?? undefined,
      source: row?.raw ?? {},
    },
    unit,
  };
}
export type IssueDto = ReturnType<typeof toIssueDto>;

export async function listIssues(tx: Tx, vendorId: string, s: SessionRow, f: IssueFilter, page: { page: number; pageSize: number }) {
  const where: SQL | undefined = and(
    eq(I.vendorId, vendorId), eq(I.sessionId, s.id), f.code ? eq(I.code, f.code) : undefined, f.severity ? eq(I.severity, f.severity) : undefined, f.status ? eq(I.status, f.status) : undefined,
    f.q ? or(ilike(I.message, `%${escapeLike(f.q)}%`), ilike(I.value, `%${escapeLike(f.q)}%`), ilike(R.sku, `%${escapeLike(f.q)}%`), sql`${R.data}->>'title' ILIKE ${`%${escapeLike(f.q)}%`}`) : undefined,
  );
  const from = tx.select({ i: I, row: R }).from(I).leftJoin(R, and(eq(R.sessionId, I.sessionId), eq(R.rowNumber, I.rowNumber), eq(R.vendorId, I.vendorId))).where(where);
  const rows = await from.orderBy(asc(I.rowNumber), asc(I.id)).limit(page.pageSize).offset((page.page - 1) * page.pageSize);
  const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(I).leftJoin(R, and(eq(R.sessionId, I.sessionId), eq(R.rowNumber, I.rowNumber), eq(R.vendorId, I.vendorId))).where(where);
  const unit = readSettings(s.settings).currencyUnit;
  return { items: rows.map((r) => toIssueDto(r.i, r.row, unit)), total: c?.n ?? 0 };
}

export async function issueSummary(tx: Tx, vendorId: string, sessionId: string) {
  const rows = await tx.select({ code: I.code, severity: I.severity, status: I.status, n: sql<number>`count(*)::int` }).from(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId))).groupBy(I.code, I.severity, I.status);
  const byCode = new Map<string, { code: string; title: string; total: number; open: number; resolved: number; ignored: number; errors: number; warnings: number }>();
  const totals = { total: 0, open: 0, resolved: 0, ignored: 0, errors: 0, warnings: 0 };
  for (const r of rows) {
    const e = byCode.get(r.code) ?? { code: r.code, title: issueTitle(r.code), total: 0, open: 0, resolved: 0, ignored: 0, errors: 0, warnings: 0 };
    e.total += r.n; e[r.status as 'open' | 'resolved' | 'ignored'] += r.n; totals.total += r.n; totals[r.status as 'open' | 'resolved' | 'ignored'] += r.n;
    if (r.status === 'open') { if (r.severity === 'error') { e.errors += r.n; totals.errors += r.n; } else { e.warnings += r.n; totals.warnings += r.n; } }
    byCode.set(r.code, e);
  }
  const rowCounts = await tx.select({ status: R.status, n: sql<number>`count(*)::int` }).from(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId))).groupBy(R.status);
  return {
    ...totals,
    byCode: [...byCode.values()].sort((a, b) => b.open - a.open || a.code.localeCompare(b.code)),
    knownCodes: Object.entries(ISSUE_INFO).map(([code, v]) => ({ code, title: v.title })),
    rows: Object.fromEntries(rowCounts.map((r) => [r.status, r.n])) as Record<string, number>,
  };
}

/** recount the status buckets of a session after rows changed state outside a full validation */
export async function recount(tx: Tx, vendorId: string, sessionId: string, extraStats: Record<string, number> = {}): Promise<void> {
  const counts = await tx.select({ status: R.status, n: sql<number>`count(*)::int` }).from(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId))).groupBy(R.status);
  const n = (st: string) => counts.find((c) => c.status === st)?.n ?? 0;
  const [s] = await tx.select({ stats: S.stats }).from(S).where(eq(S.id, sessionId));
  await tx.update(S).set({ validRows: n('valid'), warningRows: n('warning'), errorRows: n('error'), ignoredRows: n('ignored'), committedRows: n('committed'), stats: { ...(s?.stats ?? {}), skippedRows: n('skipped'), ...extraStats } }).where(eq(S.id, sessionId));
}

export interface ResolveInput { action: IssueAction; customValue?: string }

type Outcome = { ok: true; issue: IssueRecord; row: RowRecord } | { ok: false; reason: string };

function assertWorkable(s: SessionRow): void {
  if (isBusy(s.status)) throw new AppError('CONFLICT', `Issues cannot be changed while the import is ${s.status}`, { details: { rule: 'busy', status: s.status } });
  if (s.status === 'committed' || s.status === 'cancelled') throw new AppError('CONFLICT', `This import is ${s.status}`, { details: { rule: 'not_editable', status: s.status } });
}

/** the work of one issue: store the fix (or the dismissal), close the issue, keep the row bucket in line */
async function resolveOne(tx: Tx, vendorId: string, actorId: string | null, issue: IssueRecord, input: ResolveInput, categories: Awaited<ReturnType<typeof loadCategoryIndex>>): Promise<Outcome> {
  if (issue.status !== 'open') return { ok: false, reason: `The issue is already ${issue.status}` };
  const [row] = await tx.select().from(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, issue.sessionId), eq(R.rowNumber, issue.rowNumber)));
  if (!row) return { ok: false, reason: 'The row no longer exists' };
  const stored = unpack(row);
  const suggestion = (issue.suggestion as Suggestion | null) ?? null;
  let resolution: Record<string, unknown>;
  let status: 'resolved' | 'ignored' = 'resolved';

  if (input.action === 'ignore') {
    status = 'ignored';
    resolution = { action: 'ignore' };
    if (issue.severity === 'error') stored.meta.ignored = true;
  } else if (input.action === 'accept_suggestion') {
    if (!suggestion) return { ok: false, reason: 'This issue has no suggested fix; enter a value instead' };
    if (suggestion.kind === 'skip_row') { stored.meta.ignored = true; resolution = { action: 'accept_suggestion', kind: 'skip_row', label: 'Row skipped' }; }
    else {
      stored.fixes[suggestion.field ?? issue.field ?? ''] = suggestion.value ?? '';
      resolution = { action: 'accept_suggestion', kind: suggestion.kind, field: suggestion.field, value: suggestion.value ?? '', label: suggestion.label ?? suggestion.value ?? '' };
    }
  } else {
    const field = issue.field;
    if (!field) return { ok: false, reason: 'This issue is not tied to a column, so it cannot take a value' };
    if (input.customValue === undefined) return { ok: false, reason: 'customValue is required' };
    let value = input.customValue.trim();
    let label = value;
    if (field === 'category') {
      const found = categories.resolve(value);
      if (!found) return { ok: false, reason: `"${value}" is not one of your categories` };
      value = found.id; label = found.label;
    }
    stored.fixes[field] = value;
    resolution = { action: 'custom_value', field, value, label: label === '' ? 'Cleared' : label };
  }
  if (input.action !== 'ignore') stored.meta.fixed = true;

  await tx.update(I).set({ status, resolution, resolvedBy: actorId, resolvedAt: new Date() }).where(eq(I.id, issue.id));
  const [open] = await tx.select({ errors: sql<number>`count(*) filter (where ${I.severity} = 'error')::int`, warnings: sql<number>`count(*) filter (where ${I.severity} = 'warning')::int` })
    .from(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, issue.sessionId), eq(I.rowNumber, issue.rowNumber), eq(I.status, 'open')));
  const next = stored.meta.ignored ? 'ignored' : (open?.errors ?? 0) > 0 ? 'error' : (open?.warnings ?? 0) > 0 ? 'warning' : row.status === 'skipped' ? 'skipped' : 'valid';
  const [after] = await tx.update(R).set({ status: next, issueCount: (open?.errors ?? 0) + (open?.warnings ?? 0), data: pack(stored) }).where(eq(R.id, row.id)).returning();
  const [updated] = await tx.select().from(I).where(eq(I.id, issue.id));
  return { ok: true, issue: updated!, row: after! };
}

/** a data-changing fix makes the stored normalised values stale until the next validation; commit refuses to run before that */
const changesData = (a: IssueAction): boolean => a !== 'ignore';

export async function resolveIssue(tx: Tx, vendorId: string, actorId: string | null, sessionId: string, issueId: string, input: ResolveInput) {
  const s = await getSession(tx, vendorId, sessionId, { forUpdate: true });
  assertWorkable(s);
  const [issue] = await tx.select().from(I).where(and(eq(I.id, issueId), eq(I.sessionId, sessionId), eq(I.vendorId, vendorId)));
  if (!issue) throw Errors.notFound('Issue', issueId);
  const out = await resolveOne(tx, vendorId, actorId, issue, input, await loadCategoryIndex(tx, vendorId));
  if (!out.ok) throw new AppError(out.reason.startsWith('The issue is already') ? 'CONFLICT' : 'VALIDATION_FAILED', out.reason, { details: { rule: out.reason.startsWith('The issue is already') ? 'already_handled' : 'cannot_apply' } });
  await recount(tx, vendorId, sessionId, changesData(input.action) ? { pendingFixes: (s.stats.pendingFixes ?? 0) + 1 } : {});
  return { issue: toIssueDto(out.issue, out.row, readSettings(s.settings).currencyUnit), session: s };
}

export const MAX_BULK_ISSUES = 5_000;

/** apply one decision to every open issue of a code (optionally only those showing one source value) */
export async function resolveBulk(tx: Tx, vendorId: string, actorId: string | null, sessionId: string, input: { code: string; action: IssueAction; customValue?: string; sourceValue?: string }) {
  const s = await getSession(tx, vendorId, sessionId, { forUpdate: true });
  assertWorkable(s);
  const issues = await tx.select().from(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId), eq(I.code, input.code), eq(I.status, 'open'), input.sourceValue !== undefined ? eq(I.value, input.sourceValue) : undefined)).orderBy(asc(I.rowNumber), asc(I.id)).limit(MAX_BULK_ISSUES);
  const categories = await loadCategoryIndex(tx, vendorId);
  let applied = 0;
  const skipped: Array<{ issueId: string; rowNumber: number; reason: string }> = [];
  for (const issue of issues) {
    const out = await resolveOne(tx, vendorId, actorId, issue, input, categories);
    if (out.ok) applied++; else skipped.push({ issueId: issue.id, rowNumber: issue.rowNumber, reason: out.reason });
  }
  await recount(tx, vendorId, sessionId, applied > 0 && changesData(input.action) ? { pendingFixes: (s.stats.pendingFixes ?? 0) + applied } : {});
  return { matched: issues.length, applied, skipped: skipped.slice(0, 100), skippedCount: skipped.length };
}

export async function errorsCsv(tx: Tx, vendorId: string, sessionId: string): Promise<string> {
  const rows = await tx.select({ i: I, sku: R.sku, data: R.data }).from(I)
    .leftJoin(R, and(eq(R.sessionId, I.sessionId), eq(R.rowNumber, I.rowNumber), eq(R.vendorId, I.vendorId)))
    .where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId), eq(I.status, 'open'))).orderBy(asc(I.rowNumber), asc(I.id));
  const lines: Array<Array<string | number | null>> = [['row', 'sku', 'product_title', 'issue', 'severity', 'field', 'value', 'message', 'suggested_fix']];
  for (const r of rows) {
    const title = (r.data as { title?: string } | null)?.title ?? '';
    lines.push([r.i.rowNumber, r.sku ?? '', title, r.i.code, r.i.severity, r.i.field ?? '', r.i.value ?? '', r.i.message, describeFix((r.i.suggestion as Suggestion | null) ?? null) ?? '']);
  }
  return toCsv(lines);
}

export async function listRows(tx: Tx, vendorId: string, sessionId: string, f: { status?: string; q?: string }, page: { page: number; pageSize: number }) {
  const like = f.q ? `%${escapeLike(f.q)}%` : null;
  const where = and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId), f.status ? eq(R.status, f.status) : undefined, like ? or(ilike(R.sku, like), ilike(R.productCode, like), sql`${R.data}->>'title' ILIKE ${like}`) : undefined);
  const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(R).where(where);
  const rows = await tx.select().from(R).where(where).orderBy(asc(R.rowNumber)).limit(page.pageSize).offset((page.page - 1) * page.pageSize);
  const items = rows.map((r) => {
    const st = unpack(r);
    return {
      rowNumber: r.rowNumber, status: r.status, sku: r.sku, productCode: r.productCode, title: st.data.title ?? null, issueCount: r.issueCount, plan: st.meta.plan ?? null,
      skipReason: st.meta.skipReason ?? null, fixed: st.meta.fixed === true, result: st.meta.result ?? null, productId: r.productId, variantId: r.variantId, values: st.data as Record<string, unknown>, raw: r.raw,
    };
  });
  return { items, total: c?.n ?? 0 };
}

