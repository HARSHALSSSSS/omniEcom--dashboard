import { AppError } from '@oms/shared';
import type { ShippingProvider, ShipmentRequest } from '../providers';
import { DELIVERY_DAYS, PINCODE, assertSandbox, makeAwb, minorToRupees, pincodeOf, requireConfig, timeline, zoneOf, type Zone } from './common';

/**
 * Blue Dart (Apex air express and Surface). SANDBOX-ONLY, deterministic, no network (see common.ts). Declared settings are the non-secret
 * ones; the shipping and tracking licence keys are read from the stored provider configuration (`shippingLicenceKey`,
 * `trackingLicenceKey`) and are deliberately NOT declared settings, so they are accepted on enable but never echoed back by the API.
 */
const AWB_LENGTH = 11;
const CONFIG_REQUIRED = ['loginId', 'customerCode', 'originArea', 'pickupPincode'];
const COD_LIMIT_MINOR = 5_000_000;
export type BlueDartService = 'apex' | 'surface';

export interface Serviceability { pincode: string; serviceable: boolean; cod: boolean; apex: boolean; surface: boolean; reason: string | null }

/** sandbox rule: valid 6-digit codes; pincodes ending in 99 are outside the network, those ending in 0 are surface-only and prepaid-only */
export function blueDartServiceability(pincode: string): Serviceability {
  if (!PINCODE.test(pincode)) return { pincode, serviceable: false, cod: false, apex: false, surface: false, reason: 'Not a valid 6-digit pincode' };
  if (pincode.endsWith('99')) return { pincode, serviceable: false, cod: false, apex: false, surface: false, reason: 'Outside the Blue Dart network' };
  const remote = pincode.endsWith('0');
  return { pincode, serviceable: true, cod: !remote, apex: !remote, surface: true, reason: null };
}

const APEX_BASE: Record<Zone, number> = { local: 6_000, regional: 8_500, national: 11_500 };
const SURFACE_BASE: Record<Zone, number> = { local: 4_200, regional: 5_800, national: 7_800 };
/** charge in minor units: zone base for the first 500 g, 2,200 per extra 500 g (Apex) or 1,500 (Surface), COD fee 2.5% (min 4,000) */
export function blueDartRate(input: { fromPincode: string; toPincode: string; weightGrams: number; service: BlueDartService; codAmountMinor?: number | null }): { costMinor: number; zone: Zone; etaDays: number } {
  const zone = zoneOf(input.fromPincode, input.toPincode);
  const slabs = Math.max(1, Math.ceil(input.weightGrams / 500));
  const apex = input.service === 'apex';
  const cod = input.codAmountMinor ? Math.max(4_000, Math.round(input.codAmountMinor * 0.025)) : 0;
  return { costMinor: (apex ? APEX_BASE : SURFACE_BASE)[zone] + (slabs - 1) * (apex ? 2_200 : 1_500) + cod, zone, etaDays: Math.max(1, DELIVERY_DAYS[zone] - (apex ? 1 : 0)) };
}

const labelText = (req: ShipmentRequest, awb: string, service: BlueDartService, cost: number): string => [
  '*** BLUE DART (SANDBOX) ***', `AWB ${awb} ${service.toUpperCase()}`, `ORDER ${req.orderNumber} / SHIP ${req.shipmentNumber}`, `FROM ${req.warehouse.code} ${req.warehouse.name}`,
  `TO ${String(req.destination.name ?? '')} ${pincodeOf(req.destination)}`, req.codAmountMinor ? `COD ${minorToRupees(req.codAmountMinor)} ${req.currency}` : 'PREPAID', `CHARGE ${minorToRupees(cost)}`,
  ...req.packages.map((p) => `PKG ${p.barcode} ${p.weightGrams ?? '?'}g`),
].join('\n');

