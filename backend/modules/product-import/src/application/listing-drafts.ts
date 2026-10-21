import { and, eq, inArray, schema, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import type { Container } from '@oms/module-kit';
import * as listings from '@oms/mod-listings';
import type { ImportSettings } from '../domain/settings';


/** Draft listings (never published) of a new variant on the chosen marketplace accounts. Each account runs in a savepoint so one refusal does not undo the product. */
export async function draftListings(tx: Tx, c: Container, vendorId: string, variantId: string, settings: ImportSettings, actorId: string | null): Promise<{ created: number; notes: string[] }> {
  const A = schema.marketplaceAccounts;
  const accounts = await tx.select({ id: A.id, name: A.displayName }).from(A)
    .where(and(eq(A.vendorId, vendorId), eq(A.status, 'active'), settings.assignAllChannels ? undefined : inArray(A.id, settings.accountIds.length ? settings.accountIds : ['00000000-0000-0000-0000-000000000000'])));
  if (accounts.length === 0) return { created: 0, notes: ['No connected marketplace account to create drafts on'] };
  const ctx = listings.systemCtx(c, vendorId, actorId ?? 'product-import');
  let created = 0;
  const notes: string[] = [];
  for (const account of accounts) {
    try {
      await tx.transaction((sp) => listings.createListing(sp as unknown as Tx, ctx, { marketplaceAccountId: account.id, variantId }));
      created++;
    } catch (e) {
      if (e instanceof AppError && e.code === 'CONFLICT') continue; // already listed there
      notes.push(`${account.name}: ${e instanceof AppError ? e.message : 'draft listing failed'}`);
    }
  }
  return { created, notes };
}
