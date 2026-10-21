import { sql } from 'drizzle-orm';
import { bigint, boolean, char, check, date, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { deletedAt, inList, minor, pk, tenantId, timestamps, tz, version } from './_helpers';
import { vendors } from './identity';
import { productVariants } from './catalog';
import { warehouses } from './operations';
import { marketplaceAccounts } from './marketplace';

/**
 * Backend readiness for the frontend screens: promotions, procurement, price proposals, reports, GST registry,
 * product import sessions, AI conversations and marketing spend. Modules own their tables (see scripts/scaffold-modules.mjs).
 */

// ---------------------------------------------------------------- GST registry (settings: multi-state GSTIN)
export const GSTIN_STATUSES = ['active', 'inactive', 'cancelled'] as const;
/** One GST registration of the business per state (the vendor's `gstin` stays as the primary mirror). */
export const vendorGstins = pgTable('vendor_gstins', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  gstin: text('gstin').notNull(),
  /** first two digits of the GSTIN */
  stateCode: char('state_code', { length: 2 }).notNull(),
  stateName: text('state_name').notNull(),
  legalName: text('legal_name'),
  tradeName: text('trade_name'),
  address: jsonb('address').$type<Record<string, unknown>>().notNull().default({}),
  isPrimary: boolean('is_primary').notNull().default(false),
  status: text('status').notNull().default('active'),
  verifiedAt: tz('verified_at'),
  notes: text('notes'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('vendor_gstins_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('vendor_gstins_gstin_uq').on(t.vendorId, t.gstin),
  uniqueIndex('vendor_gstins_primary_uq').on(t.vendorId).where(sql`${t.isPrimary}`),
  index('vendor_gstins_vendor_idx').on(t.vendorId, t.stateCode),
  check('vendor_gstins_status_chk', inList('status', GSTIN_STATUSES)),
  check('vendor_gstins_format_chk', sql`gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
]);

// ---------------------------------------------------------------- procurement
export const SUPPLIER_STATUSES = ['active', 'inactive', 'blocked'] as const;
export const PURCHASE_ORDER_STATUSES = ['draft', 'submitted', 'acknowledged', 'partially_received', 'received', 'cancelled'] as const;

export const suppliers = pgTable('suppliers', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  email: text('email'),
  phone: text('phone'),
  gstin: text('gstin'),
  city: text('city'),
  state: text('state'),
  address: jsonb('address').$type<Record<string, unknown>>().notNull().default({}),
  paymentTerms: text('payment_terms'),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  status: text('status').notNull().default('active'),
  notes: text('notes'),
  version: version(),
  ...timestamps(),
  deletedAt: deletedAt(),
}, (t) => [
  unique('suppliers_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('suppliers_code_uq').on(t.vendorId, sql`lower(${t.code})`).where(sql`${t.deletedAt} IS NULL`),
  index('suppliers_vendor_status_idx').on(t.vendorId, t.status, t.name),
  check('suppliers_status_chk', inList('status', SUPPLIER_STATUSES)),
  check('suppliers_lead_time_chk', sql`lead_time_days >= 0 AND lead_time_days <= 365`),
]);

/** What a supplier sells us: the cost and lead time per variant (drives reorder suggestions and PO defaults). */
export const supplierProducts = pgTable('supplier_products', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  supplierSku: text('supplier_sku'),
  costMinor: minor('cost_minor').notNull(),
  leadTimeDays: integer('lead_time_days'),
  minOrderQuantity: integer('min_order_quantity').notNull().default(1),
  isPreferred: boolean('is_preferred').notNull().default(false),
  ...timestamps(),
}, (t) => [
  uniqueIndex('supplier_products_uq').on(t.supplierId, t.variantId),
  index('supplier_products_variant_idx').on(t.vendorId, t.variantId),
  foreignKey({ columns: [t.vendorId, t.supplierId], foreignColumns: [suppliers.vendorId, suppliers.id], name: 'supplier_products_supplier_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'supplier_products_variant_fk' }),
  check('supplier_products_cost_chk', sql`cost_minor >= 0 AND min_order_quantity >= 1`),
]);

export const purchaseOrders = pgTable('purchase_orders', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  poNumber: text('po_number').notNull(),
  supplierId: uuid('supplier_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull(),
  status: text('status').notNull().default('draft'),
  orderDate: tz('order_date').notNull().defaultNow(),
  expectedAt: tz('expected_at'),
  submittedAt: tz('submitted_at'),
  acknowledgedAt: tz('acknowledged_at'),
  receivedAt: tz('received_at'),
  cancelledAt: tz('cancelled_at'),
  cancelReason: text('cancel_reason'),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  subtotalMinor: minor('subtotal_minor').notNull().default(0),
  taxMinor: minor('tax_minor').notNull().default(0),
  shippingMinor: minor('shipping_minor').notNull().default(0),
  totalMinor: minor('total_minor').notNull().default(0),
  paymentTerms: text('payment_terms'),
  reference: text('reference'),
  notes: text('notes'),
  approvedBy: uuid('approved_by'),
  approvedAt: tz('approved_at'),
  createdBy: uuid('created_by'),
  /** the inbound shipment that carries the expected stock into inventory (`incoming`) once the PO is submitted */
  inboundId: uuid('inbound_id'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('purchase_orders_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('purchase_orders_number_uq').on(t.vendorId, t.poNumber),
  index('purchase_orders_vendor_status_idx').on(t.vendorId, t.status, t.createdAt.desc()),
  index('purchase_orders_supplier_idx').on(t.vendorId, t.supplierId),
  foreignKey({ columns: [t.vendorId, t.supplierId], foreignColumns: [suppliers.vendorId, suppliers.id], name: 'purchase_orders_supplier_fk' }),
  foreignKey({ columns: [t.vendorId, t.warehouseId], foreignColumns: [warehouses.vendorId, warehouses.id], name: 'purchase_orders_warehouse_fk' }),
  check('purchase_orders_status_chk', inList('status', PURCHASE_ORDER_STATUSES)),
  check('purchase_orders_amounts_chk', sql`subtotal_minor >= 0 AND tax_minor >= 0 AND shipping_minor >= 0 AND total_minor >= 0`),
]);

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  purchaseOrderId: uuid('purchase_order_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  sku: text('sku').notNull(),
  title: text('title').notNull(),
  quantityOrdered: integer('quantity_ordered').notNull(),
  quantityReceived: integer('quantity_received').notNull().default(0),
  quantityDamaged: integer('quantity_damaged').notNull().default(0),
  unitCostMinor: minor('unit_cost_minor').notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  totalMinor: minor('total_minor').notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('purchase_order_lines_uq').on(t.purchaseOrderId, t.variantId),
  index('purchase_order_lines_vendor_idx').on(t.vendorId, t.purchaseOrderId),
  index('purchase_order_lines_variant_idx').on(t.vendorId, t.variantId),
  foreignKey({ columns: [t.vendorId, t.purchaseOrderId], foreignColumns: [purchaseOrders.vendorId, purchaseOrders.id], name: 'purchase_order_lines_po_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'purchase_order_lines_variant_fk' }),
  check('purchase_order_lines_qty_chk', sql`quantity_ordered > 0 AND quantity_received >= 0 AND quantity_damaged >= 0 AND quantity_damaged <= quantity_received AND unit_cost_minor >= 0 AND total_minor >= 0 AND tax_rate_bps >= 0`),
]);

/** One goods-receipt event of a purchase order (a PO can be received in several parts). */
export const purchaseOrderReceipts = pgTable('purchase_order_receipts', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  purchaseOrderId: uuid('purchase_order_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull(),
  receivedBy: uuid('received_by'),
  receivedAt: tz('received_at').notNull().defaultNow(),
  note: text('note'),
  items: jsonb('items').$type<Array<{ lineId: string; variantId: string; received: number; damaged: number }>>().notNull().default([]),
  ...timestamps(),
}, (t) => [
  index('purchase_order_receipts_po_idx').on(t.vendorId, t.purchaseOrderId, t.receivedAt.desc()),
  foreignKey({ columns: [t.vendorId, t.purchaseOrderId], foreignColumns: [purchaseOrders.vendorId, purchaseOrders.id], name: 'purchase_order_receipts_po_fk' }).onDelete('cascade'),
]);

// ---------------------------------------------------------------- pricing: policies, competitor prices, proposals
export const PRICING_STRATEGIES = ['automated_match', 'margin_floor', 'velocity_boost', 'custom'] as const;
export const PRICE_PROPOSAL_STATUSES = ['pending_review', 'approved', 'rejected', 'auto_applied', 'expired', 'superseded', 'failed'] as const;

export const pricingPolicies = pgTable('pricing_policies', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** null = every connected account */
  accountId: uuid('account_id'),
  strategy: text('strategy').notNull(),
  /** never propose a price whose margin would fall under this */
  targetMarginMinBps: integer('target_margin_min_bps').notNull().default(0),
  /** never propose a price more than this far under the current price */
  maxDiscountBps: integer('max_discount_bps').notNull().default(0),
  /** proposals that move the price by less than this are applied without review */
  autoApproveUnderBps: integer('auto_approve_under_bps').notNull().default(0),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('active'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('pricing_policies_vendor_id_id_uq').on(t.vendorId, t.id),
  index('pricing_policies_vendor_idx').on(t.vendorId, t.status),
  foreignKey({ columns: [t.vendorId, t.accountId], foreignColumns: [marketplaceAccounts.vendorId, marketplaceAccounts.id], name: 'pricing_policies_account_fk' }).onDelete('cascade'),
  check('pricing_policies_strategy_chk', inList('strategy', PRICING_STRATEGIES)),
  check('pricing_policies_status_chk', inList('status', ['active', 'paused'])),
  check('pricing_policies_bps_chk', sql`target_margin_min_bps BETWEEN 0 AND 10000 AND max_discount_bps BETWEEN 0 AND 10000 AND auto_approve_under_bps BETWEEN 0 AND 10000`),
]);

/** Competitor / Buy Box price observations entered by the seller (manual or CSV import). The platform does not scrape. */
export const competitorPrices = pgTable('competitor_prices', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull(),
  accountId: uuid('account_id'),
  priceMinor: minor('price_minor').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  sellerName: text('seller_name'),
  source: text('source').notNull().default('manual'),
  observedAt: tz('observed_at').notNull().defaultNow(),
  ...timestamps(),
}, (t) => [
  index('competitor_prices_variant_idx').on(t.vendorId, t.variantId, t.observedAt.desc()),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'competitor_prices_variant_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.vendorId, t.accountId], foreignColumns: [marketplaceAccounts.vendorId, marketplaceAccounts.id], name: 'competitor_prices_account_fk' }).onDelete('cascade'),
  check('competitor_prices_source_chk', inList('source', ['manual', 'import', 'api'])),
  check('competitor_prices_price_chk', sql`price_minor > 0`),
]);

export const pricingProposals = pgTable('price_proposals', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull(),
  accountId: uuid('account_id').notNull(),
  policyId: uuid('policy_id'),
  strategy: text('strategy').notNull(),
  currentPriceMinor: minor('current_price_minor').notNull(),
  proposedPriceMinor: minor('proposed_price_minor').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  competitorPriceMinor: minor('competitor_price_minor'),
  estMarginDeltaBps: integer('est_margin_delta_bps'),
  projectedSalesDeltaBps: integer('projected_sales_delta_bps'),
  reasoning: text('reasoning').notNull(),
  status: text('status').notNull().default('pending_review'),
  expiresAt: tz('expires_at'),
  decidedBy: uuid('decided_by'),
  decidedAt: tz('decided_at'),
  decisionNote: text('decision_note'),
  appliedAt: tz('applied_at'),
  failureMessage: text('failure_message'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('price_proposals_vendor_id_id_uq').on(t.vendorId, t.id),
  index('price_proposals_vendor_status_idx').on(t.vendorId, t.status, t.createdAt.desc()),
  index('price_proposals_variant_idx').on(t.vendorId, t.variantId, t.accountId),
  uniqueIndex('price_proposals_open_uq').on(t.vendorId, t.variantId, t.accountId).where(sql`${t.status} = 'pending_review'`),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'price_proposals_variant_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.vendorId, t.accountId], foreignColumns: [marketplaceAccounts.vendorId, marketplaceAccounts.id], name: 'price_proposals_account_fk' }).onDelete('cascade'),
  check('price_proposals_status_chk', inList('status', PRICE_PROPOSAL_STATUSES)),
  check('price_proposals_strategy_chk', inList('strategy', PRICING_STRATEGIES)),
  check('price_proposals_price_chk', sql`current_price_minor > 0 AND proposed_price_minor > 0`),
]);

// ---------------------------------------------------------------- promotions
export const PROMOTION_TYPES = ['percentage_discount', 'flat_discount', 'bogo', 'bundle'] as const;
export const PROMOTION_STATUSES = ['draft', 'scheduled', 'active', 'ended', 'cancelled'] as const;
export const PROMOTION_ITEM_STATUSES = ['eligible', 'pending_sync', 'live', 'ineligible', 'ended'] as const;

export const promotionCampaigns = pgTable('promotion_campaigns', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  /** percentage_discount: basis points (1500 = 15 %) */
  valueBps: integer('value_bps'),
  /** flat_discount: minor units off the price */
  valueMinor: minor('value_minor'),
  /** bogo: buy X get Y */
  buyQuantity: integer('buy_quantity'),
  getQuantity: integer('get_quantity'),
  minOrderMinor: minor('min_order_minor').notNull().default(0),
  budgetMinor: minor('budget_minor').notNull().default(0),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  status: text('status').notNull().default('draft'),
  startsAt: tz('starts_at'),
  endsAt: tz('ends_at'),
  /** marketplace accounts the campaign runs on; empty = every connected account */
  accountIds: jsonb('account_ids').$type<string[]>().notNull().default([]),
  /** results are computed from orders in the campaign window and cached here */
  spendMinor: minor('spend_minor').notNull().default(0),
  revenueMinor: minor('revenue_minor').notNull().default(0),
  unitsMoved: integer('units_moved').notNull().default(0),
  ordersCount: integer('orders_count').notNull().default(0),
  statsUpdatedAt: tz('stats_updated_at'),
  createdBy: uuid('created_by'),
  version: version(),
  ...timestamps(),
  deletedAt: deletedAt(),
}, (t) => [
  unique('promotion_campaigns_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('promotion_campaigns_code_uq').on(t.vendorId, sql`lower(${t.code})`).where(sql`${t.deletedAt} IS NULL`),
  index('promotion_campaigns_vendor_status_idx').on(t.vendorId, t.status, t.startsAt),
  check('promotion_campaigns_type_chk', inList('type', PROMOTION_TYPES)),
  check('promotion_campaigns_status_chk', inList('status', PROMOTION_STATUSES)),
  check('promotion_campaigns_window_chk', sql`starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at`),
  check('promotion_campaigns_amounts_chk', sql`min_order_minor >= 0 AND budget_minor >= 0 AND spend_minor >= 0 AND revenue_minor >= 0 AND units_moved >= 0 AND orders_count >= 0`),
]);

export const promotionItems = pgTable('promotion_items', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  originalPriceMinor: minor('original_price_minor').notNull(),
  promoPriceMinor: minor('promo_price_minor').notNull(),
  status: text('status').notNull().default('eligible'),
  reason: text('reason'),
  lastSyncedAt: tz('last_synced_at'),
  ...timestamps(),
}, (t) => [
  uniqueIndex('promotion_items_uq').on(t.campaignId, t.variantId),
  index('promotion_items_variant_idx').on(t.vendorId, t.variantId),
  foreignKey({ columns: [t.vendorId, t.campaignId], foreignColumns: [promotionCampaigns.vendorId, promotionCampaigns.id], name: 'promotion_items_campaign_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.vendorId, t.variantId], foreignColumns: [productVariants.vendorId, productVariants.id], name: 'promotion_items_variant_fk' }),
  check('promotion_items_status_chk', inList('status', PROMOTION_ITEM_STATUSES)),
  check('promotion_items_price_chk', sql`original_price_minor > 0 AND promo_price_minor > 0 AND promo_price_minor <= original_price_minor`),
]);

// ---------------------------------------------------------------- reports
export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export const REPORT_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export const REPORT_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;

export const reportSchedules = pgTable('report_schedules', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  reportType: text('report_type').notNull(),
  format: text('format').notNull().default('csv'),
  frequency: text('frequency').notNull(),
  /** 0 = Sunday .. 6 */
  dayOfWeek: integer('day_of_week'),
  dayOfMonth: integer('day_of_month'),
  timeOfDay: text('time_of_day').notNull().default('06:00'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  recipients: jsonb('recipients').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('active'),
  lastRunAt: tz('last_run_at'),
  lastRunStatus: text('last_run_status'),
  nextRunAt: tz('next_run_at'),
  createdBy: uuid('created_by'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('report_schedules_vendor_id_id_uq').on(t.vendorId, t.id),
  index('report_schedules_vendor_idx').on(t.vendorId, t.status),
  index('report_schedules_due_idx').on(t.nextRunAt).where(sql`${t.status} = 'active'`),
  check('report_schedules_format_chk', inList('format', REPORT_FORMATS)),
  check('report_schedules_frequency_chk', inList('frequency', REPORT_FREQUENCIES)),
  check('report_schedules_status_chk', inList('status', ['active', 'paused'])),
]);

export const reportRuns = pgTable('report_runs', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  scheduleId: uuid('schedule_id'),
  reportType: text('report_type').notNull(),
  format: text('format').notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('queued'),
  trigger: text('trigger').notNull().default('manual'),
  fileKey: text('file_key'),
  fileName: text('file_name'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  rowCount: integer('row_count'),
  error: text('error'),
  requestedBy: uuid('requested_by'),
  startedAt: tz('started_at'),
  finishedAt: tz('finished_at'),
  expiresAt: tz('expires_at'),
  ...timestamps(),
}, (t) => [
  unique('report_runs_vendor_id_id_uq').on(t.vendorId, t.id),
  index('report_runs_vendor_idx').on(t.vendorId, t.createdAt.desc()),
  index('report_runs_schedule_idx').on(t.vendorId, t.scheduleId, t.createdAt.desc()),
  foreignKey({ columns: [t.vendorId, t.scheduleId], foreignColumns: [reportSchedules.vendorId, reportSchedules.id], name: 'report_runs_schedule_fk' }).onDelete('set null'),
  check('report_runs_status_chk', inList('status', REPORT_RUN_STATUSES)),
  check('report_runs_format_chk', inList('format', REPORT_FORMATS)),
  check('report_runs_trigger_chk', inList('trigger', ['manual', 'schedule'])),
]);

// ---------------------------------------------------------------- product import wizard
export const IMPORT_SOURCES = ['csv', 'xlsx', 'tsv', 'shopify', 'amazon', 'flipkart', 'marketplace', 'erp'] as const;
export const IMPORT_SESSION_STATUSES = ['created', 'uploaded', 'analyzed', 'validating', 'validated', 'committing', 'committed', 'partially_committed', 'failed', 'cancelled'] as const;
export const IMPORT_ROW_STATUSES = ['pending', 'valid', 'warning', 'error', 'ignored', 'committed', 'skipped'] as const;
export const IMPORT_ISSUE_STATUSES = ['open', 'resolved', 'ignored'] as const;

export const importSessions = pgTable('import_sessions', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  source: text('source').notNull().default('csv'),
  fileName: text('file_name'),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
  inputKey: text('input_key'),
  status: text('status').notNull().default('created'),
  /** detected header row of the uploaded file */
  headers: jsonb('headers').$type<string[]>().notNull().default([]),
  /** target field -> source header chosen by the seller (or auto-detected) */
  mapping: jsonb('mapping').$type<Record<string, string | null>>().notNull().default({}),
  /** duplicateStrategy, assignAllChannels, accountIds, autoPublish, warehouseId, ... */
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  rowCount: integer('row_count').notNull().default(0),
  validRows: integer('valid_rows').notNull().default(0),
  warningRows: integer('warning_rows').notNull().default(0),
  errorRows: integer('error_rows').notNull().default(0),
  ignoredRows: integer('ignored_rows').notNull().default(0),
  committedRows: integer('committed_rows').notNull().default(0),
  processedRows: integer('processed_rows').notNull().default(0),
  stats: jsonb('stats').$type<Record<string, number>>().notNull().default({}),
  failureMessage: text('failure_message'),
  requestedBy: uuid('requested_by'),
  startedAt: tz('started_at'),
  finishedAt: tz('finished_at'),
  version: version(),
  ...timestamps(),
}, (t) => [
  unique('import_sessions_vendor_id_id_uq').on(t.vendorId, t.id),
  index('import_sessions_vendor_idx').on(t.vendorId, t.createdAt.desc()),
  check('import_sessions_source_chk', inList('source', IMPORT_SOURCES)),
  check('import_sessions_status_chk', inList('status', IMPORT_SESSION_STATUSES)),
]);

export const importRows = pgTable('import_rows', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  rowNumber: integer('row_number').notNull(),
  raw: jsonb('raw').$type<Record<string, string>>().notNull().default({}),
  /** normalised values after mapping and cleaning */
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('pending'),
  issueCount: integer('issue_count').notNull().default(0),
  productCode: text('product_code'),
  sku: text('sku'),
  productId: uuid('product_id'),
  variantId: uuid('variant_id'),
  ...timestamps(),
}, (t) => [
  uniqueIndex('import_rows_uq').on(t.sessionId, t.rowNumber),
  index('import_rows_status_idx').on(t.vendorId, t.sessionId, t.status),
  foreignKey({ columns: [t.vendorId, t.sessionId], foreignColumns: [importSessions.vendorId, importSessions.id], name: 'import_rows_session_fk' }).onDelete('cascade'),
  check('import_rows_status_chk', inList('status', IMPORT_ROW_STATUSES)),
]);

export const importIssues = pgTable('import_issues', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  rowNumber: integer('row_number').notNull(),
  /** missing_sku, category_unmapped, invalid_image, duplicate_barcode, pricing_invalid, duplicate_sku, ... */
  code: text('code').notNull(),
  severity: text('severity').notNull().default('error'),
  field: text('field'),
  message: text('message').notNull(),
  value: text('value'),
  /** proposed fix: { kind: 'set_value' | 'map_category' | 'skip_row', value?, label? } */
  suggestion: jsonb('suggestion').$type<Record<string, unknown> | null>(),
  status: text('status').notNull().default('open'),
  resolution: jsonb('resolution').$type<Record<string, unknown> | null>(),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: tz('resolved_at'),
  ...timestamps(),
}, (t) => [
  index('import_issues_session_idx').on(t.vendorId, t.sessionId, t.status, t.rowNumber),
  index('import_issues_code_idx').on(t.vendorId, t.sessionId, t.code),
  foreignKey({ columns: [t.vendorId, t.sessionId], foreignColumns: [importSessions.vendorId, importSessions.id], name: 'import_issues_session_fk' }).onDelete('cascade'),
  check('import_issues_severity_chk', inList('severity', ['error', 'warning'])),
  check('import_issues_status_chk', inList('status', IMPORT_ISSUE_STATUSES)),
]);

// ---------------------------------------------------------------- AI assistant conversations
export const aiConversations = pgTable('ai_conversations', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull().default('active'),
  messageCount: integer('message_count').notNull().default(0),
  lastMessageAt: tz('last_message_at'),
  ...timestamps(),
}, (t) => [
  unique('ai_conversations_vendor_id_id_uq').on(t.vendorId, t.id),
  index('ai_conversations_user_idx').on(t.vendorId, t.userId, t.lastMessageAt.desc()),
  check('ai_conversations_status_chk', inList('status', ['active', 'archived'])),
]);

export const aiMessages = pgTable('ai_messages', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  intent: text('intent'),
  confidence: text('confidence'),
  generatedBy: text('generated_by'),
  /** structured answer data, sources and suggested actions for the UI cards */
  data: jsonb('data').$type<unknown>(),
  sources: jsonb('sources').$type<unknown[]>().notNull().default([]),
  suggestedActions: jsonb('suggested_actions').$type<Array<Record<string, unknown>>>().notNull().default([]),
  ...timestamps(),
}, (t) => [
  index('ai_messages_conversation_idx').on(t.vendorId, t.conversationId, t.createdAt),
  foreignKey({ columns: [t.vendorId, t.conversationId], foreignColumns: [aiConversations.vendorId, aiConversations.id], name: 'ai_messages_conversation_fk' }).onDelete('cascade'),
  check('ai_messages_role_chk', inList('role', ['user', 'assistant'])),
]);

// ---------------------------------------------------------------- marketing spend (advertising cost for profitability)
export const marketingSpend = pgTable('marketing_spend', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id'),
  spendDate: date('spend_date', { mode: 'string' }).notNull(),
  amountMinor: minor('amount_minor').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  campaign: text('campaign'),
  source: text('source').notNull().default('manual'),
  notes: text('notes'),
  createdBy: uuid('created_by'),
  ...timestamps(),
}, (t) => [
  index('marketing_spend_vendor_date_idx').on(t.vendorId, t.spendDate.desc()),
  foreignKey({ columns: [t.vendorId, t.accountId], foreignColumns: [marketplaceAccounts.vendorId, marketplaceAccounts.id], name: 'marketing_spend_account_fk' }).onDelete('cascade'),
  check('marketing_spend_amount_chk', sql`amount_minor >= 0`),
  check('marketing_spend_source_chk', inList('source', ['manual', 'import', 'api'])),
]);
