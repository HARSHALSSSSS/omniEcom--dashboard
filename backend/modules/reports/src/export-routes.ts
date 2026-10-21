import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { desc, eq, schema } from '@oms/database';
import { IdParamSchema, pagedEnvelope, PageQuerySchema, successEnvelope } from '@oms/contracts';
import { audit, ok, paged, requireVendor, vendorTx } from '@oms/module-kit';
import { assertFormat, checkParams, defOf, REPORT_DEFS, REPORT_TYPES, toCatalogEntry } from './catalog';
import { RANGE_LABEL, RANGES, relativeWindow } from './params';
import { CatalogEntrySchema, ExportBodySchema, ReportTypeSchema, RunSchema, ScheduleSchema, FormatSchema } from './report-schemas';
import { createRun, executeRun, getRun, INLINE_MAX_ROWS, listRuns, readRunFile, toRunDto } from './runs';
import { enqueueRun, listSchedules, toScheduleDto } from './schedules';
import { localParts } from './tz';

const TAGS = ['Report exports'];
const R = schema.reportRuns;
const PeriodSchema = z.object({ key: z.string(), label: z.string(), from: z.string(), to: z.string(), fromDay: z.string(), toDay: z.string() });

/** Exports (csv / xlsx / pdf files of the reports), their run history and downloads. Schedules live in schedule-routes. */
export const exportRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;

  r.get('/reports/catalog', {
    config: { access: { permission: 'reports:read' } },
    schema: {
      tags: TAGS, summary: 'Report catalog', description: 'The report types that can be exported: description, formats, parameters (`relative` ones are allowed in schedules), the sheets of the xlsx / pdf and what the csv contains. Also the period shortcuts.',
      response: { 200: successEnvelope(z.object({ types: z.array(CatalogEntrySchema), periods: z.array(z.object({ key: z.string(), label: z.string() })), formats: z.array(FormatSchema) })) },
    },
  }, async (req) => ok(req, { types: REPORT_TYPES.map((t) => toCatalogEntry(REPORT_DEFS[t])), periods: RANGES.map((k) => ({ key: k, label: RANGE_LABEL[k] })), formats: ['csv', 'xlsx', 'pdf'] as Array<'csv' | 'xlsx' | 'pdf'> }));

  r.get('/reports/overview', {
    config: { access: { permission: 'reports:read' } },
    schema: {
      tags: TAGS, summary: 'Reports page overview',
      description: 'Everything the Reports page needs in one call: the three featured downloads with a ready button label and parameters (for example "Download October 2026"), period shortcuts resolved in the business time zone, recent runs and the schedule counts.',
      response: { 200: successEnvelope(z.object({
        timezone: z.string(), today: z.string(), periods: z.array(PeriodSchema),
        featured: z.array(z.object({ type: ReportTypeSchema, title: z.string(), description: z.string(), formats: z.array(FormatSchema), defaultFormat: FormatSchema, buttonLabel: z.string(), suggestedParams: z.record(z.string(), z.unknown()), lastRun: RunSchema.nullable() })),
        recentRuns: z.array(RunSchema), schedules: z.object({ total: z.number().int(), active: z.number().int(), paused: z.number().int(), nextRunAt: z.string().nullable(), next: ScheduleSchema.nullable() }),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const [v] = await tx.select({ tz: schema.vendors.timezone }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
    const tz = v?.tz ?? 'Asia/Kolkata';
    const now = new Date();
    const p = localParts(now, tz);
    const periods = (['this_month', 'previous_month', 'last_7_days', 'last_30_days', 'this_financial_year', 'previous_financial_year'] as const).map((key) => {
      const w = relativeWindow(key, tz, now);
      return { key, label: w.label === w.fromDay ? RANGE_LABEL[key] : w.label, from: w.from.toISOString(), to: w.to.toISOString(), fromDay: w.fromDay, toDay: w.toDay };
    });
    const month = relativeWindow('this_month', tz, now);
    const recent = await tx.select().from(R).where(eq(R.vendorId, vendorId)).orderBy(desc(R.createdAt), desc(R.id)).limit(8);
    const lastOf = async (type: string) => (await tx.select().from(R).where(eq(R.vendorId, vendorId)).orderBy(desc(R.createdAt)).limit(200)).find((x) => x.reportType === type && x.status === 'succeeded');
    const feature = async (type: 'gst_register' | 'settlement_audit' | 'inventory_valuation', buttonLabel: string, suggestedParams: Record<string, unknown>) => {
      const d = REPORT_DEFS[type];
      const last = await lastOf(type);
      return { type, title: d.title, description: d.description, formats: [...d.formats], defaultFormat: d.defaultFormat, buttonLabel, suggestedParams, lastRun: last ? toRunDto(last, now) : null };
    };
    const sched = await listSchedules(tx, vendorId, { page: 1, pageSize: 100 });
    const active = sched.items.filter((s) => s.status === 'active');
    const next = active.filter((s) => s.nextRunAt).sort((a, b) => a.nextRunAt!.getTime() - b.nextRunAt!.getTime())[0] ?? null;
    return {
      timezone: tz, today: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`, periods,
      featured: [
        await feature('gst_register', `Download ${month.label}`, { month: `${p.year}-${String(p.month).padStart(2, '0')}` }),
        await feature('settlement_audit', 'Download Settlement Log', { range: 'previous_month' }),
        await feature('inventory_valuation', 'Download Valuation PDF', {}),
      ],
      recentRuns: recent.map((x) => toRunDto(x, now)),
      schedules: { total: sched.total, active: active.length, paused: sched.items.length - active.length, nextRunAt: next?.nextRunAt?.toISOString() ?? null, next: next ? toScheduleDto(next, sched.last.get(next.id) ?? null) : null },
    };
  })));

  r.post('/reports/exports', {
    config: { access: { permission: 'reports:write' } },
    schema: {
      tags: TAGS, summary: 'Export a report as csv, xlsx or pdf',
      description: `Creates a run. Small reports are generated inside the request (201, status succeeded, \`downloadUrl\` set); big ones (over ${INLINE_MAX_ROWS} source rows) or \`background: true\` go through a job (202, status queued: poll \`GET /reports/runs/{id}\`). A report that cannot be built (for example the GST register without a GSTIN) answers with its error and the failed run is kept in the history.`,
      body: ExportBodySchema,
      response: { 201: successEnvelope(RunSchema), 202: successEnvelope(RunSchema) },
    },
  }, async (req, reply) => {
    const vendorId = requireVendor(req);
    const body = req.body;
    const { run, inline } = await vendorTx(req, async (tx) => {
      const def = defOf(body.type)!;
      assertFormat(def, body.format);
      const params = checkParams(def, body.params, { forSchedule: false });
      const [v] = await tx.select({ tz: schema.vendors.timezone }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
      const window = def.resolve(params, v?.tz ?? 'Asia/Kolkata', new Date());
      const inline = !body.background && (await def.estimate(tx, vendorId, window)) <= INLINE_MAX_ROWS;
      const run = await createRun(tx, vendorId, { def, format: body.format, params, trigger: 'manual', requestedBy: req.ctx.principal?.actorId ?? null });
      await audit(tx, req, { action: 'report.export_requested', resourceType: 'report_run', resourceId: run.id, metadata: { type: body.type, format: body.format, params, inline } });
      return { run, inline };
    });
    if (!inline) {
      await enqueueRun(c, vendorId, run.id, req.ctx.correlationId);
      reply.code(202);
      return ok(req, toRunDto(run));
    }
    const done = await executeRun(c, vendorId, run.id);
    if (done.error) throw done.error;
    reply.code(201);
    return ok(req, toRunDto(done.run));
  });

  r.get('/reports/runs', {
    config: { access: { permission: 'reports:read' } },
    schema: {
      tags: TAGS, summary: 'List report runs', description: 'Newest first. Filters: `filter[type]`, `filter[status]`, `filter[scheduleId]`, `filter[trigger]`.',
      querystring: PageQuerySchema.extend({ 'filter[type]': ReportTypeSchema.optional(), 'filter[status]': z.enum(['queued', 'running', 'succeeded', 'failed']).optional(), 'filter[scheduleId]': z.uuid().optional(), 'filter[trigger]': z.enum(['manual', 'schedule']).optional() }),
      response: { 200: pagedEnvelope(RunSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const page = await vendorTx(req, (tx, vendorId) => listRuns(tx, vendorId, { page: q.page, pageSize: q.pageSize, type: q['filter[type]'], status: q['filter[status]'], scheduleId: q['filter[scheduleId]'], trigger: q['filter[trigger]'] }));
    return paged(req, page.items.map((x) => toRunDto(x)), q, page.total);
  });

  r.get('/reports/runs/:id', {
    config: { access: { permission: 'reports:read' } },
    schema: { tags: TAGS, summary: 'Get a report run', description: 'Status, period, file name, size, rows, warnings and the download link while the file is kept.', params: IdParamSchema, response: { 200: successEnvelope(RunSchema) } },
  }, async (req) => ok(req, toRunDto(await vendorTx(req, (tx, vendorId) => getRun(tx, vendorId, req.params.id)))));

  r.get('/reports/runs/:id/download', {
    config: { access: { permission: 'reports:read' } },
    schema: { tags: TAGS, summary: 'Download the file of a report run', description: 'The csv, xlsx or pdf with the right content type, as an attachment. Authenticated; the file is kept for 30 days, then 404 `file_expired`.', params: IdParamSchema, response: { 200: z.unknown().describe('binary file (csv, xlsx or pdf)') } },
  }, async (req, reply) => {
    const file = await vendorTx(req, async (tx, vendorId) => {
      const f = await readRunFile(tx, c, vendorId, req.params.id);
      await audit(tx, req, { action: 'report.downloaded', resourceType: 'report_run', resourceId: req.params.id, metadata: { fileName: f.fileName } });
      return f;
    });
    return reply.header('Content-Type', file.contentType).header('Content-Disposition', `attachment; filename="${file.fileName}"`).header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').send(file.body);
  });
};
