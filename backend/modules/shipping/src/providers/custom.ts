import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '@oms/shared';
import type { ShippingProvider, TrackingUpdate } from '../providers';
import { TRACKING_STATUSES, type TrackingStatus } from '../domain';

/**
 * The "Configured logistics provider": a courier or fleet the seller sets up themselves (name, tracking page, optional tracking API).
 * One adapter serves every such provider of every vendor: a vendor's provider has the code `custom:<slug>` and its own settings.
 *
 * - AWB: always typed in by the seller (the provider issues it); optional `awbPrefix` / `awbLength` catch typos.
 * - Label: a printable text label with the AWB and the provider name (a provider's own label is not available without an API).
 * - Tracking, fallback first: the tracking link is built from `trackingUrlTemplate`; updates are entered by hand
 *   (POST /shipments/{id}/tracking-events) unless a `trackingApiUrl` is configured, then the provider is polled for them.
 *   Polling without a configured API reports nothing new, so a manual provider is never marked as "tracking sync failed".
 */
export const CUSTOM_CODE = 'custom';
export const CUSTOM_PREFIX = 'custom:';
export const isCustomCode = (code: string): boolean => code === CUSTOM_CODE || code.startsWith(CUSTOM_PREFIX);

const API_TIMEOUT_MS = 8_000;
const API_MAX_BYTES = 256 * 1024;
const MAX_EVENTS = 100;

/** the tracking API contract: GET trackingApiUrl ({awb} replaced) -> { events: [{ id?, status, location?, note?, occurredAt }] } (or the array itself) */
const STATUS_ALIASES: Record<string, TrackingStatus> = {
  in_transit: 'in_transit', shipped: 'in_transit', out_for_delivery: 'out_for_delivery', delivered: 'delivered',
  delivery_failed: 'delivery_failed', undelivered: 'delivery_failed', failed: 'delivery_failed', ndr: 'delivery_failed',
  rto_initiated: 'rto_initiated', rto: 'rto_initiated', return_to_origin: 'rto_initiated', rto_in_transit: 'rto_in_transit', rto_delivered: 'rto_delivered',
};
const normalizeStatus = (raw: unknown): TrackingStatus | null => {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return STATUS_ALIASES[s] ?? ((TRACKING_STATUSES as readonly string[]).includes(s) ? (s as TrackingStatus) : null);
};

/** an address the server must never call: loopback, private, link-local (cloud metadata), carrier-grade NAT, multicast, unspecified */
export function isPrivateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPrivateAddress(mapped[1]!);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

