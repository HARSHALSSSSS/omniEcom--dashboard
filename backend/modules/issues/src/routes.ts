import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema } from '@oms/database';
import { AppError, Errors, isAppError } from '@oms/shared';
import { IdParamSchema, PageQuerySchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { audit, ok, pageWindow, paged, requireVendor, vendorTx } from '@oms/module-kit';
import { ATTEMPTABLE, failureBanner, precheck, runAttempt } from './attempt';
import { bounds, sweepVendor, type Actor } from './engine';
import * as svc from './service';

const TAGS = ['Issues'];
const Area = z.enum(schema.ISSUE_AREAS);
const Priority = z.enum(schema.ISSUE_PRIORITIES);
const ActionSchema = z.object({ text: z.string().optional(), label: z.string().optional(), href: z.string().optional() });
const IssueSchema = z.object({
  id: z.string(), key: z.string(), area: z.string(), priority: z.string(), status: z.string(), title: z.string(), explanation: z.string(), impact: z.string().nullable(), count: z.number().int(),
  dueAt: z.string().nullable(), dueLabel: z.string().nullable().describe('Display text in the business time zone: Today, Today, 3:30 PM, Tomorrow, Overdue, Oct 21'), recommendedAction: ActionSchema,
  assignedTo: z.string().nullable(), assigneeName: z.string().nullable().describe('Display name of the assignee'), snoozedUntil: z.string().nullable(), statusNote: z.string().nullable().describe('"Review started" / "Resolution failed" line under an in-progress or failed issue'), firstSeenAt: z.string(), updatedAt: z.string(),
}).meta({ id: 'Issue' });
const DetailSchema = IssueSchema.extend({
  whyItMatters: z.string(),
  affected: z.object({ total: z.number().int(), items: z.array(z.object({ type: z.string(), id: z.string(), label: z.string(), href: z.string().nullable() })) }),
  deadline: z.object({ at: z.string().nullable(), label: z.string().nullable() }),
  resolution: z.string().nullable(), resolvedAt: z.string().nullable(),
  timeline: z.array(z.object({ type: z.string(), actorType: z.string(), actorId: z.string().nullable(), note: z.string().nullable(), at: z.string() })),
}).meta({ id: 'IssueDetail' });
const Until = z.string().min(1).max(40).describe('later_today | tomorrow | this_week | YYYY-MM-DD | ISO time');
const ListQuery = PageQuerySchema.extend({
  tab: z.enum(['all', 'critical', 'today', 'upcoming']).default('all'),
  'filter[area]': Area.optional(), 'filter[priority]': Priority.optional(), 'filter[status]': z.enum(['open', 'in_progress', 'snoozed']).optional().describe('Default: open and in progress'),
  'filter[due]': z.enum(['today', 'tomorrow', 'this_week']).optional(), sort: z.enum(['priority', 'due', 'updated']).default('priority').describe('priority (then due) by default'),
});

const actorOf = (req: FastifyRequest): Actor => ({ type: req.ctx.principal?.actorType ?? 'user', id: req.ctx.principal?.actorId ?? null });

/** Issues: the "Needs attention" queue. Detectors in `detectors.ts`, state machine in `service.ts`, sweep in `engine.ts`. */
export const issueRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;

  r.get('/issues', {
    config: { access: { permission: 'issues:read' } },
    schema: {
      tags: TAGS, summary: 'The issue queue (grouped problems), ranked by priority then due time',
      description: 'Tabs: all, critical, today (due before the end of today in the business time zone, overdue included) and upcoming (due later or no due date). By default only open and in-progress issues are listed.',
      querystring: ListQuery, response: { 200: pagedEnvelope(IssueSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const out = await vendorTx(req, (tx, vendorId) => svc.listIssues(tx, vendorId, { tab: q.tab, area: q['filter[area]'], priority: q['filter[priority]'], status: q['filter[status]'], due: q['filter[due]'], sort: q.sort }, pageWindow(q)));
    return paged(req, out.items, q, out.total);
  });

  r.get('/issues/counts', {
    config: { access: { permission: 'issues:read' } },
    schema: {
      tags: TAGS, summary: 'Open issue count, tab counts and counts per area (sidebar badge, dashboard)', description: 'Counts open + in-progress issues with the same rules as the list tabs.',
      response: { 200: successEnvelope(z.object({ open: z.number().int(), tabs: z.object({ all: z.number().int(), critical: z.number().int(), today: z.number().int(), upcoming: z.number().int() }), byArea: z.record(z.string(), z.number().int()), updatedAt: z.string() })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.issueCounts(tx, vendorId))));

  r.get('/issues/history', {
    config: { access: { permission: 'issues:read' } },
    schema: {
      tags: TAGS, summary: 'Resolved and snoozed issues', querystring: PageQuerySchema.extend({ status: z.enum(['all', 'resolved', 'snoozed']).default('all') }),
      response: { 200: successEnvelope(z.object({
        items: z.array(z.object({ id: z.string(), title: z.string(), area: z.string(), status: z.string(), updatedAt: z.string(), resolvedBy: z.string().nullable(), resolution: z.string().nullable(), returnsAt: z.string().nullable(), returnsLabel: z.string().nullable(), recommendedAction: ActionSchema })),
        page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: z.object({ all: z.number().int(), resolved: z.number().int(), snoozed: z.number().int() }),
      })) },
    },
  }, async (req) => {
    const q = req.query;
    const out = await vendorTx(req, (tx, vendorId) => svc.issueHistory(tx, vendorId, q.status, pageWindow(q)));
    return ok(req, { items: out.items, page: q.page, pageSize: q.pageSize, total: out.total, pages: Math.max(1, Math.ceil(out.total / q.pageSize)), counts: out.counts });
  });

  r.get('/issues/assignees', {
    config: { access: { permission: 'issues:write' } },
    schema: {
      tags: TAGS, summary: 'Members an issue can be assigned to', description: 'Active members of the business (id, name). Needs issues:write only, so staff can pick an assignee without the admin-only users:read.',
      response: { 200: successEnvelope(z.array(z.object({ id: z.string(), name: z.string(), email: z.string() }))) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.assignableMembers(tx, vendorId))));

  r.get('/issues/recommendation', {
    config: { access: { permission: 'issues:read' } },
    schema: {
      tags: TAGS, summary: 'The "Recommended action" banner of the queue (null when there is nothing to say)', description: 'Computed from low stock and the last 7 days of sales.',
      response: { 200: successEnvelope(z.object({ text: z.string(), evidence: z.record(z.string(), z.unknown()), action: z.object({ label: z.string(), href: z.string() }) }).nullable()) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.recommendation(tx, vendorId))));

  r.post('/issues/refresh', {
    config: { access: { permission: 'issues:write' } },
    schema: {
      tags: TAGS, summary: 'Run the detectors for this business now', description: 'Same as the scheduled sweep (every 5 minutes) but only for the caller\'s business. Idempotent.',
      response: { 200: successEnvelope(z.object({ created: z.number().int(), updated: z.number().int(), reopened: z.number().int(), autoResolved: z.number().int(), unsnoozed: z.number().int(), detectors: z.number().int(), failedDetectors: z.array(z.string()), open: z.number().int() })) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await sweepVendor(tx, vendorId);
    await audit(tx, req, { action: 'issue.refresh', resourceType: 'issue', resourceId: vendorId, after: { ...res } });
    return res;
  })));

  r.post('/issues/bulk', {
    config: { access: { permission: 'issues:write' } },
    schema: {
      tags: TAGS, summary: 'Resolve, snooze or assign several issues at once (partial success allowed)', description: 'At most 100 ids. Every id gets its own result; one failing id never blocks the others.',
      body: z.object({ ids: z.array(z.uuid()).min(1).max(100), action: z.enum(['resolve', 'snooze', 'assign']), until: Until.optional(), assigneeId: z.uuid().optional() }),
      response: { 200: successEnvelope(z.object({ results: z.array(z.object({ id: z.string(), ok: z.boolean(), error: z.string().optional(), rule: z.string().optional() })), succeeded: z.number().int(), failed: z.number().int() })) },
    },
  }, async (req) => {
    const { action, until, assigneeId } = req.body;
    if (action === 'snooze' && !until) throw Errors.validation({ issues: [{ path: 'until', message: 'required to snooze' }] });
    if (action === 'assign' && !assigneeId) throw Errors.validation({ issues: [{ path: 'assigneeId', message: 'required to assign' }] });
    const ids = [...new Set(req.body.ids)];
    const actor = actorOf(req);
    return ok(req, await vendorTx(req, async (tx, vendorId) => {
      const b = await bounds(tx, vendorId);
      const results: Array<{ id: string; ok: boolean; error?: string; rule?: string }> = [];
      for (const id of ids) {
        try {
          await tx.transaction(async (sp) => {
            if (action === 'resolve') await svc.resolveIssue(sp, vendorId, id, actor, {}, req.ctx.correlationId);
            else if (action === 'snooze') {
              const i = await svc.loadIssue(sp, vendorId, id);
              await svc.snoozeIssue(sp, vendorId, id, actor, await svc.snoozeUntil(sp, until!, b, i.priority));
            } else await svc.assignIssue(sp, vendorId, id, actor, assigneeId!);
            await audit(sp, req, { action: `issue.${action}`, resourceType: 'issue', resourceId: id, after: { bulk: true, ...(until ? { until } : {}), ...(assigneeId ? { assigneeId } : {}) } });
          });
          results.push({ id, ok: true });
        } catch (e) {
          if (!isAppError(e)) throw e;
          results.push({ id, ok: false, error: e.message, ...(typeof e.details?.rule === 'string' ? { rule: e.details.rule } : {}) });
        }
      }
      return { results, succeeded: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length };
    }));
  });

  r.get('/issues/:id', {
    config: { access: { permission: 'issues:read' } },
    schema: { tags: TAGS, summary: 'Issue detail (drawer): why it matters, affected records, deadline, recommended action and timeline', params: IdParamSchema, response: { 200: successEnvelope(DetailSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.issueDetail(tx, vendorId, req.params.id))));

  /** a state change: runs `fn`, audits it and returns the refreshed issue */
  const change = async (req: FastifyRequest, id: string, action: string, after: Record<string, unknown>, fn: (tx: Parameters<Parameters<typeof vendorTx>[1]>[0], vendorId: string) => Promise<unknown>) =>
    ok(req, await vendorTx(req, async (tx, vendorId) => {
      const before = await svc.loadIssue(tx, vendorId, id);
      await fn(tx, vendorId);
      const now = await svc.loadIssue(tx, vendorId, id);
      await audit(tx, req, { action, resourceType: 'issue', resourceId: id, before: { status: before.status }, after: { status: now.status, ...after } });
      return (await svc.listOne(tx, vendorId, now));
    }));

  r.post('/issues/:id/start', {
    config: { access: { permission: 'issues:write' } },
    schema: { tags: TAGS, summary: 'Mark an issue in progress ("working on it")', params: IdParamSchema, body: z.object({ note: z.string().trim().max(300).optional() }).default({}), response: { 200: successEnvelope(IssueSchema) } },
  }, async (req) => change(req, req.params.id, 'issue.start', {}, (tx, vendorId) => svc.startIssue(tx, vendorId, req.params.id, actorOf(req), req.body.note)));

  r.post('/issues/:id/snooze', {
    config: { access: { permission: 'issues:write' } },
    schema: {
      tags: TAGS, summary: 'Snooze an issue until later (it returns automatically)', description: 'Critical issues can be snoozed until the next business day at most, others up to 7 days (400 `snooze_too_long`).',
      params: IdParamSchema, body: z.object({ until: Until, note: z.string().trim().max(300).optional() }), response: { 200: successEnvelope(IssueSchema) },
    },
  }, async (req) => change(req, req.params.id, 'issue.snooze', { until: req.body.until }, async (tx, vendorId) => {
    const i = await svc.loadIssue(tx, vendorId, req.params.id);
    if (i.status === 'resolved') throw Errors.conflict('A resolved issue cannot be snoozed', { rule: 'already_resolved' });
    const until = await svc.snoozeUntil(tx, req.body.until, await bounds(tx, vendorId), i.priority);
    await svc.snoozeIssue(tx, vendorId, req.params.id, actorOf(req), until, req.body.note);
  }));

  r.post('/issues/:id/unsnooze', {
    config: { access: { permission: 'issues:write' } },
    schema: { tags: TAGS, summary: 'Bring a snoozed issue back to the queue', params: IdParamSchema, response: { 200: successEnvelope(IssueSchema) } },
  }, async (req) => change(req, req.params.id, 'issue.unsnooze', {}, (tx, vendorId) => svc.unsnoozeIssue(tx, vendorId, req.params.id, actorOf(req))));

  r.post('/issues/:id/assign', {
    config: { access: { permission: 'issues:write' } },
    schema: { tags: TAGS, summary: 'Assign an issue to a member of the business', params: IdParamSchema, body: z.object({ userId: z.uuid() }), response: { 200: successEnvelope(IssueSchema) } },
  }, async (req) => change(req, req.params.id, 'issue.assign', { assignedTo: req.body.userId }, (tx, vendorId) => svc.assignIssue(tx, vendorId, req.params.id, actorOf(req), req.body.userId)));

  r.post('/issues/:id/resolve', {
    config: { access: { permission: 'issues:write' } },
    schema: {
      tags: TAGS, summary: 'Mark an issue resolved, manually or by running its safe action',
      description: '`mode: "manual"` (default) just closes it (it comes back when the condition gets worse or returns after it went away). `mode: "attempt"` runs the safe action first (a failing channel sync -> run the syncs again): 409 `not_attemptable` (details.rule) when the issue has no safe action, 409 `resolution_failed` (details.rule, details.banner) when the action failed - the issue stays open with a resolution_failed event.',
      params: IdParamSchema, body: z.object({ note: z.string().trim().max(300).optional(), mode: z.enum(['manual', 'attempt']).default('manual') }).default({ mode: 'manual' }), response: { 200: successEnvelope(IssueSchema) },
    },
  }, async (req) => {
    const { note, mode } = req.body;
    const vendorId = requireVendor(req);
    const actor = actorOf(req);
    if (mode === 'manual') return change(req, req.params.id, 'issue.resolve', { mode }, (tx, vid) => svc.resolveIssue(tx, vid, req.params.id, actor, { note, mode }, req.ctx.correlationId));

    // attempt: look (tx), act OUTSIDE the transaction (enqueueSyncJob opens its own), then record the outcome (tx)
    const plan = await vendorTx(req, async (tx, vid) => {
      const i = await svc.loadIssue(tx, vid, req.params.id);
      if (i.status === 'resolved') throw Errors.conflict('The issue is already resolved', { rule: 'already_resolved' });
      if (!ATTEMPTABLE.has(i.key)) throw Errors.conflict('This issue has no automatic fix; resolve it manually once the cause is fixed', { rule: 'not_attemptable', key: i.key });
      return { issue: i, pre: await precheck(tx, vid, i) };
    });
    let failure: string | null = plan.pre.ok ? null : (plan.pre.reason ?? 'Synchronization could not be started');
    let jobIds: string[] = [];
    if (!failure) {
      try { jobIds = await runAttempt(c, vendorId, plan.issue.id, plan.pre.accountId!, actor.id); } catch (e) { failure = e instanceof Error ? e.message : 'Synchronization could not be started'; }
    }
    if (failure) {
      const banner = failureBanner(plan.pre.channel);
      await vendorTx(req, async (tx, vid) => {
        await svc.failResolution(tx, vid, plan.issue.id, actor, failure!);
        await audit(tx, req, { action: 'issue.resolution_failed', resourceType: 'issue', resourceId: plan.issue.id, after: { reason: failure } });
      });
      throw new AppError('CONFLICT', banner.title, { details: { rule: 'resolution_failed', banner: `${banner.title}. ${banner.body}`, reason: failure, issueId: plan.issue.id } });
    }
    return change(req, req.params.id, 'issue.resolve', { mode, jobIds }, (tx, vid) => svc.resolveIssue(tx, vid, plan.issue.id, actor, { note: note ?? 'Sync retried', mode, data: { jobIds } }, req.ctx.correlationId));
  });
};

