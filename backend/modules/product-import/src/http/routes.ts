import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { audit, created, ok, paged, requireVendor, vendorTx } from '@oms/module-kit';
import { readActivity } from '../application/activity';
import { marketplaceSources, startFromMarketplace } from '../application/marketplace';
import { IdParamSchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { z } from 'zod';
import { AppError } from '@oms/shared';
import { LIMITS, REQUIRED_TARGETS, TARGET_BY_KEY } from '../domain/catalogue';
import { beginCommit, commitEnvelope, commitPreview } from '../application/commit';
import { MAX_ISSUE_IMAGE_BYTES, errorsCsv, issueSummary, listIssues, listRows, recount, resolveBulk, resolveIssue, storeIssueImage } from '../application/issues';
import { applyMappingChange, applySettings, createSession, importOptions, listSessions, mappingView, sessionDto, templateFile, touchSession } from '../application/sessions';
import { EDITABLE_STATUSES, JOBS, getSession, isBusy, issueTotals, toSessionDto, type SessionRow } from '../application/store';
import { analysisView, analyse, assertUploadable, saveUpload } from '../application/upload';
import { beginValidation, runValidation } from '../application/validation';
import {
  ActivityQuerySchema, ActivitySchema, IssuePageSchema, FromMarketplaceBodySchema, MarketplaceSourceSchema,
  BulkResolveBodySchema, BulkResultSchema, CommitBodySchema, CommitResultSchema, CreateBodySchema, IssueListQuerySchema, ListQuerySchema, MappingBodySchema,
  MappingViewSchema, OptionsSchema, ResolveBodySchema, ResolveResultSchema, RevalidateResultSchema, RowListQuerySchema, RowSchema, SessionSchema, SettingsBodySchema, SummarySchema, TemplateQuerySchema,
  UploadResultSchema,
} from './schemas';

const TAGS = ['Product Import'];
const IssueParamsSchema = z.object({ id: z.uuid(), issueId: z.uuid() });
const FILE_TYPES = ['text/csv', 'text/plain', 'text/tab-separated-values', 'application/csv', 'application/octet-stream', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

/**
 * Guided product import (wizard): create -> upload the file -> review the column mapping -> settings -> validate (job) -> resolve issues
 * -> revalidate -> commit (job on the heavy queue). The old fixed-header CSV flow (/products/imports) is untouched.
 */
export const productImportRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;

  // raw file bodies (csv / tsv / xlsx) only inside this plugin
  app.addContentTypeParser(FILE_TYPES, { parseAs: 'buffer', bodyLimit: LIMITS.maxBytes + 64 * 1024 }, (_req, body, done) => done(null, body));
  app.addContentTypeParser(['image/png', 'image/jpeg', 'image/webp'], { parseAs: 'buffer', bodyLimit: MAX_ISSUE_IMAGE_BYTES + 64 * 1024 }, (_req, body, done) => done(null, body));

  const enqueue = (name: string, vendorId: string, correlationId: string, s: SessionRow) =>
    c.queues.enqueue('heavy', name, { vendorId, correlationId, idempotencyKey: `${name}-${s.id}-${s.version}`, data: { sessionId: s.id } });

  // ---------------------------------------------------------------- static
  r.get('/imports/options', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Wizard options: target fields, duplicate strategies, limits, presets', response: { 200: successEnvelope(OptionsSchema) } },
  }, async (req) => ok(req, importOptions()));

  r.get('/imports/template', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Download the import template (all columns plus an example row)', querystring: TemplateQuerySchema, response: { 200: z.any().describe('text/csv or an .xlsx workbook (binary)') } },
  }, async (req, reply) => {
    const file = templateFile(req.query.format);
    return reply.header('Content-Disposition', `attachment; filename="${file.fileName}"`).type(file.contentType).send(file.body);
  });

  // ---------------------------------------------------------------- marketplace source
  r.get('/imports/marketplace-sources', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Marketplace accounts a catalogue can be imported from', description: 'One row per marketplace account: connection state, products available (null until counted), products already imported, last import and whether it can be imported.', response: { 200: successEnvelope(MarketplaceSourceSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => marketplaceSources(tx, c, vendorId))));

  r.post('/imports/from-marketplace', {
    config: { access: { permission: 'imports:write' } },
    schema: {
      tags: TAGS, summary: 'Start an import from a connected marketplace catalogue', body: FromMarketplaceBodySchema,
      description: `Reads the catalogue of the account through its connector and builds the import rows from it (standard fields; prices in paise). Up to ${LIMITS.marketplaceInlineProducts} products are read inside the request: 201 with the session in status "analyzed". Larger catalogues are read by a job: 202 with the session in status "uploaded" (uiStatus "analyzing", counters.processed grows); poll GET /imports/{id} until it is "analyzed". Calling again while a session of the account is still running returns that session. Mapping, settings, validation, issues and commit work as for a file.`,
      response: { 201: successEnvelope(SessionSchema), 202: successEnvelope(SessionSchema) },
    },
  }, async (req, reply) => {
    const vendorId = requireVendor(req);
    const res = await startFromMarketplace(c.database.db, c, vendorId, req.ctx.principal?.actorId ?? null, req.ctx.correlationId, req.body.accountId);
    await vendorTx(req, (tx) => audit(tx, req, { action: 'import.from_marketplace', resourceType: 'import_session', resourceId: res.session.id, metadata: { accountId: req.body.accountId, created: res.created, queued: res.queued } }));
    const dto = await vendorTx(req, async (tx, v) => sessionDto(tx, v, await getSession(tx, v, res.session.id)));
    if (res.queued) { reply.code(202); return ok(req, dto); }
    return created(req, reply, dto, `/api/v1/imports/${dto.id}`);
  });

  // ---------------------------------------------------------------- sessions
  r.post('/imports', {
    config: { access: { permission: 'imports:write' } },
    schema: { tags: TAGS, summary: 'Start an import (step 1)', description: 'Declares the file; send its bytes to POST /imports/{id}/file next.', body: CreateBodySchema, response: { 201: successEnvelope(SessionSchema) } },
  }, async (req, reply) => {
    const dto = await vendorTx(req, async (tx, vendorId) => {
      const row = await createSession(tx, vendorId, req.ctx.principal?.actorId ?? null, req.body);
      await audit(tx, req, { action: 'import.create', resourceType: 'import_session', resourceId: row.id, metadata: { source: row.source, fileName: row.fileName } });
      return sessionDto(tx, vendorId, row);
    });
    return created(req, reply, dto, `/api/v1/imports/${dto.id}`);
  });

  r.get('/imports', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Import history', querystring: ListQuerySchema, response: { 200: pagedEnvelope(SessionSchema) } },
  }, async (req) => {
    const q = req.query;
    const page = await vendorTx(req, (tx, vendorId) => listSessions(tx, vendorId, { page: q.page, pageSize: q.pageSize, status: q['filter[status]'], q: q.q }));
    return paged(req, page.items, q, page.total);
  });

  r.get('/imports/:id', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Status and counters of an import (poll this for progress)', params: IdParamSchema, response: { 200: successEnvelope(SessionSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => sessionDto(tx, vendorId, await getSession(tx, vendorId, req.params.id)))));

  r.get('/imports/:id/activity', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Live activity feed of an import (newest first)', description: 'Events recorded while validating, committing and resolving issues (the newest 300 are kept). Page backwards with `before` = the previous `nextBefore`.', params: IdParamSchema, querystring: ActivityQuerySchema, response: { 200: successEnvelope(ActivitySchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => readActivity((await getSession(tx, vendorId, req.params.id)).stats, req.query))));

  r.post('/imports/:id/file', {
    config: { access: { permission: 'imports:write' }, idempotent: false },
    schema: {
      tags: TAGS,
      summary: 'Upload the file (step 2) and analyse it',
      description: `Raw body: csv, tsv or xlsx (the content is sniffed, the extension is not trusted). At most ${LIMITS.maxBytes / 1024 / 1024} MB and ${LIMITS.maxRows} data rows. Replaces an earlier upload of the same import. Returns the headers, a preview, the detected preset and the automatic column mapping.`,
      params: IdParamSchema,
      response: { 200: successEnvelope(UploadResultSchema) },
    },
  }, async (req) => {
    if (!Buffer.isBuffer(req.body)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send the file as the raw request body (Content-Type: text/csv or application/octet-stream)');
    const body = req.body;
    const before = await vendorTx(req, async (tx, vendorId) => { const s = await getSession(tx, vendorId, req.params.id); assertUploadable(s); return s; });
    const parsed = analyse(body, before); // CPU only, outside any transaction
    const out = await vendorTx(req, async (tx, vendorId) => {
      const row = await saveUpload(tx, c, vendorId, req.params.id, body, parsed);
      await audit(tx, req, { action: 'import.upload', resourceType: 'import_session', resourceId: row.id, metadata: { bytes: body.length, rows: parsed.rows.length, format: parsed.format } });
      return { session: await sessionDto(tx, vendorId, row), analysis: await analysisView(tx, vendorId, row, parsed) };
    });
    return ok(req, out);
  });

  // ---------------------------------------------------------------- mapping + settings
  r.get('/imports/:id/mapping', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Column mapping with confidence and sample values', params: IdParamSchema, response: { 200: successEnvelope(MappingViewSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => mappingView(tx, vendorId, await getSession(tx, vendorId, req.params.id)))));

  r.put('/imports/:id/mapping', {
    config: { access: { permission: 'imports:write' } },
    schema: {
      tags: TAGS, summary: 'Change the column mapping', params: IdParamSchema, body: MappingBodySchema,
      description: 'Either one column ({ sourceColumn, targetField }; null unmaps it) or the whole mapping ({ mapping }). A column feeds one field only. A validated import must be validated again.',
      response: { 200: successEnvelope(MappingViewSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const s = await getSession(tx, vendorId, req.params.id, { forUpdate: true });
    const next = applyMappingChange(s, req.body);
    const row = await touchSession(tx, s, { mapping: next }, { invalidates: true });
    await audit(tx, req, { action: 'import.mapping', resourceType: 'import_session', resourceId: s.id, metadata: { mapped: Object.values(next).filter(Boolean).length } });
    return mappingView(tx, vendorId, row);
  })));

  r.put('/imports/:id/settings', {
    config: { access: { permission: 'imports:write' } },
    schema: { tags: TAGS, summary: 'Import settings (duplicates, channels, warehouse, default category, price unit)', params: IdParamSchema, body: SettingsBodySchema, response: { 200: successEnvelope(SessionSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const s = await getSession(tx, vendorId, req.params.id, { forUpdate: true });
    const row = await applySettings(tx, vendorId, s, req.body);
    await audit(tx, req, { action: 'import.settings', resourceType: 'import_session', resourceId: s.id, metadata: { changed: Object.keys(req.body).filter((k) => k !== 'version') } });
    return sessionDto(tx, vendorId, row);
  })));

  // ---------------------------------------------------------------- validation
  const start = async (req: Parameters<typeof vendorTx>[0], id: string) => vendorTx(req, async (tx, vendorId) => {
    const s = await getSession(tx, vendorId, id, { forUpdate: true });
    if (s.headers.length === 0) throw new AppError('CONFLICT', 'Upload the file first', { details: { rule: 'no_file' } });
    if (!(EDITABLE_STATUSES as readonly string[]).includes(s.status)) {
      throw new AppError('CONFLICT', isBusy(s.status) ? `This import is already ${s.status}` : `The import cannot be validated while it is ${s.status}`, { details: { rule: isBusy(s.status) ? 'busy' : 'wrong_status', status: s.status } });
    }
    const missing = REQUIRED_TARGETS.filter((t) => !s.mapping[t]);
    if (missing.length) {
      throw new AppError('CONFLICT', `Map the required columns first: ${missing.map((m) => TARGET_BY_KEY.get(m)!.label).join(', ')}`, { details: { rule: 'missing_required_mapping', missing } });
    }
    await beginValidation(tx, vendorId, s.id);
    await audit(tx, req, { action: 'import.validate', resourceType: 'import_session', resourceId: s.id, metadata: { rows: s.rowCount } });
    return { vendorId, session: await getSession(tx, vendorId, s.id) };
  });

  r.post('/imports/:id/validate', {
    config: { access: { permission: 'imports:write' } },
    schema: { tags: TAGS, summary: 'Validate the file (step 4, background job)', description: 'Applies the mapping and settings to every row and records issues. Poll GET /imports/{id} for progress.', params: IdParamSchema, response: { 202: successEnvelope(SessionSchema) } },
  }, async (req, reply) => {
    const { vendorId, session } = await start(req, req.params.id);
    await enqueue(JOBS.validate, vendorId, req.ctx.correlationId, session);
    reply.code(202);
    return ok(req, await vendorTx(req, (tx, v) => sessionDto(tx, v, session)));
  });

  r.post('/imports/:id/revalidate', {
    config: { access: { permission: 'imports:write' } },
    schema: {
      tags: TAGS, summary: 'Validate again after fixing issues', params: IdParamSchema,
      description: `Keeps your fixes and dismissed issues. Files of up to ${LIMITS.inlineRevalidateRows} rows are re-checked inside the request (200); larger ones run as a job (202, queued: true).`,
      response: { 200: successEnvelope(RevalidateResultSchema), 202: successEnvelope(RevalidateResultSchema) },
    },
  }, async (req, reply) => {
    const { vendorId, session } = await start(req, req.params.id);
    if (session.rowCount > LIMITS.inlineRevalidateRows) {
      await enqueue(JOBS.validate, vendorId, req.ctx.correlationId, session);
      reply.code(202);
      const dto = await vendorTx(req, (tx, v) => sessionDto(tx, v, session));
      return ok(req, { queued: true, status: 'queued' as const, revalidatedCount: 0, resolvedCount: dto.issues.resolved, remainingIssuesCount: dto.issues.open, session: dto, revalidation: dto.revalidation });
    }
    const outcome = await runValidation(c.database.db, vendorId, session.id);
    const dto = await vendorTx(req, async (tx, v) => sessionDto(tx, v, await getSession(tx, v, session.id)));
    return ok(req, { queued: false, status: outcome.openIssues === 0 ? ('clean' as const) : ('issues_remain' as const), revalidatedCount: outcome.rows, resolvedCount: outcome.resolvedIssues, remainingIssuesCount: outcome.openIssues, session: dto, revalidation: dto.revalidation });
  });

  r.get('/imports/:id/summary', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Issue counts per code and severity (the tabs of the issues screen)', params: IdParamSchema, response: { 200: successEnvelope(SummarySchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => { await getSession(tx, vendorId, req.params.id); return issueSummary(tx, vendorId, req.params.id); })));

  r.get('/imports/:id/issues', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Issues with the row they belong to', description: 'Filter by code, severity, status and target field (`filter[field]`); `sort` is severity (default: errors first, then row), row or code, prefix - for descending. The applied sort is echoed in the response.', params: IdParamSchema, querystring: IssueListQuerySchema, response: { 200: successEnvelope(IssuePageSchema) } },
  }, async (req) => {
    const q = req.query;
    const page = await vendorTx(req, async (tx, vendorId) => listIssues(tx, vendorId, await getSession(tx, vendorId, req.params.id), { code: q['filter[code]'], severity: q['filter[severity]'], status: q['filter[status]'], field: q['filter[field]'], q: q.q, sort: q.sort }, q));
    return ok(req, { items: page.items, page: q.page, pageSize: q.pageSize, total: page.total, pages: Math.max(1, Math.ceil(page.total / q.pageSize)), sort: q.sort });
  });

  r.get('/imports/:id/rows', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Rows with their normalised values, status and (after the commit) result', params: IdParamSchema, querystring: RowListQuerySchema, response: { 200: pagedEnvelope(RowSchema) } },
  }, async (req) => {
    const q = req.query;
    const page = await vendorTx(req, async (tx, vendorId) => { await getSession(tx, vendorId, req.params.id); return listRows(tx, vendorId, req.params.id, { status: q['filter[status]'], q: q.q }, q); });
    return paged(req, page.items, q, page.total);
  });

  r.get('/imports/:id/errors.csv', {
    config: { access: { permission: 'imports:read' } },
    schema: { tags: TAGS, summary: 'Download the unresolved issues as CSV', params: IdParamSchema, response: { 200: z.string().describe('text/csv') } },
  }, async (req, reply) => {
    const body = await vendorTx(req, async (tx, vendorId) => { await getSession(tx, vendorId, req.params.id); return errorsCsv(tx, vendorId, req.params.id); });
    reply.header('Content-Disposition', `attachment; filename="import-${req.params.id.slice(0, 8)}-issues.csv"`).type('text/csv; charset=utf-8');
    return body;
  });

  // ---------------------------------------------------------------- resolving
  r.post('/imports/:id/issues/bulk', {
    config: { access: { permission: 'imports:write' } },
    schema: {
      tags: TAGS, summary: 'Apply one decision to every open issue of a code', params: IdParamSchema, body: BulkResolveBodySchema,
      description: 'accept_suggestion uses each issue\'s own suggestion; custom_value sets the same value everywhere (for category issues: a category id, name or path); ignore dismisses them.',
      response: { 200: successEnvelope(BulkResultSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await resolveBulk(tx, vendorId, req.ctx.principal?.actorId ?? null, req.params.id, req.body);
    await audit(tx, req, { action: 'import.bulk_resolve', resourceType: 'import_session', resourceId: req.params.id, metadata: { code: req.body.code, action: req.body.action, applied: res.applied } });
    const s = await getSession(tx, vendorId, req.params.id);
    const dto = toSessionDto(s, await issueTotals(tx, vendorId, s.id));
    return { ...res, issues: dto.issues, counters: dto.counters };
  })));

  r.post('/imports/:id/issues/:issueId', {
    config: { access: { permission: 'imports:write' } },
    schema: { tags: TAGS, summary: 'Resolve one issue (accept the suggestion, type a value, or ignore it)', params: IssueParamsSchema, body: ResolveBodySchema, response: { 200: successEnvelope(ResolveResultSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await resolveIssue(tx, vendorId, req.ctx.principal?.actorId ?? null, req.params.id, req.params.issueId, req.body);
    await audit(tx, req, { action: 'import.resolve_issue', resourceType: 'import_session', resourceId: req.params.id, metadata: { issueId: req.params.issueId, action: req.body.action } });
    const s = await getSession(tx, vendorId, req.params.id);
    const dto = toSessionDto(s, await issueTotals(tx, vendorId, s.id));
    return { issue: res.issue, issues: dto.issues, counters: dto.counters };
  })));

  r.post('/imports/:id/issues/:issueId/image', {
    config: { access: { permission: 'imports:write' }, idempotent: false },
    schema: {
      tags: TAGS, summary: 'Upload an image for an invalid image issue', params: IssueParamsSchema, response: { 200: successEnvelope(ResolveResultSchema) },
      description: `Raw body: a PNG, JPEG or WebP (Content-Type), at most ${MAX_ISSUE_IMAGE_BYTES / 1024 / 1024} MB (413 above, 415 for other types or when the bytes are not the declared image, 400 for an issue that is not an invalid image issue). The file is stored under the tenant's import prefix, becomes the row's image (the commit attaches it to the product as a product image), and the issue is resolved. Like every fix it needs a revalidation before the commit.`,
    },
  }, async (req) => {
    if (!Buffer.isBuffer(req.body)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send the image as the raw request body (Content-Type: image/png, image/jpeg or image/webp)');
    const body = req.body;
    const contentType = String(req.headers['content-type'] ?? '');
    return ok(req, await vendorTx(req, async (tx, vendorId) => {
      const image = await storeIssueImage(tx, c, vendorId, req.params.id, req.params.issueId, body, contentType);
      const res = await resolveIssue(tx, vendorId, req.ctx.principal?.actorId ?? null, req.params.id, req.params.issueId, { action: 'custom_value', image });
      await audit(tx, req, { action: 'import.issue_image', resourceType: 'import_session', resourceId: req.params.id, metadata: { issueId: req.params.issueId, bytes: body.length, mime: image.mime } });
      const s = await getSession(tx, vendorId, req.params.id);
      const dto = toSessionDto(s, await issueTotals(tx, vendorId, s.id));
      return { issue: res.issue, issues: dto.issues, counters: dto.counters };
    }));
  });

  // ---------------------------------------------------------------- commit / cancel
  r.get('/imports/:id/commit-preview', {
    config: { access: { permission: 'imports:read' } },
    schema: {
      tags: TAGS, summary: 'Exact row counts for each commit choice', params: IdParamSchema,
      response: { 200: successEnvelope(z.object({ cleanOnly: z.number().int(), includeResolved: z.number().int(), pendingFixes: z.number().int() })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => commitPreview(tx, vendorId, req.params.id))));

  r.post('/imports/:id/commit', {
    config: { access: { permission: 'imports:write' } },
    schema: {
      tags: TAGS, summary: 'Import the validated rows (background job)', params: IdParamSchema, body: CommitBodySchema,
      description: 'clean_only imports rows without issues; include_resolved also imports rows whose issues you fixed. Rows with open errors are never imported. Creates or updates products and variants through the catalogue, stock through inventory and (when asked) draft listings. Poll GET /imports/{id}.',
      response: { 202: successEnvelope(CommitResultSchema) },
    },
  }, async (req, reply) => {
    const out = await vendorTx(req, async (tx, vendorId) => {
      const res = await beginCommit(tx, vendorId, req.params.id, req.body.mode);
      await audit(tx, req, { action: 'import.commit_start', resourceType: 'import_session', resourceId: res.session.id, metadata: { mode: req.body.mode, rows: res.eligibleRows } });
      return { vendorId, ...res, dto: await sessionDto(tx, vendorId, res.session) };
    });
    const env = commitEnvelope(out.vendorId, req.ctx.correlationId, out.session);
    await c.queues.enqueue('heavy', JOBS.commit, env);
    reply.code(202);
    return ok(req, { session: out.dto, eligibleRows: out.eligibleRows });
  });

  r.post('/imports/:id/cancel', {
    config: { access: { permission: 'imports:write' } },
    schema: { tags: TAGS, summary: 'Cancel an import (a running validation or commit stops; rows already imported stay)', params: IdParamSchema, response: { 200: successEnvelope(SessionSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const s = await getSession(tx, vendorId, req.params.id, { forUpdate: true });
    if (s.status === 'committed' || s.status === 'cancelled') throw new AppError('CONFLICT', `This import is already ${s.status}`, { details: { rule: 'wrong_status', status: s.status } });
    const row = await touchSession(tx, s, { status: 'cancelled', finishedAt: new Date() }, { invalidates: false });
    await recount(tx, vendorId, s.id);
    await audit(tx, req, { action: 'import.cancel', resourceType: 'import_session', resourceId: s.id, metadata: { was: s.status } });
    return sessionDto(tx, vendorId, row);
  })));
};
