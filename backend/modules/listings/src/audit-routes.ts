import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, IsoDate, successEnvelope } from '@oms/contracts';
import { ok, requireVendor, vendorTx } from '@oms/module-kit';
import { ctxFromRequest } from './ctx';
import * as audit from './audit-service';
import { ScreenStatusSchema } from './workspace-schemas';

const Int = z.number().int();
const Window = { generatedAt: IsoDate, listingsEvaluated: Int.describe('Listings the numbers are computed from (newest first, at most 1000)'), totalListings: Int, truncated: z.boolean().describe('true when the catalogue has more listings than were evaluated') };

const SuggestionSchema = z.object({
  id: z.string(), marketplace: z.string(), marketplaceName: z.string(), attribute: z.string(), label: z.string(), title: z.string(), description: z.string(), note: z.string(),
  suggestedValue: z.string().nullable().describe('A value the same product already carries on another listing; null = nothing to suggest, the merchant types it'),
  valueSource: z.string().nullable(),
  listingIds: z.array(z.string()).describe('Listings to patch (PATCH /listings/{id} with attributeOverrides) once the merchant confirms'),
  listings: z.array(z.object({ id: z.string(), sku: z.string(), productTitle: z.string() })), total: Int,
});
const StepSchema = z.object({ key: z.enum(['master', 'mapped', 'content', 'review', 'live']), title: z.string(), statusText: z.string(), state: z.enum(['complete', 'warning', 'current', 'pending']) });
const SyncStepSchema = z.object({
  key: z.enum(['content', 'stock', 'listing']), label: z.string(), status: z.enum(['complete', 'in_progress', 'pending', 'failed', 'attention']),
  progressPct: Int.nullable().describe('From the job\'s own done/total, or what the status proves (succeeded 100, queued 0); null while a job runs without reporting a total'),
  progress: z.object({ done: Int, total: Int, failed: Int, unit: z.enum(['listings', 'stages']) }).nullable().describe('What the running job reports: done of total units (listings for content and stock, stages for a publish: content prepared, submitted, outcome recorded). null when no job runs or the job reported no total'),
  detail: z.string(), at: IsoDate.nullable(), jobId: z.string().nullable(),
});
const PricingRuleSchema = z.object({
  policyId: z.string(), name: z.string(), strategy: z.enum(['automated_match', 'margin_floor', 'velocity_boost', 'custom']), strategyLabel: z.string(),
  scope: z.enum(['account', 'all_channels']).describe('account = a policy of one of the channel\'s accounts; all_channels = a policy that applies to every connected account'),
  summary: z.string(),
});
const SyncModeSchema = z.object({ mode: z.enum(['real_time', 'polling', 'manual']), label: z.string().describe('"Real-time", "Polling every N min" or "On demand"'), detail: z.string() });

/**
 * Catalogue-level read models of the listing screens: Readiness audit, Publishing preparation and the Listing sync telemetry.
 * Read only: fixes go through PATCH /listings/{id}, publishing through POST /listings/bulk-publish.
 */
