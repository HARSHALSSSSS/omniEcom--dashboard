import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Wizard Co' });
});
afterAll(() => t.close());

const step = (state: any, key: string) => state.steps.find((s: any) => s.key === key);

describe('wizard behaviours the screens rely on', () => {
  it('"Skip for now" on a step that is already done keeps it done', async () => {
    await c.put('/api/v1/onboarding/channels', { selected: [] }, admin);
    const sk = await c.post('/api/v1/onboarding/steps/channels/skip', {}, admin);
    expect(sk.status).toBe(200);
    expect(step(sk.body.data, 'channels').status).toBe('completed');
  });

  it('a saved draft comes back with the state and is dropped once the step is saved', async () => {
    const d = await c.put('/api/v1/onboarding/steps/business/draft', { data: { businessName: 'Half typed', businessType: 'retail', teamSize: '2_5', operatingLocation: 'Pu' } }, admin);
    expect(d.status).toBe(200);
    expect((await c.get('/api/v1/onboarding', admin)).body.data.drafts.business).toMatchObject({ businessName: 'Half typed', teamSize: '2_5' });
    await c.put('/api/v1/onboarding/business', { businessName: 'Wizard Co', businessType: 'retail', teamSize: '2_5', operatingLocation: 'Pune, Maharashtra' }, admin);
    expect((await c.get('/api/v1/onboarding', admin)).body.data.drafts.business).toBeUndefined();
  });
});
