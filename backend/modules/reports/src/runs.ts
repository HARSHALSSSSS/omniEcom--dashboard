import { and, count, desc, eq, isNotNull, lt, schema, withSystem, withVendor, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { sanitizeFileName, tenantKey } from '@oms/storage';
import type { Container } from '@oms/module-kit';
import { defOf, type ReportDef } from './catalog';
import { deliverRun, notifyFailure } from './delivery';
import { splitParams, type RunMeta } from './run-meta';
import { FORMAT_META, renderDocument } from './render';
import { documentRows, type ReportFormat } from './tabular';

const R = schema.reportRuns;
const SCH = schema.reportSchedules;
export type RunRow = typeof R.$inferSelect;

export const REPORT_RETENTION_DAYS = 30;
/** a manual export whose estimated source rows stay under this is generated inside the request */
export const INLINE_MAX_ROWS = 2_000;
export const JOB_GENERATE = 'reports.generate';
const MAX_ROWS: Record<ReportFormat, number> = { csv: 200_000, xlsx: 200_000, pdf: 20_000 };
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const STALE_RUNNING_MS = 10 * 60_000;

export function toRunDto(r: RunRow, now = new Date()) {
  const { visible, meta } = splitParams(r.params);
  const downloadable = r.status === 'succeeded' && r.fileKey !== null && (r.expiresAt === null || r.expiresAt > now);
  return {
    id: r.id, reportType: r.reportType, reportTitle: defOf(r.reportType)?.title ?? r.reportType, format: r.format as ReportFormat, params: visible,
    status: r.status as 'queued' | 'running' | 'succeeded' | 'failed', trigger: r.trigger as 'manual' | 'schedule', scheduleId: r.scheduleId, scheduleName: meta.schedule?.name ?? null,
    period: meta.period ?? null, fileName: r.fileName, sizeBytes: r.sizeBytes, rowCount: r.rowCount, warnings: meta.warnings ?? null, notes: meta.notes ?? [], settlementDataAvailable: meta.settlementDataAvailable ?? null,
    error: r.error, requestedBy: r.requestedBy, startedAt: r.startedAt?.toISOString() ?? null, finishedAt: r.finishedAt?.toISOString() ?? null, expiresAt: r.expiresAt?.toISOString() ?? null,
    downloadable, downloadUrl: downloadable ? `/api/v1/reports/runs/${r.id}/download` : null, createdAt: r.createdAt.toISOString(),
  };
}

export async function createRun(tx: Tx, vendorId: string, i: { def: ReportDef; format: ReportFormat; params: Record<string, unknown>; trigger: 'manual' | 'schedule'; scheduleId?: string | null; scheduleName?: string | null; requestedBy?: string | null }): Promise<RunRow> {
  const params = { ...i.params, ...(i.scheduleName ? { __schedule: { name: i.scheduleName } } : {}) };
  const [row] = await tx.insert(R).values({ vendorId, scheduleId: i.scheduleId ?? null, reportType: i.def.type, format: i.format, params, trigger: i.trigger, status: 'queued', requestedBy: i.requestedBy ?? null }).returning();
  return row!;
}

export async function getRun(tx: Tx, vendorId: string, id: string): Promise<RunRow> {
  const [r] = await tx.select().from(R).where(and(eq(R.id, id), eq(R.vendorId, vendorId)));
  if (!r) throw Errors.notFound('Report run', id);
  return r;
}

export async function listRuns(tx: Tx, vendorId: string, q: { page: number; pageSize: number; type?: string; status?: string; scheduleId?: string; trigger?: string }) {
  const where = and(eq(R.vendorId, vendorId), q.type ? eq(R.reportType, q.type) : undefined, q.status ? eq(R.status, q.status) : undefined, q.scheduleId ? eq(R.scheduleId, q.scheduleId) : undefined, q.trigger ? eq(R.trigger, q.trigger) : undefined);
  const [c] = await tx.select({ n: count() }).from(R).where(where);
  const items = await tx.select().from(R).where(where).orderBy(desc(R.createdAt), desc(R.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  return { items, total: Number(c?.n ?? 0) };
}

export interface GeneratedFile { body: Buffer; contentType: string; fileName: string }

/** the stored file of a finished run, for the authenticated download */
export async function readRunFile(tx: Tx, c: Container, vendorId: string, id: string): Promise<GeneratedFile> {
  const r = await getRun(tx, vendorId, id);
  if (r.status !== 'succeeded') throw new AppError('INVALID_STATE', `This report is ${r.status}, there is no file to download`, { details: { rule: 'run_not_ready', status: r.status } });
  if (!r.fileKey || (r.expiresAt && r.expiresAt <= new Date())) throw new AppError('NOT_FOUND', 'The file of this report has expired. Generate it again.', { details: { rule: 'file_expired' } });
  const body = await c.storage.get(r.fileKey);
  if (!body) throw new AppError('NOT_FOUND', 'The file of this report is no longer stored. Generate it again.', { details: { rule: 'file_expired' } });
  return { body, contentType: FORMAT_META[r.format as ReportFormat].contentType, fileName: r.fileName ?? `report.${FORMAT_META[r.format as ReportFormat].extension}` };
}

const failureText = (e: unknown): string => (e instanceof AppError && e.expose ? e.message : 'The report could not be generated');

/**
 * Generates the file of a queued run: build the document (read-only, tenant scoped), render, store, record. Used by the request
 * (small reports) and by the `reports.generate` job. Safe to call twice: a run that is not queued is left alone.
 * Returns the error for a failed run so a request can answer with it; the failure is also recorded on the run.
 */
export async function executeRun(c: Container, vendorId: string, runId: string): Promise<{ run: RunRow; error: unknown | null }> {
  const db = c.database.db;
  const claimed = await withVendor(db, vendorId, async (tx) => {
    const [r] = await tx.select().from(R).where(and(eq(R.id, runId), eq(R.vendorId, vendorId))).for('update');
    if (!r) return null;
    const stale = r.status === 'running' && r.startedAt !== null && Date.now() - r.startedAt.getTime() > STALE_RUNNING_MS;
    if (r.status !== 'queued' && !stale) return { run: r, skip: true };
    const [u] = await tx.update(R).set({ status: 'running', startedAt: new Date(), error: null }).where(eq(R.id, runId)).returning();
    return { run: u!, skip: false };
  });
  if (!claimed) throw Errors.notFound('Report run', runId);
  if (claimed.skip) return { run: claimed.run, error: null };
  const run = claimed.run;
  const def = defOf(run.reportType);
  const format = run.format as ReportFormat;
  const { visible, meta: runMeta } = splitParams(run.params);

  try {
    if (!def) throw new AppError('BAD_REQUEST', `Unknown report type ${run.reportType}`);
    const now = new Date();
    const built = await withVendor(db, vendorId, async (tx) => {
      const [v] = await tx.select({ tz: schema.vendors.timezone, name: schema.vendors.displayName }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
      const timezone = v?.tz ?? 'Asia/Kolkata';
      const window = def.resolve(visible, timezone, now);
      return { window, result: await def.build({ tx, vendorId, timezone, businessName: v?.name ?? '', params: visible, window, now }) };
    });
    const doc = built.result.document;
    if (documentRows(doc) > MAX_ROWS[format]) throw new AppError('PAYLOAD_TOO_LARGE', `This report has too many rows for ${format}. Choose a shorter period or another format.`, { details: { rule: 'report_too_large' } });
    const body = renderDocument(doc, format);
    if (body.length > MAX_FILE_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'The report file would be too large. Choose a shorter period.', { details: { rule: 'report_too_large' } });
    const w = built.window;
    const fileName = sanitizeFileName(`${def.type}_${w.fromDay}${w.toDay === w.fromDay ? '' : `_to_${w.toDay}`}.${FORMAT_META[format].extension}`);
    const key = tenantKey(vendorId, 'reports', runId, fileName);
    await c.storage.put(key, body, FORMAT_META[format].contentType);
    const result: RunMeta = { period: { fromDay: w.fromDay, toDay: w.toDay, label: w.label }, warnings: built.result.meta.warnings, notes: built.result.meta.notes, ...(built.result.meta.settlementDataAvailable !== undefined ? { settlementDataAvailable: built.result.meta.settlementDataAvailable } : {}) };
    const finishedAt = new Date();
    const done = await withVendor(db, vendorId, async (tx) => {
      const [u] = await tx.update(R).set({
        status: 'succeeded', fileKey: key, fileName, sizeBytes: body.length, rowCount: doc.sheets[doc.primarySheet]?.rows.length ?? 0, finishedAt, expiresAt: new Date(finishedAt.getTime() + REPORT_RETENTION_DAYS * 86_400_000),
        params: { ...run.params, __result: result }, error: null,
      }).where(eq(R.id, runId)).returning();
      if (run.scheduleId) await tx.update(SCH).set({ lastRunAt: finishedAt, lastRunStatus: 'succeeded' }).where(and(eq(SCH.id, run.scheduleId), eq(SCH.vendorId, vendorId)));
      await tx.insert(schema.auditLogs).values({ vendorId, actorType: run.requestedBy ? 'user' : 'system', actorId: run.requestedBy ?? 'reports', action: 'report.generated', source: 'job', resourceType: 'report_run', resourceId: runId, metadata: { type: run.reportType, format, bytes: body.length, trigger: run.trigger } });
      return u!;
    });
    if (run.scheduleId) await deliverRun(c, vendorId, done, def, runMeta.schedule?.name ?? def.title).catch((e: unknown) => c.logger.warn({ runId, err: (e as Error).message }, 'report delivery failed'));
    return { run: done, error: null };
  } catch (e) {
    const failedAt = new Date();
    const failed = await withVendor(db, vendorId, async (tx) => {
      const [u] = await tx.update(R).set({ status: 'failed', error: failureText(e), finishedAt: failedAt }).where(eq(R.id, runId)).returning();
      if (run.scheduleId) await tx.update(SCH).set({ lastRunAt: failedAt, lastRunStatus: 'failed' }).where(and(eq(SCH.id, run.scheduleId), eq(SCH.vendorId, vendorId)));
      return u!;
    });
    if (!(e instanceof AppError)) c.logger.error({ runId, err: (e as Error).message }, 'report generation failed');
    if (run.scheduleId) await notifyFailure(c, vendorId, failed, runMeta.schedule?.name ?? run.reportType).catch(() => undefined);
    return { run: failed, error: e };
  }
}

/** Removes the files of runs past their retention. The run rows stay as history. */
export async function purgeExpiredFiles(c: Container, now = new Date(), limit = 200): Promise<number> {
  const due = await withSystem(c.database.db, (tx) => tx.select({ id: R.id, vendorId: R.vendorId, key: R.fileKey }).from(R).where(and(isNotNull(R.fileKey), lt(R.expiresAt, now))).limit(limit));
  let purged = 0;
  for (const d of due) {
    try {
      await c.storage.delete(d.key!);
      await withVendor(c.database.db, d.vendorId, (tx) => tx.update(R).set({ fileKey: null }).where(and(eq(R.id, d.id), eq(R.vendorId, d.vendorId))));
      purged++;
    } catch (e) { c.logger.warn({ runId: d.id, err: (e as Error).message }, 'report file purge failed'); }
  }
  return purged;
}
