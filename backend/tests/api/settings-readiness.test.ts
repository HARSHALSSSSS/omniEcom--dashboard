import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withVendor, writeOutboxEvent } from '@oms/database';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, type World } from '../helpers/stage4';
import { stateNameForCode, vendorGstRegistrations } from '../../modules/vendors/src';
import { scanAlerts } from '../../modules/notifications/src';
import { rollupRecent } from '../../modules/analytics/src';

// Valid GSTINs (mod-36 check character) for the PAN AABCN8412P in four states, and a second PAN.
const MH = '27AABCN8412P1Z1';
const KA = '29AABCN8412P1ZX';
const HR = '06AABCN8412P1Z5';
const TN = '33AABCN8412P1Z8';
const OTHER_PAN_GSTIN = '27AAPFU0939F1ZV';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

const owner = async <T = any>(q: string, params: unknown[] = []): Promise<T[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<T>(q, params)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};
const del = (url: string, as: Actor) => c.call('DELETE', url, { as });
const emitEvent = async (vendorId: string, type: string, aggregateId: string, payload: Record<string, unknown> = {}) => {
  await withVendor(t.container.database.db, vendorId, (tx) => writeOutboxEvent(tx, { type, vendorId, aggregateType: type.split('.')[0]!, aggregateId, payload }));
  await t.relayEvents();
};
const inbox = async (as: Actor, qs = '') => (await c.get(`/api/v1/notifications?limit=100${qs}`, as)).body.data.items as any[];
const newVendor = async (name: string) => {
  const admin = await c.registerVendor({ businessName: name });
  return admin;
};

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