/** https only, no credentials in the URL, and the host must resolve to public addresses */
export async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError('BAD_REQUEST', 'The tracking API address is not a valid URL', { details: { rule: 'tracking_api_url' } }); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new AppError('BAD_REQUEST', 'The tracking API must be a plain https address (no credentials in the URL, default port)', { details: { rule: 'tracking_api_url' } });
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new AppError('BAD_REQUEST', 'The tracking API must be a public address', { details: { rule: 'tracking_api_url' } });
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new AppError('BAD_REQUEST', 'The tracking API must be a public address', { details: { rule: 'tracking_api_url' } });
  return url;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > API_MAX_BYTES) { await reader.cancel(); throw new AppError('UPSTREAM_ERROR', 'The tracking API answered with too much data'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const customProvider: ShippingProvider = {
  code: CUSTOM_CODE, name: 'Configured logistics provider',
  description: 'A logistics provider you set up yourself: its name, its tracking page and, if it has one, a tracking API. You enter the AWB it issues; tracking is entered by hand or fetched from the API.',
  capabilities: { labels: true, polling: true, cancel: true, reattempt: true, rto: true, manifest: true },
  configFields: [
    { key: 'carrierName', description: 'Name of the logistics provider, shown on labels and in tracking', required: true },
    { key: 'trackingUrlTemplate', description: 'Public tracking page, e.g. https://courier.example/track/{awb}', required: true },
    { key: 'awbPrefix', description: 'Optional: every AWB you enter must start with this', required: false },
    { key: 'awbLength', description: 'Optional: every AWB you enter must have exactly this many characters', required: false },
    { key: 'defaultService', description: 'Optional: service name stored on the shipments (e.g. Surface)', required: false },
    { key: 'trackingApiUrl', description: 'Optional: https endpoint returning { events: [{ status, location, note, occurredAt }] } for an AWB ({awb} is replaced). Without it tracking is entered by hand', required: false },
    { key: 'apiKey', description: 'Optional: credential sent as a bearer token to the tracking API. Stored, never shown again', required: false, secret: true },
  ],
  async createShipment(req, config) {
    const awb = (req.manual?.awb ?? '').trim();
    const name = typeof config.carrierName === 'string' && config.carrierName.trim() ? config.carrierName.trim() : 'Logistics provider';
    if (!awb) throw new AppError('BAD_REQUEST', `Enter the AWB that ${name} issued for this parcel`, { details: { rule: 'awb_required' } });
    const prefix = typeof config.awbPrefix === 'string' ? config.awbPrefix.trim() : '';
    if (prefix && !awb.toUpperCase().startsWith(prefix.toUpperCase())) throw new AppError('BAD_REQUEST', `A ${name} AWB starts with ${prefix}`, { details: { rule: 'awb_format', prefix } });
    const length = Number(config.awbLength);
    if (Number.isInteger(length) && length > 0 && awb.length !== length) throw new AppError('BAD_REQUEST', `A ${name} AWB has ${length} characters`, { details: { rule: 'awb_format', length } });
    const tpl = typeof config.trackingUrlTemplate === 'string' ? config.trackingUrlTemplate : null;
    return {
      awb, carrier: name, trackingUrl: req.manual?.trackingUrl ?? (tpl ? tpl.replace('{awb}', encodeURIComponent(awb)) : null), estimatedDeliveryAt: null, costMinor: null,
      providerData: { custom: true },
      label: { format: 'text', content: [`SHIP ${req.shipmentNumber}`, `${name.toUpperCase()}  AWB ${awb}`, `ORDER ${req.orderNumber}`, `FROM ${req.warehouse.code} ${req.warehouse.name}`, `TO ${String(req.destination.name ?? '')} ${String(req.destination.pincode ?? '')}`, req.codAmountMinor ? `COD ${(req.codAmountMinor / 100).toFixed(2)} ${req.currency}` : 'PREPAID', ...req.packages.map((p) => `PKG ${p.barcode}`)].join('\n') },
    };
  },
  async cancelShipment() { /* nothing is booked remotely: the AWB was typed in */ },
  async track(awb, config) {
    const api = typeof config.trackingApiUrl === 'string' ? config.trackingApiUrl.trim() : '';
    if (!api) return []; // fallback: no API, so tracking is entered by hand and the tracking link is the source
    const url = await assertPublicHttps(api.replace('{awb}', encodeURIComponent(awb)));
    const key = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), API_TIMEOUT_MS);
    let body: unknown;
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'error', signal: ctl.signal, headers: { accept: 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) } });
      if (!res.ok) throw new AppError('UPSTREAM_ERROR', `The tracking API answered ${res.status}`);
      body = JSON.parse(await readCapped(res));
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('UPSTREAM_ERROR', (e as Error).name === 'AbortError' ? 'The tracking API timed out' : 'The tracking API could not be reached or answered something that is not JSON');
    } finally { clearTimeout(timer); }
    const list = Array.isArray(body) ? body : (body as { events?: unknown } | null)?.events;
    if (!Array.isArray(list)) throw new AppError('UPSTREAM_ERROR', 'The tracking API answered without an events list');
    const out: TrackingUpdate[] = [];
    for (const raw of list.slice(0, MAX_EVENTS)) {
      const e = (raw ?? {}) as Record<string, unknown>;
      const status = normalizeStatus(e.status);
      const at = new Date(String(e.occurredAt ?? e.timestamp ?? ''));
      if (!status || Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60_000) continue; // events are de-duplicated by id when applied, so a late report of an old event is still taken
      out.push({ eventId: typeof e.id === 'string' && e.id ? e.id.slice(0, 120) : `${awb}-${status}-${at.toISOString()}`, status, rawStatus: String(e.status).slice(0, 120), location: typeof e.location === 'string' ? e.location.slice(0, 200) : null, note: typeof e.note === 'string' ? e.note.slice(0, 500) : null, occurredAt: at });
    }
    return out;
  },
  async requestReattempt() { /* staff arrange it with the provider */ },
  async initiateRto() { /* staff arrange it with the provider */ },
};
