import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import type { Logger } from '@oms/logging';

// ---------------------------------------------------------------------------------------------
// Metrics (Prometheus). One registry per process; label cardinality is kept low on purpose:
// never label by vendorId/userId/orderId. Use route *templates*, not raw URLs.
// ---------------------------------------------------------------------------------------------
export interface Metrics {
  registry: Registry;
  httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  httpRequestsInFlight: Gauge;
  jobsProcessed: Counter<'queue' | 'status'>;
  jobDuration: Histogram<'queue'>;
  marketplaceCalls: Counter<'marketplace' | 'operation' | 'outcome'>;
  dbPoolSize: Gauge<'state'>;
}

export function createMetrics(service: string): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });
  return {
    registry,
    httpRequestDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    httpRequestsInFlight: new Gauge({ name: 'http_requests_in_flight', help: 'In-flight HTTP requests', registers: [registry] }),
    jobsProcessed: new Counter({ name: 'jobs_processed_total', help: 'Background jobs processed', labelNames: ['queue', 'status'], registers: [registry] }),
    jobDuration: new Histogram({
      name: 'job_duration_seconds', help: 'Background job duration', labelNames: ['queue'],
      buckets: [0.05, 0.25, 1, 5, 15, 60, 300], registers: [registry],
    }),
    marketplaceCalls: new Counter({
      name: 'marketplace_calls_total', help: 'Outbound marketplace API calls',
      labelNames: ['marketplace', 'operation', 'outcome'], registers: [registry],
    }),
    dbPoolSize: new Gauge({ name: 'db_pool_connections', help: 'pg pool connections', labelNames: ['state'], registers: [registry] }),
  };
}

// ---------------------------------------------------------------------------------------------
// Health. /health/live = process is up. /health/ready = dependencies reachable (DB, Redis).
// ---------------------------------------------------------------------------------------------
export type CheckResult = { status: 'up' | 'down'; latencyMs: number; error?: string };
export type HealthCheck = () => Promise<void>;

export class HealthRegistry {
  private readonly checks = new Map<string, { fn: HealthCheck; critical: boolean }>();

  register(name: string, fn: HealthCheck, opts: { critical?: boolean } = {}): void {
    this.checks.set(name, { fn, critical: opts.critical ?? true });
  }

  async run(timeoutMs = 2000): Promise<{ ok: boolean; checks: Record<string, CheckResult> }> {
    const entries = await Promise.all(
      [...this.checks.entries()].map(async ([name, { fn, critical }]) => {
        const started = performance.now();
        try {
          await Promise.race([
            fn(),
            new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs).unref()),
          ]);
          return [name, { critical, result: { status: 'up', latencyMs: Math.round(performance.now() - started) } as CheckResult }] as const;
        } catch (e) {
          return [name, { critical, result: { status: 'down', latencyMs: Math.round(performance.now() - started), error: (e as Error).message } as CheckResult }] as const;
        }
      }),
    );
    return {
      ok: entries.every(([, v]) => v.result.status === 'up' || !v.critical),
      checks: Object.fromEntries(entries.map(([n, v]) => [n, v.result])),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Error tracking: thin port so Sentry (or similar) can be plugged in without touching call sites.
// ---------------------------------------------------------------------------------------------
export interface ErrorTracker {
  captureException(err: unknown, context?: Record<string, unknown>): void;
  /** Wait (bounded) until queued events have been sent; called on shutdown. */
  flush?(timeoutMs?: number): Promise<void>;
}

export const logErrorTracker = (logger: Logger): ErrorTracker => ({
  captureException: (err, context) => logger.error({ err, ...context }, 'unhandled exception captured'),
});

/** The slice of @sentry/node we use (structural, so tests can fake it and a major upgrade does not ripple through the codebase). */
export interface SentryLike {
  init(options: Record<string, unknown>): unknown;
  captureException(err: unknown, hint?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): unknown;
  flush(timeoutMs?: number): Promise<unknown>;
}

const TAG_KEYS = ['requestId', 'route', 'vendorId', 'queue', 'jobId'] as const;
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|signature/i;

/** Strips everything that could carry PII or secrets before an event leaves the process (request bodies/headers/cookies/users/query strings). */
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  const e = event as { user?: unknown; request?: { method?: string; url?: unknown }; server_name?: unknown; extra?: Record<string, unknown>; breadcrumbs?: Array<{ message?: unknown; data?: unknown }> };
  delete e.user;
  if (e.request) e.request = { method: e.request.method, url: typeof e.request.url === 'string' ? e.request.url.split('?')[0] : undefined };
  delete e.server_name;
  if (e.extra) for (const k of Object.keys(e.extra)) if (SECRET_KEY.test(k)) e.extra[k] = '[redacted]';
  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map((b) => ({ ...b, data: undefined, message: typeof b.message === 'string' ? b.message.slice(0, 200) : b.message }));
  return event;
}

