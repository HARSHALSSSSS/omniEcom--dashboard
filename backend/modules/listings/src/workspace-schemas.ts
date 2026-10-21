import { z } from 'zod';
import { IsoDate } from '@oms/contracts';
import { LISTING_ACTIONS, READINESS_GROUPS, SCREEN_STATUSES } from './workspace-domain';

export const Scalar = z.union([z.string().max(500), z.number(), z.boolean()]);

/** additive fields of PATCH /listings/{id}: channel content (null = go back to the master value) and attribute overrides (null = remove) */
export const ChannelContentFields = {
  title: z.string().trim().max(500).nullable().optional().describe('Channel title; null or empty removes the override (the master title applies again)'),
  description: z.string().max(20_000).nullable().optional(),
  bulletPoints: z.array(z.string().max(500)).max(10).nullable().optional().describe('Key feature bullets of this channel'),
  searchTerms: z.array(z.string().max(100)).max(50).nullable().optional(),
  brand: z.string().trim().max(200).nullable().optional(),
  attributeOverrides: z.record(z.string().min(1).max(100), Scalar.nullable()).optional().describe('Merged into the listing\'s own attribute values; null removes one'),
};

export const ScreenStatusSchema = z.enum(SCREEN_STATUSES);

export const TableBlockSchema = z.object({
  screenStatus: ScreenStatusSchema.describe('The Listings screen tab: live | ready | needs_review | syncing | failed | blocked'),
  barcode: z.string().nullable(), thumbnailUrl: z.string().nullable(), imageCount: z.number().int(),
  categoryName: z.string().nullable().describe('Your category of the product'), marketplaceName: z.string(), accountName: z.string(), marketplaceCategoryName: z.string().nullable(),
  priceMinor: z.number().nullable().describe('What the listing shows: the listing price, else the variant price (a running sale is already in it)'), mrpMinor: z.number().nullable(),
  salePriceMinor: z.number().nullable().describe('Sale price running right now (pricing module), else null'), saleEndsAt: IsoDate.nullable(),
  stock: z.object({ available: z.number().int(), sellable: z.number().int().describe('What this channel may sell after allocation and safety buffer'), pushed: z.number().int().nullable(), dirty: z.boolean() }),
  readiness: z.object({
    percent: z.number().int(), ready: z.boolean(), errors: z.number().int(), warnings: z.number().int(),
    attributesChecked: z.boolean().describe('false: the category attributes were not validated since the last edit'),
    topBlocker: z.object({ message: z.string(), field: z.string().nullable() }).nullable(),
  }),
  externalListingId: z.string().nullable(), externalUrl: z.string().nullable().describe('Public page of the listing (live Amazon India / Flipkart accounts only)'), lastSyncAt: IsoDate.nullable(),
}).meta({ id: 'ListingTableBlock' });

const FixSchema = z.object({ action: z.string(), field: z.string().nullable() }).nullable();
export const ReadinessSchema = z.object({
  percent: z.number().int(), ready: z.boolean(), summary: z.object({ pass: z.number().int(), warn: z.number().int(), fail: z.number().int() }), attributesChecked: z.boolean(),
  topBlocker: z.object({ key: z.string(), message: z.string(), field: z.string().nullable(), fix: FixSchema }).nullable(),
  groups: z.array(z.object({
    key: z.enum(READINESS_GROUPS), label: z.string(), status: z.enum(['pass', 'warn', 'fail']), passed: z.number().int(), total: z.number().int(),
    items: z.array(z.object({ key: z.string(), group: z.enum(READINESS_GROUPS), status: z.enum(['pass', 'warn', 'fail']), label: z.string(), message: z.string(), field: z.string().nullable(), fix: FixSchema })),
  })),
}).meta({ id: 'ListingReadinessChecklist' });

export const ActionSchema = z.object({ action: z.enum(LISTING_ACTIONS), label: z.string(), enabled: z.boolean(), disabledReason: z.string().nullable() }).meta({ id: 'ListingActionState' });

export const ActivityPageSchema = z.object({
  total: z.number().int(),
  items: z.array(z.object({ id: z.string(), at: IsoDate, action: z.string(), title: z.string(), details: z.string(), actor: z.object({ type: z.string(), id: z.string().nullable(), name: z.string() }) })),
}).meta({ id: 'ListingActivityPage' });

export const CountsSchema = z.object({ all: z.number().int(), live: z.number().int(), ready: z.number().int(), needs_review: z.number().int(), syncing: z.number().int(), failed: z.number().int(), blocked: z.number().int() });

export const FlowStepSchema = z.object({
  step: z.enum(['validate', 'approve', 'publish']), status: z.enum(['ok', 'failed', 'skipped', 'not_run']), message: z.string(), code: z.string().nullable(), durationMs: z.number().int(), details: z.record(z.string(), z.unknown()).nullable(),
});

export const BulkResultSchema = z.object({
  action: z.string(),
  summary: z.object({ total: z.number().int(), succeeded: z.number().int(), failed: z.number().int(), skipped: z.number().int() }),
  results: z.array(z.object({
    index: z.number().int(), id: z.string(), sku: z.string().nullable(), ok: z.boolean(), status: z.enum(['done', 'skipped', 'failed']), outcome: z.string().nullable(), message: z.string(), jobId: z.string().nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
  })),
}).meta({ id: 'ListingBulkResult' });
