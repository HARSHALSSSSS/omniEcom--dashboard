import { describe, expect, it } from 'vitest';
import { getProvider, listProviders, type ShipmentRequest } from '../../modules/shipping/src/providers';

/**
 * The Delhivery and Blue Dart providers: registered next to manual / sandbox, deterministic, sandbox-only (live is refused),
 * never a network call. Credentials are not declared settings, so the API never echoes them.
 */
const delhiveryCfg = { clientName: 'ACME', pickupName: 'Mumbai WH', pickupPincode: '400001' };
const blueCfg = { loginId: 'BD1', customerCode: 'C123', originArea: 'BOM', pickupPincode: '400001' };

const req = (o: Partial<ShipmentRequest> & { pincode?: string } = {}): ShipmentRequest => ({
  shipmentNumber: o.shipmentNumber ?? 'SHP-000001', orderNumber: 'ORD-000001', warehouse: { code: 'WH1', name: 'Mumbai warehouse', address: { pincode: '400001' } },
  destination: { name: 'Asha Buyer', pincode: o.pincode ?? '560001' }, packages: [{ barcode: 'PKG1', weightGrams: 700, lengthMm: null, widthMm: null, heightMm: null }],
  codAmountMinor: o.codAmountMinor ?? null, currency: 'INR',
});

describe.each([
  { code: 'delhivery', name: 'Delhivery', cfg: delhiveryCfg, awbLength: 13, bad: '000001', unserviceable: '900100', noCod: '560001' },
  { code: 'bluedart', name: 'Blue Dart', cfg: blueCfg, awbLength: 11, bad: '12345', unserviceable: '560099', noCod: '560010' },
])('$name provider', (p) => {
  const provider = getProvider(p.code);

  it('is registered, only available where sandbox couriers are allowed, and supports the whole outbound flow', () => {
    expect(listProviders().map((x) => x.code)).toEqual(expect.arrayContaining(['manual', 'sandbox', 'delhivery', 'bluedart']));
    expect(provider.simulator).toBe(true);
    expect(provider.capabilities).toEqual({ labels: true, polling: true, cancel: true, reattempt: true, rto: true, manifest: true });
    expect(typeof provider.requestReattempt).toBe('function');
    expect(typeof provider.initiateRto).toBe('function');
  });

  it('declares only non-secret settings: licence keys and tokens are never an echoed field', () => {
    const keys = provider.configFields.map((f) => f.key);
    for (const secret of ['apiToken', 'shippingLicenceKey', 'trackingLicenceKey', 'password']) expect(keys).not.toContain(secret);
    expect(provider.configFields.filter((f) => f.required).length).toBeGreaterThanOrEqual(3);
  });

  it('books a shipment: same shipment = same AWB the same day, label text, charge and ETA', async () => {
    const a = await provider.createShipment(req(), p.cfg);
    const b = await provider.createShipment(req(), p.cfg);
    const c = await provider.createShipment(req({ shipmentNumber: 'SHP-000002' }), p.cfg);
    expect(a.awb).toMatch(new RegExp(`^\\d{${p.awbLength}}$`));
    expect(b.awb).toBe(a.awb);
    expect(c.awb).not.toBe(a.awb);
    expect(a.carrier).toBe(p.name);
    expect(a.trackingUrl).toContain(a.awb);
    expect(a.costMinor).toBeGreaterThan(0);
    expect(a.estimatedDeliveryAt!.getTime()).toBeGreaterThan(Date.now());
    expect(a.label).toMatchObject({ format: 'text' });
    expect(a.label.content).toContain(a.awb);
    expect(a.label.content).toContain('PREPAID');
    expect(a.providerData).toMatchObject({ sandbox: true });
  });

  it('prints the COD amount and charges a COD fee', async () => {
    const prepaid = await provider.createShipment(req({ pincode: '110012' }), p.cfg);
    const cod = await provider.createShipment(req({ pincode: '110012', codAmountMinor: 199900 }), p.cfg);
    expect(cod.label.content).toContain('COD 1999.00 INR');
    expect(cod.costMinor!).toBeGreaterThan(prepaid.costMinor!);
  });

  it('refuses what the courier cannot do: unconfigured account, bad / unserviceable pincode, COD where unavailable', async () => {
    await expect(provider.createShipment(req(), {})).rejects.toMatchObject({ code: 'BAD_REQUEST', details: { rule: 'provider_not_configured' } });
    await expect(provider.createShipment(req({ pincode: p.bad }), p.cfg)).rejects.toMatchObject({ details: { rule: 'pincode_not_serviceable' } });
    await expect(provider.createShipment(req({ pincode: p.unserviceable }), p.cfg)).rejects.toMatchObject({ details: { rule: 'pincode_not_serviceable' } });
    await expect(provider.createShipment(req({ pincode: p.noCod, codAmountMinor: 10000 }), p.cfg)).rejects.toMatchObject({ details: { rule: 'cod_not_available' } });
    await expect(provider.createShipment(req({ pincode: '110012', codAmountMinor: 99_999_999 }), p.cfg)).rejects.toMatchObject({ details: { rule: 'cod_limit_exceeded' } });
  });

  it('never pretends to book live: mode "live" is refused everywhere', async () => {
    const live = { ...p.cfg, mode: 'live' };
    await expect(provider.createShipment(req(), live)).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED', details: { reason: 'live_not_verified' } });
    await expect(provider.track('260101' + '1'.repeat(p.awbLength - 6), live)).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
    await expect(provider.cancelShipment('x', live)).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
  });

  it('tracks along the booking date: picked up, in transit, out for delivery, delivered (oldest first, `since` respected)', async () => {
    const old = (daysAgo: number) => { const d = new Date(Date.now() - daysAgo * 86_400_000); return `${String(d.getUTCFullYear() % 100).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${'7'.repeat(p.awbLength - 6)}`; };
    expect((await provider.track(old(2), p.cfg)).map((e) => e.status).slice(0, 2)).toEqual(['dispatched', 'in_transit']); // the third event falls on today's 10:00 UTC, so only the first two are certain
    expect((await provider.track(old(0), p.cfg)).every((e) => e.status === 'dispatched')).toBe(true);
    const full = await provider.track(old(10), p.cfg);
    expect(full.map((e) => e.status)).toEqual(['dispatched', 'in_transit', 'out_for_delivery', 'delivered']);
    expect(new Set(full.map((e) => e.eventId)).size).toBe(4);
    expect(full[3]!.occurredAt.getTime()).toBeGreaterThan(full[0]!.occurredAt.getTime());
    expect((await provider.track(old(10), p.cfg, full[1]!.occurredAt)).map((e) => e.status)).toEqual(['out_for_delivery', 'delivered']);
    await expect(provider.track('not-an-awb', p.cfg)).rejects.toMatchObject({ details: { rule: 'invalid_awb' } });
  });

  it('scripts a failed delivery (ndr) and a return to origin (rto) through the sandbox scenario setting', async () => {
    const d = new Date(Date.now() - 12 * 86_400_000);
    const awb = `${String(d.getUTCFullYear() % 100).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${'5'.repeat(p.awbLength - 6)}`;
    expect((await provider.track(awb, { ...p.cfg, sandboxScenario: 'ndr' })).at(-1)).toMatchObject({ status: 'delivery_failed', rawStatus: 'NDR' });
    expect((await provider.track(awb, { ...p.cfg, sandboxScenario: 'rto' })).map((e) => e.status)).toEqual(['dispatched', 'in_transit', 'delivery_failed', 'rto_initiated', 'rto_in_transit', 'rto_delivered']);
  });

  it('cancels only before the shipment is moving; NDR re-attempt and RTO requests validate the AWB', async () => {
    const fresh = await provider.createShipment(req(), p.cfg);
    await expect(provider.cancelShipment(fresh.awb, p.cfg)).resolves.toBeUndefined();
    const d = new Date(Date.now() - 5 * 86_400_000);
    const moving = `${String(d.getUTCFullYear() % 100).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${'3'.repeat(p.awbLength - 6)}`;
    await expect(provider.cancelShipment(moving, p.cfg)).rejects.toMatchObject({ code: 'CONFLICT', details: { rule: 'already_in_transit' } });
    await expect(provider.requestReattempt!(moving, p.cfg, {})).resolves.toBeUndefined();
    await expect(provider.initiateRto!(moving, p.cfg, {})).resolves.toBeUndefined();
    await expect(provider.initiateRto!('bad', p.cfg, {})).rejects.toMatchObject({ details: { rule: 'invalid_awb' } });
  });
});

