import { AppError } from '@oms/shared';
import type { ShippingProvider, ShipmentRequest } from '../providers';
import { DELIVERY_DAYS, PINCODE, assertSandbox, makeAwb, minorToRupees, pincodeOf, requireConfig, timeline, zoneOf, type Zone } from './common';

/**
 * Delhivery (surface and express). SANDBOX-ONLY, deterministic, no network (see common.ts). Declared settings are the non-secret ones;
 * the API token is read from the stored provider configuration key `apiToken` and is deliberately NOT a declared setting, so it is
 * accepted when the provider is enabled but never echoed back by the API.
 */
const AWB_LENGTH = 13;
const CONFIG_REQUIRED = ['clientName', 'pickupName', 'pickupPincode'];
const COD_LIMIT_MINOR = 10_000_000;

export interface Serviceability { pincode: string; serviceable: boolean; cod: boolean; prepaid: boolean; reason: string | null }

/** whether Delhivery delivers to a pincode (sandbox rule: valid 6-digit codes, except the ones that start with 9 and end in 00 which are treated as out of delivery area) */
export function delhiveryServiceability(pincode: string): Serviceability {
  if (!PINCODE.test(pincode)) return { pincode, serviceable: false, cod: false, prepaid: false, reason: 'Not a valid 6-digit pincode' };
  if (pincode.startsWith('9') && pincode.endsWith('00')) return { pincode, serviceable: false, cod: false, prepaid: false, reason: 'Out of delivery area' };
  return { pincode, serviceable: true, prepaid: true, cod: !pincode.endsWith('1'), reason: null };
}

const BASE: Record<Zone, number> = { local: 3_500, regional: 4_800, national: 6_500 };
/** shipping charge in minor units: zone base for the first 500 g, 1,400 per extra 500 g, COD fee 2% of the collectable amount (min 3,000) */
export function delhiveryRate(input: { fromPincode: string; toPincode: string; weightGrams: number; codAmountMinor?: number | null; express?: boolean }): { costMinor: number; zone: Zone; etaDays: number } {
  const zone = zoneOf(input.fromPincode, input.toPincode);
  const slabs = Math.max(1, Math.ceil(input.weightGrams / 500));
  const cod = input.codAmountMinor ? Math.max(3_000, Math.round(input.codAmountMinor * 0.02)) : 0;
  const mode = input.express ? 1.4 : 1;
  return { costMinor: Math.round((BASE[zone] + (slabs - 1) * 1_400) * mode) + cod, zone, etaDays: Math.max(1, DELIVERY_DAYS[zone] - (input.express ? 1 : 0)) };
}

const labelText = (req: ShipmentRequest, awb: string, cost: number): string => [
  '*** DELHIVERY (SANDBOX) ***', `AWB ${awb}`, `ORDER ${req.orderNumber} / SHIP ${req.shipmentNumber}`, `FROM ${req.warehouse.code} ${req.warehouse.name}`,
  `TO ${String(req.destination.name ?? '')} ${pincodeOf(req.destination)}`, req.codAmountMinor ? `COD ${minorToRupees(req.codAmountMinor)} ${req.currency}` : 'PREPAID', `CHARGE ${minorToRupees(cost)}`,
  ...req.packages.map((p) => `PKG ${p.barcode} ${p.weightGrams ?? '?'}g`),
].join('\n');

export const delhiveryProvider: ShippingProvider = {
  code: 'delhivery', name: 'Delhivery', simulator: true,
  description: 'Delhivery surface and express: serviceability, AWB and label, tracking, cancellation, NDR re-attempt and return to origin. Runs in sandbox mode until live access is verified.',
  capabilities: { labels: true, polling: true, cancel: true, reattempt: true, rto: true, manifest: true },
  configFields: [
    { key: 'clientName', description: 'Client name registered with Delhivery', required: true },
    { key: 'pickupName', description: 'Pickup (warehouse) name, exactly as in the Delhivery panel', required: true },
    { key: 'pickupPincode', description: 'Pincode of the pickup warehouse', required: true },
    { key: 'service', description: '"surface" (default) or "express"', required: false },
    { key: 'mode', description: '"sandbox" (default). "live" is refused until the integration is verified', required: false },
    { key: 'sandboxScenario', description: 'Sandbox tracking script: on_time (default), ndr or rto', required: false },
  ],
  async createShipment(req, config) {
    assertSandbox('Delhivery', config);
    requireConfig('Delhivery', config, CONFIG_REQUIRED);
    const to = pincodeOf(req.destination);
    const s = delhiveryServiceability(to);
    if (!s.serviceable) throw new AppError('BAD_REQUEST', `Delhivery does not deliver to ${to || 'this address'}: ${s.reason}`, { details: { rule: 'pincode_not_serviceable', pincode: to } });
    if (req.codAmountMinor && !s.cod) throw new AppError('BAD_REQUEST', `Delhivery does not offer cash on delivery to ${to}`, { details: { rule: 'cod_not_available', pincode: to } });
    if (req.codAmountMinor && req.codAmountMinor > COD_LIMIT_MINOR) throw new AppError('BAD_REQUEST', 'Delhivery cash on delivery is limited to 100,000.00', { details: { rule: 'cod_limit_exceeded' } });
    const weight = req.packages.reduce((n, p) => n + (p.weightGrams ?? 500), 0);
    const rate = delhiveryRate({ fromPincode: String(config.pickupPincode), toPincode: to, weightGrams: weight, codAmountMinor: req.codAmountMinor, express: config.service === 'express' });
    const now = new Date();
    const awb = makeAwb(AWB_LENGTH, req.shipmentNumber, now);
    return {
      awb, carrier: 'Delhivery', trackingUrl: `https://www.delhivery.com/track/package/${awb}`, estimatedDeliveryAt: new Date(now.getTime() + rate.etaDays * 86_400_000), costMinor: rate.costMinor,
      providerData: { sandbox: true, zone: rate.zone, service: config.service === 'express' ? 'express' : 'surface', pickupName: config.pickupName },
      label: { format: 'text', content: labelText(req, awb, rate.costMinor) },
    };
  },
  async cancelShipment(awb, config) {
    assertSandbox('Delhivery', config);
    // the pickup scan on the booking day still allows a cancellation; anything after it does not
    if (timeline(awb, AWB_LENGTH, config, new Date()).some((e) => e.status !== 'dispatched')) throw new AppError('CONFLICT', 'Delhivery cannot cancel a shipment that is already moving', { details: { rule: 'already_in_transit', awb } });
  },
  async track(awb, config, since) {
    assertSandbox('Delhivery', config);
    return timeline(awb, AWB_LENGTH, config, new Date(), since);
  },
  async requestReattempt(awb, config) {
    assertSandbox('Delhivery', config);
    timeline(awb, AWB_LENGTH, config, new Date());
  },
  async initiateRto(awb, config) {
    assertSandbox('Delhivery', config);
    timeline(awb, AWB_LENGTH, config, new Date());
  },
};
