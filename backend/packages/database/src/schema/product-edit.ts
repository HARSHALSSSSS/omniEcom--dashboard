import { index, pgTable, text, foreignKey, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantId, timestamps, tz } from './_helpers';
import { vendors } from './identity';
import { products } from './catalog';

/** A seller dismissed a suggested improvement ("Dismiss" in the edit panel) for one product; it stays hidden until restored or until `until`. */
export const productInsightDismissals = pgTable('product_insight_dismissals', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  /** insight key, e.g. description_short */
  key: text('key').notNull(),
  dismissedBy: uuid('dismissed_by'),
  dismissedAt: tz('dismissed_at').notNull().defaultNow(),
  /** when set, the insight may reappear after this moment */
  until: tz('until'),
  ...timestamps(),
}, (t) => [
  uniqueIndex('product_insight_dismissals_uq').on(t.vendorId, t.productId, t.key),
  index('product_insight_dismissals_product_idx').on(t.vendorId, t.productId),
  foreignKey({ columns: [t.vendorId, t.productId], foreignColumns: [products.vendorId, products.id], name: 'product_insight_dismissals_product_fk' }).onDelete('cascade'),
]);
