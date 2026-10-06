import { describe, expect, it } from 'vitest';
import { parseConfig } from '@oms/config';
import { TEST_ENV } from '@oms/testing';

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
    const { SWAGGER_ENABLED: _omit, ...rest } = TEST_ENV;
    expect(parseConfig({ ...rest, NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
    expect(parseConfig({ ...rest, NODE_ENV: 'staging' }).swaggerEnabled).toBe(true);
    expect(parseConfig({ ...rest, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled).toBe(true);
  });
  it('splits CORS origins', () => {
    expect(parseConfig({ ...TEST_ENV, CORS_ORIGINS: 'https://a.com, https://b.com' }).CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });
});