/**
 * Sentry-backed tracker. Errors are ALSO logged (so a Sentry outage never hides a failure). Only low-cardinality tags
 * (request id, route template, vendor id, queue, job id) are sent as tags; every other context key goes to `extra` unless it looks secret.
 */
export function sentryErrorTracker(sentry: SentryLike, logger: Logger): ErrorTracker {
  const log = logErrorTracker(logger);
  return {
    captureException(err, context = {}) {
      log.captureException(err, context);
      const tags: Record<string, string> = {};
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(context)) {
        if (v === undefined || v === null) continue;
        if ((TAG_KEYS as readonly string[]).includes(k)) tags[k] = String(v).slice(0, 200);
        else if (!SECRET_KEY.test(k)) extra[k] = v;
      }
      try { sentry.captureException(err, { tags, extra }); } catch (e) { logger.warn({ message: (e as Error).message }, 'sentry capture failed'); }
    },
    flush: async (timeoutMs = 2000) => { await sentry.flush(timeoutMs).catch(() => undefined); },
  };
}

export interface ErrorTrackerConfig { dsn?: string; environment: string; release?: string; service: string; logger: Logger }

/** SENTRY_DSN set -> Sentry (+ logging); otherwise the log-only tracker. A failure to load/init Sentry degrades to logging, never to a boot failure. */
export async function createErrorTracker(cfg: ErrorTrackerConfig, load: () => Promise<SentryLike> = async () => (await import('@sentry/node')) as unknown as SentryLike): Promise<ErrorTracker> {
  if (!cfg.dsn) return logErrorTracker(cfg.logger);
  try {
    const sentry = await load();
    sentry.init({
      dsn: cfg.dsn, environment: cfg.environment, release: cfg.release, serverName: cfg.service,
      sendDefaultPii: false, tracesSampleRate: 0, maxBreadcrumbs: 20,
      initialScope: { tags: { service: cfg.service } },
      beforeSend: (event: Record<string, unknown>) => scrubSentryEvent(event),
    });
    cfg.logger.info({ service: cfg.service }, 'sentry error tracking enabled');
    return sentryErrorTracker(sentry, cfg.logger);
  } catch (err) {
    cfg.logger.warn({ message: (err as Error).message }, 'sentry could not be initialised; falling back to log-only error tracking');
    return logErrorTracker(cfg.logger);
  }
}

// ---------------------------------------------------------------------------------------------
// Tracing (OpenTelemetry). Must be started BEFORE other imports in the entrypoint so
// http/pg instrumentations can patch modules. No-op unless OTEL_ENABLED=true.
// ---------------------------------------------------------------------------------------------
export interface TracingConfig { enabled: boolean; serviceName: string; serviceVersion?: string; environment: string; otlpEndpoint?: string }

export async function startTracing(cfg: TracingConfig): Promise<{ shutdown: () => Promise<void> }> {
  if (!cfg.enabled) return { shutdown: async () => undefined };
  const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }, { PgInstrumentation }, { resourceFromAttributes }] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-pg'),
    import('@opentelemetry/resources'),
  ]);
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': cfg.serviceName,
      'service.version': cfg.serviceVersion ?? '0.0.0',
      'deployment.environment.name': cfg.environment,
    }),
    traceExporter: new OTLPTraceExporter(cfg.otlpEndpoint ? { url: `${cfg.otlpEndpoint.replace(/\/$/, '')}/v1/traces` } : {}),
    instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}

export { trace, context as otelContext, SpanStatusCode } from '@opentelemetry/api';
export { Gauge } from 'prom-client';
