import { createHash } from 'node:crypto';
import { AppError, newId } from '@oms/shared';
import type { TrackingStatus } from './domain';
import { blueDartProvider, customProvider, delhiveryProvider, isCustomCode } from './providers/index';

/**
 * The shipping provider interface. Core code (shipments, manifests, tracking, NDR/RTO) only ever talks to this interface, so
 * adding a courier = one new file implementing it + registering it below. Nothing else changes, and no courier is hardcoded.
 * Calls to a provider are network calls in real implementations: the service layer makes them OUTSIDE database transactions.
 */
export interface ShipmentRequest {
  shipmentNumber: string;
  orderNumber: string;
  warehouse: { code: string; name: string; address: Record<string, unknown> };
  destination: Record<string, unknown>;
  packages: Array<{ barcode: string; weightGrams: number | null; lengthMm: number | null; widthMm: number | null; heightMm: number | null }>;
  codAmountMinor: number | null;
  currency: string;
  service?: string | null;
  /** manual provider: staff-entered values */
  manual?: { awb?: string; carrier?: string; trackingUrl?: string };
}
export interface ProviderShipment {
  awb: string;
  carrier: string;
  trackingUrl: string | null;
  label: { format: 'text' | 'pdf_base64'; content: string };
  estimatedDeliveryAt: Date | null;
  costMinor: number | null;
  providerData: Record<string, unknown>;
}
export interface TrackingUpdate { eventId: string; status: TrackingStatus; rawStatus?: string; location?: string | null; note?: string | null; occurredAt: Date }

export interface ProviderCapabilities { labels: boolean; polling: boolean; cancel: boolean; reattempt: boolean; rto: boolean; manifest: boolean }
/** `secret`: a credential. It is stored, accepted when set, and never returned by the API (a placeholder shows that it is set). */
export interface ProviderConfigField { key: string; description: string; required: boolean; secret?: boolean }
export const SECRET_MASK = '********';
export interface ShippingProvider {
  code: string;
  name: string;
  description: string;
  capabilities: ProviderCapabilities;
  /** simulators: only available when SANDBOX_COURIER_ENABLED (off by default in production) */
  simulator?: boolean;
  /** non-secret settings a vendor may set for this provider (documented in the catalogue) */
  configFields: ProviderConfigField[];
  createShipment(req: ShipmentRequest, config: Record<string, unknown>): Promise<ProviderShipment>;
  cancelShipment(awb: string, config: Record<string, unknown>): Promise<void>;
  track(awb: string, config: Record<string, unknown>, since?: Date): Promise<TrackingUpdate[]>;
  requestReattempt?(awb: string, config: Record<string, unknown>, input: { nextAttemptAt?: Date | null; note?: string | null }): Promise<void>;
  initiateRto?(awb: string, config: Record<string, unknown>, input: { note?: string | null }): Promise<void>;
  /** providers that can book a pickup with the carrier; every other provider's slots are recorded as manual bookings */
  schedulePickup?(input: PickupRequest, config: Record<string, unknown>): Promise<{ reference: string }>;
  cancelPickup?(reference: string, config: Record<string, unknown>): Promise<void>;
}
export interface PickupRequest { date: string; windowStart: string; windowEnd: string; parcelCount: number; warehouse: { code: string; name: string; address: Record<string, unknown> } }

/** Staff type the AWB (or we generate an internal reference). No network, no polling: tracking is entered by hand or pushed in. */
const manualProvider: ShippingProvider = {
  code: 'manual', name: 'Manual / self-ship', description: 'Hand over to any courier or own fleet. Staff enter the AWB and tracking updates (or an integration pushes them through the tracking API).',
  capabilities: { labels: true, polling: false, cancel: true, reattempt: true, rto: true, manifest: true },
  configFields: [{ key: 'defaultCarrier', description: 'Carrier name used when none is given', required: false }, { key: 'trackingUrlTemplate', description: 'e.g. https://courier.example/track/{awb}', required: false }],
  async createShipment(req, config) {
    const awb = (req.manual?.awb ?? `MAN-${req.shipmentNumber}`).trim();
    const carrier = req.manual?.carrier ?? (typeof config.defaultCarrier === 'string' ? config.defaultCarrier : 'Self ship');
    const tpl = typeof config.trackingUrlTemplate === 'string' ? config.trackingUrlTemplate : null;
    return {
      awb, carrier, trackingUrl: req.manual?.trackingUrl ?? (tpl ? tpl.replace('{awb}', encodeURIComponent(awb)) : null), estimatedDeliveryAt: null, costMinor: null, providerData: {},
      label: { format: 'text', content: [`SHIP ${req.shipmentNumber}`, `AWB ${awb}`, `ORDER ${req.orderNumber}`, `FROM ${req.warehouse.code}`, `TO ${String(req.destination.name ?? '')}`, ...req.packages.map((p) => `PKG ${p.barcode}`)].join('\n') },
    };
  },
  async cancelShipment() { /* nothing to cancel remotely */ },
  async track() { return []; },
  async requestReattempt() { /* staff arrange it with the courier */ },
  async initiateRto() { /* staff arrange it with the courier */ },
};

