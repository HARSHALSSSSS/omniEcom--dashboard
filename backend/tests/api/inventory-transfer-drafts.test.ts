import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const INV = '/api/v1/inventory';
const list = (r: { body: any }) => r.body.data as any[];
const items = (r: { body: any }) => r.body.data.items as any[];
const ledgerOk = async (as: Actor) => expect((await c.get(`${INV}/ledger-check`, as)).body.data).toEqual({ healthy: true, drift: [] });

/** a vendor with `warehouses` locations and stocked variants (all stock in the first location) */
async function shop(stocks: Array<[string, number]>, warehouses = 2) {
  const admin = await c.registerVendor({ businessName: `Drafts ${Math.random().toString(36).slice(2, 7)}` });
  const whs = [];
  for (let i = 0; i < warehouses; i++) whs.push(await c.makeWarehouse(admin, { priority: 100 + i * 100 }));
  const variants = [];
  for (const [sku, qty] of stocks) {
    const v = await c.makeVariant(admin, { sku });
    if (qty > 0) await c.stock(admin, v.variantId, whs[0]!.id, qty);
    variants.push(v);
  }
  return { admin, whs, variants };
}

/** on hand / incoming per warehouse of one variant */
const stockAt = async (as: Actor, variantId: string, whIds: string[]) => {
  const rows = (await c.get(`${INV}/variants/${variantId}`, as)).body.data.warehouses as any[];
  return Object.fromEntries(whIds.map((id) => {
    const r = rows.find((x) => x.warehouseId === id);
    return [id, { onHand: r?.onHand ?? 0, incoming: r?.incoming ?? 0, available: r?.available ?? 0, damaged: r?.damaged ?? 0 }];
  }));
};