describe('rates and serviceability', () => {
  it('Delhivery: zone and weight slabs, express costs more but arrives sooner, COD fee has a minimum', async () => {
    const { delhiveryRate, delhiveryServiceability } = await import('../../modules/shipping/src/providers/delhivery');
    const local = delhiveryRate({ fromPincode: '400001', toPincode: '400050', weightGrams: 400 });
    const national = delhiveryRate({ fromPincode: '400001', toPincode: '700001', weightGrams: 400 });
    expect(local).toMatchObject({ zone: 'local', costMinor: 3500, etaDays: 2 });
    expect(national).toMatchObject({ zone: 'national', costMinor: 6500, etaDays: 5 });
    expect(delhiveryRate({ fromPincode: '400001', toPincode: '700001', weightGrams: 1200 }).costMinor).toBe(6500 + 2 * 1400);
    const express = delhiveryRate({ fromPincode: '400001', toPincode: '700001', weightGrams: 400, express: true });
    expect(express.costMinor).toBeGreaterThan(national.costMinor);
    expect(express.etaDays).toBeLessThan(national.etaDays);
    expect(delhiveryRate({ fromPincode: '400001', toPincode: '400050', weightGrams: 400, codAmountMinor: 10_000 }).costMinor).toBe(3500 + 3000);
    expect(delhiveryRate({ fromPincode: '400001', toPincode: '400050', weightGrams: 400, codAmountMinor: 1_000_000 }).costMinor).toBe(3500 + 20_000);
    expect(delhiveryServiceability('560001')).toMatchObject({ serviceable: true, prepaid: true });
    expect(delhiveryServiceability('56001')).toMatchObject({ serviceable: false, reason: expect.stringContaining('6-digit') });
  });

  it('Blue Dart: Apex costs more than Surface, remote pincodes are Surface-only and prepaid-only, outside the network is refused', async () => {
    const { blueDartRate, blueDartServiceability } = await import('../../modules/shipping/src/providers/bluedart');
    const apex = blueDartRate({ fromPincode: '400001', toPincode: '700001', weightGrams: 400, service: 'apex' });
    const surface = blueDartRate({ fromPincode: '400001', toPincode: '700001', weightGrams: 400, service: 'surface' });
    expect(apex.costMinor).toBeGreaterThan(surface.costMinor);
    expect(apex.etaDays).toBeLessThan(surface.etaDays);
    expect(blueDartServiceability('560010')).toMatchObject({ serviceable: true, apex: false, surface: true, cod: false });
    expect(blueDartServiceability('560099')).toMatchObject({ serviceable: false });
  });

  it('Blue Dart falls back to Surface where Apex is not offered and says so', async () => {
    const r = await getProvider('bluedart').createShipment(req({ pincode: '560010' }), { ...blueCfg, service: 'apex' });
    expect(r.providerData).toMatchObject({ service: 'surface', requestedService: 'apex' });
    expect(r.label.content).toContain('SURFACE');
  });
});
