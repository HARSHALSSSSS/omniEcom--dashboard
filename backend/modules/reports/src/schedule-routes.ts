import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, pagedEnvelope, PageQuerySchema, successEnvelope } from '@oms/contracts';
import { audit, created, ok, paged, requireVendor, vendorTx } from '@oms/module-kit';
import { RunSchema, ScheduleBodySchema, SchedulePatchSchema, ScheduleSchema } from './report-schemas';
import { toRunDto } from './runs';
import { createSchedule, deleteSchedule, enqueueRun, getSchedule, listSchedules, runScheduleNow, setScheduleStatus, toScheduleDto, updateSchedule, type ScheduleInput } from './schedules';

const TAGS = ['Report schedules'];
const VersionBody = z.object({ version: z.number().int().min(1).optional() }).strict().default({});

/** Scheduled reports: cadence, recipients, pause / resume, run now. The scheduler tick (`reports.run-schedules`) creates the runs. */
export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const one = async (tx: Parameters<typeof getSchedule>[0], vendorId: string, id: string) => {
    const s = await getSchedule(tx, vendorId, id);
    return toScheduleDto(s, (await listSchedules(tx, vendorId, { page: 1, pageSize: 100 })).last.get(id) ?? null);
  };

  r.get('/reports/schedules', {
    config: { access: { permission: 'reports:read' } },
    schema: {
      tags: TAGS, summary: 'List report schedules', description: 'Name, format, cadence, recipients, next delivery, status and the last run (with its download link while kept).',
      querystring: PageQuerySchema.extend({ 'filter[status]': z.enum(['active', 'paused']).optional() }), response: { 200: pagedEnvelope(ScheduleSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const page = await vendorTx(req, (tx, vendorId) => listSchedules(tx, vendorId, { page: q.page, pageSize: q.pageSize, status: q['filter[status]'] }));
    return paged(req, page.items.map((s) => toScheduleDto(s, page.last.get(s.id) ?? null)), q, page.total);
  });

  r.post('/reports/schedules', {
    config: { access: { permission: 'reports:write' } },
    schema: {
      tags: TAGS, summary: 'Schedule a report',
      description: 'Daily, weekly (`dayOfWeek`) or monthly (`dayOfMonth`, shorter months run on their last day) at `timeOfDay` in `timezone` (default Asia/Kolkata). The report is generated for its own relative period at every run (use `params.range`, for example previous_month). Recipients get an e-mail with a link and the team gets an in-app notification.',
      body: ScheduleBodySchema, response: { 201: successEnvelope(ScheduleSchema) },
    },
  }, async (req, reply) => {
    const dto = await vendorTx(req, async (tx, vendorId) => {
      const s = await createSchedule(tx, vendorId, req.body as ScheduleInput, req.ctx.principal?.actorId ?? null);
      await audit(tx, req, { action: 'report.schedule_created', resourceType: 'report_schedule', resourceId: s.id, after: { name: s.name, type: s.reportType, frequency: s.frequency, recipients: s.recipients } });
      return toScheduleDto(s);
    });
    return created(req, reply, dto, `/api/v1/reports/schedules/${dto.id}`);
  });

  r.get('/reports/schedules/:id', {
    config: { access: { permission: 'reports:read' } },
    schema: { tags: TAGS, summary: 'Get a report schedule', params: IdParamSchema, response: { 200: successEnvelope(ScheduleSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => one(tx, vendorId, req.params.id))));

  r.patch('/reports/schedules/:id', {
    config: { access: { permission: 'reports:write' } },
    schema: { tags: TAGS, summary: 'Change a report schedule', description: 'Send the current `version`; a stale version answers 409 VERSION_CONFLICT. The next run is recomputed.', params: IdParamSchema, body: SchedulePatchSchema, response: { 200: successEnvelope(ScheduleSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const { before, after } = await updateSchedule(tx, vendorId, req.params.id, req.body as Parameters<typeof updateSchedule>[3]);
    await audit(tx, req, { action: 'report.schedule_updated', resourceType: 'report_schedule', resourceId: after.id, before: { name: before.name, frequency: before.frequency, recipients: before.recipients, status: before.status }, after: { name: after.name, frequency: after.frequency, recipients: after.recipients, status: after.status } });
    return one(tx, vendorId, after.id);
  })));

  r.delete('/reports/schedules/:id', {
    config: { access: { permission: 'reports:write' } },
    schema: { tags: TAGS, summary: 'Delete a report schedule', description: 'Past runs stay in the history (without the schedule link).', params: IdParamSchema, response: { 200: successEnvelope(z.object({ deleted: z.literal(true), id: z.string() })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const s = await deleteSchedule(tx, vendorId, req.params.id);
    await audit(tx, req, { action: 'report.schedule_deleted', resourceType: 'report_schedule', resourceId: s.id, before: { name: s.name, type: s.reportType } });
    return { deleted: true as const, id: s.id };
  })));

  for (const [path, status, summary] of [['pause', 'paused', 'Pause a report schedule'], ['resume', 'active', 'Resume a report schedule']] as const) {
    r.post(`/reports/schedules/:id/${path}`, {
      config: { access: { permission: 'reports:write' } },
      schema: { tags: TAGS, summary, description: 'Idempotent: a schedule that already has that status is returned unchanged. Resuming computes the next run from now (missed runs are not replayed).', params: IdParamSchema, body: VersionBody, response: { 200: successEnvelope(ScheduleSchema) } },
    }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
      const { before, after } = await setScheduleStatus(tx, vendorId, req.params.id, status);
      if (before.version !== after.version) await audit(tx, req, { action: `report.schedule_${path}d`, resourceType: 'report_schedule', resourceId: after.id });
      return one(tx, vendorId, after.id);
    })));
  }

  r.post('/reports/schedules/:id/run-now', {
    config: { access: { permission: 'reports:write' } },
    schema: { tags: TAGS, summary: 'Run a schedule now', description: 'Generates the report immediately through a background job (202) with the schedule\'s parameters and tells its recipients like a scheduled run. The next scheduled time does not change.', params: IdParamSchema, response: { 202: successEnvelope(RunSchema) } },
  }, async (req, reply) => {
    const vendorId = requireVendor(req);
    const run = await vendorTx(req, async (tx) => {
      const x = await runScheduleNow(tx, vendorId, req.params.id, req.ctx.principal?.actorId ?? null);
      await audit(tx, req, { action: 'report.schedule_run_now', resourceType: 'report_schedule', resourceId: req.params.id, metadata: { runId: x.id, type: x.reportType } });
      return x;
    });
    await enqueueRun(c, vendorId, run.id, req.ctx.correlationId);
    reply.code(202);
    return ok(req, toRunDto(run));
  });
};
