import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successEnvelope } from '@oms/contracts';
import { ok } from '@oms/module-kit';

/**
 * What the connect screen needs before anything is created: may this connector talk to the real marketplace yet, or only to
 * its sandbox? (`live: false` makes the host refuse live accounts, so the screen must say "Sandbox" instead of offering Live.)
 */
export const connIntRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;

  r.get('/marketplace-hub/connectors/:code/readiness', {
    config: { access: { permission: 'marketplace_accounts:read' } },
    schema: {
      tags: ['Marketplace Hub'],
      summary: 'Sandbox / live readiness of a connector',
      description: 'Whether the connector is verified against the real marketplace (`live`) or only runs against its sandbox, and the mode a new connection gets by default.',
      params: z.object({ code: z.string().min(2).max(40) }),
      response: { 200: successEnvelope(z.object({ code: z.string(), sandbox: z.boolean(), live: z.boolean(), notes: z.string(), defaultMode: z.enum(['live', 'sandbox']) })) },
    },
  }, async (req) => {
    const connector = c.connectors.get(req.params.code); // 404 for unknown / disabled connectors
    const { sandbox, live, notes } = connector.readiness;
    return ok(req, { code: connector.code, sandbox, live, notes, defaultMode: live ? 'live' as const : 'sandbox' as const });
  });
};
