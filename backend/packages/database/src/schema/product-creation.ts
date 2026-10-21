import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, jsonb, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { inList, pk, tenantId, timestamps, tz, version } from './_helpers';
import { vendors } from './identity';
import { products } from './catalog';

// ================================================================================================
// Product creation flow: wizard state, managed brands, AI description suggestions
// ================================================================================================

export const CREATION_STEPS = ['basic', 'variants', 'inventory', 'listings', 'channels'] as const;

/**
 * Wizard state of a product that is being created. One row per product; created with the draft. The step list mirrors the designed chain
 * Product -> Variants -> Inventory -> Listings -> Channels; "basic" is the first step ("Continue checks this step only").
 */
export const productCreation = pgTable('product_creation', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  currentStep: text('current_step').notNull().default('basic'),
  completedSteps: jsonb('completed_steps').$type<string[]>().notNull().default([]),
  /** true while the master SKU is the auto-generated DRAFT-xxxx code (the seller has not chosen one yet) */
  codeIsPlaceholder: boolean('code_is_placeholder').notNull().default(false),
  /** the master SKU the seller last had checked for uniqueness (sku-check / validate-step); readiness shows "verify" until it matches the code */
  skuVerifiedCode: text('sku_verified_code'),
  savedAt: tz('saved_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  version: version(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('product_creation_product_uq').on(t.vendorId, t.productId),
  foreignKey({ columns: [t.vendorId, t.productId], foreignColumns: [products.vendorId, products.id], name: 'product_creation_product_fk' }).onDelete('cascade'),
  check('product_creation_step_chk', inList('current_step', CREATION_STEPS)),
]);

/**
 * The business's brand list. A brand typed for the first time is unconfirmed ("Confirm" tag in the readiness panel); confirming it
 * (explicitly or by choosing it from the list again) makes it available as a known brand.
 */
export const brands = pgTable('brands', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** lower-cased, whitespace-collapsed name: case-insensitive uniqueness per business */
  nameKey: text('name_key').notNull(),
  confirmedAt: tz('confirmed_at'),
  createdBy: uuid('created_by'),
  ...timestamps(),
}, (t) => [
  unique('brands_vendor_id_id_uq').on(t.vendorId, t.id),
  uniqueIndex('brands_name_uq').on(t.vendorId, t.nameKey),
  check('brands_name_chk', sql`length(name) BETWEEN 1 AND 80`),
]);

export const AI_DESCRIPTION_MODES = ['rewrite', 'concise', 'benefits'] as const;
export const AI_SUGGESTION_STATUSES = ['suggested', 'applied', 'dismissed', 'expired'] as const;

/** A suggestion for the product description. Never applied automatically: the seller applies or dismisses it. */
export const productAiSuggestions = pgTable('product_ai_suggestions', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  mode: text('mode').notNull(),
  /** the description the suggestion was made from (empty when the seller had none) */
  sourceText: text('source_text').notNull().default(''),
  suggestionText: text('suggestion_text').notNull(),
  /** which product facts the text may use: ['name', 'category', 'brand', 'material', ...] */
  basis: jsonb('basis').$type<string[]>().notNull().default([]),
  /** true when benefits were requested but no verified facts exist, so the text stays generic */
  needsFacts: boolean('needs_facts').notNull().default(false),
  provider: text('provider').notNull().default('rules'),
  status: text('status').notNull().default('suggested'),
  decidedAt: tz('decided_at'),
  createdBy: uuid('created_by'),
  ...timestamps(),
}, (t) => [
  index('product_ai_suggestions_product_idx').on(t.vendorId, t.productId, t.createdAt.desc()),
  foreignKey({ columns: [t.vendorId, t.productId], foreignColumns: [products.vendorId, products.id], name: 'product_ai_suggestions_product_fk' }).onDelete('cascade'),
  check('product_ai_suggestions_mode_chk', inList('mode', AI_DESCRIPTION_MODES)),
  check('product_ai_suggestions_status_chk', inList('status', AI_SUGGESTION_STATUSES)),
]);
