import { describe, expect, it, vi } from 'vitest';
import { createErrorTracker, logErrorTracker, scrubSentryEvent, sentryErrorTracker } from '@oms/observability';

const logger = () => { const calls: any[] = []; return { calls, logger: { info: (...a: any[]) => calls.push(a), warn: (...a: any[]) => calls.push(a), error: (...a: any[]) => calls.push(a) } as any }; };
const fakeSentry = () => ({ init: vi.fn(), captureException: vi.fn(), flush: vi.fn(async () => true) });

describe('error tracking', () => {
  it('without SENTRY_DSN it stays log-only and never loads Sentry', async () => {
    const load = vi.fn();
    const t = await createErrorTracker({ environment: 'production', service: 'api', logger: logger().logger }, load as any);
    expect(load).not.toHaveBeenCalled();
    expect(t.flush).toBeUndefined();
    expect(logErrorTracker).toBeTypeOf('function');
  });

  it('with SENTRY_DSN it initialises Sentry without PII and tags only low-cardinality fields', async () => {
    const s = fakeSentry(); const l = logger();
    const t = await createErrorTracker({ dsn: 'https://k@o0.ingest.sentry.io/1', environment: 'production', release: '1.2.3', service: 'api', logger: l.logger }, async () => s);
    expect(s.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://k@o0.ingest.sentry.io/1', environment: 'production', release: '1.2.3', sendDefaultPii: false }));
    const err = new Error('boom');
    t.captureException(err, { requestId: 'r1', route: '/api/v1/orders/:id', vendorId: 'v1', password: 'hunter2', authToken: 'abc', note: 'ok' });
    const [sent, hint] = s.captureException.mock.calls[0]!;
    expect(sent).toBe(err);
    expect(hint.tags).toEqual({ requestId: 'r1', route: '/api/v1/orders/:id', vendorId: 'v1' });
    expect(hint.extra).toEqual({ note: 'ok' });
    expect(l.calls.some((c) => c[1] === 'unhandled exception captured')).toBe(true); // still logged
    await t.flush?.(10);
    expect(s.flush).toHaveBeenCalled();
  });

  it('falls back to logging when Sentry cannot be loaded', async () => {
    const l = logger();
    const t = await createErrorTracker({ dsn: 'https://k@o0.ingest.sentry.io/1', environment: 'production', service: 'api', logger: l.logger }, async () => { throw new Error('missing module'); });
    t.captureException(new Error('x'));
    expect(l.calls.some((c) => /falling back/.test(c[1]))).toBe(true);
  });

  it('a throwing Sentry client never breaks the caller', () => {
    const s = fakeSentry(); s.captureException.mockImplementation(() => { throw new Error('offline'); });
    expect(() => sentryErrorTracker(s, logger().logger).captureException(new Error('x'))).not.toThrow();
  });

  it('scrubs users, request bodies/headers/cookies and query strings from events', () => {
    const e = scrubSentryEvent({ user: { email: 'a@b.c' }, request: { method: 'POST', url: 'https://api/x?token=abc', headers: { authorization: 'Bearer z' }, data: { password: 'p' }, cookies: { s: '1' } }, extra: { apiKey: 'k', fine: 1 } }) as any;
    expect(e.user).toBeUndefined();
    expect(e.request).toEqual({ method: 'POST', url: 'https://api/x' });
    expect(e.extra).toEqual({ apiKey: '[redacted]', fine: 1 });
  });
});
