import { and, eq, schema, sql, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { ISSUE_INFO, LIMITS, type IssueCode } from '../domain/catalogue';
import type { Plan, RowData } from '../domain/rows';
import { readSettings } from '../domain/settings';

export const S = schema.importSessions;
export const R = schema.importRows;
export const I = schema.importIssues;
export type SessionRow = typeof S.$inferSelect;
export type RowRecord = typeof R.$inferSelect;
export type IssueRecord = typeof I.$inferSelect;

export const JOBS = { validate: 'product-import.validate', commit: 'product-import.commit' } as const;

export const storageKey = (vendorId: string, sessionId: string, ext: string): string => `vendors/${vendorId}/imports/${sessionId}/source.${ext}`;

/** what the seller did to a row and what the importer did with it, kept next to the normalised values in `import_rows.data` */
export interface RowMeta {
  plan?: Plan | null;
  skipReason?: string | null;
  /** the seller excluded the row (skip_row, or ignoring one of its errors) */
  ignored?: boolean;
  /** at least one suggested or typed fix was applied */
  fixed?: boolean;
  result?: { action: 'created' | 'updated' | 'variant_added' | 'skipped'; productId?: string; variantId?: string; stock?: 'received' | 'counted' | 'unchanged' | 'none'; listingDrafts?: number; notes?: string[] };
}
export interface StoredRow { data: RowData; fixes: Record<string, string>; meta: RowMeta }

export function unpack(row: Pick<RowRecord, 'data'>): StoredRow {
  const { __fixes, __meta, ...data } = row.data as RowData & { __fixes?: Record<string, string>; __meta?: RowMeta };
  return { data, fixes: __fixes ?? {}, meta: __meta ?? {} };
}
export const pack = (s: StoredRow): Record<string, unknown> => ({ ...s.data, __fixes: s.fixes, __meta: s.meta });

export async function getSession(tx: Tx, vendorId: string, id: string, opts: { forUpdate?: boolean } = {}): Promise<SessionRow> {
  const q = tx.select().from(S).where(and(eq(S.id, id), eq(S.vendorId, vendorId)));
  const [row] = await (opts.forUpdate ? q.for('update') : q);
  if (!row) throw Errors.notFound('Import', id);
  return row;
}

export const UI_STATUS: Record<string, 'pending' | 'uploading' | 'analyzing' | 'mapping' | 'processing' | 'completed' | 'needs_attention' | 'failed'> = {
  created: 'pending', uploaded: 'analyzing', analyzed: 'mapping', validating: 'processing', validated: 'needs_attention', committing: 'processing',
  committed: 'completed', partially_committed: 'needs_attention', failed: 'failed', cancelled: 'failed',
};

export interface IssueTotals { total: number; open: number; resolved: number; ignored: number; openErrors: number; openWarnings: number }

export async function issueTotals(tx: Tx, vendorId: string, sessionId: string): Promise<IssueTotals> {
  const rows = await tx
    .select({ status: I.status, severity: I.severity, n: sql<number>`count(*)::int` })
    .from(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId))).groupBy(I.status, I.severity);
  const t: IssueTotals = { total: 0, open: 0, resolved: 0, ignored: 0, openErrors: 0, openWarnings: 0 };
  for (const r of rows) {
    t.total += r.n;
    if (r.status === 'open') { t.open += r.n; if (r.severity === 'error') t.openErrors += r.n; else t.openWarnings += r.n; }
    else if (r.status === 'resolved') t.resolved += r.n;
    else t.ignored += r.n;
  }
  return t;
}

export function toSessionDto(s: SessionRow, issues: IssueTotals) {
  const total = s.rowCount;
  const working = s.status === 'committing' ? s.committedRows + (s.stats.failedRows ?? 0) : s.processedRows;
  const target = s.status === 'committing' ? s.stats.commitTotal ?? total : total;
  const percent = s.status === 'validated' || s.status === 'committed' || s.status === 'partially_committed' ? 100 : target > 0 ? Math.min(100, Math.floor((working / target) * 100)) : 0;
  const elapsed = s.startedAt ? Date.now() - s.startedAt.getTime() : 0;
  const busy = s.status === 'validating' || s.status === 'committing';
  const etaSeconds = busy && working > 0 && elapsed > 0 ? Math.max(0, Math.ceil(((target - working) * (elapsed / working)) / 1000)) : null;
  return {
    id: s.id,
    source: s.source,
    fileName: s.fileName,
    fileSizeBytes: s.fileSizeBytes,
    status: s.status as (typeof schema.IMPORT_SESSION_STATUSES)[number],
    uiStatus: UI_STATUS[s.status] ?? 'pending',
    headers: s.headers,
    settings: readSettings(s.settings),
    counters: {
      total, processed: s.processedRows, valid: s.validRows, warning: s.warningRows, error: s.errorRows, ignored: s.ignoredRows, skipped: s.stats.skippedRows ?? 0,
      committed: s.committedRows, failed: s.stats.failedRows ?? 0, percent, etaSeconds,
    },
    issues: { total: issues.total, open: issues.open, resolved: issues.resolved, ignored: issues.ignored, openErrors: issues.openErrors, openWarnings: issues.openWarnings },
    results: { productsCreated: s.stats.productsCreated ?? 0, productsUpdated: s.stats.productsUpdated ?? 0, variantsCreated: s.stats.variantsCreated ?? 0, variantsUpdated: s.stats.variantsUpdated ?? 0 },
    failureMessage: s.failureMessage,
    requestedBy: s.requestedBy,
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    version: s.version,
  };
}
export type SessionDto = ReturnType<typeof toSessionDto>;

export const issueTitle = (code: string): string => ISSUE_INFO[code as IssueCode]?.title ?? code;
export const MAX_FILE_BYTES = LIMITS.maxBytes;

/** statuses in which the file, mapping and settings may still change */
export const EDITABLE_STATUSES = ['created', 'uploaded', 'analyzed', 'validated', 'partially_committed', 'failed'] as const;
export const isBusy = (status: string): boolean => status === 'validating' || status === 'committing';
