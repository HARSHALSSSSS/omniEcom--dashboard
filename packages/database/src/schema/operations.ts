import { sql } from 'drizzle-orm';
import { boolean, char, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { deletedAt, inList, minor, pk, tenantId, timestamps, tz, version } from './_helpers';
import { vendors } from './identity';
import { productVariants } from './catalog';
import { marketplaceAccounts, marketplaceListings } from './marketplace';

export const WAREHOUSE_STATUSES = ['active', 'inactive'] as const;
export const ORDER_STATUSES = ['new', 'confirmed', 'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'returned'] as const;
export const ORDER_ITEM_STATUSES = ['new', 'allocated', 'shipped', 'delivered', 'cancelled', 'returned'] as const;

export const warehouses = pgTable('warehouses', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  address: jsonb('address').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('active'),
  isDefault: boolean('is_default').notNull().default(false),
  priority: integer('priority').notNull().default(100),
  version: version(),
  ...timestamps(),
  deletedAt: deletedAt(),
}, (t) => [
  unique('warehouses_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('warehouses_vendor_code_uq').on(t.vendorId, t.code).where(sql`${t.deletedAt} IS NULL`),
  uniqueIndex('warehouses_default_uq').on(t.vendorId).where(sql`${t.isDefault} AND ${t.deletedAt} IS NULL`),
  check('warehouses_status_chk', inList('status', WAREHOUSE_STATUSES)),
]);

/** Current stock per (variant, warehouse). Movement ledger arrives with the Inventory module (Stage 3). */
export const inventory = pgTable('inventory', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull(),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  quantityReserved: integer('quantity_reserved').notNull().default(0),
  reorderLevel: integer('reorder_level'),
  version: version(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('inventory_variant_warehouse_uq').on(t.vendorId, t.variantId, t.warehouseId),
  index('inventory_vendor_warehouse_idx').on(t.vendorId, t.warehouseId),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'inventory_variant_fk' }),
  foreignKey({ columns: [t.vendorId, t.warehouseId], foreignColumns: [warehouses.vendorId, warehouses.id], name: 'inventory_warehouse_fk' }),
  check('inventory_qty_chk', sql`quantity_on_hand >= 0 AND quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand`),
]);

/** One normalised order per marketplace order. (marketplace_account_id, external_order_id) is the ingestion idempotency key. */
export const orders = pgTable('orders', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  marketplaceAccountId: uuid('marketplace_account_id').notNull(),
  externalOrderId: text('external_order_id').notNull(),
  /** human-friendly internal number, assigned per vendor */
  orderNumber: text('order_number').notNull(),
  status: text('status').notNull().default('new'),
  placedAt: tz('placed_at').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  subtotalMinor: minor('subtotal_minor').notNull().default(0),
  taxMinor: minor('tax_minor').notNull().default(0),
  shippingMinor: minor('shipping_minor').notNull().default(0),
  discountMinor: minor('discount_minor').notNull().default(0),
  totalMinor: minor('total_minor').notNull().default(0),
  /** buyer PII: encrypted at the application layer where marketplace policy requires it */
  buyer: jsonb('buyer').$type<Record<string, unknown>>().notNull().default({}),
  shippingAddress: jsonb('shipping_address').$type<Record<string, unknown>>().notNull().default({}),
  /** original marketplace payload, kept for audit/reprocessing */
  rawPayload: jsonb('raw_payload'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('orders_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('orders_account_external_uq').on(t.marketplaceAccountId, t.externalOrderId),
  uniqueIndex('orders_vendor_number_uq').on(t.vendorId, t.orderNumber),
  index('orders_vendor_status_placed_idx').on(t.vendorId, t.status, t.placedAt.desc(), t.id),
  index('orders_vendor_placed_idx').on(t.vendorId, t.placedAt.desc(), t.id),
  foreignKey({ columns: [t.vendorId, t.marketplaceAccountId], foreignColumns: [marketplaceAccounts.vendorId, marketplaceAccounts.id], name: 'orders_account_fk' }),
  check('orders_status_chk', inList('status', ORDER_STATUSES)),
]);

export const orderItems = pgTable('order_items', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull(),
  externalItemId: text('external_item_id').notNull(),
  variantId: uuid('variant_id'),
  listingId: uuid('listing_id'),
  sku: text('sku').notNull(),
  title: text('title').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceMinor: minor('unit_price_minor').notNull(),
  taxMinor: minor('tax_minor').notNull().default(0),
  discountMinor: minor('discount_minor').notNull().default(0),
  status: text('status').notNull().default('new'),
  ...timestamps(),
}, (t) => [
  uniqueIndex('order_items_order_external_uq').on(t.orderId, t.externalItemId),
  index('order_items_vendor_order_idx').on(t.vendorId, t.orderId),
  index('order_items_vendor_variant_idx').on(t.vendorId, t.variantId),
  foreignKey({ columns: [t.vendorId, t.orderId], foreignColumns: [orders.vendorId, orders.id], name: 'order_items_order_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'order_items_variant_fk' }),
  foreignKey({ columns: [t.vendorId, t.listingId], foreignColumns: [marketplaceListings.vendorId, marketplaceListings.id], name: 'order_items_listing_fk' }),
  check('order_items_qty_chk', sql`quantity > 0`),
  check('order_items_status_chk', inList('status', ORDER_ITEM_STATUSES)),
]);