export const blueDartProvider: ShippingProvider = {
  code: 'bluedart', name: 'Blue Dart', simulator: true,
  description: 'Blue Dart Apex and Surface: serviceability, AWB and label, tracking, cancellation, NDR re-attempt and return to origin. Runs in sandbox mode until live access is verified.',
  capabilities: { labels: true, polling: true, cancel: true, reattempt: true, rto: true, manifest: true },
  configFields: [
    { key: 'loginId', description: 'Blue Dart login id', required: true },
    { key: 'customerCode', description: 'Blue Dart customer code', required: true },
    { key: 'originArea', description: 'Origin area code of the pickup warehouse', required: true },
    { key: 'pickupPincode', description: 'Pincode of the pickup warehouse', required: true },
    { key: 'service', description: '"apex" (default) or "surface"', required: false },
    { key: 'mode', description: '"sandbox" (default). "live" is refused until the integration is verified', required: false },
    { key: 'sandboxScenario', description: 'Sandbox tracking script: on_time (default), ndr or rto', required: false },
  ],
  async createShipment(req, config) {
    assertSandbox('Blue Dart', config);
    requireConfig('Blue Dart', config, CONFIG_REQUIRED);
    const to = pincodeOf(req.destination);
    const s = blueDartServiceability(to);
    if (!s.serviceable) throw new AppError('BAD_REQUEST', `Blue Dart does not deliver to ${to || 'this address'}: ${s.reason}`, { details: { rule: 'pincode_not_serviceable', pincode: to } });
    const wanted: BlueDartService = config.service === 'surface' ? 'surface' : 'apex';
    // Apex is not offered everywhere: fall back to Surface rather than refusing the parcel, and say so in the provider data
    const service: BlueDartService = wanted === 'apex' && !s.apex ? 'surface' : wanted;
    if (req.codAmountMinor && !s.cod) throw new AppError('BAD_REQUEST', `Blue Dart does not offer cash on delivery to ${to}`, { details: { rule: 'cod_not_available', pincode: to } });
    if (req.codAmountMinor && req.codAmountMinor > COD_LIMIT_MINOR) throw new AppError('BAD_REQUEST', 'Blue Dart cash on delivery is limited to 50,000.00', { details: { rule: 'cod_limit_exceeded' } });
    const weight = req.packages.reduce((n, p) => n + (p.weightGrams ?? 500), 0);
    const rate = blueDartRate({ fromPincode: String(config.pickupPincode), toPincode: to, weightGrams: weight, service, codAmountMinor: req.codAmountMinor });
    const now = new Date();
    const awb = makeAwb(AWB_LENGTH, req.shipmentNumber, now);
    return {
      awb, carrier: 'Blue Dart', trackingUrl: `https://www.bluedart.com/tracking?trackfor=${awb}`, estimatedDeliveryAt: new Date(now.getTime() + rate.etaDays * 86_400_000), costMinor: rate.costMinor,
      providerData: { sandbox: true, zone: rate.zone, service, requestedService: wanted, originArea: config.originArea },
      label: { format: 'text', content: labelText(req, awb, service, rate.costMinor) },
    };
  },
  async cancelShipment(awb, config) {
    assertSandbox('Blue Dart', config);
    // the pickup scan on the booking day still allows a cancellation; anything after it does not
    if (timeline(awb, AWB_LENGTH, config, new Date()).some((e) => e.status !== 'dispatched')) throw new AppError('CONFLICT', 'Blue Dart cannot cancel a shipment that is already moving', { details: { rule: 'already_in_transit', awb } });
  },
  async track(awb, config, since) {
    assertSandbox('Blue Dart', config);
    return timeline(awb, AWB_LENGTH, config, new Date(), since);
  },
  async requestReattempt(awb, config) {
    assertSandbox('Blue Dart', config);
    timeline(awb, AWB_LENGTH, config, new Date());
  },
  async initiateRto(awb, config) {
    assertSandbox('Blue Dart', config);
    timeline(awb, AWB_LENGTH, config, new Date());
  },
};
