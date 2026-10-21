import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { JOB_RUN_SCHEDULES, reportJobs } from '../../modules/reports/src/index';
import { sys } from '../helpers/reports';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
beforeAll(async () => {
  mockControl.reset();
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Runs Shop' });
});
afterAll(() => t.close());

const API = '/api/v1/reports';
const tick = () => reportJobs.find((j) => j.name === JOB_RUN_SCHEDULES)!.handle({ vendorId: null, correlationId: 'test', data: {} } as never, t.container, { attemptsMade: 0 });
const exportReport = (as: Actor, body: Record<string, unknown>) => c.post(`${API}/exports`, body, as);
const makeDue = (id: string) => sys(t, (q) => q(`update report_schedules set next_run_at = now() - interval '1 minute' where id = $1`, [id]));
const weekly = (extra: Record<string, unknown> = {}) => ({ name: 'Weekly sales', reportType: 'sales', format: 'csv', frequency: 'weekly', dayOfWeek: 1, timeOfDay: '06:00', params: { range: 'last_7_days' }, recipients: ['Finance@Runs.test'], ...extra });
const mine = async (as: Actor) => ((await c.get('/api/v1/notifications', as)).body.data.items as any[]);

describe('catalog and overview', () => {
  it('lists the report types with formats, parameters and what the csv contains', async () => {
    const r = await c.get(`${API}/catalog`, admin);
    expect(r.status).toBe(200);
    const types = r.body.data.types as any[];
    expect(types.map((x) => x.type)).toEqual(['gst_register', 'settlement_audit', 'inventory_valuation', 'sales', 'orders', 'inventory', 'products', 'returns']);
    const gst = types[0];
    expect(gst).toMatchObject({ formats: ['csv', 'xlsx', 'pdf'], schedulable: true, csvSheet: 'Invoices', category: 'compliance' });
    expect(gst.params.find((p: any) => p.key === 'month')).toMatchObject({ type: 'month', relative: false });
    expect(gst.params.find((p: any) => p.key === 'range')).toMatchObject({ relative: true, default: 'this_month' });
    expect(r.body.data.periods.map((p: any) => p.key)).toContain('previous_financial_year');
  });

  it('gives the Reports page its three featured downloads, period shortcuts and counts in one call', async () => {
    const r = await c.get(`${API}/overview`, admin);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.timezone).toBe('Asia/Kolkata');
    expect(d.featured.map((f: any) => f.type)).toEqual(['gst_register', 'settlement_audit', 'inventory_valuation']);
    expect(d.featured[0].buttonLabel).toMatch(/^Download (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/);
    expect(d.featured[0].suggestedParams.month).toBe(d.today.slice(0, 7));
    expect(d.periods).toHaveLength(6);
    expect(d.periods[0]).toMatchObject({ key: 'this_month', fromDay: `${d.today.slice(0, 7)}-01` });
    expect(d.schedules).toMatchObject({ total: 0, active: 0, paused: 0, nextRunAt: null });
  });
});

describe('permissions', () => {
  it('a viewer reads reports, runs and schedules but cannot export or schedule; staff can', async () => {
    const viewer = await c.addMember(admin, 'vendor_viewer');
    const staff = await c.addMember(admin, 'vendor_staff');
    for (const p of ['catalog', 'overview', 'runs', 'schedules']) expect((await c.get(`${API}/${p}`, viewer)).status, p).toBe(200);
    expect((await exportReport(viewer, { type: 'sales', format: 'csv' })).status).toBe(403);
    expect((await c.post(`${API}/schedules`, weekly(), viewer)).status).toBe(403);
    expect((await exportReport(staff, { type: 'sales', format: 'csv' })).status).toBe(201);
    expect((await c.get(`${API}/catalog`)).status).toBe(401);
  });
});

