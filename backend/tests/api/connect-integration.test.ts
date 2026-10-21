import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';

/** The connect screen's extra read: is the connector verified for live use, or sandbox only? */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let viewer: Actor;

const URL_ = '/api/v1/marketplace-hub/connectors';

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Connect Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
});
afterAll(() => t.close());

describe('GET /marketplace-hub/connectors/:code/readiness', () => {
  it('says whether a connector may run live, with the default mode a new connection gets', async () => {
    const r = await c.get(`${URL_}/mock/readiness`, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ code: 'mock', sandbox: true, live: false, defaultMode: 'sandbox' });
    expect(typeof r.body.data.notes).toBe('string');
  });

  it('is readable by a viewer and answers 404 for an unknown connector', async () => {
    expect((await c.get(`${URL_}/mock/readiness`, viewer)).status).toBe(200);
    expect((await c.get(`${URL_}/nope_market/readiness`, admin)).status).toBe(404);
  });
});
