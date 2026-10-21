import { sql } from 'drizzle-orm';
import { bigserial, boolean, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, inList, pk, tenantId, timestamps, tz, version } from './_helpers';
import { vendors } from './identity';
import { productVariants } from './catalog';
import { warehouses } from './operations';
import { returnOrders } from './returns-ops';

// ================================================================================================
// Dashboard workspace: issues ("Needs attention"), saved views, inventory groups, SLA policy, return inspections, shipping snapshots
// ================================================================================================

export const ISSUE_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const ISSUE_STATUSES = ['open', 'in_progress', 'snoozed', 'resolved'] as const;
export const ISSUE_AREAS = ['orders', 'inventory', 'listings', 'channels', 'returns', 'shipping', 'products'] as const;
export const ISSUE_EVENT_TYPES = ['detected', 'updated', 'started', 'snoozed', 'unsnoozed', 'resolved', 'reopened', 'assigned', 'auto_resolved', 'resolution_failed'] as const;

/**
 * One row per detected problem GROUP (e.g. "7 orders are at risk of missing dispatch"). A detector owns the row through
 * (vendor_id, key, scope_hash): it updates the same issue instead of creating a new one, auto-resolves it when the condition is gone
 * and reopens it when the condition returns.
 */
export const issues = pgTable('issues', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  /** detector code, e.g. orders_dispatch_risk */
  key: text('key').notNull(),
  /** distinguishes several issues of one detector (e.g. one per marketplace account); empty when there is only one */
  scopeHash: text('scope_hash').notNull().default(''),
  area: text('area').notNull(),
  priority: text('priority').notNull(),
  status: text('status').notNull().default('open'),
  title: text('title').notNull(),
  explanation: text('explanation').notNull().default(''),
  impact: text('impact'),
  /** how many records the issue covers */
  count: integer('count').notNull().default(0),
  /** first 50 affected records: [{ type, id, label }] */
  affected: jsonb('affected').$type<Array<{ type: string; id: string; label: string }>>().notNull().default([]),
  dueAt: tz('due_at'),
  /** { text, label, href } */
  recommendedAction: jsonb('recommended_action').$type<Record<string, unknown>>().notNull().default({}),
  /** detector-specific facts shown in the drawer: { whyItMatters, ... } */
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  firstSeenAt: tz('first_seen_at').notNull().defaultNow(),
  lastSeenAt: tz('last_seen_at').notNull().defaultNow(),
  snoozedUntil: tz('snoozed_until'),
  resolvedAt: tz('resolved_at'),
  resolvedBy: uuid('resolved_by'),
  resolution: text('resolution'),
  assignedTo: uuid('assigned_to'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('issues_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('issues_detector_uq').on(t.vendorId, t.key, t.scopeHash),
  index('issues_vendor_status_idx').on(t.vendorId, t.status, t.priority, t.dueAt),
  index('issues_vendor_area_idx').on(t.vendorId, t.area, t.status),
  check('issues_priority_chk', inList('priority', ISSUE_PRIORITIES)),
  check('issues_status_chk', inList('status', ISSUE_STATUSES)),
  check('issues_area_chk', inList('area', ISSUE_AREAS)),
  check('issues_count_chk', sql`count >= 0`),
]);

/** append-only history of one issue */
export const issueEvents = pgTable('issue_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  issueId: uuid('issue_id').notNull(),
  type: text('type').notNull(),
  actorType: text('actor_type').notNull().default('system'),
  actorId: text('actor_id'),
  note: text('note'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [
  index('issue_events_issue_idx').on(t.vendorId, t.issueId, t.id.desc()),
  foreignKey({ columns: [t.vendorId, t.issueId], foreignColumns: [issues.vendorId, issues.id], name: 'issue_events_issue_fk' }).onDelete('cascade'),
  check('issue_events_type_chk', inList('type', ISSUE_EVENT_TYPES)),
]);

export const VIEW_SCREENS = ['products', 'inventory', 'orders', 'returns'] as const;

/** Saved filters + sort of a list screen. Private to its creator unless `shared` ("available in this workspace"). */
export const savedViews = pgTable('saved_views', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  screen: text('screen').notNull(),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  sort: text('sort'),
  shared: boolean('shared').notNull().default(false),
  createdBy: uuid('created_by').notNull(),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('saved_views_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('saved_views_name_uq').on(t.vendorId, t.screen, t.createdBy, t.name),
  index('saved_views_vendor_screen_idx').on(t.vendorId, t.screen),
  check('saved_views_screen_chk', inList('screen', VIEW_SCREENS)),
]);

/** Static lists of variants ("Add to saved group" in the inventory ledger). */
export const inventoryGroups = pgTable('inventory_groups', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull(),
  ...timestamps(),
}, (t) => [
  unique('inventory_groups_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('inventory_groups_name_uq').on(t.vendorId, t.name),
]);

export const inventoryGroupItems = pgTable('inventory_group_items', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  createdAt: createdAt(),
}, (t) => [
  index('inventory_group_items_vendor_group_idx').on(t.vendorId, t.groupId),
  uniqueIndex('inventory_group_items_uq').on(t.groupId, t.variantId),
  foreignKey({ columns: [t.vendorId, t.groupId], foreignColumns: [inventoryGroups.vendorId, inventoryGroups.id], name: 'inventory_group_items_group_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'inventory_group_items_variant_fk' }).onDelete('cascade'),
]);

/**
 * Dispatch SLA policy: how long a marketplace (optionally per warehouse) gives the seller to hand an order to the courier.
 * Resolution order for an order: (marketplace + warehouse) -> (marketplace) -> business default (vendor settings, 24 h).
 * `cutoff_time` ("HH:MM", business time zone): orders placed after it count from the next working morning.
 */
export const marketplaceSla = pgTable('marketplace_sla', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  marketplace: text('marketplace').notNull(),
  warehouseId: uuid('warehouse_id'),
  handlingHours: integer('handling_hours').notNull().default(24),
  cutoffTime: text('cutoff_time'),
  ...timestamps(),
}, (t) => [
  uniqueIndex('marketplace_sla_uq').on(t.vendorId, t.marketplace, sql`coalesce(${t.warehouseId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
  foreignKey({ columns: [t.vendorId, t.warehouseId], foreignColumns: [warehouses.vendorId, warehouses.id], name: 'marketplace_sla_warehouse_fk' }).onDelete('cascade'),
  check('marketplace_sla_hours_chk', sql`handling_hours BETWEEN 1 AND 720`),
  check('marketplace_sla_cutoff_chk', sql`cutoff_time IS NULL OR cutoff_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
]);

export const INSPECTION_STATUSES = ['not_started', 'in_progress', 'passed', 'failed', 'requires_review'] as const;
export const INSPECTION_RESULTS = ['pass', 'fail', 'needs_review'] as const;

/** Append-only inspection records of a return (each save of the inspection form). */
export const returnInspections = pgTable('return_inspections', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  returnOrderId: uuid('return_order_id').notNull(),
  /** { packagingIntact, productUsable, accessoriesPresent, visibleDamage, productMismatch, missingQuantity, custom: [{ label, ok }] } */
  checklist: jsonb('checklist').$type<Record<string, unknown>>().notNull().default({}),
  result: text('result').notNull(),
  systemCondition: text('system_condition').notNull().default('receipt_matched'),
  note: text('note'),
  inspectorId: uuid('inspector_id'),
  createdAt: createdAt(),
}, (t) => [
  index('return_inspections_return_idx').on(t.vendorId, t.returnOrderId, t.createdAt.desc()),
  foreignKey({ columns: [t.vendorId, t.returnOrderId], foreignColumns: [returnOrders.vendorId, returnOrders.id], name: 'return_inspections_return_fk' }).onDelete('cascade'),
  check('return_inspections_result_chk', inList('result', INSPECTION_RESULTS)),
]);

/** Hourly counts of the shipping pipeline so the overview can say "+8 since last sync". */
export const shippingSnapshots = pgTable('shipping_snapshots', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  takenAt: tz('taken_at').notNull().defaultNow(),
  counts: jsonb('counts').$type<Record<string, number>>().notNull().default({}),
}, (t) => [
  index('shipping_snapshots_vendor_idx').on(t.vendorId, t.takenAt.desc()),
]);

export const SHIPPING_METHOD_KINDS = ['marketplace', 'seller', 'third_party'] as const;
export const SHIPPING_SELECTED_BY = ['rule', 'preference', 'manual'] as const;
