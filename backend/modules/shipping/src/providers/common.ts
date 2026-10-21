import { createHash } from 'node:crypto';
import { AppError } from '@oms/shared';
import type { TrackingUpdate } from '../providers';
import type { TrackingStatus } from '../domain';

/**
 * Shared pieces of the Delhivery and Blue Dart providers. Both run in SANDBOX mode only: they behave deterministically (the same shipment
 * always gets the same AWB, tracking follows a fixed timeline derived from the AWB's booking date) and make no network call, because no
 * courier account has been verified. `mode: "live"` is refused with a clear error instead of pretending to book a parcel.
 */
export const PINCODE = /^[1-9]\d{5}$/;
export type Scenario = 'on_time' | 'ndr' | 'rto';
export type Zone = 'local' | 'regional' | 'national';

export function assertSandbox(name: string, config: Record<string, unknown>): void {
  if (config.mode === 'live') {
    throw new AppError('CAPABILITY_UNSUPPORTED', `${name} is not verified for live use yet; remove mode "live" to run it in sandbox mode`, { details: { reason: 'live_not_verified' } });
  }
}

export function requireConfig(name: string, config: Record<string, unknown>, keys: string[]): void {
  const missing = keys.filter((k) => typeof config[k] !== 'string' || !String(config[k]).trim());
  if (missing.length) throw new AppError('BAD_REQUEST', `${name} is not configured: ${missing.join(', ')} missing`, { details: { rule: 'provider_not_configured', missing } });
}

export function pincodeOf(address: Record<string, unknown>): string {
  const raw = String(address.pincode ?? address.postalCode ?? address.zip ?? '').trim();
  return raw;
}

/** same city prefix (first three digits) = local, same postal region (first digit) = regional, else national */
export function zoneOf(from: string, to: string): Zone {
  if (from.slice(0, 3) === to.slice(0, 3)) return 'local';
  return from[0] === to[0] ? 'regional' : 'national';
}
export const DELIVERY_DAYS: Record<Zone, number> = { local: 2, regional: 3, national: 5 };

const yymmdd = (d: Date): string => `${String(d.getUTCFullYear() % 100).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** `<yymmdd><hash digits>`: stable for one shipment on one day (a retried booking gets the same AWB) and the booking date is recoverable for tracking */
export function makeAwb(length: number, shipmentNumber: string, now: Date): string {
  const digits = BigInt(`0x${createHash('sha1').update(`${shipmentNumber}:${yymmdd(now)}`).digest('hex').slice(0, 14)}`).toString().padStart(length, '0');
  return `${yymmdd(now)}${digits.slice(0, length - 6)}`;
}

export function bookedAt(awb: string, length: number): Date {
  if (!new RegExp(`^\\d{${length}}$`).test(awb)) throw new AppError('BAD_REQUEST', `"${awb}" is not a valid AWB for this courier`, { details: { rule: 'invalid_awb' } });
  return new Date(Date.UTC(2000 + Number(awb.slice(0, 2)), Number(awb.slice(2, 4)) - 1, Number(awb.slice(4, 6)), 10, 0, 0));
}

export const scenarioOf = (config: Record<string, unknown>): Scenario => (config.sandboxScenario === 'ndr' || config.sandboxScenario === 'rto' ? config.sandboxScenario : 'on_time');

const STEPS: Record<Scenario, Array<{ day: number; status: TrackingStatus; raw: string; note: string | null }>> = {
  on_time: [
    { day: 0, status: 'dispatched', raw: 'PICKED_UP', note: 'Shipment picked up' }, { day: 1, status: 'in_transit', raw: 'IN_TRANSIT', note: 'Arrived at the destination hub' },
    { day: 2, status: 'out_for_delivery', raw: 'OUT_FOR_DELIVERY', note: 'Out for delivery' }, { day: 3, status: 'delivered', raw: 'DELIVERED', note: 'Delivered to the consignee' },
  ],
  ndr: [
    { day: 0, status: 'dispatched', raw: 'PICKED_UP', note: 'Shipment picked up' }, { day: 1, status: 'in_transit', raw: 'IN_TRANSIT', note: 'Arrived at the destination hub' },
    { day: 2, status: 'out_for_delivery', raw: 'OUT_FOR_DELIVERY', note: 'Out for delivery' }, { day: 3, status: 'delivery_failed', raw: 'NDR', note: 'Consignee not available' },
  ],
  rto: [
    { day: 0, status: 'dispatched', raw: 'PICKED_UP', note: 'Shipment picked up' }, { day: 1, status: 'in_transit', raw: 'IN_TRANSIT', note: 'Arrived at the destination hub' },
    { day: 3, status: 'delivery_failed', raw: 'NDR', note: 'Consignee refused the parcel' }, { day: 4, status: 'rto_initiated', raw: 'RTO_INITIATED', note: 'Return to origin initiated' },
    { day: 5, status: 'rto_in_transit', raw: 'RTO_IN_TRANSIT', note: 'Returning to the origin' }, { day: 7, status: 'rto_delivered', raw: 'RTO_DELIVERED', note: 'Returned to the seller' },
  ],
};

/** the tracking events that exist by `now`, oldest first, optionally only those after `since` */
export function timeline(awb: string, length: number, config: Record<string, unknown>, now: Date, since?: Date): TrackingUpdate[] {
  const start = bookedAt(awb, length).getTime();
  return STEPS[scenarioOf(config)]
    .map((s) => ({ eventId: `${awb}-${s.day}-${s.raw}`, status: s.status, rawStatus: s.raw, location: null, note: s.note, occurredAt: new Date(start + s.day * 86_400_000) }))
    .filter((e) => e.occurredAt.getTime() <= now.getTime() && (!since || e.occurredAt.getTime() > since.getTime()));
}

export const minorToRupees = (minor: number): string => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
