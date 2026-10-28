import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Hosts that cannot pass `--build-arg APP=...` build the worker apps from their own Dockerfile
 * (backend/infrastructure/docker/<app>/Dockerfile). Each one must stay the main Dockerfile with only `ARG APP` preset.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), '../../infrastructure/docker');
const main = readFileSync(join(dir, 'Dockerfile'), 'utf8').replace(/\r\n/g, '\n');

describe('per-app Dockerfiles', () => {
  it('the main Dockerfile still builds `api` by default and declares APP in the build and runtime stages', () => {
    expect(main.match(/^ARG APP=api$/gm)).toHaveLength(2);
  });

  for (const app of ['worker', 'scheduler', 'webhook-worker']) {
    it(`${app} is the main Dockerfile with APP preset to ${app}`, () => {
      const variant = readFileSync(join(dir, app, 'Dockerfile'), 'utf8').replace(/\r\n/g, '\n');
      const expected = main.replace(/^ARG APP=api$/gm, `ARG APP=${app}`);
      expect(variant.endsWith(expected)).toBe(true);
      expect(variant.match(new RegExp(`^ARG APP=${app}$`, 'gm'))).toHaveLength(2);
      expect(variant).not.toMatch(/^ARG APP=api$/m);
    });
  }
});