export const auditRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Listings Workspace'];
  const ctxOf = (req: FastifyRequest) => ctxFromRequest(req, requireVendor(req));

  r.get('/listings/audit/readiness', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Catalogue readiness audit',
      description: 'Computed from the stored readiness of every listing (no marketplace call). overall.readinessPct = listings that can still be published and have no blocking check / all of them (null: none to publish). spectrum counts listings by state (ready = live, ready to publish or syncing; needs_review; blocked = blocking errors or rejected) plus the not-listed candidates. health scores each readiness group (pass 1, warn 0.5, fail 0) and, computed from the master catalogue, Variants (options set, SKU, barcode, price, an image per variant, every variant listed on the account) and Compliance (HSN code, GST rate, country of origin, manufacturer or brand, weight, MRP present, price within MRP, category attributes once validated); each check scores the share of variants or listings that pass it. Order: content, attributes, media, variants, compliance, then price, stock, category, marketplace. coverage = active products with a live listing per connected marketplace. journey = the steps of one sample listing that needs attention. suggestions = missing category attributes, with a value the same product already has elsewhere (apply with PATCH /listings/{id} attributeOverrides).',
      response: { 200: successEnvelope(z.object({
        ...Window,
        overall: z.object({ readinessPct: Int.nullable(), readyListings: Int, cohortListings: Int, readyProducts: Int }),
        spectrum: z.object({ ready: Int, needs_review: Int, blocked: Int, not_listed: Int }),
        health: z.array(z.object({ key: z.enum(['content', 'attributes', 'media', 'variants', 'compliance', 'price', 'stock', 'category', 'marketplace']), label: z.string(), scorePct: Int, listings: Int, checks: Int, unchecked: Int.describe('Listings whose attributes were not validated since the last edit (not scored)') })),
        coverage: z.array(z.object({ marketplace: z.string(), name: z.string(), activeProducts: Int, totalProducts: Int, percent: Int })),
        unlistedProducts: Int.describe('Products that could still be listed on at least one connected marketplace'),
        journey: z.object({ listingId: z.string(), productTitle: z.string(), sku: z.string(), marketplace: z.string(), marketplaceName: z.string(), accountName: z.string(), screenStatus: ScreenStatusSchema, steps: z.array(StepSchema) }).nullable(),
        suggestions: z.array(SuggestionSchema),
      }).meta({ id: 'ListingReadinessAudit' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => audit.readinessAudit(ctxOf(req), tx))));

  r.get('/listings/audit/publishing', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Publishing preparation: the ready catalogue cohort and its potential issues',
      description: 'Cohort = listings that can still go through the publish flow (draft, ready, approved, rejected, correction required). A listing is ready when its stored readiness has no blocking check. issues list every blocking and warning check (blockers first, at most 100; issuesTotal is the full count). readyListingIds (at most 500) feed POST /listings/bulk-publish, 100 per call. channels carry the pricing rule (active pricing policy) and the sync mode (webhooks / polling interval from the connector) of each channel; publishLock states what the approval locks. Nothing is published by this read.',
      response: { 200: successEnvelope(z.object({
        ...Window,
        candidateListings: Int, readyListings: Int, blockedListings: Int, readyProducts: Int, readyVariants: Int, potentialIssueProducts: Int,
        unvalidatedListings: Int.describe('Candidates whose category attributes were not validated yet (the publish flow validates them first)'),
        readyListingIds: z.array(z.string()), readyIdsTruncated: z.boolean(),
        issues: z.array(z.object({ id: z.string(), listingId: z.string(), productId: z.string(), productTitle: z.string(), sku: z.string(), marketplace: z.string(), marketplaceName: z.string(), issue: z.string(), severity: z.enum(['blocker', 'warning']), field: z.string().nullable(), fixAction: z.string().nullable() })),
        issuesTotal: Int,
        channels: z.array(z.object({ marketplace: z.string(), name: z.string(), ready: Int, blocked: Int, warnings: Int, categories: z.array(z.string()), accounts: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
          pricingRule: PricingRuleSchema.nullable().describe('The active pricing policy that applies to the channel (a policy of one of its accounts first, else one for all channels); null = no policy, channel prices stay as set'),
          sync: SyncModeSchema.describe('How the connector keeps the channel up to date, from its capabilities and polling profile'),
        })),
        publishLock: z.object({ locked: z.array(z.string()), notLocked: z.array(z.string()), statement: z.string() }).describe('What cannot change between the merchant\'s approval and the submission: the approval is bound to a hash of price, MRP and content, and a listing whose hash changed is not sent'),
      }).meta({ id: 'ListingPublishingPreparation' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => audit.publishingPreparation(ctxOf(req), tx))));

  r.get('/listings/:id/sync', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Sync telemetry of a listing: content, stock and listing steps with the jobs behind them',
      description: 'Each step is derived from real state: the content propagation state, the quantity push state, the listing status, and the newest sync job of that kind. progressPct comes from the job\'s own done/total (null while a job runs without a total); progress carries those counts (content and stock jobs count listings, a publish job its three stages). state: syncing (a step is in progress) | attention (a step failed or needs a decision) | synced | idle (not live). Other channels of the product: GET /listings/{id}/channels. Poll while state = syncing.',
      params: IdParamSchema,
      response: { 200: successEnvelope(z.object({
        listingId: z.string(), generatedAt: IsoDate,
        listing: z.object({ id: z.string(), productId: z.string(), productTitle: z.string(), sku: z.string(), variantsCount: Int, marketplace: z.string(), marketplaceName: z.string(), accountName: z.string(), status: z.string(), screenStatus: ScreenStatusSchema, externalListingId: z.string().nullable() }),
        state: z.enum(['syncing', 'synced', 'attention', 'idle']), startedAt: IsoDate.nullable().describe('When the oldest running step started'), lastSyncedAt: IsoDate.nullable(),
        steps: z.array(SyncStepSchema),
        jobs: z.array(z.object({ id: z.string(), type: z.string(), status: z.string(), scheduledAt: IsoDate, startedAt: IsoDate.nullable(), finishedAt: IsoDate.nullable(), attempts: Int, maxAttempts: Int, progress: z.object({ total: Int, done: Int, failed: Int }), error: z.object({ code: z.string(), message: z.string() }).nullable() })),
      }).meta({ id: 'ListingSyncTelemetry' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => audit.syncTelemetry(ctxOf(req), tx, req.params.id))));
};
