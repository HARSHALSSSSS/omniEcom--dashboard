import { and, eq, isNull, schema, sql, type Tx } from '@oms/database';
import type { Fx } from './ctx';

/**
 * A product whose listing went live is not a draft any more. Called in the same transaction that makes a listing active (publish,
 * marketplace status report, content sync): a DRAFT product of that variant becomes ACTIVE. Archived and already-active products are
 * never touched, and nothing is ever demoted automatically.
 */
export async function promoteProductOnLive(tx: Tx, vendorId: string, variantId: string, f: Fx): Promise<boolean> {
  const P = schema.products;
  const V = schema.productVariants;
  const [row] = await tx.update(P).set({ status: 'active', version: sql`${P.version} + 1` })
    .where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), eq(P.status, 'draft'), sql`${P.id} = (select ${V.productId} from ${V} where ${V.id} = ${variantId} and ${V.vendorId} = ${vendorId})`))
    .returning({ id: P.id, title: P.title, productCode: P.productCode });
  if (!row) return false;
  await f.event({ type: 'product.updated', aggregateType: 'product', aggregateId: row.id, payload: { fields: ['status'], reason: 'listing_live' } });
  await f.audit({ action: 'product.update', resourceType: 'product', resourceId: row.id, before: { title: row.title, status: 'draft', productCode: row.productCode }, after: { title: row.title, status: 'active', productCode: row.productCode }, metadata: { reason: 'listing_live' } });
  return true;
}
