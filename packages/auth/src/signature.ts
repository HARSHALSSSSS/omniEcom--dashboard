import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Generic HMAC webhook verification helper. Marketplace-specific schemes (header names, payload
 * canonicalisation) are implemented per connector and call this for the constant-time comparison.
 * ALWAYS verify against the RAW request body bytes, never re-serialised JSON.
 */
export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyHmacSignature(opts: { secret: string; rawBody: string | Buffer; signature: string; timestamp?: number; toleranceSeconds?: number; now?: Date }): boolean {
  if (opts.timestamp !== undefined) {
    const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
    if (Math.abs(nowSec - opts.timestamp) > (opts.toleranceSeconds ?? 300)) return false; // replay protection
  }
  const signed = opts.timestamp !== undefined ? `${opts.timestamp}.${opts.rawBody.toString()}` : opts.rawBody;
  return safeEqual(hmacSha256Hex(opts.secret, signed), opts.signature.replace(/^sha256=/, ''));
}
