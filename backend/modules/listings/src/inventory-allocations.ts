import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq, inArray, schema, type Tx } from '@oms/database';
import { successEnvelope } from '@oms/contracts';
import { ok, vendorTx } from '@oms/module-kit';
import { availabilityFor } from '@oms/mod-inventory';
import { computeSellable, DEFAULT_POLICY, type ChannelPolicy } from './domain';
import { afterWorkspaceBuffer, stockDefaults } from './stock-defaults';

/**
 * Per variant: what each marketplace account may sell right now. This lives in listings because it needs both the channel policy
 * (allocation %, safety buffer, cap, warehouses) and the stock of the inventory module, which cannot depend on listings.
 * The number is the same one the inventory sync pushes: sellable = clamp(floor(available x allocation%) - buffer, 0, max).
 */
const L = schema.marketplaceListings;
const A = schema.marketplaceAccounts;
const POLICY = schema.channelInventoryPolicies;

export async function channelAllocations(tx: Tx, vendorId: string, variantIds: string[], nameOf: (code: string) => string) {
  const listings = variantIds.length
    ? await tx.select({ l: L, marketplace: A.marketplace, accountName: A.displayName }).from(L)
      .innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
      .where(and(eq(L.vendorId, vendorId), inArray(L.variantId, variantIds), eq(L.status, 'active'), eq(A.status, 'active')))
      .orderBy(A.createdAt)
    : [];
  const policies = new Map((await tx.select().from(POLICY).where(eq(POLICY.vendorId, vendorId))).map((p) => [p.marketplaceAccountId, p]));
  const total = await availabilityFor(tx, vendorId, variantIds);
  const byWarehouseSet = new Map<string, Map<string, number>>();
  const availableFor = async (variantId: string, warehouseIds: string[]): Promise<number> => {
    if (!warehouseIds.length) return total.get(variantId)?.available ?? 0;
    const key = warehouseIds.join(',');
    const cache = byWarehouseSet.get(key) ?? (byWarehouseSet.set(key, new Map(
      [...(await availabilityFor(tx, vendorId, variantIds, warehouseIds)).entries()].map(([id, a]) => [id, a.available]),
    )).get(key)!);
    return cache.get(variantId) ?? 0;
  };

  const sd = await stockDefaults(tx, vendorId);
  const items = [];
  for (const variantId of variantIds) {
    const channels = [];
    for (const { l, marketplace, accountName } of listings.filter((x) => x.l.variantId === variantId)) {
      const p = policies.get(l.marketplaceAccountId) ?? null;
      const policy: ChannelPolicy = p ? { mode: p.mode as ChannelPolicy['mode'], safetyBuffer: p.safetyBuffer, allocationPercent: p.allocationPercent, maxQuantity: p.maxQuantity } : DEFAULT_POLICY;
      const available = await availableFor(variantId, p?.warehouseIds ?? []);
      channels.push({
        channel: { code: marketplace, name: nameOf(marketplace), accountId: l.marketplaceAccountId, accountName }, listingId: l.id,
        allocated: computeSellable(afterWorkspaceBuffer(available, sd), policy, { buffer: l.bufferOverride, max: l.maxQuantityOverride }), pushed: l.pushedQuantity, dirty: l.quantityDirty,
        mode: policy.mode, allocationPercent: policy.allocationPercent, safetyBuffer: l.bufferOverride ?? policy.safetyBuffer, maxQuantity: l.maxQuantityOverride ?? policy.maxQuantity,
      });
    }
    const available = total.get(variantId)?.available ?? 0;
    const offered = Math.max(0, ...channels.map((c) => c.allocated));
    items.push({ variantId, available, channels, buffer: channels.length ? Math.max(0, available - offered) : null });
  }
  return items;
}

const Count = z.number().int();
export const inventoryAllocationRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/inventory/channel-allocations', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: ['Channel Inventory'], summary: 'Stock each marketplace account may sell, per variant',
      description: 'For every variant: `available` (all active warehouses) and one entry per ACTIVE listing with `allocated` = what that channel may sell now (same formula as the inventory sync: floor(available x allocation%) - safety buffer, capped). Channels share the same stock: they are not partitions, so the numbers can add up to more than `available`. `buffer` = units not offered to any channel (available minus the most generous channel); null when the variant has no active listing. Up to 100 ids, comma separated.',
      querystring: z.object({ variantIds: z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.uuid()).min(1).max(100)) }),
      response: { 200: successEnvelope(z.array(z.object({
        variantId: z.string(), available: Count, buffer: Count.nullable(),
        channels: z.array(z.object({
          channel: z.object({ code: z.string(), name: z.string(), accountId: z.string(), accountName: z.string() }), listingId: z.string(), allocated: Count, pushed: Count.nullable().describe('what the marketplace last confirmed'), dirty: z.boolean(),
          mode: z.enum(schema.CHANNEL_INVENTORY_MODES), allocationPercent: Count, safetyBuffer: Count, maxQuantity: Count.nullable(),
        })),
      }))) },
    },
  }, async (req) => {
    const nameOf = (code: string) => (app.container.connectors.has(code) ? app.container.connectors.get(code).displayName : code);
    return ok(req, await vendorTx(req, (tx, vendorId) => channelAllocations(tx, vendorId, [...new Set(req.query.variantIds)], nameOf)));
  });
};
