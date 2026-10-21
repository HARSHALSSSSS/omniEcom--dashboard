import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NormalizedWebhook } from '@oms/marketplace-core';
import type { ShpOrder, ShpProduct } from './dto';
import { mapOrder, mapProductReport } from './mappers';

/**
 * Shopify signs every webhook delivery: base64 HMAC-SHA256 of the RAW body with the app's client secret (here: the per-account secret
 * generated in the platform), sent in `X-Shopify-Hmac-Sha256`. The topic travels in a header, so the parser recognises the payload
 * by its shape as well (the stored event is re-parsed later without headers): orders carry `line_items`, products `variants`,
 * inventory level changes `inventory_item_id` + `location_id`.
 */
export const SIGNATURE_HEADER = 'x-shopify-hmac-sha256';

export const sign = (secret: string, rawBody: string | Buffer): string => createHmac('sha256', secret).update(rawBody).digest('base64');

/** constant-time and never throws (hash first: equal-length strings can still encode to different byte lengths) */
const constantTimeEqual = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function verifyWebhook({ headers, rawBody, secret }: { headers: Record<string, string | undefined>; rawBody: Buffer; secret: string }): boolean {
  const got = headers[SIGNATURE_HEADER];
  return Boolean(got) && constantTimeEqual(got!, sign(secret, rawBody));
}

const isOrder = (b: Record<string, unknown>): b is Record<string, unknown> & ShpOrder => Array.isArray(b.line_items) && b.id !== undefined;
const isProduct = (b: Record<string, unknown>): b is Record<string, unknown> & ShpProduct => Array.isArray(b.variants) && typeof b.title === 'string';

export function parseWebhook({ headers, body }: { headers: Record<string, string | undefined>; body: unknown }): NormalizedWebhook | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  // `x-shopify-event-id` is stable across redeliveries of one event; without it the key is derived from the entity and its last change
  const key = (kind: string, id: unknown, at: unknown): string => `shopify-${headers['x-shopify-event-id'] ?? headers['x-shopify-webhook-id'] ?? `${kind}-${String(id)}-${String(at ?? '')}`}`;

  if (isOrder(b)) {
    const order = mapOrder(b);
    const eventType = order.status === 'cancelled' ? 'order.cancelled' : headers['x-shopify-topic'] === 'orders/create' ? 'order.created' : 'order.updated';
    return { eventType, externalId: String(b.id), idempotencyKey: key('order', b.id, b.updated_at), payload: body, order, externalOrderId: order.externalOrderId };
  }
  if (isProduct(b)) {
    const report = mapProductReport(b);
    return { eventType: 'listing.status_changed', externalId: String(b.id), idempotencyKey: key('product', b.id, b.updated_at), payload: body, listing: report };
  }
  if (typeof b.inventory_item_id === 'number' && typeof b.location_id === 'number') {
    return { eventType: 'inventory.updated', externalId: `${b.inventory_item_id}@${b.location_id}`, idempotencyKey: key('inventory', `${b.inventory_item_id}@${b.location_id}`, b.updated_at), payload: body };
  }
  return null;
}