/**
 * Deterministic courier simulator (the same idea as the marketplace simulators): lets the whole outbound flow run end to end
 * without a real courier. Tracking is pushed through POST /shipments/{id}/simulate. Not a real courier; says so in its name.
 */
const sandboxProvider: ShippingProvider = {
  code: 'sandbox', simulator: true, name: 'Sandbox courier (simulator)', description: 'A built-in simulated courier for development, demos and tests. Issues AWBs and labels; tracking events are simulated through the API.',
  capabilities: { labels: true, polling: false, cancel: true, reattempt: true, rto: true, manifest: true },
  configFields: [{ key: 'fail', description: 'Test hook: "create" makes shipment creation fail, "track" makes tracking refreshes fail, "pickup" makes pickup booking fail', required: false }],
  async createShipment(req, config) {
    if (config.fail === 'create') throw new AppError('UPSTREAM_ERROR', 'Sandbox courier rejected the shipment (simulated failure)');
    const awb = `SBX${createHash('sha1').update(`${req.shipmentNumber}:${newId()}`).digest('hex').slice(0, 10).toUpperCase()}`;
    return {
      awb, carrier: 'Sandbox Express', trackingUrl: `https://sandbox-courier.invalid/track/${awb}`, estimatedDeliveryAt: new Date(Date.now() + 4 * 86_400_000), costMinor: 6500 + req.packages.reduce((n, p) => n + Math.ceil((p.weightGrams ?? 500) / 500) * 1500, 0),
      providerData: { simulated: true },
      label: { format: 'text', content: ['*** SANDBOX COURIER ***', `AWB ${awb}`, `SHIP ${req.shipmentNumber} / ORDER ${req.orderNumber}`, `FROM ${req.warehouse.code} ${req.warehouse.name}`, `TO ${String(req.destination.name ?? '')} ${String(req.destination.pincode ?? '')}`, req.codAmountMinor ? `COD ${(req.codAmountMinor / 100).toFixed(2)} ${req.currency}` : 'PREPAID', ...req.packages.map((p) => `PKG ${p.barcode} ${p.weightGrams ?? '?'}g`)].join('\n') },
    };
  },
  async cancelShipment() { /* accepted */ },
  async track(_awb, config) {
    if (config.fail === 'track') throw new AppError('UPSTREAM_ERROR', 'Sandbox courier tracking timed out (simulated failure)');
    return [];
  },
  async requestReattempt() { /* accepted */ },
  async initiateRto() { /* accepted */ },
  async schedulePickup(input, config) {
    if (config.fail === 'pickup') throw new AppError('UPSTREAM_ERROR', 'Sandbox courier rejected the pickup (simulated failure)');
    return { reference: `SBXPK${createHash('sha1').update(`${input.warehouse.code}:${input.date}:${input.windowStart}:${newId()}`).digest('hex').slice(0, 8).toUpperCase()}` };
  },
  async cancelPickup() { /* accepted */ },
};

const REGISTRY = new Map<string, ShippingProvider>([[manualProvider.code, manualProvider], [sandboxProvider.code, sandboxProvider], [delhiveryProvider.code, delhiveryProvider], [blueDartProvider.code, blueDartProvider], [customProvider.code, customProvider]]);
export const listProviders = (): ShippingProvider[] => [...REGISTRY.values()];
/** a vendor's own logistics provider has the code `custom:<slug>`; all of them are served by the one `custom` adapter */
export function getProvider(code: string): ShippingProvider {
  const p = REGISTRY.get(isCustomCode(code) ? 'custom' : code);
  if (!p) throw new AppError('BAD_REQUEST', `Unknown shipping provider "${code}"`, { details: { available: [...REGISTRY.keys()] } });
  return p;
}
const secretKeys = (code: string): string[] => { try { return getProvider(code).configFields.filter((f) => f.secret).map((f) => f.key); } catch { return []; } };
/** the settings the provider declares, with every credential replaced by a placeholder: nothing free-form and no secret can leave through the API */
export function publicConfig(code: string, config: Record<string, unknown>): Record<string, unknown> {
  let fields: ProviderConfigField[] = [];
  try { fields = getProvider(code).configFields; } catch { /* unknown provider: expose nothing */ }
  const secret = new Set(fields.filter((f) => f.secret).map((f) => f.key));
  return Object.fromEntries(Object.entries(config).filter(([k]) => fields.some((f) => f.key === k)).map(([k, v]) => [k, secret.has(k) ? (typeof v === 'string' && v ? SECRET_MASK : '') : v]));
}
/** a changed configuration keeps a credential that was not sent again (or came back as the placeholder) */
export function mergeConfig(code: string, before: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const out = { ...next };
  for (const k of secretKeys(code)) if ((out[k] === undefined || out[k] === SECRET_MASK) && typeof before[k] === 'string' && before[k]) out[k] = before[k];
  for (const k of secretKeys(code)) if (out[k] === SECRET_MASK || out[k] === '') delete out[k];
  return out;
}
/** register an additional provider (a real courier adapter calls this at start-up) */
export const registerProvider = (p: ShippingProvider): void => { REGISTRY.set(p.code, p); };
