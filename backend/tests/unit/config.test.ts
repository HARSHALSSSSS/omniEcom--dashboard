import { describe, expect, it } from 'vitest';
import { parseConfig } from '@oms/config';
import { TEST_ENV } from '@oms/testing';

/** a configuration that passes the production readiness checks */
const PROD_ENV: Record<string, string | undefined> = {
  ...TEST_ENV, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'Zk3v9qLw1XrT7mNc4HbY8dFs2PjA6eUo0GiKt5RxVnWyQz1B', ENCRYPTION_KEYS: 'k2025:' + Buffer.alloc(32, 7).toString('base64'),
  METRICS_TOKEN: 'metrics-token-0123456789', CORS_ORIGINS: 'https://app.example.com', DATABASE_URL: 'postgres://oms_app:pw@db.example.com:5432/oms', DATABASE_SSL: 'true', STORAGE_DRIVER: 's3',
  TRUST_PROXY: '1', APP_WEB_URL: 'https://app.example.com', PUBLIC_BASE_URL: 'https://api.example.com', PUBLIC_API_URL: 'https://api.example.com', AUTH_RATE_LIMIT_MAX: '10', EMAIL_VERIFICATION_REQUIRED: 'true',
  SMTP_URL: 'smtps://mailer:pw@smtp.mail-provider.test:465', EMAIL_FROM: 'Omni Ecom <no-reply@mail.acme-shop.in>', REDIS_URL: 'rediss://:pw@cache.acme-shop.in:6379',
  STORAGE_ENDPOINT: 'https://s3.ap-south-1.amazonaws.com', STORAGE_BUCKET: 'acme-oms-media', STORAGE_ACCESS_KEY_ID: 'AKIAEXAMPLEKEYID0000', STORAGE_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

describe('config', () => {
  it('parses a valid environment with sane defaults', () => {
    const c = parseConfig(TEST_ENV);
    expect(c.PORT).toBe(3000);
    expect(c.isTest).toBe(true);
    expect(c.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });
  it('fails fast and names every problem', () => {
    expect(() => parseConfig({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*ENCRYPTION_KEYS/);
  });
  it('rejects weak JWT secrets', () => {
    expect(() => parseConfig({ ...TEST_ENV, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });
  it('disables swagger by default in production, enables elsewhere', () => {
    const { SWAGGER_ENABLED: _omit, ...rest } = PROD_ENV;
    expect(parseConfig({ ...rest, NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
    expect(parseConfig({ ...rest, NODE_ENV: 'staging' }).swaggerEnabled).toBe(true);
    expect(parseConfig({ ...rest, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled).toBe(true);
    expect(parseConfig({ ...rest, NODE_ENV: 'production' })).toMatchObject({ mockMarketplaceEnabled: false, sandboxCourierEnabled: false });
    expect(parseConfig({ ...TEST_ENV }).sandboxCourierEnabled).toBe(true);
  });
  it('production refuses a valid-but-unsafe configuration and lists every problem', () => {
    expect(() => parseConfig({ ...TEST_ENV, NODE_ENV: 'production' })).toThrow(/Unsafe production configuration[\s\S]*JWT_ACCESS_SECRET[\s\S]*METRICS_TOKEN[\s\S]*CORS_ORIGINS[\s\S]*DATABASE_SSL/);
    for (const [patch, msg] of [
      [{ JWT_ACCESS_SECRET: 'x'.repeat(40) }, /JWT_ACCESS_SECRET/], [{ METRICS_TOKEN: undefined }, /METRICS_TOKEN/], [{ CORS_ORIGINS: '*' }, /CORS_ORIGINS/], [{ CORS_ORIGINS: 'http://app.example.com' }, /https origins/],
      [{ DATABASE_SSL: 'false' }, /DATABASE_SSL/], [{ DATABASE_URL: 'postgres://oms_owner:p@db.example.com/oms' }, /restricted application role/], [{ DATABASE_URL: 'postgres://postgres:p@db.example.com/oms' }, /restricted application role/],
      [{ STORAGE_DRIVER: 'memory' }, /STORAGE_DRIVER/], [{ TRUST_PROXY: 'false' }, /TRUST_PROXY/], [{ TRUST_PROXY: 'true' }, /spoof/], [{ EMAIL_VERIFICATION_REQUIRED: 'false' }, /EMAIL_VERIFICATION_REQUIRED/],
      [{ AUTH_RATE_LIMIT_MAX: '500' }, /AUTH_RATE_LIMIT_MAX/], [{ APP_WEB_URL: 'http://app.example.com' }, /APP_WEB_URL/], [{ ENCRYPTION_KEYS: 'dev1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=' }, /development key/],
    ] as Array<[Record<string, string | undefined>, RegExp]>) {
      expect(() => parseConfig({ ...PROD_ENV, ...patch }), JSON.stringify(patch)).toThrow(msg);
    }
    expect(parseConfig(PROD_ENV).isProd).toBe(true);
    // staging is held to the same standard (except TRUST_PROXY)
    expect(() => parseConfig({ ...PROD_ENV, NODE_ENV: 'staging', METRICS_TOKEN: undefined })).toThrow(/METRICS_TOKEN/);
  });
  it('production requires real e-mail delivery, a real Redis, complete S3 storage and no sandbox connectors', () => {
    const bad: Array<[Record<string, string | undefined>, RegExp]> = [
      [{ SMTP_URL: undefined }, /SMTP_URL is required/], [{ SMTP_URL: 'http://smtp.shop.in' }, /smtp:\/\/ or smtps/], [{ SMTP_URL: 'smtp://localhost:1025' }, /not localhost/],
      [{ EMAIL_FROM: undefined }, /EMAIL_FROM is required/], [{ EMAIL_FROM: 'not an address' }, /EMAIL_FROM must be/], [{ EMAIL_FROM: 'no-reply@example.com' }, /own sending domain/], [{ EMAIL_FROM: 'Omni <no-reply@localhost>' }, /own sending domain|EMAIL_FROM must be/],
      [{ REDIS_URL: undefined }, /REDIS_URL must point at the production Redis/], [{ REDIS_URL: 'redis://127.0.0.1:6379' }, /REDIS_URL must point/], [{ REDIS_URL: 'http://cache.acme-shop.in' }, /redis:\/\/ or rediss/],
      [{ STORAGE_ENDPOINT: undefined }, /STORAGE_ENDPOINT is required/], [{ STORAGE_ENDPOINT: 'http://localhost:9000' }, /STORAGE_ENDPOINT must not be localhost/], [{ STORAGE_BUCKET: ' ' }, /STORAGE_BUCKET is required/],
      [{ STORAGE_ACCESS_KEY_ID: undefined }, /STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY/], [{ STORAGE_SECRET_ACCESS_KEY: undefined }, /STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY/], [{ STORAGE_ACCESS_KEY_ID: 'minioadmin' }, /MinIO development defaults/],
      [{ MOCK_MARKETPLACE_ENABLED: 'true' }, /MOCK_MARKETPLACE_ENABLED=true is not allowed/], [{ SANDBOX_COURIER_ENABLED: 'true' }, /SANDBOX_COURIER_ENABLED=true is not allowed/],
    ];
    for (const [patch, msg] of bad) expect(() => parseConfig({ ...PROD_ENV, ...patch }), JSON.stringify(patch)).toThrow(msg);
    // explicit false is fine, and the memory-storage driver is already refused elsewhere
    expect(parseConfig({ ...PROD_ENV, MOCK_MARKETPLACE_ENABLED: 'false', SANDBOX_COURIER_ENABLED: 'false' }).isProd).toBe(true);
    // staging keeps its rehearsal conveniences: sandbox connectors allowed, SMTP/Redis not enforced
    const { SMTP_URL: _s, EMAIL_FROM: _e, ...rest } = PROD_ENV;
    expect(parseConfig({ ...rest, NODE_ENV: 'staging', SANDBOX_COURIER_ENABLED: 'true', MOCK_MARKETPLACE_ENABLED: 'true', REDIS_URL: 'redis://localhost:6379' }).sandboxCourierEnabled).toBe(true);
  });
  it('splits CORS origins', () => {
    expect(parseConfig({ ...TEST_ENV, CORS_ORIGINS: 'https://a.com, https://b.com' }).CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });
});
