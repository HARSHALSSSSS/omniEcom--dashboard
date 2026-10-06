import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, desc, eq, lt, schema } from '@oms/database';
import { decodeCursor, encodeCursor } from '@oms/shared';
import { IsoDate, PaginationQuerySchema, paginatedEnvelope } from '@oms/contracts';
import { paginated, scopedTx, requireScope } from '@oms/module-kit';
import { tenantWhere } from '@oms/database';

const AuditLogSchema = z
  .object({
    id: z.number().int(), vendorId: z.string().nullable(), actorType: z.string(), actorId: z.string().nullable(), onBehalfOfVendorId: z.string().nullable(),
    action: z.string(), resourceType: z.string().nullable(), resourceId: z.string().nullable(), requestId: z.string().nullable(),
    ip: z.string().nullable(), before: z.unknown().nullable(), after: z.unknown().nullable(), metadata: z.record(z.string(), z.unknown()), createdAt: IsoDate,
  })
  .meta({ id: 'AuditLog' });

const ListQuery = PaginationQuerySchema.extend({
  'filter[action]': z.string().max(100).optional().describe('Exact action, e.g. product.update'),
  'filter[resourceType]': z.string().max(60).optional(),
  'filter[resourceId]': z.string().max(100).optional(),
  'filter[actorId]': z.string().max(100).optional(),
});

/** Append-only audit trail. Vendors see their own tenant; platform staff see everything. */
export const auditRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const A = schema.auditLogs;

  r.get('/audit-logs', {
    config: { access: { permission: 'audit:read' } },
    schema: {
      tags: ['Audit'],
      summary: 'Audit trail (newest first)',
      description: 'Who did what, when, from where. Append-only and tenant-scoped; secrets are never recorded. Keyset pagination.',
      querystring: ListQuery,
      response: { 200: paginatedEnvelope(AuditLogSchema) },
    },
  }, async (req) => {
    const q = req.query;
    requireScope(req);
    const before = q.cursor ? Number(decodeCursor<[number]>(q.cursor)[0]) : undefined;
    const rows = await scopedTx(req, (tx, scope) =>
      tx
        .select()
        .from(A)
        .where(and(tenantWhere(A as never, scope), before ? lt(A.id, before) : undefined, q['filter[action]'] ? eq(A.action, q['filter[action]']) : undefined, q['filter[resourceType]'] ? eq(A.resourceType, q['filter[resourceType]']) : undefined, q['filter[resourceId]'] ? eq(A.resourceId, q['filter[resourceId]']) : undefined, q['filter[actorId]'] ? eq(A.actorId, q['filter[actorId]']) : undefined))
        .orderBy(desc(A.id))
        .limit(q.limit + 1),
    );
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((a) => ({
      id: a.id, vendorId: a.vendorId, actorType: a.actorType, actorId: a.actorId, onBehalfOfVendorId: a.onBehalfOfVendorId, action: a.action, resourceType: a.resourceType,
      resourceId: a.resourceId, requestId: a.requestId, ip: a.ip, before: a.before ?? null, after: a.after ?? null, metadata: a.metadata, createdAt: a.createdAt.toISOString(),
    }));
    return paginated(req, items, { limit: q.limit, nextCursor: hasMore ? encodeCursor([items[items.length - 1]!.id]) : null });
  });
};
