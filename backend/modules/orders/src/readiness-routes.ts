import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, successEnvelope } from '@oms/contracts';
import { ok, opCtxFromRequest, requireVendor, vendorTx, audit } from '@oms/module-kit';
import { AppError } from '@oms/shared';
import { REASON_CODES } from './cancellations';
import { BULK_ORDER_MAX, bulkOrders, nextActions } from './read-models';

const Count = z.number().int();
const ActionSchema = z.object({
  key: z.string(), label: z.string(), kind: z.enum(['transition', 'cancel', 'allocate', 'fulfillment']), method: z.enum(['GET', 'POST']), href: z.string(), body: z.record(z.string(), z.unknown()).nullable(),
  enabled: z.boolean(), disabledReason: z.string().nullable().describe('permission_required | managed_by_fulfillment | ...'), message: z.string().nullable(),
  useInstead: z.object({ key: z.string(), href: z.string() }).nullable().describe('set when a manual step is refused because the warehouse flow owns it: call this instead'),
});

/** next-actions and bulk actions of the Orders screen (static `/orders/bulk` is registered before `/orders/:id`) */
export const orderReadinessRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Orders'];

  r.post('/orders/bulk', {
    config: { access: { permission: 'orders:write' } },
    schema: {
      tags: TAGS, summary: 'Bulk action on orders (confirm, cancel, assign warehouse, mark priority)',
      description: `At most ${BULK_ORDER_MAX} orders. Each order is its own unit of work: the response is 200 with \`results[{ orderId, ok, changed, error? }]\` even when some fail. confirm = new -> confirmed (same rules as POST /orders/{id}/transition); cancel needs \`params.reason\` (releases stock, tells the marketplace); assign_warehouse needs \`params.warehouseId\` (only before warehouse work starts: moves the stock reservation and recomputes the SLA); mark_priority sets (default) or clears (\`params.priority=false\`) a priority flag, which shows as the \`priority\` attention reason.`,
      body: z.object({
        action: z.enum(['confirm', 'cancel', 'assign_warehouse', 'mark_priority']), ids: z.array(z.uuid()).min(1).max(BULK_ORDER_MAX),
        params: z.object({ reason: z.string().trim().min(2).max(300).optional(), reasonCode: z.enum(REASON_CODES).optional(), warehouseId: z.uuid().optional(), priority: z.boolean().optional() }).strict().default({}),
      }),
      response: { 200: successEnvelope(z.object({
        action: z.string(), total: Count, succeeded: Count, failed: Count,
        results: z.array(z.object({ orderId: z.string(), orderNumber: z.string().nullable(), ok: z.boolean(), changed: z.boolean(), status: z.string().nullable(), error: z.object({ code: z.string(), message: z.string(), rule: z.string().optional() }).optional() })),
      })) },
    },
  }, async (req) => {
    const { action, ids, params } = req.body;
    if (action === 'cancel' && !params.reason) throw new AppError('BAD_REQUEST', 'params.reason is required to cancel orders', { details: { rule: 'reason_required' } });
    if (action === 'assign_warehouse' && !params.warehouseId) throw new AppError('BAD_REQUEST', 'params.warehouseId is required to assign a warehouse', { details: { rule: 'warehouse_required' } });
    const vendorId = requireVendor(req);
    const res = await bulkOrders(opCtxFromRequest(req, vendorId), action, ids, params);
    await vendorTx(req, (tx) => audit(tx, req, { action: `order.bulk_${action}`, resourceType: 'order', after: { total: res.total, succeeded: res.succeeded, failed: res.failed } }));
    return ok(req, res);
  });

  r.get('/orders/:id/next-actions', {
    config: { access: { permission: 'orders:read' } },
    schema: {
      tags: TAGS, summary: 'Allowed next steps of an order',
      description: 'Every step the order may take from its status, each with `enabled` / `disabledReason`. Once a fulfillment exists the picking..delivered statuses follow the warehouse work: those manual steps are disabled with `managed_by_fulfillment` and `useInstead` points to the fulfillment. `primaryAction` is the key of the button the row should show.',
      params: IdParamSchema,
      response: { 200: successEnvelope(z.object({
        orderId: z.string(), orderNumber: z.string(), status: z.string(), version: Count, managedByFulfillment: z.boolean(),
        fulfillment: z.object({ id: z.string(), number: z.string(), status: z.string() }).nullable(), primaryAction: z.string().nullable(), actions: z.array(ActionSchema),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => nextActions(tx, vendorId, req.params.id, req.ctx.principal?.permissions.has('orders:write') ?? false))));
};