describe('exports, runs and downloads', () => {
  it('a small report completes inside the request; the download is an attachment with the right headers', async () => {
    const r = await exportReport(admin, { type: 'sales', format: 'xlsx', params: { range: 'last_30_days' } });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'succeeded', trigger: 'manual', scheduleId: null, downloadable: true });
    const dl = await c.get(r.body.data.downloadUrl, admin);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(dl.headers['content-disposition']).toMatch(/^attachment; filename="sales_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.xlsx"$/);
    expect(dl.headers['cache-control']).toBe('private, no-store');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(dl.headers['content-length'])).toBe(r.body.data.sizeBytes);
    const pdf = await exportReport(admin, { type: 'sales', format: 'pdf' });
    expect((await c.get(pdf.body.data.downloadUrl, admin)).headers['content-type']).toBe('application/pdf');
    expect((await c.get((await exportReport(admin, { type: 'sales', format: 'csv' })).body.data.downloadUrl, admin)).headers['content-type']).toBe('text/csv; charset=utf-8');
  });

  it('a background export is queued, cannot be downloaded yet, and completes through the job', async () => {
    const r = await exportReport(admin, { type: 'orders', format: 'csv', background: true });
    expect(r.status).toBe(202);
    expect(r.body.data).toMatchObject({ status: 'queued', downloadable: false, downloadUrl: null });
    const id = r.body.data.id;
    expect(t.pendingJobs((j) => j.name === 'reports.generate')).toHaveLength(1);
    const early = await c.get(`${API}/runs/${id}/download`, admin);
    expect(early.status).toBe(409);
    expect(early.body.error.details.rule).toBe('run_not_ready');
    await t.pump();
    const done = (await c.get(`${API}/runs/${id}`, admin)).body.data;
    expect(done).toMatchObject({ status: 'succeeded', downloadable: true, error: null });
    expect(done.sizeBytes).toBeGreaterThan(0);
    expect((await c.get(done.downloadUrl, admin)).status).toBe(200);
    // the job is idempotent: running the same run again changes nothing
    await t.container.queues.enqueue('heavy' as never, 'reports.generate', { vendorId: admin.vendorId, correlationId: 'again', data: { runId: id } } as never);
    await t.pump();
    expect((await c.get(`${API}/runs/${id}`, admin)).body.data.finishedAt).toBe(done.finishedAt);
  });

  it('validates the request: type, format, parameters', async () => {
    expect((await exportReport(admin, { type: 'nope', format: 'csv' })).status).toBe(400);
    expect((await exportReport(admin, { type: 'sales', format: 'docx' })).status).toBe(400);
    expect((await exportReport(admin, { type: 'sales', format: 'csv', extra: 1 })).status).toBe(400);
    const bad = await exportReport(admin, { type: 'sales', format: 'csv', params: { granularity: 'year' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.rule).toBe('invalid_params');
    expect(bad.body.error.details.issues[0].path).toBe('params.granularity');
  });

  it('lists runs newest first with filters and paging', async () => {
    const all = (await c.get(`${API}/runs?pageSize=2`, admin)).body.data;
    expect(all.items).toHaveLength(2);
    expect(all.total).toBeGreaterThanOrEqual(5);
    expect(all.pages).toBe(Math.ceil(all.total / 2));
    expect(all.items[0].createdAt >= all.items[1].createdAt).toBe(true);
    const orders = (await c.get(`${API}/runs?filter[type]=orders&filter[status]=succeeded`, admin)).body.data;
    expect(orders.items.every((x: any) => x.reportType === 'orders' && x.status === 'succeeded')).toBe(true);
    expect(orders.total).toBe(1);
  });

  it('files expire: the download says so and the purge removes the stored file but keeps the run', async () => {
    const r = (await exportReport(admin, { type: 'sales', format: 'csv' })).body.data;
    const [row] = await sys(t, (q) => q(`select file_key from report_runs where id = $1`, [r.id]));
    expect(t.storage.objects.has(row.file_key)).toBe(true);
    await sys(t, (q) => q(`update report_runs set expires_at = now() - interval '1 hour' where id = $1`, [r.id]));
    const gone = await c.get(r.downloadUrl, admin);
    expect(gone.status).toBe(404);
    expect(gone.body.error.details.rule).toBe('file_expired');
    expect((await c.get(`${API}/runs/${r.id}`, admin)).body.data).toMatchObject({ status: 'succeeded', downloadable: false, downloadUrl: null });
    await tick();
    expect(t.storage.objects.has(row.file_key)).toBe(false);
    expect((await sys(t, (q) => q(`select file_key from report_runs where id = $1`, [r.id])))[0].file_key).toBeNull();
  });

  it('tenant isolation: another business sees none of these runs or schedules', async () => {
    const other = await c.registerVendor({ businessName: 'Other Runs Shop' });
    const run = (await exportReport(admin, { type: 'sales', format: 'csv' })).body.data;
    expect((await c.get(`${API}/runs`, other)).body.data.total).toBe(0);
    expect((await c.get(`${API}/runs/${run.id}`, other)).status).toBe(404);
    expect((await c.get(`${API}/runs/${run.id}/download`, other)).status).toBe(404);
  });
});

