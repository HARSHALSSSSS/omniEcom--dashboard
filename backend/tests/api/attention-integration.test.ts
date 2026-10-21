import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const sqlAs = async <T = any>(q: string, p: unknown[] = []): Promise<T[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<T>(q, p)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};
const refresh = async (a: Actor) => { expect((await c.post('/api/v1/issues/refresh', {}, a)).status).toBe(200); };
const list = async (a: Actor, qs = '') => (await c.get(`/api/v1/issues?pageSize=100${qs}`, a)).body.data as { items: any[]; total: number };

describe('Needs attention screen: assignees and the shapes the page relies on', () => {
  let w: World;
  let staff: Actor;
  let viewer: Actor;
  beforeAll(async () => {
    w = await buildWorld(t, c);
    staff = await c.addMember(w.admin, 'vendor_staff');
    viewer = await c.addMember(w.admin, 'vendor_viewer');
    const o = await orderArrives(t, c, w, 1);
    await sqlAs("update orders set dispatch_due_at = now() + interval '30 minutes' where id = $1", [o.id]);
    const v = await c.makeVariant(w.admin);
    await c.post('/api/v1/listings', { marketplaceAccountId: w.account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, w.admin);
    await refresh(w.admin);
  });

  it('GET /issues/assignees lists the active members for anyone who may write issues (staff included), not viewers', async () => {
    const asStaff = await c.get('/api/v1/issues/assignees', staff);
    expect(asStaff.status, JSON.stringify(asStaff.body)).toBe(200);
    const ids = asStaff.body.data.map((m: any) => m.id);
    expect(ids).toEqual(expect.arrayContaining([w.admin.userId, staff.userId, viewer.userId]));
    expect(asStaff.body.data[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), email: expect.any(String) });
    expect((await c.get('/api/v1/issues/assignees', viewer)).status).toBe(403);
  });

  it('an assigned issue carries the assignee name in the list, the drawer and the action response; unassigned is null', async () => {
    const { items } = await list(w.admin);
    expect(items.every((i) => i.assigneeName === null && i.assignedTo === null)).toBe(true);
    const issue = items[0];
    const r = await c.post(`/api/v1/issues/${issue.id}/assign`, { userId: staff.userId }, w.admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ assignedTo: staff.userId, assigneeName: 'Team Member' });
    expect((await list(w.admin)).items.find((i) => i.id === issue.id)).toMatchObject({ assigneeName: 'Team Member' });
    expect((await c.get(`/api/v1/issues/${issue.id}`, w.admin)).body.data).toMatchObject({ assigneeName: 'Team Member' });
  });

  it('the viewer can read every screen endpoint but not change anything', async () => {
    for (const p of ['/api/v1/issues', '/api/v1/issues/counts', '/api/v1/issues/history', '/api/v1/issues/recommendation']) expect((await c.get(p, viewer)).status, p).toBe(200);
    const issue = (await list(w.admin)).items[0];
    expect((await c.get(`/api/v1/issues/${issue.id}`, viewer)).status).toBe(200);
    for (const p of ['start', 'resolve', 'unsnooze']) expect((await c.post(`/api/v1/issues/${issue.id}/${p}`, {}, viewer)).status, p).toBe(403);
    expect((await c.post(`/api/v1/issues/${issue.id}/snooze`, { until: 'tomorrow' }, viewer)).status).toBe(403);
    expect((await c.post('/api/v1/issues/bulk', { ids: [issue.id], action: 'resolve' }, viewer)).status).toBe(403);
    expect((await c.post('/api/v1/issues/refresh', {}, viewer)).status).toBe(403);
  });

  it('tab counts equal the tab list totals; history counts follow resolve and snooze; attempt on a non-attemptable issue is a 409 with its rule', async () => {
    const cnt = (await c.get('/api/v1/issues/counts', w.admin)).body.data;
    for (const tab of ['all', 'critical', 'today', 'upcoming'] as const) expect((await list(w.admin, `&tab=${tab}`)).total, tab).toBe(cnt.tabs[tab]);
    const [a, b] = (await list(w.admin)).items;
    const bulk = await c.post('/api/v1/issues/bulk', { ids: [a.id, b.id, '00000000-0000-4000-8000-000000000000'], action: 'snooze', until: 'tomorrow' }, w.admin);
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.results).toHaveLength(3);
    expect(bulk.body.data.results.find((x: any) => x.id === '00000000-0000-4000-8000-000000000000')).toMatchObject({ ok: false, error: expect.any(String) });
    const hist = (await c.get('/api/v1/issues/history', w.admin)).body.data;
    expect(hist.counts.snoozed).toBe(bulk.body.data.succeeded);
    expect(hist.items.every((i: any) => i.status === 'snoozed' && i.returnsAt && i.returnsLabel)).toBe(true);
    const attempt = await c.post(`/api/v1/issues/${a.id}/resolve`, { mode: 'attempt' }, w.admin);
    if (a.key !== 'channel_sync_failing') {
      expect(attempt.status).toBe(409);
      expect(attempt.body.error.details.rule).toBe('not_attemptable');
    }
  });
});
