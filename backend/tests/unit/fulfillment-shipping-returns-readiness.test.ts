import { describe, expect, it } from 'vitest';
import { actionsFor, primaryAction, slaView, stageOf } from '../../modules/fulfillment/src/queue-domain';
import { alreadyDone } from '../../modules/shipping/src/fulfillment-actions';
import { labelsPdf, paginate } from '../../modules/shipping/src/pdf-labels';
import { returnStage } from '../../modules/returns/src/domain';
import { nextActions } from '../../modules/returns/src/readiness';

describe('fulfillment queue stages and SLA label', () => {
  it('maps statuses to the four stages; a held fulfillment stays in the stage it was held from', () => {
    expect(stageOf('confirmed', null)).toBe('awaiting_pick');
    expect(stageOf('picking', null)).toBe('picking');
    expect(stageOf('picked', null)).toBe('packing');
    expect(stageOf('packing', null)).toBe('packing');
    expect(stageOf('packed', null)).toBe('ready_to_ship');
    expect(stageOf('ready_to_ship', null)).toBe('ready_to_ship');
    expect(stageOf('on_hold', 'picking')).toBe('picking');
    expect(stageOf('shipped', null)).toBeNull();
    expect(stageOf('on_hold', null)).toBeNull();
  });
  it('labels the SLA as due in / overdue by with bands', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const th = { atRiskMinutes: 90, approachingMinutes: 240 };
    expect(slaView(null, th, now)).toMatchObject({ band: 'none', label: 'No deadline', minutesRemaining: null });
    expect(slaView(new Date('2026-10-01T12:15:00Z'), th, now)).toMatchObject({ band: 'approaching', label: 'Due in 2h 15m', minutesRemaining: 135 });
    expect(slaView(new Date('2026-10-01T11:00:00Z'), th, now)).toMatchObject({ band: 'at_risk', label: 'Due in 1h' });
    expect(slaView(new Date('2026-10-03T14:00:00Z'), th, now)).toMatchObject({ band: 'safe', label: 'Due in 2d 4h' });
    expect(slaView(new Date('2026-10-01T09:20:00Z'), th, now)).toMatchObject({ band: 'breached', label: 'Overdue by 40m' });
  });
});