describe('schedules', () => {
  it('creates a weekly schedule with the next run on the right weekday and time (IST by default)', async () => {
    const r = await c.post(`${API}/schedules`, weekly(), admin);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const s = r.body.data;
    expect(s).toMatchObject({ name: 'Weekly sales', cadence: 'Weekly on Monday at 06:00', timezone: 'Asia/Kolkata', status: 'active', format: 'csv', recipients: ['finance@runs.test'], version: 1, lastRun: null });
    const next = new Date(s.nextRunAt);
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 86_400_000);
    expect([next.getUTCDay(), next.getUTCHours(), next.getUTCMinutes()]).toEqual([1, 0, 30]); // Monday 06:00 IST
    expect((await c.get(`${API}/schedules/${s.id}`, admin)).body.data.id).toBe(s.id);
    expect((await c.get(`${API}/overview`, admin)).body.data.schedules).toMatchObject({ total: 1, active: 1, nextRunAt: s.nextRunAt });
  });

  it('refuses what cannot work: missing day, fixed periods, bad time, zone, recipients, unknown or unsupported report', async () => {
    const rule = async (body: Record<string, unknown>) => { const r = await c.post(`${API}/schedules`, body, admin); expect(r.status, JSON.stringify(body)).toBe(400); return r.body.error.details?.rule; };
    expect(await rule(weekly({ dayOfWeek: undefined }))).toBe('day_required');
    expect(await rule(weekly({ frequency: 'monthly', dayOfMonth: undefined }))).toBe('day_required');
    expect(await rule(weekly({ params: { month: '2026-10' } }))).toBe('schedule_params_must_be_relative');
    expect(await rule(weekly({ params: { from: '2026-10-01', to: '2026-10-02' } }))).toBe('schedule_params_must_be_relative');
    expect(await rule(weekly({ reportType: 'inventory_valuation', params: { asOf: '2026-10-01' } }))).toBe('schedule_params_must_be_relative');
    expect(await rule(weekly({ timeOfDay: '25:00' }))).toBe('bad_time');
    expect(await rule(weekly({ timezone: 'Mars/Base' }))).toBe('bad_timezone');
    expect(await rule(weekly({ recipients: ['not-an-email'] }))).toBe('bad_recipient');
    expect(await rule(weekly({ recipients: Array.from({ length: 21 }, (_, i) => `a${i}@x.test`) }))).toBeUndefined(); // the body schema stops it first
    expect((await c.post(`${API}/schedules`, weekly({ reportType: 'nope' }), admin)).status).toBe(400);
  });

  it('fires when due: one run, file stored, team notified, recipients e-mailed, schedule moved on; a second tick does nothing', async () => {
    const s = (await c.post(`${API}/schedules`, weekly({ name: 'Tick sales', frequency: 'daily', dayOfWeek: undefined, timeOfDay: '07:30', recipients: ['cfo@runs.test', 'ops@runs.test'] }), admin)).body.data;
    await makeDue(s.id);
    await tick();
    expect(t.pendingJobs((j) => j.name === 'reports.generate')).toHaveLength(1);
    await t.pump();
    const runs = (await c.get(`${API}/runs?filter[scheduleId]=${s.id}`, admin)).body.data;
    expect(runs.total).toBe(1);
    const run = runs.items[0];
    expect(run).toMatchObject({ trigger: 'schedule', status: 'succeeded', scheduleName: 'Tick sales', downloadable: true });
    expect((await c.get(run.downloadUrl, admin)).status).toBe(200);

    const after = (await c.get(`${API}/schedules/${s.id}`, admin)).body.data;
    expect(after).toMatchObject({ lastRunStatus: 'succeeded', lastRun: { id: run.id, status: 'succeeded', downloadUrl: run.downloadUrl } });
    expect(new Date(after.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(after.version).toBe(s.version); // the bookkeeping of a run is not an edit

    const note = (await mine(admin)).find((n) => n.title === 'Tick sales is ready');
    expect(note).toBeTruthy();
    expect(note).toMatchObject({ entityType: 'report_run', entityId: run.id, severity: 'info' });
    expect(note.body).toContain(`/api/v1/reports/runs/${run.id}/download`);
    for (const to of ['cfo@runs.test', 'ops@runs.test']) {
      const mail = t.mailer.last('notification', to)!;
      expect(mail.subject).toContain('Tick sales');
      expect(mail.text).toContain(`/reports?run=${run.id}`);
      expect(mail.data.runId).toBe(run.id);
    }

    await tick();
    await t.pump();
    expect((await c.get(`${API}/runs?filter[scheduleId]=${s.id}`, admin)).body.data.total).toBe(1);
  });

  it('a failing scheduled report is recorded and the team is warned', async () => {
    const s = (await c.post(`${API}/schedules`, weekly({ name: 'Monthly GST', reportType: 'gst_register', format: 'xlsx', frequency: 'monthly', dayOfWeek: undefined, dayOfMonth: 31, params: { range: 'previous_month' }, recipients: [] }), admin)).body.data;
    await makeDue(s.id);
    await tick();
    await t.pump();
    const run = (await c.get(`${API}/runs?filter[scheduleId]=${s.id}`, admin)).body.data.items[0];
    expect(run).toMatchObject({ status: 'failed', downloadable: false });
    expect(run.error).toMatch(/GSTIN/);
    expect((await c.get(`${API}/schedules/${s.id}`, admin)).body.data.lastRunStatus).toBe('failed');
    const warn = (await mine(admin)).find((n) => n.title === 'Monthly GST could not be generated');
    expect(warn).toMatchObject({ severity: 'warning', entityId: run.id });
  });

  it('run now: queued through the job with the schedule parameters, next run untouched', async () => {
    const s = (await c.post(`${API}/schedules`, weekly({ name: 'Manual sales', recipients: ['m@runs.test'] }), admin)).body.data;
    const r = await c.post(`${API}/schedules/${s.id}/run-now`, {}, admin);
    expect(r.status).toBe(202);
    expect(r.body.data).toMatchObject({ status: 'queued', scheduleId: s.id, trigger: 'manual', params: { range: 'last_7_days' } });
    await t.pump();
    expect((await c.get(`${API}/runs/${r.body.data.id}`, admin)).body.data.status).toBe('succeeded');
    expect(t.mailer.last('notification', 'm@runs.test')).toBeTruthy();
    expect((await c.get(`${API}/schedules/${s.id}`, admin)).body.data.nextRunAt).toBe(s.nextRunAt);
    expect((await c.post(`${API}/schedules/00000000-0000-4000-8000-000000000000/run-now`, {}, admin)).status).toBe(404);
  });

  it('pause, resume and edit: idempotent pause, recomputed next run, version lock', async () => {
    const s = (await c.post(`${API}/schedules`, weekly({ name: 'Editable' }), admin)).body.data;
    const p1 = (await c.post(`${API}/schedules/${s.id}/pause`, {}, admin)).body.data;
    expect(p1).toMatchObject({ status: 'paused', nextRunAt: null, version: 2 });
    const p2 = (await c.post(`${API}/schedules/${s.id}/pause`, {}, admin)).body.data;
    expect(p2.version).toBe(2);
    await sys(t, (q) => q(`update report_schedules set next_run_at = now() - interval '1 minute' where id = $1`, [s.id]));
    await tick();
    expect((await c.get(`${API}/runs?filter[scheduleId]=${s.id}`, admin)).body.data.total).toBe(0);
    const r1 = (await c.post(`${API}/schedules/${s.id}/resume`, {}, admin)).body.data;
    expect(r1.status).toBe('active');
    expect(new Date(r1.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    const stale = await c.patch(`${API}/schedules/${s.id}`, { version: 1, name: 'Stale' }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    const ok = await c.patch(`${API}/schedules/${s.id}`, { version: r1.version, name: 'Renamed', frequency: 'monthly', dayOfMonth: 31, timeOfDay: '08:15', recipients: ['x@runs.test'] }, admin);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ name: 'Renamed', cadence: 'Monthly on day 31 at 08:15', recipients: ['x@runs.test'], version: r1.version + 1 });
    const bad = await c.patch(`${API}/schedules/${s.id}`, { version: ok.body.data.version, params: { month: '2026-01' } }, admin);
    expect(bad.body.error.details.rule).toBe('schedule_params_must_be_relative');
  });

  it('deleting a schedule keeps its runs; other businesses cannot touch it', async () => {
    const s = (await c.post(`${API}/schedules`, weekly({ name: 'Doomed', recipients: [] }), admin)).body.data;
    const run = (await c.post(`${API}/schedules/${s.id}/run-now`, {}, admin)).body.data;
    await t.pump();
    const other = await c.registerVendor({ businessName: 'Schedule Thief' });
    expect((await c.get(`${API}/schedules/${s.id}`, other)).status).toBe(404);
    expect((await c.del(`${API}/schedules/${s.id}`, other)).status).toBe(404);
    expect((await c.get(`${API}/schedules`, other)).body.data.total).toBe(0);
    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.del(`${API}/schedules/${s.id}`, viewer)).status).toBe(403);

    const del = await c.del(`${API}/schedules/${s.id}`, admin);
    expect(del.status).toBe(200);
    expect((await c.get(`${API}/schedules/${s.id}`, admin)).status).toBe(404);
    const kept = (await c.get(`${API}/runs/${run.id}`, admin)).body.data;
    expect(kept).toMatchObject({ status: 'succeeded', scheduleId: null, scheduleName: 'Doomed' });
  });

  it('every schedule change is audited', async () => {
    const rows = await sys(t, (q) => q(`select action from audit_logs where vendor_id = $1 and action like 'report.%'`, [admin.vendorId]));
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ['report.export_requested', 'report.downloaded', 'report.generated', 'report.schedule_created', 'report.schedule_updated', 'report.schedule_deleted', 'report.schedule_paused', 'report.schedule_resumed', 'report.schedule_run_now']) expect(actions.has(a), a).toBe(true);
  });
});
