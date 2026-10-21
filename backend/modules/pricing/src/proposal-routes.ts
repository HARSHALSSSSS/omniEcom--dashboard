import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema, type Tx } from '@oms/database';
import { IdParamSchema, IsoDate, PageQuerySchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { AppError } from '@oms/shared';
import { created, ok, opCtxFromRequest, paged, pageWindow, requireVendor, vendorTx, type OpCtx } from '@oms/module-kit';
import { addCompetitorPrice, deleteCompetitorPrice, getCompetitorDto, importCompetitorPrices, listCompetitorPrices } from './competitors';
import { SYNC_PAIR_LIMIT, candidatePairs, generateProposals } from './generate';
import { pricingOverview } from './overview';
import { affectedVariants, createPolicy, deletePolicy, getPolicyDto, listPolicies, updatePolicy } from './policies';
import { bulkDecide, decideProposal, getProposalDto, listProposals } from './proposals';
import { SyncWork } from './service';

export const JOB_GENERATE_PROPOSALS = 'pricing.generate-proposals';

const Bps = z.number().int().min(0).max(10_000);
const Minor = z.number().int().min(1).max(100_000_000_000);
const Strategy = z.enum(schema.PRICING_STRATEGIES);
const Status = z.enum(schema.PRICE_PROPOSAL_STATUSES);

/** knobs a policy understands (anything else is refused, so a typo cannot silently do nothing) */
const PolicyParams = z.strictObject({
  undercutBps: Bps.max(5_000).optional().describe('automated_match: aim this far below the competitor (0 = match exactly)'),
  allowIncrease: z.boolean().optional().describe('automated_match: false = never raise the price towards a higher competitor'),
  slowUnits: z.number().int().min(1).max(10_000).optional().describe('velocity_boost: slow = fewer units than this sold in 30 days (default 5)'),
  minStock: z.number().int().min(0).max(1_000_000).optional().describe('velocity_boost: only when at least this many units are in stock (default 10)'),
  stepBps: Bps.min(1).max(5_000).optional().describe('velocity_boost: how much to cut (default 500 = 5%)'),
  targetMarginBps: Bps.optional().describe('custom: the margin the price should earn'),
  maxIncreaseBps: Bps.max(50_000).optional().describe('the largest raise per proposal (default 5000 = 50%)'),
  minChangeBps: Bps.max(5_000).optional().describe('ignore moves smaller than this (default 50 = 0.5%)'),
  elasticity: z.number().min(0.1).max(5).optional().describe('assumed sales response to a price change (default 1.5)'),
  expiresInDays: z.number().int().min(1).max(60).optional().describe('how long a proposal stays open (default 7)'),
});

const PolicySchema = z.object({
  id: z.string(), name: z.string(), accountId: z.string().nullable(), channel: z.string(), strategy: Strategy, targetMarginMinBps: Bps, maxDiscountBps: Bps, autoApproveUnderBps: Bps,
  params: z.record(z.string(), z.unknown()), status: z.enum(['active', 'paused']), affectedVariants: z.number().int().describe('Variants with an active listing this policy looks at'), version: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate,
}).meta({ id: 'PricingPolicy' });
const PolicyBody = z.object({
  name: z.string().trim().min(1).max(120), accountId: z.uuid().nullish().describe('null / omitted = every connected account'), strategy: Strategy,
  targetMarginMinBps: Bps.default(0).describe('Never propose a price that earns less margin than this (after cost and marketplace fees)'),
  maxDiscountBps: Bps.default(0).describe('Never propose a price more than this far under the current price (0 = no decreases)'),
  autoApproveUnderBps: Bps.default(0).describe('Proposals moving the price by LESS than this are applied without review (0 = always review)'),
  params: PolicyParams.default({}), status: z.enum(['active', 'paused']).default('active'),
});

const ProposalSchema = z.object({
  id: z.string(), status: Status, strategy: Strategy, variantId: z.string(), sku: z.string(), productTitle: z.string(), accountId: z.string(), channelName: z.string(), marketplace: z.string(),
  policyId: z.string().nullable(), policyName: z.string().nullable(), currentPriceMinor: z.number().int(), proposedPriceMinor: z.number().int(), currency: z.string(), priceChangeBps: z.number().int(),
  competitorPriceMinor: z.number().int().nullable(), estMarginDeltaBps: z.number().int().nullable().describe('Change of the unit margin; null when the variant has no cost price'),
  projectedSalesDeltaBps: z.number().int().nullable().describe('Projected change of unit sales; null without enough sales history'), reasoning: z.string(),
  expiresAt: IsoDate.nullable(), createdAt: IsoDate, decidedBy: z.string().nullable(), decidedByName: z.string().nullable(), decidedAt: IsoDate.nullable(), decisionNote: z.string().nullable(),
  appliedAt: IsoDate.nullable(), failureMessage: z.string().nullable(), pushSkipped: z.boolean().describe('Saved here, but the marketplace cannot take price updates through its API'), version: z.number().int(),
}).meta({ id: 'PriceProposal' });
const Pushed = z.array(z.object({ accountId: z.string(), skipped: z.string().optional() }));
const Competitor = z.object({
  id: z.string(), variantId: z.string(), sku: z.string().nullable(), productTitle: z.string().nullable(), accountId: z.string().nullable(), accountName: z.string().nullable(), priceMinor: z.number().int(), currency: z.string(),
  sellerName: z.string().nullable(), source: z.enum(['manual', 'import', 'api']), observedAt: IsoDate, createdAt: IsoDate,
}).meta({ id: 'CompetitorPrice' });
const GenerateItem = z.object({
  variantId: z.string(), sku: z.string(), accountId: z.string(), status: z.enum(['proposed', 'auto_applied', 'unchanged', 'skipped', 'failed']), currentPriceMinor: z.number().int(),
  proposedPriceMinor: z.number().int().nullable(), policyId: z.string().nullable(), proposalId: z.string().optional(), reason: z.string().optional(),
});
const GenerateResult = z.object({ dryRun: z.boolean(), evaluated: z.number().int(), proposed: z.number().int(), autoApplied: z.number().int(), unchanged: z.number().int(), skipped: z.number().int(), failed: z.number().int(), items: z.array(GenerateItem) });
const Decision = z.object({ version: z.number().int().optional().describe('The proposal version the reviewer saw (409 VERSION_CONFLICT when it changed)'), note: z.string().trim().max(500).nullish() });

/** Price proposals, policies, competitor prices and the overview of the pricing screen. */
export const proposalRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Pricing'];
  app.addContentTypeParser(['text/csv', 'text/plain'], { parseAs: 'string', bodyLimit: 1_000_000 }, (_req, body, done) => done(null, body));

  async function run<T>(req: FastifyRequest, fn: (tx: Tx, ctx: OpCtx, work: SyncWork) => Promise<T>) {
    const vendorId = requireVendor(req);
    const work = new SyncWork();
    const out = await vendorTx(req, (tx) => fn(tx, opCtxFromRequest(req, vendorId), work));
    return { out, pushed: await work.flush(req.server.container, vendorId) };
  }

  r.get('/pricing/overview', {
    config: { access: { permission: 'pricing:read' } },
    schema: {
      tags: TAGS, summary: 'Tiles of the pricing screen', description: 'Pending proposals, potential margin gain (monthly contribution gain of the pending proposals weighted by 30-day sales; proposals without a cost price are counted in `proposalsWithoutEstimate`, not guessed), proposals auto-applied in the last 30 days, channels covered and active policies.',
      response: { 200: successEnvelope(z.object({
        pendingProposals: z.number().int(), potentialMarginGainMinor: z.number().int(), proposalsWithoutEstimate: z.number().int(), autoAppliedLast30Days: z.number().int(), approvedLast30Days: z.number().int(), rejectedLast30Days: z.number().int(),
        activePolicies: z.number().int(), pausedPolicies: z.number().int(), channelsCovered: z.number().int(), channels: z.array(z.object({ accountId: z.string(), name: z.string(), marketplace: z.string() })),
        proposalCounts: z.record(Status, z.number().int()), basis: z.literal('estimated'),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => pricingOverview(tx, vendorId))));

  // ---------------------------------------------------------------- policies
  r.get('/pricing/policies', {
    config: { access: { permission: 'pricing:read' } },
    schema: { tags: TAGS, summary: 'Pricing policies (strategy rules)', querystring: z.object({ 'filter[status]': z.enum(['active', 'paused']).optional(), 'filter[accountId]': z.uuid().optional() }), response: { 200: successEnvelope(z.array(PolicySchema)) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => listPolicies(tx, vendorId, { status: req.query['filter[status]'], accountId: req.query['filter[accountId]'] }))));

  r.post('/pricing/policies/preview', {
    config: { access: { permission: 'pricing:read' } },
    schema: { tags: TAGS, summary: 'How many variants a policy would look at', body: z.object({ accountId: z.uuid().nullish() }), response: { 200: successEnvelope(z.object({ affectedVariants: z.number().int() })) } },
  }, async (req) => ok(req, { affectedVariants: await vendorTx(req, (tx, vendorId) => affectedVariants(tx, vendorId, req.body.accountId ?? null)) }));

  r.post('/pricing/policies', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Create a pricing policy', description: 'Strategies: `automated_match` (follow the competitor price; needs competitor prices), `margin_floor` (raise prices that earn less than the floor), `velocity_boost` (cut slow movers that have stock), `custom` (price for `params.targetMarginBps`). Guardrails always apply: margin floor, maximum discount, MRP.', body: PolicyBody, response: { 201: successEnvelope(PolicySchema) } },
  }, async (req, reply) => {
    const { out } = await run(req, (tx, ctx) => createPolicy(tx, ctx, { ...req.body, params: req.body.params as Record<string, unknown> }));
    return created(req, reply, out, `/api/v1/pricing/policies/${out.id}`);
  });

  r.get('/pricing/policies/:id', {
    config: { access: { permission: 'pricing:read' } },
    schema: { tags: TAGS, summary: 'One pricing policy', params: IdParamSchema, response: { 200: successEnvelope(PolicySchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => getPolicyDto(tx, vendorId, req.params.id))));

  r.patch('/pricing/policies/:id', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Change a pricing policy (pause / resume, thresholds, ...)', description: '`version` (optional) is the version the editor saw: 409 VERSION_CONFLICT when somebody changed it first.', params: IdParamSchema, body: PolicyBody.partial().extend({ version: z.number().int().optional() }), response: { 200: successEnvelope(PolicySchema) } },
  }, async (req) => {
    const { version, ...patch } = req.body;
    const { out } = await run(req, (tx, ctx) => updatePolicy(tx, ctx, req.params.id, { ...patch, params: patch.params as Record<string, unknown> | undefined }, version));
    return ok(req, out);
  });

  r.delete('/pricing/policies/:id', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Delete a pricing policy', description: 'Open proposals it created stay reviewable.', params: IdParamSchema, response: { 200: successEnvelope(z.object({ deleted: z.literal(true) })) } },
  }, async (req) => { await run(req, (tx, ctx) => deletePolicy(tx, ctx, req.params.id)); return ok(req, { deleted: true as const }); });

  // ---------------------------------------------------------------- competitor prices
  r.get('/pricing/competitor-prices', {
    config: { access: { permission: 'pricing:read' } },
    schema: {
      tags: TAGS, summary: 'Competitor price observations', description: 'Entered by the seller (manual or CSV); nothing is scraped. `latest=true` shows only the newest observation per variant.',
      querystring: PageQuerySchema.extend({ 'filter[variantId]': z.uuid().optional(), 'filter[accountId]': z.uuid().optional(), q: z.string().trim().min(1).max(100).optional(), latest: z.enum(['true', 'false']).default('false') }),
      response: { 200: pagedEnvelope(Competitor) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const res = await vendorTx(req, (tx, vendorId) => listCompetitorPrices(tx, vendorId, { variantId: req.query['filter[variantId]'], accountId: req.query['filter[accountId]'], q: req.query.q, latestOnly: req.query.latest === 'true', ...w }));
    return paged(req, res.items, req.query, res.total);
  });

  r.post('/pricing/competitor-prices', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Record a competitor price', body: z.object({ variantId: z.uuid(), accountId: z.uuid().nullish(), priceMinor: Minor, sellerName: z.string().trim().max(120).nullish(), observedAt: z.coerce.date().nullish() }), response: { 201: successEnvelope(Competitor) } },
  }, async (req, reply) => {
    const { out } = await run(req, async (tx, ctx) => getCompetitorDto(tx, ctx.vendorId, (await addCompetitorPrice(tx, ctx, req.body)).id));
    return created(req, reply, out);
  });

  r.post('/pricing/competitor-prices/import', {
    config: { access: { permission: 'pricing:write' } },
    schema: {
      tags: TAGS, summary: 'Import competitor prices from CSV', description: 'Body: `text/csv` with the header `sku,price,seller` (price in rupees; optional `account` column with a marketplace account id), or JSON `{ "csv": "..." }`. Up to 2000 rows; every row is reported, a bad row never blocks the others.',
      response: { 200: successEnvelope(z.object({ total: z.number().int(), imported: z.number().int(), skipped: z.number().int(), rows: z.array(z.object({ line: z.number().int(), sku: z.string(), status: z.enum(['imported', 'skipped']), reason: z.string().optional() })) })) },
    },
  }, async (req) => {
    const body = req.body as unknown;
    const csv = typeof body === 'string' ? body : typeof (body as { csv?: unknown } | null)?.csv === 'string' ? (body as { csv: string }).csv : null;
    if (csv === null) throw new AppError('BAD_REQUEST', 'Send the CSV as text/csv or as JSON { "csv": "..." }', { details: { rule: 'csv_body' } });
    return ok(req, (await run(req, (tx, ctx) => importCompetitorPrices(tx, ctx, csv))).out);
  });

  r.delete('/pricing/competitor-prices/:id', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Delete a competitor price observation', params: IdParamSchema, response: { 200: successEnvelope(z.object({ deleted: z.literal(true) })) } },
  }, async (req) => { await run(req, (tx, ctx) => deleteCompetitorPrice(tx, ctx, req.params.id)); return ok(req, { deleted: true as const }); });

  // ---------------------------------------------------------------- proposals
  r.get('/pricing/proposals', {
    config: { access: { permission: 'pricing:read' } },
    schema: {
      tags: TAGS, summary: 'Price proposals (the review queue)', description: 'Default order: biggest margin impact first. `counts` are per status for the same filters (without the status filter), for the tabs.',
      querystring: PageQuerySchema.extend({ 'filter[status]': Status.optional(), 'filter[accountId]': z.uuid().optional(), 'filter[strategy]': Strategy.optional(), q: z.string().trim().min(1).max(100).optional(), sort: z.enum(['impact', 'newest', 'oldest']).default('impact') }),
      response: { 200: successEnvelope(z.object({ items: z.array(ProposalSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: z.record(z.string(), z.number().int()) })) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const res = await vendorTx(req, (tx, vendorId) => listProposals(tx, vendorId, { status: req.query['filter[status]'], accountId: req.query['filter[accountId]'], strategy: req.query['filter[strategy]'], q: req.query.q, sort: req.query.sort, ...w }));
    const out = paged(req, res.items, req.query, res.total);
    return { ...out, data: { ...out.data, counts: res.counts } };
  });

  r.post('/pricing/proposals/bulk', {
    config: { access: { permission: 'pricing:approve' } },
    schema: {
      tags: TAGS, summary: 'Approve or reject many proposals', description: 'Up to 100 ids. Each proposal is decided on its own: the response is 200 with a result per id (partial success is normal).',
      body: z.object({ ids: z.array(z.uuid()).min(1).max(100), action: z.enum(['approve', 'reject']), note: z.string().trim().max(500).nullish() }),
      response: { 200: successEnvelope(z.object({ action: z.enum(['approve', 'reject']), total: z.number().int(), succeeded: z.number().int(), failed: z.number().int(), items: z.array(z.object({ id: z.string(), outcome: z.enum(['applied', 'rejected', 'unchanged', 'failed', 'expired', 'error']), code: z.string().optional(), message: z.string().optional() })), pushed: Pushed })) },
    },
  }, async (req) => {
    const { out, pushed } = await run(req, (tx, ctx, work) => bulkDecide(tx, ctx, work, req.body.ids, req.body.action, req.body.note ?? null));
    return ok(req, { ...out, pushed });
  });

  r.post('/pricing/proposals/generate', {
    config: { access: { permission: 'pricing:write' } },
    schema: {
      tags: TAGS, summary: 'Generate proposals from the active policies', description: `Evaluates the active policies against each variant with an active listing (optionally one account / policy / a list of variants). At most one open proposal per variant and account; a newer one supersedes the older. Changes under a policy's auto-approve threshold are applied immediately (\`auto_applied\`). Up to ${SYNC_PAIR_LIMIT} variant+account pairs run inside the request (200); more are queued as a background job (202). \`dryRun\` reports without writing.`,
      body: z.object({ accountId: z.uuid().optional(), policyId: z.uuid().optional(), variantIds: z.array(z.uuid()).max(1000).optional(), dryRun: z.boolean().default(false) }),
      response: { 200: successEnvelope(z.object({ queued: z.literal(false), truncated: z.boolean(), result: GenerateResult, pushed: Pushed })), 202: successEnvelope(z.object({ queued: z.literal(true), pairs: z.number().int() })) },
    },
  }, async (req, reply) => {
    const vendorId = requireVendor(req);
    const probe = await vendorTx(req, (tx) => candidatePairs(tx, vendorId, req.body, SYNC_PAIR_LIMIT + 1));
    const big = probe.length > SYNC_PAIR_LIMIT;
    if (big && !req.body.dryRun) {
      const c = req.server.container;
      await c.queues.enqueue('heavy', JOB_GENERATE_PROPOSALS, { vendorId, correlationId: req.ctx.correlationId ?? req.id, data: { accountId: req.body.accountId, policyId: req.body.policyId, variantIds: req.body.variantIds } });
      reply.code(202);
      return ok(req, { queued: true as const, pairs: probe.length });
    }
    const { out, pushed } = await run(req, (tx, ctx, work) => generateProposals(tx, ctx, work, req.body, probe.slice(0, SYNC_PAIR_LIMIT)));
    return ok(req, { queued: false as const, truncated: big, result: out, pushed });
  });

  r.get('/pricing/proposals/:id', {
    config: { access: { permission: 'pricing:read' } },
    schema: { tags: TAGS, summary: 'One price proposal', params: IdParamSchema, response: { 200: successEnvelope(ProposalSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => getProposalDto(tx, vendorId, req.params.id))));

  const decisionRoute = (action: 'approve' | 'reject') => r.post(`/pricing/proposals/:id/${action}`, {
    config: { access: { permission: 'pricing:approve' } },
    schema: {
      tags: TAGS, summary: action === 'approve' ? 'Approve a proposal and put the price live' : 'Reject a proposal',
      description: action === 'approve'
        ? 'Applies the proposed price through the pricing module (history reason `proposal:<id>`) and queues the marketplace push. A marketplace whose connector cannot take prices still gets the price saved here: `pushSkipped` is true and `failureMessage` says to update it in the seller panel. A price the rules refuse (e.g. above the MRP) moves the proposal to `failed` (409 `proposal_apply_failed`); approving it again retries. Repeating an approval changes nothing. 409 for expired or superseded proposals.'
        : 'The current price stays. Repeating a rejection changes nothing. 409 for proposals that were already approved, expired or superseded.',
      params: IdParamSchema, body: Decision, response: { 200: successEnvelope(z.object({ outcome: z.enum(['applied', 'rejected', 'unchanged']), proposal: ProposalSchema, pushed: Pushed })) },
    },
  }, async (req) => {
    const { out, pushed } = await run(req, (tx, ctx, work) => decideProposal(tx, ctx, work, req.params.id, action, { version: req.body.version, note: req.body.note }));
    if (out.outcome === 'failed') throw new AppError('CONFLICT', out.proposal.failureMessage ?? 'The price could not be applied', { details: { rule: 'proposal_apply_failed', proposalId: out.proposal.id } });
    if (out.outcome === 'expired') throw new AppError('INVALID_STATE', 'This proposal expired before a decision', { details: { rule: 'proposal_expired', proposalId: out.proposal.id } });
    return ok(req, { outcome: out.outcome, proposal: out.proposal, pushed });
  });
  decisionRoute('approve');
  decisionRoute('reject');
};