describe('fulfillment actions availability', () => {
  const f = (status: string, o: Partial<{ openTasks: number; unverifiedTasks: number; unpackedUnits: number; holdFrom: string | null }> = {}) => ({ status, holdFrom: o.holdFrom ?? null, openTasks: o.openTasks ?? 0, unverifiedTasks: o.unverifiedTasks ?? 0, unpackedUnits: o.unpackedUnits ?? 0 });
  const get = (a: ReturnType<typeof actionsFor>, k: string) => a.find((x) => x.action === k)!;

  it('always lists the six actions; before routing only start is possible', () => {
    const a = actionsFor({ orderStatus: 'new', fulfillment: null, shipment: null });
    expect(a.map((x) => x.action)).toEqual(['start', 'pick_all', 'pack', 'ready', 'handover', 'exception']);
    expect(a.filter((x) => x.enabled).map((x) => x.action)).toEqual(['start']);
    expect(get(a, 'pick_all').disabledReason).toMatch(/No fulfillment/);
    expect(get(actionsFor({ orderStatus: 'cancelled', fulfillment: null, shipment: null }), 'start')).toMatchObject({ enabled: false, disabledReason: 'A cancelled order cannot be fulfilled' });
  });
  it('walks start -> pick all -> pack -> ready -> handover', () => {
    expect(primaryAction(actionsFor({ orderStatus: 'confirmed', fulfillment: f('confirmed'), shipment: null }))).toBe('start');
    const picking = actionsFor({ orderStatus: 'picking', fulfillment: f('picking', { openTasks: 2, unverifiedTasks: 1 }), shipment: null });
    expect(primaryAction(picking)).toBe('pick_all');
    expect(get(picking, 'pick_all').requiresOverride).toBe(true);
    expect(get(picking, 'start')).toMatchObject({ enabled: false, disabledReason: 'Picking has already started' });
    const picked = actionsFor({ orderStatus: 'picking', fulfillment: f('picked', { unpackedUnits: 3 }), shipment: null });
    expect(primaryAction(picked)).toBe('pack');
    expect(get(picked, 'pack').requires).toEqual(['weightGrams']);
    expect(primaryAction(actionsFor({ orderStatus: 'packed', fulfillment: f('packed'), shipment: null }))).toBe('ready');
    const ready = actionsFor({ orderStatus: 'ready_to_dispatch', fulfillment: f('ready_to_ship'), shipment: { status: 'label_ready' } });
    expect(primaryAction(ready)).toBe('handover');
    expect(get(ready, 'ready')).toMatchObject({ enabled: false, disabledReason: 'The label already exists' });
  });
  it('a held fulfillment blocks everything but is explained; exceptions stop once shipped', () => {
    const held = actionsFor({ orderStatus: 'picking', fulfillment: f('on_hold', { holdFrom: 'picking' }), shipment: null });
    expect(held.filter((x) => x.enabled).map((x) => x.action)).toEqual(['exception']);
    expect(get(held, 'pick_all').disabledReason).toMatch(/on hold/);
    const shipped = actionsFor({ orderStatus: 'dispatched', fulfillment: f('shipped'), shipment: { status: 'dispatched' } });
    expect(get(shipped, 'exception').enabled).toBe(false);
  });
  it('a replay of a finished action is recognised', () => {
    expect(alreadyDone('start', 'picking')).toBe(true);
    expect(alreadyDone('start', 'confirmed')).toBe(false);
    expect(alreadyDone('pick_all', 'packed')).toBe(true);
    expect(alreadyDone('ready', 'packed')).toBe(false);
    expect(alreadyDone('handover', 'in_transit')).toBe(true);
    expect(alreadyDone('exception', 'shipped')).toBe(false);
  });
});