describe('draft transfers: draft -> edit -> submit / discard', () => {
  it('saves a draft without moving stock, shows what the source can give, edits it and submits it', async () => {
    const { admin, whs, variants } = await shop([['D-1', 30], ['D-2', 10]]);
    const [a, b] = whs;
    const [v1, v2] = variants;

    const made = await c.post(`${INV}/transfers`, { fromWarehouseId: a!.id, toWarehouseId: b!.id, items: [{ variantId: v1!.variantId, quantity: 5 }, { variantId: v2!.variantId, quantity: 4 }], notes: 'weekend top-up' }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const draft = made.body.data;
    expect(draft).toMatchObject({ status: 'draft', notes: 'weekend top-up', version: 1 });
    expect(draft.number).toMatch(/^TR-\d{6}$/);
    expect(draft.items.map((i: any) => [i.sku, i.title.length > 0, i.quantity, i.availableAtSource])).toEqual([['D-1', true, 5, 30], ['D-2', true, 4, 10]]);
    // a draft moves nothing
    expect(await stockAt(admin, v1!.variantId, whs.map((w) => w.id))).toMatchObject({ [a!.id]: { onHand: 30 }, [b!.id]: { onHand: 0, incoming: 0 } });

    // it is listed as a draft
    const drafts = list(await c.get(`${INV}/transfers?filter[status]=draft`, admin));
    expect(drafts.map((d) => d.id)).toContain(draft.id);

    // edit: other quantity, one product removed, new notes, bumped version
    const edited = await c.patch(`${INV}/transfers/${draft.id}`, { items: [{ variantId: v1!.variantId, quantity: 12 }], notes: 'smaller', version: 1 }, admin);
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data).toMatchObject({ status: 'draft', notes: 'smaller', version: 2 });
    expect(edited.body.data.items).toHaveLength(1);
    expect(edited.body.data.items[0]).toMatchObject({ sku: 'D-1', quantity: 12, availableAtSource: 30 });
    expect(await stockAt(admin, v1!.variantId, whs.map((w) => w.id))).toMatchObject({ [a!.id]: { onHand: 30 }, [b!.id]: { onHand: 0 } });

    // a stale version, an empty edit, the same warehouse twice and an unknown product are refused
    const stale = await c.patch(`${INV}/transfers/${draft.id}`, { notes: 'late', version: 1 }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toMatchObject({ rule: 'stale_draft' });
    expect((await c.patch(`${INV}/transfers/${draft.id}`, {}, admin)).status).toBe(400);
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { toWarehouseId: a!.id }, admin)).status).toBe(400);
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { items: [{ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 }] }, admin)).status).toBe(404);
    expect((await c.get(`${INV}/transfers/${draft.id}`, admin)).body.data).toMatchObject({ version: 2, notes: 'smaller' });

    // notes can be cleared
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { notes: null }, admin)).body.data.notes).toBeNull();

    // submit: the stock moves now, once
    const sub = await c.post(`${INV}/transfers/${draft.id}/submit`, {}, admin);
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);
    expect(sub.body.data.duplicate).toBe(false);
    expect(sub.body.data.transfer).toMatchObject({ id: draft.id, status: 'received' });
    expect(sub.body.data.transfer.items[0]).toMatchObject({ quantity: 12, receivedQuantity: 12, availableAtSource: null });
    expect(await stockAt(admin, v1!.variantId, whs.map((w) => w.id))).toMatchObject({ [a!.id]: { onHand: 18, available: 18 }, [b!.id]: { onHand: 12, incoming: 0 } });
    await ledgerOk(admin);

    // idempotent: a second submit changes nothing
    const again = await c.post(`${INV}/transfers/${draft.id}/submit`, {}, admin);
    expect(again.status).toBe(200);
    expect(again.body.data.duplicate).toBe(true);
    expect(await stockAt(admin, v1!.variantId, whs.map((w) => w.id))).toMatchObject({ [a!.id]: { onHand: 18 }, [b!.id]: { onHand: 12 } });

    // a submitted transfer cannot be edited or discarded
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { notes: 'x' }, admin)).status).toBe(409);
    expect((await c.post(`${INV}/transfers/${draft.id}/cancel`, {}, admin)).status).toBe(409);
    expect(list(await c.get(`${INV}/transfers?filter[status]=draft`, admin)).map((d) => d.id)).not.toContain(draft.id);
    await ledgerOk(admin);
  });

  it('discards a draft without touching stock; a discarded draft can be neither submitted nor edited', async () => {
    const { admin, whs, variants } = await shop([['X-1', 20]]);
    const v = variants[0]!;
    const draft = (await c.post(`${INV}/transfers`, { fromWarehouseId: whs[0]!.id, toWarehouseId: whs[1]!.id, items: [{ variantId: v.variantId, quantity: 7 }] }, admin)).body.data;

    const gone = await c.post(`${INV}/transfers/${draft.id}/cancel`, {}, admin);
    expect(gone.status).toBe(200);
    expect(gone.body.data.status).toBe('cancelled');
    expect(await stockAt(admin, v.variantId, whs.map((w) => w.id))).toMatchObject({ [whs[0]!.id]: { onHand: 20 }, [whs[1]!.id]: { onHand: 0 } });

    const sub = await c.post(`${INV}/transfers/${draft.id}/submit`, {}, admin);
    expect(sub.status).toBe(409);
    expect(sub.body.error.code).toBe('INVALID_STATE');
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { notes: 'x' }, admin)).status).toBe(409);
    expect(list(await c.get(`${INV}/transfers?filter[status]=cancelled`, admin)).map((d) => d.id)).toContain(draft.id);
    await ledgerOk(admin);
  });

  it('refuses to submit when the source cannot cover a line (all or nothing) and succeeds after the draft is fixed', async () => {
    const { admin, whs, variants } = await shop([['S-1', 10], ['S-2', 3]]);
    const [a, b] = whs;
    const [v1, v2] = variants;
    const draft = (await c.post(`${INV}/transfers`, { fromWarehouseId: a!.id, toWarehouseId: b!.id, items: [{ variantId: v1!.variantId, quantity: 4 }, { variantId: v2!.variantId, quantity: 9 }] }, admin)).body.data;

    const refused = await c.post(`${INV}/transfers/${draft.id}/submit`, {}, admin);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(refused.body.error.details.shortages).toEqual([expect.objectContaining({ sku: 'S-2', needed: 9, available: 3 })]);
    expect((await c.get(`${INV}/transfers/${draft.id}`, admin)).body.data.status).toBe('draft');
    expect(await stockAt(admin, v1!.variantId, whs.map((w) => w.id))).toMatchObject({ [a!.id]: { onHand: 10 }, [b!.id]: { onHand: 0 } }); // the line that fit did not move either
    expect(await stockAt(admin, v2!.variantId, whs.map((w) => w.id))).toMatchObject({ [a!.id]: { onHand: 3 } });

    expect((await c.patch(`${INV}/transfers/${draft.id}`, { items: [{ variantId: v1!.variantId, quantity: 4 }, { variantId: v2!.variantId, quantity: 3 }] }, admin)).status).toBe(200);
    expect((await c.post(`${INV}/transfers/${draft.id}/submit`, {}, admin)).status).toBe(200);
    expect(await stockAt(admin, v2!.variantId, whs.map((w) => w.id))).toMatchObject({ [a!.id]: { onHand: 0 }, [b!.id]: { onHand: 3 } });
    await ledgerOk(admin);
  });

  it('needs inventory:write to edit, submit or discard, and hides nothing from a viewer', async () => {
    const { admin, whs, variants } = await shop([['P-1', 10]]);
    const draft = (await c.post(`${INV}/transfers`, { fromWarehouseId: whs[0]!.id, toWarehouseId: whs[1]!.id, items: [{ variantId: variants[0]!.variantId, quantity: 2 }] }, admin)).body.data;
    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { notes: 'x' }, viewer)).status).toBe(403);
    expect((await c.post(`${INV}/transfers/${draft.id}/submit`, {}, viewer)).status).toBe(403);
    expect((await c.post(`${INV}/transfers/${draft.id}/cancel`, {}, viewer)).status).toBe(403);
    expect((await c.get(`${INV}/transfers/${draft.id}`, viewer)).status).toBe(200);
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { notes: 'x' })).status).toBe(401);
    expect((await c.post(`${INV}/transfers/00000000-0000-4000-8000-000000000000/submit`, {}, admin)).status).toBe(404);
  });

  it('does not let another business see or change a draft', async () => {
    const mine = await shop([['T-1', 10]]);
    const draft = (await c.post(`${INV}/transfers`, { fromWarehouseId: mine.whs[0]!.id, toWarehouseId: mine.whs[1]!.id, items: [{ variantId: mine.variants[0]!.variantId, quantity: 2 }] }, mine.admin)).body.data;
    const other = await shop([['T-1', 10]]);
    expect((await c.get(`${INV}/transfers/${draft.id}`, other.admin)).status).toBe(404);
    expect((await c.patch(`${INV}/transfers/${draft.id}`, { notes: 'x' }, other.admin)).status).toBe(404);
    expect((await c.post(`${INV}/transfers/${draft.id}/submit`, {}, other.admin)).status).toBe(404);
    expect(list(await c.get(`${INV}/transfers?filter[status]=draft`, other.admin)).map((d) => d.id)).not.toContain(draft.id);
  });

  it('a bulk transfer still leaves ONE draft that is then submitted from the draft list', async () => {
    const { admin, whs, variants } = await shop([['B-1', 10], ['B-2', 10]]);
    const bulk = await c.post(`${INV}/bulk`, { selection: { mode: 'ids', ids: variants.map((v) => v.variantId) }, action: 'transfer', params: { fromWarehouseId: whs[0]!.id, toWarehouseId: whs[1]!.id, quantity: 3 } }, admin);
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(bulk.body.data.transfer).toMatchObject({ status: 'draft', items: 2 });
    expect(await stockAt(admin, variants[0]!.variantId, whs.map((w) => w.id))).toMatchObject({ [whs[0]!.id]: { onHand: 10 }, [whs[1]!.id]: { onHand: 0 } });
    const sub = await c.post(`${INV}/transfers/${bulk.body.data.transfer.id}/submit`, {}, admin);
    expect(sub.status).toBe(200);
    expect(await stockAt(admin, variants[1]!.variantId, whs.map((w) => w.id))).toMatchObject({ [whs[0]!.id]: { onHand: 7 }, [whs[1]!.id]: { onHand: 3 } });
    await ledgerOk(admin);
  });
});

