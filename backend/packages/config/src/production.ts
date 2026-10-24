import type { Env } from './env';

const DEV_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const WEAK = /change-?me|dev-?only|example|secret|password|test/i;

/**
 * Production / staging refuse to start with a configuration that is merely *valid* but unsafe: development secrets, an open CORS
 * list, plain-http URLs, an unauthenticated metrics endpoint, a database role that bypasses row-level security, in-memory
 * storage... Every problem is listed at once. (Development and test keep their convenient defaults.)
 * `strict` (production) additionally requires TRUST_PROXY, real e-mail delivery (SMTP_URL + EMAIL_FROM), a non-local Redis, complete S3 storage
 * settings, and refuses the mock marketplace / sandbox courier (staging may keep those for rehearsals).
 */
export function assertProductionReadiness(env: Env, strict: boolean): void {
  const problems: string[] = [];
  if (env.JWT_ACCESS_SECRET.length < 48 || WEAK.test(env.JWT_ACCESS_SECRET)) problems.push('JWT_ACCESS_SECRET must be a random value of at least 48 characters (not a development placeholder)');
  for (const k of env.ENCRYPTION_KEYS.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [id, b64] = k.split(':');
    if (!id || !b64 || Buffer.from(b64, 'base64').length !== 32) problems.push('ENCRYPTION_KEYS entries must be keyId:base64(32 random bytes)');
    else if (/^dev/i.test(id) || b64 === DEV_KEY) problems.push('ENCRYPTION_KEYS contains the development key');
  }
  if (env.METRICS_ENABLED && (!env.METRICS_TOKEN || env.METRICS_TOKEN.length < 16)) problems.push('METRICS_TOKEN (16+ characters) is required while METRICS_ENABLED=true');
  for (const o of env.CORS_ORIGINS) {
    if (o === '*' || /localhost|127\.0\.0\.1/.test(o) || !o.startsWith('https://')) problems.push(`CORS_ORIGINS must be explicit https origins (found "${o}")`);
  }
  for (const [name, url] of [['APP_WEB_URL', env.APP_WEB_URL], ['PUBLIC_BASE_URL', env.PUBLIC_BASE_URL], ['PUBLIC_API_URL', env.PUBLIC_API_URL]] as const) {
    if (!url.startsWith('https://')) problems.push(`${name} must be an https URL`);
  }
  if (!env.DATABASE_SSL) problems.push('DATABASE_SSL must be true');
  const dbUser = (() => { try { return decodeURIComponent(new URL(env.DATABASE_URL).username); } catch { return ''; } })();
  if (/^(postgres|root|admin)$|owner/i.test(dbUser)) problems.push('DATABASE_URL must use the restricted application role (an owner / superuser bypasses row-level security)');
  if (env.STORAGE_DRIVER === 'memory') problems.push('STORAGE_DRIVER=memory is not allowed (data would be lost on restart)');
  if (!env.EMAIL_VERIFICATION_REQUIRED) problems.push('EMAIL_VERIFICATION_REQUIRED must stay true');
  if (env.AUTH_RATE_LIMIT_MAX > 20) problems.push('AUTH_RATE_LIMIT_MAX must be 20 or less');
  if (env.TRUST_PROXY === true) problems.push('TRUST_PROXY=true believes every X-Forwarded-For hop (clients can spoof their IP and dodge rate limits): use the number of proxy hops (e.g. 1) or the proxy CIDRs');
  if (strict && env.TRUST_PROXY === false) problems.push('TRUST_PROXY must be set to the number of proxy hops (e.g. 1) or the load balancer CIDRs (otherwise every client shares one rate-limit bucket and audit logs record the proxy IP)');
  if (strict) {
    productionInfrastructureProblems(env, problems);
    if (env.MOCK_MARKETPLACE_ENABLED === true) problems.push('MOCK_MARKETPLACE_ENABLED=true is not allowed in production (the mock marketplace is a sandbox-only connector)');
    if (env.SANDBOX_COURIER_ENABLED === true) problems.push('SANDBOX_COURIER_ENABLED=true is not allowed in production (the sandbox courier fabricates shipment events)');
  }
  if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|\[::1\])$/i;
const PLACEHOLDER_MAIL_DOMAIN = /(^|\.)(localhost|local|test|invalid|example|example\.(com|org|net))$/i;
const hostOf = (url: string): { protocol: string; host: string } | null => { try { const u = new URL(url); return { protocol: u.protocol, host: u.hostname }; } catch { return null; } };

/** the address inside `Name <addr@domain>` / `addr@domain`, or null when it is not a plausible sender */
export function senderAddress(from: string): string | null {
  const m = /^[^<>\r\n]*<([^<>\s]+)>\s*$/.exec(from.trim()) ?? /^([^<>\s]+)$/.exec(from.trim());
  const addr = m?.[1];
  return addr && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr) ? addr : null;
}

function productionInfrastructureProblems(env: Env, problems: string[]): void {
  // ---- e-mail: verification / reset / invitation links are the only way in; a log mailer would lock every new user out
  if (!env.SMTP_URL) problems.push('SMTP_URL is required (smtp://user:pass@host:587 or smtps://...): without it verification, password-reset and invitation e-mails are never delivered');
  else {
    const u = hostOf(env.SMTP_URL);
    if (!u || (u.protocol !== 'smtp:' && u.protocol !== 'smtps:')) problems.push('SMTP_URL must be an smtp:// or smtps:// URL');
    else if (LOCAL_HOST.test(u.host)) problems.push('SMTP_URL must point at a real mail relay, not localhost');
  }
  const addr = env.EMAIL_FROM ? senderAddress(env.EMAIL_FROM) : null;
  if (!env.EMAIL_FROM) problems.push('EMAIL_FROM is required (e.g. "Omni Ecom <no-reply@yourdomain.com>")');
  else if (!addr) problems.push('EMAIL_FROM must be "addr@domain" or "Name <addr@domain>"');
  else if (PLACEHOLDER_MAIL_DOMAIN.test(addr.split('@')[1] ?? '')) problems.push('EMAIL_FROM must use your own sending domain (not a placeholder such as example.com or localhost)');

  // ---- redis: queues, rate limits, idempotency. The localhost default must never reach production.
  const r = hostOf(env.REDIS_URL);
  if (!r || (r.protocol !== 'redis:' && r.protocol !== 'rediss:')) problems.push('REDIS_URL must be a redis:// or rediss:// URL');
  else if (LOCAL_HOST.test(r.host)) problems.push('REDIS_URL must point at the production Redis (the localhost default is not allowed)');

  // ---- object storage (S3 driver): endpoint, bucket and credentials must all be explicit
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.STORAGE_ENDPOINT) problems.push('STORAGE_ENDPOINT is required for STORAGE_DRIVER=s3');
    else if (LOCAL_HOST.test(hostOf(env.STORAGE_ENDPOINT)?.host ?? 'localhost')) problems.push('STORAGE_ENDPOINT must not be localhost in production');
    if (!env.STORAGE_BUCKET?.trim()) problems.push('STORAGE_BUCKET is required for STORAGE_DRIVER=s3');
    if (!env.STORAGE_ACCESS_KEY_ID || !env.STORAGE_SECRET_ACCESS_KEY) problems.push('STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY are required for STORAGE_DRIVER=s3');
    else if (/^minioadmin$/i.test(env.STORAGE_ACCESS_KEY_ID) || /^minioadmin$/i.test(env.STORAGE_SECRET_ACCESS_KEY)) problems.push('STORAGE_* credentials are the MinIO development defaults');
  }
}