describe('label PDF', () => {
  it('writes one 4x6 page per label with a valid xref and escapes text', () => {
    const buf = labelsPdf(['AWB (A1)\nTO \\ somewhere', 'AWB B2']);
    const text = buf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/MediaBox [0 0 288 432]');
    expect(text).toContain('(AWB \\(A1\\)) Tj');
    expect(text).toContain('(TO \\\\ somewhere) Tj');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    // every xref offset points at "<n> 0 obj"
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries.length).toBe(3 + 2 * 2);
    entries.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
  it('splits a long label over pages and wraps wide lines; refuses an empty list', () => {
    expect(paginate([Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n')]).length).toBeGreaterThan(1);
    expect(paginate(['x'.repeat(100)])[0]!.length).toBeGreaterThan(1);
    expect(() => labelsPdf([])).toThrow();
  });
});

describe('returns stage and next actions', () => {
  it('maps the status vocabulary onto the screen stages', () => {
    const s = (status: string, inspectionStatus = 'not_started', refundStatus = 'pending') => returnStage({ status, inspectionStatus, refundStatus });
    expect(s('requested')).toBe('requested');
    expect(s('approved')).toBe('approved');
    expect(s('picked_up')).toBe('in_transit');
    expect(s('received')).toBe('received');
    expect(s('received', 'in_progress')).toBe('inspecting');
    expect(s('inspecting', 'requires_review')).toBe('inspecting');
    expect(s('inspecting', 'passed')).toBe('resolution');
    expect(s('inspecting', 'failed', 'processed')).toBe('refunded');
    expect(s('completed', 'passed', 'processed')).toBe('closed');
    expect(s('rejected')).toBe('rejected');
  });
  const facts = (o: Partial<Parameters<typeof nextActions>[0]> = {}) => ({
    id: 'r1', status: 'requested', inspectionStatus: 'not_started', refundStatus: 'pending', refundSource: null, warehouseId: null, refundAmountMinor: 59900, marketplace: 'mock', orderTotalMinor: 100000,
    items: [{ id: 'i1', sku: 'SKU-1', quantity: 2, received: 0, decided: 0 }], connectorRefund: false, suggestion: { kind: null, reason: 'Pending inspection', suggestedOnly: true as const }, ...o,
  });
  const by = (a: ReturnType<typeof nextActions>, k: string) => a.find((x) => x.key === k)!;
  it('requested: only approve is open; the rest say what comes first', () => {
    const a = nextActions(facts());
    expect(a.map((x) => x.key)).toEqual(['approve', 'receive', 'inspection', 'disposition', 'refund', 'complete']);
    expect(a.filter((x) => x.enabled).map((x) => x.key)).toEqual(['approve']);
    expect(by(a, 'receive').disabledReason).toBe('Approve the return first');
  });
  it('approved: receive needs warehouse and items with the remaining units as default', () => {
    const r = by(nextActions(facts({ status: 'approved', warehouseId: 'w1' })), 'receive');
    expect(r.enabled).toBe(true);
    expect(r.inputs.find((i) => i.name === 'warehouseId')).toMatchObject({ required: true, default: 'w1' });
    expect(r.inputs.find((i) => i.name === 'items')!.default).toEqual([{ returnItemId: 'i1', sku: 'SKU-1', quantity: 2 }]);
  });
  it('received -> inspected: disposition then refund (staff cannot confirm refunds) then complete', () => {
    const received = nextActions(facts({ status: 'received', warehouseId: 'w1', items: [{ id: 'i1', sku: 'S', quantity: 2, received: 2, decided: 0 }] }));
    expect(by(received, 'inspection').enabled).toBe(true);
    expect(by(received, 'disposition').disabledReason).toBe('Finish the inspection first');
    expect(by(received, 'refund').disabledReason).toMatch(/Receive and inspect|Finish the inspection/);
    const inspected = nextActions(facts({ status: 'inspecting', inspectionStatus: 'passed', warehouseId: 'w1', items: [{ id: 'i1', sku: 'S', quantity: 2, received: 2, decided: 0 }], suggestion: { kind: 'sellable', reason: 'Inspection passed', suggestedOnly: true } }));
    expect(by(inspected, 'inspection').done).toBe(true);
    expect(by(inspected, 'disposition')).toMatchObject({ enabled: true });
    expect(by(inspected, 'disposition').inputs.find((i) => i.name === 'kind')).toMatchObject({ default: 'sellable' });
    expect(by(inspected, 'refund')).toMatchObject({ enabled: true, permission: 'returns:refund' });
    expect(by(inspected, 'complete').disabledReason).toBe('Some received units have no decision yet');
    const decided = nextActions(facts({ status: 'inspecting', inspectionStatus: 'passed', warehouseId: 'w1', items: [{ id: 'i1', sku: 'S', quantity: 2, received: 2, decided: 2 }] }));
    expect(by(decided, 'disposition').done).toBe(true);
    expect(by(decided, 'complete').enabled).toBe(true);
  });
  it('a failed refund offers a retry; a processed one is done; rejected returns are closed to all steps; connector option only when supported', () => {
    const failed = by(nextActions(facts({ status: 'inspecting', inspectionStatus: 'passed', refundStatus: 'failed', connectorRefund: true })), 'refund');
    expect(failed).toMatchObject({ label: 'Retry refund', enabled: true }); expect(failed.href).toMatch(/refund\/retry$/);
    const withConnector = by(nextActions(facts({ status: 'inspecting', inspectionStatus: 'passed', connectorRefund: true })), 'refund');
    expect(withConnector.inputs.find((i) => i.name === 'mode')!.options!.map((o) => o.value)).toEqual(['manual', 'connector']);
    expect(by(nextActions(facts({ status: 'completed', inspectionStatus: 'passed', refundStatus: 'processed' })), 'refund').done).toBe(true);
    const rejected = nextActions(facts({ status: 'rejected' }));
    expect(rejected.every((x) => !x.enabled)).toBe(true);
    expect(by(rejected, 'approve').disabledReason).toBe('The return was rejected');
  });
});