describe('GST registry', () => {
  let admin: Actor; let staff: Actor; let viewer: Actor; let other: Actor;
  let first: any;

  beforeAll(async () => {
    admin = await newVendor('Nova Living');
    staff = await c.addMember(admin, 'vendor_staff');
    viewer = await c.addMember(admin, 'vendor_viewer');
    other = await newVendor('Other Co');
  });

  it('starts empty and exposes the state code table', async () => {
    expect((await c.get('/api/v1/vendor/gstins', admin)).body.data).toEqual([]);
    const states = (await c.get('/api/v1/vendor/gst-states', viewer)).body.data as Array<{ code: string; name: string }>;
    expect(states.find((s) => s.code === '27')).toEqual({ code: '27', name: 'Maharashtra' });
    expect(states.length).toBeGreaterThanOrEqual(38);
  });

  it('registers the first GSTIN as primary and mirrors it on the business', async () => {
    const r = await c.post('/api/v1/vendor/gstins', { gstin: MH.toLowerCase(), legalName: 'Nova Living Brands Pvt Ltd', registeredAddress: '402 Peninsula Spire, Lower Parel, Mumbai - 400013' }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    first = r.body.data;
    expect(first).toMatchObject({ gstin: MH, stateCode: '27', stateName: 'Maharashtra', isPrimary: true, status: 'active', registeredAddress: '402 Peninsula Spire, Lower Parel, Mumbai - 400013', legalName: 'Nova Living Brands Pvt Ltd' });
    expect((await c.get('/api/v1/vendor', admin)).body.data.gstin).toBe(MH);
  });

  it('adds more states; only one is primary; the list shows the primary first', async () => {
    const ka = await c.post('/api/v1/vendor/gstins', { gstin: KA, tradeName: 'BLR Hub', address: { city: 'Bengaluru', state: 'Karnataka', pincode: '560067' } }, admin);
    expect(ka.status).toBe(201);
    expect(ka.body.data).toMatchObject({ isPrimary: false, stateName: 'Karnataka', registeredAddress: 'Bengaluru, Karnataka, 560067' });
    const hr = await c.post('/api/v1/vendor/gstins', { gstin: HR }, admin);
    expect(hr.body.data.stateName).toBe('Haryana');
    const list = (await c.get('/api/v1/vendor/gstins', viewer)).body.data as any[];
    expect(list.map((g) => g.stateCode)).toEqual(['27', '06', '29']);
    expect(list.filter((g) => g.isPrimary)).toHaveLength(1);
  });

  it('rejects a bad format, an unknown state, a wrong check character and a duplicate', async () => {
    const bad = await c.post('/api/v1/vendor/gstins', { gstin: '27AABCN8412P1Z' }, admin);
    expect(bad.status).toBe(400);
    const fmt = await c.post('/api/v1/vendor/gstins', { gstin: '27AABCN8412P1Y1' }, admin);
    expect(fmt.status).toBe(400);
    expect(fmt.body.error.details.rule).toBe('gstin_format');
    const state = await c.post('/api/v1/vendor/gstins', { gstin: '00AABCN8412P1Z0' }, admin);
    expect(state.body.error.details.rule).toBe('gstin_state_code');
    const sum = await c.post('/api/v1/vendor/gstins', { gstin: '33AABCN8412P1Z9' }, admin);
    expect(sum.status).toBe(400);
    expect(sum.body.error.details).toMatchObject({ rule: 'gstin_checksum', expectedCheckChar: '8' });
    expect(sum.body.error.details.issues[0].path).toBe('gstin');
    const dup = await c.post('/api/v1/vendor/gstins', { gstin: KA }, admin);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.rule).toBe('gstin_duplicate');
  });

  it('checks a GSTIN without saving it', async () => {
    const ok = (await c.post('/api/v1/vendor/gstins/validate', { gstin: TN }, viewer)).body.data;
    expect(ok).toMatchObject({ valid: true, stateName: 'Tamil Nadu', pan: 'AABCN8412P', problem: null });
    const bad = (await c.post('/api/v1/vendor/gstins/validate', { gstin: '33AABCN8412P1Z9' }, admin)).body.data;
    expect(bad).toMatchObject({ valid: false, problem: 'checksum', expectedCheckChar: '8' });
    expect((await c.get('/api/v1/vendor/gstins', admin)).body.data).toHaveLength(3);
  });

  it('requires the PAN inside the GSTIN to equal the business PAN', async () => {
    expect((await c.patch('/api/v1/vendor', { pan: 'AAPFU0939F' }, admin)).status).toBe(400); // clashes with the registered GSTINs
    expect((await c.patch('/api/v1/vendor', { pan: 'AABCN8412P' }, admin)).body.data.pan).toBe('AABCN8412P');
    const r = await c.post('/api/v1/vendor/gstins', { gstin: OTHER_PAN_GSTIN }, admin);
    expect(r.status).toBe(400);
    expect(r.body.error.details).toMatchObject({ rule: 'gstin_pan_mismatch', businessPan: 'AABCN8412P', gstinPan: 'AAPFU0939F' });
    const v = (await c.post('/api/v1/vendor/gstins/validate', { gstin: OTHER_PAN_GSTIN }, admin)).body.data;
    expect(v).toMatchObject({ valid: true, panMatchesBusiness: false });
    expect((await c.post('/api/v1/vendor/gstins/validate', { gstin: MH }, admin)).body.data.panMatchesBusiness).toBe(true);
  });

  it('moves the primary flag and the business GSTIN; the move is idempotent', async () => {
    const list = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    const ka = list.find((g) => g.stateCode === '29');
    const r = await c.post(`/api/v1/vendor/gstins/${ka.id}/primary`, {}, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.isPrimary).toBe(true);
    expect((await c.post(`/api/v1/vendor/gstins/${ka.id}/primary`, {}, admin)).status).toBe(200);
    const after = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    expect(after.filter((g) => g.isPrimary).map((g) => g.stateCode)).toEqual(['29']);
    expect(after[0].stateCode).toBe('29');
    expect((await c.get('/api/v1/vendor', admin)).body.data.gstin).toBe(KA);
  });

  it('keeps the primary registration: it cannot be deactivated or removed while others exist', async () => {
    const list = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    const primary = list.find((g) => g.isPrimary);
    const off = await c.patch(`/api/v1/vendor/gstins/${primary.id}`, { status: 'inactive' }, admin);
    expect(off.status).toBe(409);
    expect(off.body.error.details.rule).toBe('gstin_primary_required');
    const rm = await del(`/api/v1/vendor/gstins/${primary.id}`, admin);
    expect(rm.status).toBe(409);
    const mh = list.find((g) => g.stateCode === '27');
    const off2 = await c.patch(`/api/v1/vendor/gstins/${mh.id}`, { status: 'inactive' }, admin);
    expect(off2.body.data.status).toBe('inactive');
    const prim = await c.post(`/api/v1/vendor/gstins/${mh.id}/primary`, {}, admin);
    expect(prim.status).toBe(409); // inactive cannot be primary
    expect(prim.body.error.details.rule).toBe('gstin_primary_inactive');
  });

  it('edits a registration with an optimistic lock and keeps the address text', async () => {
    const list = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    const hr = list.find((g) => g.stateCode === '06');
    const ok = await c.patch(`/api/v1/vendor/gstins/${hr.id}`, { tradeName: 'NCR Facility', registeredAddress: 'Plot 88, Sector 34, Gurugram', version: hr.version }, admin);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ tradeName: 'NCR Facility', registeredAddress: 'Plot 88, Sector 34, Gurugram', version: hr.version + 1 });
    const stale = await c.patch(`/api/v1/vendor/gstins/${hr.id}`, { tradeName: 'x', version: hr.version }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    // structured address change keeps the free text
    const keep = await c.patch(`/api/v1/vendor/gstins/${hr.id}`, { address: { city: 'Gurugram' } }, admin);
    expect(keep.body.data.registeredAddress).toBe('Plot 88, Sector 34, Gurugram');
    // changing the GSTIN re-derives the state
    const move = await c.patch(`/api/v1/vendor/gstins/${hr.id}`, { gstin: TN }, admin);
    expect(move.body.data).toMatchObject({ gstin: TN, stateCode: '33', stateName: 'Tamil Nadu' });
    expect((await c.patch(`/api/v1/vendor/gstins/${hr.id}`, { gstin: KA }, admin)).status).toBe(409);
  });

  it('the profile GSTIN follows the registry in both directions', async () => {
    const r = await c.patch('/api/v1/vendor', { gstin: MH }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const list = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    expect(list.filter((g) => g.isPrimary).map((g) => g.gstin)).toEqual([MH]);
    expect(list.find((g) => g.gstin === MH).status).toBe('active'); // re-activated by becoming the primary one
    expect((await c.patch('/api/v1/vendor', { gstin: '27AABCN8412P1Z9' }, admin)).status).toBe(400); // wrong check character
    expect((await c.patch('/api/v1/vendor', { gstin: OTHER_PAN_GSTIN }, admin)).status).toBe(400); // other PAN
  });

  it('removes a non-primary registration and the last primary one; the business GSTIN clears', async () => {
    const list = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    for (const g of list.filter((x) => !x.isPrimary)) expect((await del(`/api/v1/vendor/gstins/${g.id}`, admin)).status).toBe(200);
    const [last] = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    expect((await del(`/api/v1/vendor/gstins/${last.id}`, admin)).status).toBe(200);
    expect((await c.get('/api/v1/vendor', admin)).body.data.gstin).toBeNull();
    expect((await del(`/api/v1/vendor/gstins/${last.id}`, admin)).status).toBe(404);
  });

  it('only the owner writes; staff and viewers read or are refused', async () => {
    expect((await c.post('/api/v1/vendor/gstins', { gstin: MH }, staff)).status).toBe(403);
    expect((await c.post('/api/v1/vendor/gstins', { gstin: MH }, viewer)).status).toBe(403);
    expect((await c.get('/api/v1/vendor/gstins', staff)).status).toBe(200);
    expect((await c.get('/api/v1/vendor/gstins', viewer)).status).toBe(200);
    const mine = (await c.post('/api/v1/vendor/gstins', { gstin: MH }, admin)).body.data;
    expect((await c.patch(`/api/v1/vendor/gstins/${mine.id}`, { notes: 'x' }, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/vendor/gstins/${mine.id}/primary`, {}, staff)).status).toBe(403);
    expect((await del(`/api/v1/vendor/gstins/${mine.id}`, staff)).status).toBe(403);
    expect((await c.get('/api/v1/vendor/gstins', undefined)).status).toBe(401);
  });

  it('is tenant isolated', async () => {
    const mine = (await c.get('/api/v1/vendor/gstins', admin)).body.data as any[];
    expect((await c.get('/api/v1/vendor/gstins', other)).body.data).toEqual([]);
    expect((await c.patch(`/api/v1/vendor/gstins/${mine[0].id}`, { notes: 'hack' }, other)).status).toBe(404);
    expect((await c.post(`/api/v1/vendor/gstins/${mine[0].id}/primary`, {}, other)).status).toBe(404);
    expect((await del(`/api/v1/vendor/gstins/${mine[0].id}`, other)).status).toBe(404);
    expect((await c.post('/api/v1/vendor/gstins', { gstin: MH }, other)).status).toBe(201); // the same GSTIN may exist in another business
  });

  it('writes an audit entry and exports vendorGstRegistrations (active first, primary first) and stateNameForCode', async () => {
    const audits = await owner(`select action from audit_logs where vendor_id = $1 and action like 'vendor.gstin_%' order by created_at`, [admin.vendorId]);
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['vendor.gstin_add', 'vendor.gstin_update', 'vendor.gstin_primary', 'vendor.gstin_remove']));
    // mix: an inactive one and a second active one
    await c.post('/api/v1/vendor/gstins', { gstin: KA, status: 'inactive' }, admin);
    await c.post('/api/v1/vendor/gstins', { gstin: HR, tradeName: 'NCR' }, admin);
    const regs = await withVendor(t.container.database.db, admin.vendorId!, (tx) => vendorGstRegistrations(tx, admin.vendorId!));
    expect(regs.map((r) => [r.stateCode, r.isPrimary, r.status])).toEqual([['27', true, 'active'], ['06', false, 'active'], ['29', false, 'inactive']]);
    expect(regs[1]).toMatchObject({ gstin: HR, stateName: 'Haryana', tradeName: 'NCR', legalName: null });
    expect(stateNameForCode('29')).toBe('Karnataka');
  });

  it('a GSTIN entered at sign-up shows up as the primary registration', async () => {
    const legacy = await newVendor('Legacy Co');
    await owner('update vendors set gstin = $2 where id = $1', [legacy.vendorId, '29ABCDE1234F1Z5']); // registration form only checks the format
    const list = (await c.get('/api/v1/vendor/gstins', legacy)).body.data as any[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ gstin: '29ABCDE1234F1Z5', stateName: 'Karnataka', isPrimary: true });
    expect((await c.get('/api/v1/vendor/gstins', legacy)).body.data).toHaveLength(1); // idempotent
    const settings = (await c.get('/api/v1/settings', legacy)).body.data;
    expect(settings.gstins).toHaveLength(1);
  });
});

describe('vendor profile: CIN, PAN', () => {
  let admin: Actor; let viewer: Actor;
  beforeAll(async () => { admin = await newVendor('Nova Profile'); viewer = await c.addMember(admin, 'vendor_viewer'); });

  it('stores and returns the CIN and the PAN', async () => {
    expect((await c.get('/api/v1/vendor', admin)).body.data.cin).toBeNull();
    const r = await c.patch('/api/v1/vendor', { cin: 'u74999mh2021ptc368942', pan: 'aabcn8412p' }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ cin: 'U74999MH2021PTC368942', pan: 'AABCN8412P' });
    expect((await c.get('/api/v1/vendor', viewer)).body.data.cin).toBe('U74999MH2021PTC368942');
    expect((await c.patch('/api/v1/vendor', { cin: null }, admin)).body.data.cin).toBeNull();
  });

  it('rejects an invalid CIN and PAN', async () => {
    const cin = await c.patch('/api/v1/vendor', { cin: 'NOT-A-CIN' }, admin);
    expect(cin.status).toBe(400);
    expect(cin.body.error.details.issues[0].path).toBe('cin');
    expect((await c.patch('/api/v1/vendor', { pan: '1234' }, admin)).status).toBe(400);
    expect((await c.patch('/api/v1/vendor', { cin: 'U74999MH2021PTC368942' }, viewer)).status).toBe(403);
  });
});

describe('settings screen', () => {
  let admin: Actor; let staff: Actor; let viewer: Actor; let other: Actor; let whMain: any; let whB: any;
  beforeAll(async () => {
    admin = await newVendor('Settings Co');
    staff = await c.addMember(admin, 'vendor_staff');
    viewer = await c.addMember(admin, 'vendor_viewer');
    other = await newVendor('Other Settings Co');
    whMain = await c.makeWarehouse(admin, { code: 'MUM', name: 'Mumbai Hub B2' });
    whB = await c.makeWarehouse(admin, { code: 'BLR', name: 'Bengaluru Hub' });
    await c.patch('/api/v1/vendor', { legalName: 'Nova Living Brands Private Limited', displayName: 'Nova Living', businessEmail: 'care@novaliving.in', phone: '+91 22 4920 1800', address: { city: 'Mumbai', state: 'Maharashtra' }, timezone: 'Asia/Kolkata' }, admin);
  });

  it('clears the support email and phone with null and keeps the rest', async () => {
    const solo = await newVendor('Clear Co');
    await c.patch('/api/v1/vendor', { businessEmail: 'care@clear.in', phone: '+91 22 4920 1800' }, solo);
    const r = await c.patch('/api/v1/settings', { business: { businessEmail: null, phone: null } }, solo);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.business).toMatchObject({ supportEmail: null, supportPhone: null, displayName: 'Clear Co' });
    expect((await c.patch('/api/v1/settings', { business: { phone: '123' } }, solo)).status).toBe(400); // too short, still validated
  });

  it('returns every tab in one call with the defaults', async () => {
    const r = await c.get('/api/v1/settings', admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d.business).toMatchObject({ legalName: 'Nova Living Brands Private Limited', displayName: 'Nova Living', cin: null, supportEmail: 'care@novaliving.in', supportPhone: '+91 22 4920 1800', registeredCity: 'Mumbai, Maharashtra' });
    expect(d.regional).toMatchObject({ currency: 'INR', timezone: 'Asia/Kolkata', timezoneLabel: 'Asia/Kolkata (UTC+05:30)', numberFormat: 'indian', locked: ['currency', 'timezone'] });
    expect(d.operations).toMatchObject({ autoAcknowledgeOrders: false, roundPriceToNine: false, defaultInventoryBufferPercent: 0, defaultFulfillmentMethod: null, defaultWarehouseId: null, lowStockThreshold: 5 });
    expect(d.alerts).toEqual({ dispatchSlaBreach: { enabled: true, thresholdMinutes: 45 }, criticalStockouts: true, tokenRenewals: true, syncFailures: true, returns: true });
    expect(d.alertMatrix.map((a: any) => a.key)).toEqual(['dispatchSlaBreach', 'criticalStockouts', 'tokenRenewals', 'syncFailures', 'returns']);
    expect(d.alertMatrix[0]).toMatchObject({ enabled: true, thresholdMinutes: 45 });
    expect(d.ai).toEqual({ enabled: true, mode: 'recommend', manageUrl: '/api/v1/ai/settings' });
    expect(d.warehouses.map((w: any) => w.name).sort()).toEqual(['Bengaluru Hub', 'Mumbai Hub B2']);
    expect(typeof d.version).toBe('number');
    expect((await c.get('/api/v1/settings', viewer)).status).toBe(200);
    expect((await c.get('/api/v1/settings', staff)).status).toBe(200);
  });

  it('saves all tabs at once and returns the refreshed aggregate', async () => {
    const before = (await c.get('/api/v1/settings', admin)).body.data;
    const r = await c.patch('/api/v1/settings', {
      business: { cin: 'U74999MH2021PTC368942', displayName: 'Nova Living India' },
      regional: { numberFormat: 'international' },
      operations: { autoAcknowledgeOrders: true, roundPriceToNine: true, defaultInventoryBufferPercent: 5, lowStockThreshold: 15, defaultFulfillmentMethod: 'marketplace', defaultWarehouseId: whMain.id },
      alerts: { dispatchSlaBreach: { thresholdMinutes: 30 }, returns: false },
      version: before.version,
    }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.business).toMatchObject({ cin: 'U74999MH2021PTC368942', displayName: 'Nova Living India' });
    expect(r.body.data.regional.numberFormat).toBe('international');
    expect(r.body.data.operations).toMatchObject({ autoAcknowledgeOrders: true, roundPriceToNine: true, defaultInventoryBufferPercent: 5, lowStockThreshold: 15, defaultFulfillmentMethod: 'marketplace', defaultWarehouseId: whMain.id, effectiveWarehouseId: whMain.id });
    expect(r.body.data.alerts).toEqual({ dispatchSlaBreach: { enabled: true, thresholdMinutes: 30 }, criticalStockouts: true, tokenRenewals: true, syncFailures: true, returns: false });
    expect(r.body.data.version).toBeGreaterThan(before.version);
    // the plain settings document and the vendor see the same values (other modules read it there)
    const doc = (await c.get('/api/v1/vendor/settings', admin)).body.data;
    expect(doc).toMatchObject({ lowStockThreshold: 15, numberFormat: 'international', operations: { roundPriceToNine: true }, alerts: { returns: false } });
  });

  it('rejects a stale version, bad values and a foreign or unknown warehouse', async () => {
    const cur = (await c.get('/api/v1/settings', admin)).body.data;
    const stale = await c.patch('/api/v1/settings', { alerts: { returns: true }, version: cur.version - 1 }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect((await c.get('/api/v1/settings', admin)).body.data.alerts.returns).toBe(false); // nothing changed
    expect((await c.patch('/api/v1/settings', { operations: { defaultInventoryBufferPercent: 101 } }, admin)).status).toBe(400);
    expect((await c.patch('/api/v1/settings', { operations: { defaultFulfillmentMethod: 'carrier_pigeon' } }, admin)).status).toBe(400);
    expect((await c.patch('/api/v1/settings', { alerts: { dispatchSlaBreach: { thresholdMinutes: 2 } } }, admin)).status).toBe(400);
    expect((await c.patch('/api/v1/settings', { alerts: { madeUp: true } }, admin)).status).toBe(400);
    expect((await c.patch('/api/v1/settings', { regional: { numberFormat: 'lakhs' } }, admin)).status).toBe(400);
    const wrong = await c.patch('/api/v1/settings', { operations: { defaultWarehouseId: '00000000-0000-4000-8000-000000000000' } }, admin);
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.rule).toBe('warehouse_not_found');
    const foreign = await c.makeWarehouse(other, { code: 'OTH', name: 'Other WH' });
    expect((await c.patch('/api/v1/settings', { operations: { defaultWarehouseId: foreign.id } }, admin)).body.error.details.rule).toBe('warehouse_not_found');
    expect((await c.patch('/api/v1/settings', { business: { cin: 'bad' } }, admin)).status).toBe(400);
  });

  it('saves only the alert preferences and merges nested flags', async () => {
    const r = await c.put('/api/v1/settings/alerts', { dispatchSlaBreach: { enabled: false }, tokenRenewals: false }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.alerts).toEqual({ dispatchSlaBreach: { enabled: false, thresholdMinutes: 30 }, criticalStockouts: true, tokenRenewals: false, syncFailures: true, returns: false });
    expect(r.body.data.alertMatrix.find((a: any) => a.key === 'tokenRenewals').enabled).toBe(false);
    const stale = await c.put('/api/v1/settings/alerts', { returns: true, version: 1 }, admin);
    expect(stale.status).toBe(409);
    const withV = await c.put('/api/v1/settings/alerts', { returns: true, version: r.body.data.version }, admin);
    expect(withV.status).toBe(200);
    expect(withV.body.data.alerts.returns).toBe(true);
    expect((await c.put('/api/v1/settings/alerts', { dispatchSlaBreach: { thresholdMinutes: 2000 } }, admin)).status).toBe(400);
    const audit = await owner(`select 1 from audit_logs where vendor_id = $1 and action = 'vendor.alerts_update'`, [admin.vendorId]);
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('is admin-only for writes and tenant isolated', async () => {
    expect((await c.patch('/api/v1/settings', { alerts: { returns: true } }, staff)).status).toBe(403);
    expect((await c.put('/api/v1/settings/alerts', { returns: true }, viewer)).status).toBe(403);
    expect((await c.get('/api/v1/settings', undefined)).status).toBe(401);
    const theirs = (await c.get('/api/v1/settings', other)).body.data;
    expect(theirs.business.displayName).not.toBe('Nova Living India');
    expect(theirs.warehouses.map((w: any) => w.name)).toEqual(['Other WH']);
    expect(theirs.operations.defaultWarehouseId).toBeNull();
    // an inactive warehouse cannot be the default
    await owner(`update warehouses set status = 'inactive' where id = $1`, [whB.id]);
    const inactive = await c.patch('/api/v1/settings', { operations: { defaultWarehouseId: whB.id } }, admin);
    expect(inactive.body.error.details.rule).toBe('warehouse_inactive');
  });

  it('shows the AI switch from /ai/settings', async () => {
    const off = await c.put('/api/v1/ai/settings', { enabled: false }, admin);
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect((await c.get('/api/v1/settings', admin)).body.data.ai.enabled).toBe(false);
  });
});

describe('notifications: categories, action links and alert switches', () => {
  it('writes money with the rupee sign and names the marketplace, never its code', async () => {
    const admin = await newVendor('Words Co');
    await emitEvent(admin.vendorId!, 'order.created', '33333333-3333-4333-8333-333333333333', { orderNumber: 'ORD-2', marketplace: 'mock', totalMinor: 51900 });
    const order = (await inbox(admin)).find((n) => n.type === 'order.new');
    expect(order?.body).toBe('Mock Marketplace (Sandbox) · ₹519.00');
    expect(order?.body).not.toMatch(/INR|mock/);
  });

  it('adds category and actionUrl and counts unread per category', async () => {
    const admin = await newVendor('Notify Co');
    await emitEvent(admin.vendorId!, 'order.created', '11111111-1111-4111-8111-111111111111', { orderNumber: 'ORD-1', marketplace: 'amazon_in', totalMinor: 150000 });
    await emitEvent(admin.vendorId!, 'return.created', '22222222-2222-4222-8222-222222222222', { orderNumber: 'ORD-1', units: 2, reasonCode: 'damaged' });
    const items = await inbox(admin);
    const order = items.find((n) => n.type === 'order.new');
    expect(order).toMatchObject({ category: 'order', actionUrl: '/orders/11111111-1111-4111-8111-111111111111', title: 'New order ORD-1' });
    const ret = items.find((n) => n.type === 'return.requested');
    expect(ret).toMatchObject({ category: 'returns', actionUrl: '/returns/22222222-2222-4222-8222-222222222222', severity: 'info' });
    const unread = (await c.get('/api/v1/notifications/unread-count', admin)).body.data;
    expect(unread).toMatchObject({ total: 2, byCategory: { order: 1, returns: 1 }, bySeverity: { info: 2 } });
    expect((await inbox(admin, '&filter[category]=returns')).map((n) => n.type)).toEqual(['return.requested']);
    expect(await inbox(admin, '&filter[category]=security')).toEqual([]);
    expect((await c.get('/api/v1/notifications?filter[category]=bogus', admin)).status).toBe(400);
    const types = (await c.get('/api/v1/notifications/types', admin)).body.data as any[];
    expect(types.find((x) => x.type === 'order.sla_breach')).toMatchObject({ category: 'order', severity: 'critical' });
    expect(types.find((x) => x.type === 'security.user_invited').category).toBe('security');
    const one = (await c.get(`/api/v1/notifications/${order.id}`, admin)).body.data;
    expect(one.category).toBe('order');
  });

  it('creates security notifications for an invitation and for a removed member', async () => {
    const admin = await newVendor('Security Co');
    const member = await c.addMember(admin, 'vendor_staff');
    await t.relayEvents();
    let sec = await inbox(admin, '&filter[category]=security');
    expect(sec.map((n) => n.type)).toContain('security.user_invited');
    expect(sec.find((n) => n.type === 'security.user_invited')).toMatchObject({ title: 'A team member was invited', body: 'Role: staff', actionUrl: '/settings' });
    expect((await del(`/api/v1/users/${member.userId}`, admin)).status).toBe(200);
    await t.relayEvents();
    sec = await inbox(admin, '&filter[category]=security');
    expect(sec.map((n) => n.type)).toContain('security.user_removed');
  });

  it('low stock follows both the legacy switch and the critical stockouts alert flag', async () => {
    const admin = await newVendor('Stock Alerts Co');
    const low = (id: string) => emitEvent(admin.vendorId!, 'inventory.low_stock', id, { available: 2, reorderLevel: 5, variantId: id, warehouseId: id });
    await low('33333333-3333-4333-8333-333333333331');
    expect((await inbox(admin)).filter((n) => n.type === 'inventory.low_stock')).toHaveLength(1);
    await c.put('/api/v1/settings/alerts', { criticalStockouts: false }, admin);
    await low('33333333-3333-4333-8333-333333333332');
    expect((await inbox(admin)).filter((n) => n.type === 'inventory.low_stock')).toHaveLength(1); // nothing new
    await c.put('/api/v1/settings/alerts', { criticalStockouts: true }, admin);
    await c.patch('/api/v1/vendor/settings', { notifications: { lowStock: false } }, admin); // legacy switch
    await low('33333333-3333-4333-8333-333333333333');
    expect((await inbox(admin)).filter((n) => n.type === 'inventory.low_stock')).toHaveLength(1);
    await c.patch('/api/v1/vendor/settings', { notifications: { lowStock: true } }, admin);
    await low('33333333-3333-4333-8333-333333333334');
    expect((await inbox(admin)).filter((n) => n.type === 'inventory.low_stock')).toHaveLength(2);
  });

  it('sync failures, token expiry and returns honour their flags; orders honour orderAlerts', async () => {
    const admin = await newVendor('Flag Co');
    await c.put('/api/v1/settings/alerts', { syncFailures: false, tokenRenewals: false, returns: false }, admin);
    await emitEvent(admin.vendorId!, 'sync.failed', '44444444-4444-4444-8444-444444444441', { type: 'orders', accountId: 'a1', error: 'boom' });
    await emitEvent(admin.vendorId!, 'marketplace_account.authorization_expired', '44444444-4444-4444-8444-444444444442', {});
    await emitEvent(admin.vendorId!, 'return.created', '44444444-4444-4444-8444-444444444443', { orderNumber: 'O', units: 1, reasonCode: 'x' });
    await emitEvent(admin.vendorId!, 'return.received', '44444444-4444-4444-8444-444444444444', { number: 'R-1', units: 1 });
    expect(await inbox(admin)).toEqual([]);
    await emitEvent(admin.vendorId!, 'marketplace_account.disconnected', '44444444-4444-4444-8444-444444444445', {}); // not gated
    expect((await inbox(admin)).map((n) => n.type)).toEqual(['marketplace.disconnected']);
    await c.put('/api/v1/settings/alerts', { syncFailures: true, tokenRenewals: true, returns: true }, admin);
    await emitEvent(admin.vendorId!, 'sync.failed', '44444444-4444-4444-8444-444444444446', { type: 'orders', accountId: 'a2', error: 'boom' });
    await emitEvent(admin.vendorId!, 'marketplace_account.authorization_expired', '44444444-4444-4444-8444-444444444447', {});
    await emitEvent(admin.vendorId!, 'return.received', '44444444-4444-4444-8444-444444444448', { number: 'R-2', units: 1 });
    expect((await inbox(admin)).map((n) => n.type).sort()).toEqual(['marketplace.authorization_expired', 'marketplace.disconnected', 'return.received', 'sync.failed']);
    await c.patch('/api/v1/vendor/settings', { notifications: { orderAlerts: false } }, admin);
    await emitEvent(admin.vendorId!, 'order.created', '44444444-4444-4444-8444-444444444449', { orderNumber: 'ORD-9' });
    expect((await inbox(admin)).some((n) => n.type === 'order.new')).toBe(false);
  });
});

describe('notification alert scan (dispatch SLA, token expiry)', () => {
  let w: World;
  beforeAll(async () => { w = await buildWorld(t, c, { warehouses: 1, stock: [50], sku: 'SLA-1' }); });

  it('warns about orders due within the threshold and collapses repeats', async () => {
    const order = await orderArrives(t, c, w, 2);
    await owner(`update orders set dispatch_due_at = now() + interval '20 minutes' where id = $1`, [order.id]);
    const first = await scanAlerts(t.container);
    expect(first.slaNotified).toBeGreaterThanOrEqual(1);
    const items = (await inbox(w.admin)).filter((n) => n.type === 'order.sla_breach');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: 'order', severity: 'critical', actionUrl: '/orders?attention=true', title: '1 order(s) must be dispatched within 45 minutes' });
    expect(items[0].body).toContain(order.orderNumber);
    await scanAlerts(t.container);
    expect((await inbox(w.admin)).filter((n) => n.type === 'order.sla_breach')).toHaveLength(1); // still unread: one notification
  });

  it('respects the threshold and the dispatchSlaBreach switch', async () => {
    const admin = w.admin;
    await c.post('/api/v1/notifications/read', { all: true }, admin);
    await c.put('/api/v1/settings/alerts', { dispatchSlaBreach: { thresholdMinutes: 10 } }, admin);
    await scanAlerts(t.container);
    expect((await inbox(admin)).filter((n) => !n.read && n.type === 'order.sla_breach')).toHaveLength(0); // 20 minutes left, threshold 10
    await c.put('/api/v1/settings/alerts', { dispatchSlaBreach: { thresholdMinutes: 60 } }, admin);
    await scanAlerts(t.container);
    expect((await inbox(admin)).filter((n) => !n.read && n.type === 'order.sla_breach')).toHaveLength(1);
    await c.post('/api/v1/notifications/read', { all: true }, admin);
    await c.put('/api/v1/settings/alerts', { dispatchSlaBreach: { enabled: false } }, admin);
    await scanAlerts(t.container);
    expect((await inbox(admin)).filter((n) => !n.read)).toHaveLength(0);
    await c.put('/api/v1/settings/alerts', { dispatchSlaBreach: { enabled: true } }, admin);
  });

  it('ignores orders already dispatched and orders far from their deadline', async () => {
    const admin = w.admin;
    await c.post('/api/v1/notifications/read', { all: true }, admin);
    await owner(`update orders set status = 'dispatched' where vendor_id = $1`, [admin.vendorId]);
    await scanAlerts(t.container);
    expect((await inbox(admin)).filter((n) => !n.read)).toHaveLength(0);
    await owner(`update orders set status = 'new', dispatch_due_at = now() + interval '5 hours' where vendor_id = $1`, [admin.vendorId]);
    await scanAlerts(t.container);
    expect((await inbox(admin)).filter((n) => !n.read)).toHaveLength(0);
  });

  it('warns when a token expires within a day and its renewal failed; stays quiet otherwise', async () => {
    const admin = w.admin;
    await c.post('/api/v1/notifications/read', { all: true }, admin);
    await owner(`update marketplace_authorizations set access_token_expires_at = now() + interval '5 hours', last_error_at = null where vendor_id = $1`, [admin.vendorId]);
    await scanAlerts(t.container);
    expect((await inbox(admin)).filter((n) => n.type === 'marketplace.token_expiring')).toHaveLength(0); // renewals are working
    await owner(`update marketplace_authorizations set last_error_at = now() where vendor_id = $1`, [admin.vendorId]);
    await scanAlerts(t.container);
    const warn = (await inbox(admin)).filter((n) => n.type === 'marketplace.token_expiring');
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ category: 'connector', severity: 'warning', entityType: 'marketplace_account', entityId: w.account.id, actionUrl: '/marketplace-hub/health' });
    expect(warn[0].title).toMatch(/expires in 5 hours/);
    await c.post('/api/v1/notifications/read', { all: true }, admin);
    await c.put('/api/v1/settings/alerts', { tokenRenewals: false }, admin);
    await scanAlerts(t.container);
    expect((await inbox(admin)).filter((n) => !n.read)).toHaveLength(0);
  });

  it('runs as the scheduled job', async () => {
    await t.queues.enqueue('maintenance', 'notifications.scan-alerts', { vendorId: null, correlationId: 'scan-test', data: {} });
    expect(await t.runJobs((j) => j.name === 'notifications.scan-alerts')).toBe(1);
  });
});

describe('shell and search', () => {
  it('shell carries the user email, role, formats and the unread severity split', async () => {
    const admin = await newVendor('Shell Co');
    await emitEvent(admin.vendorId!, 'order.created', '55555555-5555-4555-8555-555555555551', { orderNumber: 'ORD-5' });
    await emitEvent(admin.vendorId!, 'marketplace_account.disconnected', '55555555-5555-4555-8555-555555555552', {});
    const s = (await c.get('/api/v1/workspace/shell', admin)).body.data;
    expect(s.user).toMatchObject({ email: admin.email, role: 'vendor_admin', roleLabel: 'Business owner' });
    expect(s.business).toMatchObject({ currency: 'INR', numberFormat: 'indian' });
    expect(typeof s.business.timezone).toBe('string');
    expect(s.badges).toMatchObject({ notifications: 2 });
    expect(s.unreadBySeverity).toEqual({ info: 1, critical: 1 });
    await c.patch('/api/v1/settings', { regional: { numberFormat: 'international' } }, admin);
    expect((await c.get('/api/v1/workspace/shell', admin)).body.data.business.numberFormat).toBe('international');
    await c.post('/api/v1/notifications/read', { all: true }, admin);
    const read = (await c.get('/api/v1/workspace/shell', admin)).body.data;
    expect(read.badges.notifications).toBe(0);
    expect(read.unreadBySeverity).toEqual({});
  });

  it('search returns the product, order and sku groups the global search renders', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [4], sku: 'TRV-1042' });
    await orderArrives(t, c, w, 1);
    const r = await c.get('/api/v1/search?q=TRV-1042', w.admin);
    expect(r.status).toBe(200);
    const byType = Object.fromEntries(r.body.data.groups.map((g: any) => [g.type, g]));
    expect(byType.product.items[0]).toMatchObject({ meta: 'Product', href: expect.stringMatching(/^\/products\//) });
    expect(byType.product.items[0].subtitle).toContain('TRV-1042');
    expect(byType.sku.items[0]).toMatchObject({ meta: 'Inventory' });
    expect(byType.sku.items[0].title).toContain('TRV-1042');
    expect((await c.get('/api/v1/search?q=a', w.admin)).status).toBe(400);
  });
});

describe('recommendations page', () => {
  let w: World;
  let viewer: Actor;
  beforeAll(async () => {
    w = await buildWorld(t, c, { warehouses: 1, stock: [20], sku: 'TRV-1042' });
    viewer = await c.addMember(w.admin, 'vendor_viewer');
  });

  it('is empty-handed on a healthy workspace', async () => {
    const r = await c.get('/api/v1/workspace/recommendations', w.admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ channel: null, product: null, replenishment: null, channelConnections: 1 });
  });

  it('builds the product and replenishment cards from real sales and stock', async () => {
    await orderArrives(t, c, w, 18); // 18 reserved of 20: 2 available, sold 18 in 30 days
    await owner(`update inventory set reorder_level = 10 where vendor_id = $1`, [w.admin.vendorId]);
    await rollupRecent(t.container, 2); // sales velocity reads the daily roll-ups (refreshed every 15 minutes by the scheduler)
    const d = (await c.get('/api/v1/workspace/recommendations', w.admin)).body.data;
    expect(d.product).toMatchObject({ sku: 'TRV-1042', onHand: 20, reserved: 18, available: 2, lowStockThreshold: 10, status: 'low' });
    expect(d.product.salesVelocityPerDay).toBeCloseTo(0.6, 1);
    expect(d.product.estimatedCoverDays).toBe(Math.floor(2 / d.product.salesVelocityPerDay));
    expect(d.product.recentMovements.length).toBeGreaterThan(0);
    expect(d.product.recentMovements[0]).toMatchObject({ label: expect.any(String), positive: expect.any(Boolean) });
    expect(d.product.actions.map((a: any) => a.href)).toEqual(['/procurement', `/products/${d.product.productId}`]);
    const item = d.replenishment.items[0];
    expect(item).toMatchObject({ sku: 'TRV-1042', available: 2 });
    expect(item.suggestedUnits).toBe(Math.ceil(14 * item.salesVelocityPerDay - 2));
    expect(d.replenishment).toMatchObject({ headline: 'Replenish 1 product this week', targetDays: 14, formula: '14 days of sales minus available stock', totalProducts: 1 });
    expect(d.replenishment.note).toContain('Recommendation only');
    const long = (await c.get('/api/v1/workspace/recommendations?targetDays=30', w.admin)).body.data.replenishment.items[0];
    expect(long.suggestedUnits).toBeGreaterThan(item.suggestedUnits);
    const picked = (await c.get(`/api/v1/workspace/recommendations?variantId=${w.variant.variantId}`, w.admin)).body.data;
    expect(picked.product.variantId).toBe(w.variant.variantId);
    expect((await c.get('/api/v1/workspace/recommendations?limit=0', w.admin)).status).toBe(400);
  });

  it('shows the channel connection that needs attention with the retry action', async () => {
    await owner(`update marketplace_accounts set connection_status = 'error', last_failure_message = 'Token rejected by the marketplace' where id = $1`, [w.account.id]);
    const d = (await c.get('/api/v1/workspace/recommendations', w.admin)).body.data;
    expect(d.channel).toMatchObject({ connection: 'needs_attention', health: 'attention', openIssueCount: 1 });
    expect(d.channel.openIssues[0].explanation).toBe('Token rejected by the marketplace');
    expect(d.channel.actions.map((a: any) => [a.key, a.enabled])).toEqual([['retry_sync', true], ['manage', true]]);
    const v = (await c.get('/api/v1/workspace/recommendations', viewer)).body.data;
    expect(v.channel.actions[0]).toMatchObject({ key: 'retry_sync', enabled: false });
    expect((await c.get(`/api/v1/workspace/recommendations?accountId=${w.account.id}`, w.admin)).body.data.channel.channel.accountId).toBe(w.account.id);
    await owner(`update marketplace_accounts set connection_status = 'connected', last_failure_message = null where id = $1`, [w.account.id]);
  });

  it('hides cards the caller may not read and other tenants see nothing of it', async () => {
    const other = await newVendor('Reco Other');
    expect((await c.get('/api/v1/workspace/recommendations', other)).body.data).toMatchObject({ channel: null, product: null, replenishment: null, channelConnections: 0 });
    expect((await c.get('/api/v1/workspace/recommendations', undefined)).status).toBe(401);
    const foreign = await c.get(`/api/v1/workspace/recommendations?accountId=${w.account.id}`, other);
    expect(foreign.body.data.channel).toBeNull();
  });
});