describe('shrinkage as an adjustment type', () => {
  it('writes off lost units as its own ledger movement, with a preview, and refuses to add units', async () => {
    const { admin, whs, variants } = await shop([['SH-1', 20]], 1);
    const v = variants[0]!;
    const body = { variantId: v.variantId, warehouseId: whs[0]!.id, type: 'shrinkage', quantity: 3, reason: 'Missing after audit' };

    const preview = await c.post(`${INV}/adjustments/preview`, body, admin);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.data).toMatchObject({ currentAvailable: 20, adjustment: -3, newAvailable: 17 });
    expect(preview.body.data.warnings.map((w: any) => w.code)).toContain('recorded_as_loss');
    expect((await stockAt(admin, v.variantId, whs.map((w) => w.id)))[whs[0]!.id]!.onHand).toBe(20);

    const done = await c.post(`${INV}/adjustments`, { ...body, direction: 'decrease', idempotencyKey: 'shrink-key-0001' }, admin);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.data).toMatchObject({ duplicate: false, type: 'shrinkage', result: { currentAvailable: 20, adjustment: -3, newAvailable: 17 }, stock: { onHand: 17, damaged: 0 } });
    const again = await c.post(`${INV}/adjustments`, { ...body, idempotencyKey: 'shrink-key-0001' }, admin);
    expect(again.body.data.duplicate).toBe(true);
    expect((await stockAt(admin, v.variantId, whs.map((w) => w.id)))[whs[0]!.id]!.onHand).toBe(17);

    // the audit trail knows it is shrinkage, not a manual adjustment
    const ledger = (await c.get(`${INV}/movements?filter[variantId]=${v.variantId}&filter[type]=shrinkage`, admin)).body.data.items as any[];
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'shrinkage', deltaOnHand: -3, onHandAfter: 17 });
    expect(ledger[0].reason).toContain('Missing after audit');
    const feed = list(await c.get(`${INV}/movements/feed?filter[type]=shrinkage`, admin));
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ type: 'shrinkage', typeLabel: 'Inventory shrinkage', movementType: 'shrinkage', quantityDelta: -3, resultingAvailable: 17 });
    const overview = (await c.get(`${INV}/overview`, admin)).body.data;
    expect(overview.recentMovements[0]).toMatchObject({ text: 'Inventory shrinkage' });
    // it counts as an adjustment for the ledger movement filter
    expect(items(await c.get(`${INV}/ledger?filter[movement]=adjusted`, admin)).map((r) => r.sku)).toEqual(['SH-1']);

    // never adds units, never below what is there
    const up = await c.post(`${INV}/adjustments`, { ...body, direction: 'increase' }, admin);
    expect(up.status).toBe(400);
    expect(up.body.error.details).toMatchObject({ rule: 'shrinkage_requires_decrease' });
    const tooMany = await c.post(`${INV}/adjustments`, { ...body, quantity: 99 }, admin);
    expect(tooMany.status).toBe(409);
    expect((await c.post(`${INV}/adjustments`, { variantId: v.variantId, warehouseId: whs[0]!.id, type: 'shrinkage', reason: 'no quantity' }, admin)).status).toBe(400);
    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.post(`${INV}/adjustments`, body, viewer)).status).toBe(403);
    await ledgerOk(admin);
  });

  it('shrinkage works from the bulk action and from the quick adjust (reason shrinkage)', async () => {
    const { admin, whs, variants } = await shop([['SB-1', 10], ['SB-2', 10]], 1);
    const bulk = await c.post(`${INV}/bulk`, { selection: { mode: 'ids', ids: variants.map((v) => v.variantId) }, action: 'adjust', params: { type: 'shrinkage', quantity: 2, reason: 'Stolen' } }, admin);
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(bulk.body.data).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
    expect((await stockAt(admin, variants[0]!.variantId, whs.map((w) => w.id)))[whs[0]!.id]!.onHand).toBe(8);

    const quick = await c.post(`${INV}/quick-adjust`, { sku: 'SB-1', reason: 'shrinkage', quantityDelta: -1 }, admin);
    expect(quick.status, JSON.stringify(quick.body)).toBe(200);
    expect(quick.body.data).toMatchObject({ type: 'shrinkage', stock: { onHand: 7 } });
    const feed = list(await c.get(`${INV}/movements/feed?filter[type]=shrinkage&filter[variantId]=${variants[0]!.variantId}`, admin));
    expect(feed.map((f) => f.quantityDelta)).toEqual([-1, -2]);
    await ledgerOk(admin);
  });
});

describe('saved filters of the Inventory screen', () => {
  it('keeps the whole filter state of the screen, including the stock status and the saved group', async () => {
    const admin = await c.registerVendor({ businessName: `Views ${Math.random().toString(36).slice(2, 7)}` });
    const filters = { q: 'tee', warehouse: 'w1', channel: 'amazon_in', health: 'critical', stockMin: 1, stockMax: 50, movement: 'received', signal: 'low_stock', stockStatus: 'low_stock', group: 'g1' };
    const made = await c.post('/api/v1/views', { screen: 'inventory', name: 'Low tees', filters, sort: '-available' }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.data).toMatchObject({ screen: 'inventory', name: 'Low tees', filters, sort: '-available' });
    const listed = (await c.get('/api/v1/views?screen=inventory', admin)).body.data as any[];
    expect(listed.map((v) => v.name)).toEqual(['Low tees']);
    expect((await c.post('/api/v1/views', { screen: 'inventory', name: 'Bad', filters: { status: 'low_stock' } }, admin)).status).toBe(400);
    expect((await c.del(`/api/v1/views/${made.body.data.id}`, admin)).status).toBe(200);
    expect(((await c.get('/api/v1/views?screen=inventory', admin)).body.data as any[]).length).toBe(0);
  });
});
