import { check, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { inList, pk, tenantId, timestamps, tz, version } from './_helpers';
import { vendors } from './identity';

// ================================================================================================
// Seller onboarding (guided setup) and fulfillment preferences
// ================================================================================================

export const ONBOARDING_STEPS = ['business', 'channels', 'products', 'inventory', 'fulfillment', 'ready'] as const;
export const ONBOARDING_STEP_STATUSES = ['not_started', 'in_progress', 'completed', 'skipped'] as const;
export const ONBOARDING_STATUSES = ['in_progress', 'completed'] as const;

export interface OnboardingStepState { status: (typeof ONBOARDING_STEP_STATUSES)[number]; updatedAt: string; completedAt?: string; skippedAt?: string }

/** One row per vendor: where the seller is in the guided setup. Created lazily on first read. */
export const onboardingProgress = pgTable('onboarding_progress', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('in_progress'),
  /** the step the seller should land on when they come back ("Save & exit" / resume) */
  currentStep: text('current_step').notNull().default('business'),
  steps: jsonb('steps').$type<Record<string, OnboardingStepState>>().notNull().default({}),
  /** unsaved form state per step ("Save & exit" before "Continue"); never holds secrets */
  drafts: jsonb('drafts').$type<Record<string, Record<string, unknown>>>().notNull().default({}),
  /** channel codes ticked on the "Where do you sell" screen (connected or not, including coming-soon channels = interest) */
  selectedChannels: jsonb('selected_channels').$type<string[]>().notNull().default([]),
  /** cached "products available" per marketplace account: { [accountId]: { count, capped, countedAt } } */
  catalogCounts: jsonb('catalog_counts').$type<Record<string, { count: number; capped: boolean; countedAt: string }>>().notNull().default({}),
  completedAt: tz('completed_at'),
  version: version(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('onboarding_progress_vendor_uq').on(t.vendorId),
  check('onboarding_progress_status_chk', inList('status', ONBOARDING_STATUSES)),
  check('onboarding_progress_step_chk', inList('current_step', ONBOARDING_STEPS)),
]);

export const FULFILLMENT_METHODS = ['marketplace', 'seller', 'third_party'] as const;
export const FULFILLMENT_PREFERENCES = ['recommended', 'fastest', 'lowest_cost', 'best_rated'] as const;

/** The seller's default way of shipping orders, plus per-marketplace overrides (read by routing/shipping when an order is fulfilled). */
export const fulfillmentPreferences = pgTable('fulfillment_preferences', {
  id: pk(),
  vendorId: tenantId().references(() => vendors.id, { onDelete: 'cascade' }),
  defaultMethod: text('default_method').notNull().default('marketplace'),
  defaultPreference: text('default_preference').notNull().default('recommended'),
  /** { [marketplace code]: method } */
  overrides: jsonb('overrides').$type<Record<string, string>>().notNull().default({}),
  version: version(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('fulfillment_preferences_vendor_uq').on(t.vendorId),
  check('fulfillment_preferences_method_chk', inList('default_method', FULFILLMENT_METHODS)),
  check('fulfillment_preferences_pref_chk', inList('default_preference', FULFILLMENT_PREFERENCES)),
]);
