import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, desc, eq, gte, isFeatureEnabled, schema, sql } from '@oms/database';
import { IdParamSchema, successEnvelope } from '@oms/contracts';
import { AppError } from '@oms/shared';
import { assertEmailVerified, audit, ok, requireVendor, vendorTx } from '@oms/module-kit';
import { getAuthorizationRow } from '@oms/mod-marketplace-accounts';
import { ConnectorHost, connectorProfile, signState } from '@oms/mod-marketplace-connectors';
import { toSyncJobDto } from '@oms/mod-sync';
import { enabledCapabilities } from '@oms/marketplace-core';
import { runConnect, peekState } from './connect';
import { buildLanes, capabilityTags, daysLeft, networkStatus, successRate, type JobCount } from './health';
import { WINDOW_HOURS, cards, summarize } from './queries';
import {
  AccountCardSchema, AccountDetailSchema, ConnectBody, ConnectResultSchema, DirectoryItemSchema, HealthSchema, HealthStatusSchema, OauthCompleteBody, SummarySchema, SyncBody, SyncStartSchema, SyncStatusSchema,
} from './schemas';
import { assertSyncable, startSync, syncStatus } from './sync';
import { connIntRoutes } from './conn-int-routes';

const POLICY = schema.channelInventoryPolicies;
const WEBHOOKS = schema.webhookEvents;
const JOBS = schema.syncJobs;

export const marketplaceHubRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const host = new ConnectorHost(c);
  const secret = c.config.JWT_ACCESS_SECRET;
  const TAGS = ['Marketplace Hub'];
  await app.register(connIntRoutes);

  // ------------------------------------------------------------------ directory
  r.get('/marketplace-hub/directory', {
    config: { access: { permission: 'marketplace_accounts:read' } },
    schema: {
      tags: TAGS,
      summary: 'Connector directory merged with my accounts',
      description: 'Every connector with its setup form (`authFlow`) and its state for this seller: `connected` (at least one healthy account), `needs_attention` (an account is unhealthy or not finished), `available`, or `unavailable` (planned, or switched off for this business). Ratings, reviews and prices are always null: the platform does not collect them.',
      querystring: z.object({ category: z.enum(['marketplace', 'storefront', 'shipping']).optional(), q: z.string().trim().min(1).max(80).optional() }),
      response: { 200: successEnvelope(z.object({ items: z.array(DirectoryItemSchema), summary: z.object({ total: z.number().int(), connected: z.number().int(), needsAttention: z.number().int(), available: z.number().int(), unavailable: z.number().int() }) })) },
    },
  }, async (req) => {
    const { category, q } = req.query;
    const items = await vendorTx(req, async (tx, vendorId) => {
      const mine = await cards(tx, vendorId, c.connectors, new Date());
      const out: Array<z.infer<typeof DirectoryItemSchema>> = [];
      for (const connector of c.connectors.list()) {
        const profile = connectorProfile(connector);
        if (category && profile.category !== category) continue;
        if (q && !`${connector.displayName} ${connector.code} ${profile.description}`.toLowerCase().includes(q.toLowerCase())) continue;
        const accounts = mine.filter((m) => m.card.marketplace === connector.code);
        const enabledFlag = await isFeatureEnabled(tx, `connector.${connector.code}.enabled`, vendorId, true);
        const attention = accounts.filter((m) => m.card.status === 'error' || m.card.status === 'warning');
        const caps = enabledCapabilities(connector);
        const unavailableReason = connector.implementation === 'planned' ? 'This integration is not available yet' : !enabledFlag ? 'Switched off for your business' : null;
        const status = unavailableReason ? 'unavailable' as const : attention.length ? 'needs_attention' as const : accounts.some((m) => m.card.accountStatus === 'active') ? 'connected' as const : 'available' as const;
        out.push({
          id: connector.code, name: connector.displayName, category: profile.category, description: profile.description, logoKey: profile.logoKey, supportedRegions: profile.supportedRegions,
          implementation: connector.implementation, status, statusReason: unavailableReason ?? (attention[0]?.card.health.frictionPoints[0] ?? null), accountCount: accounts.length, partnerGated: profile.authFlow.partnerGated,
          authFlow: profile.authFlow, capabilities: caps, capabilityTags: capabilityTags(caps), rating: null, reviewsCount: null, pricing: null,
        });
      }
      return out;
    });
    return ok(req, {
      items,
      summary: { total: items.length, connected: items.filter((i) => i.status === 'connected').length, needsAttention: items.filter((i) => i.status === 'needs_attention').length, available: items.filter((i) => i.status === 'available').length, unavailable: items.filter((i) => i.status === 'unavailable').length },
    });
  });

  // ------------------------------------------------------------------ account cards
  r.get('/marketplace-hub/accounts', {
    config: { access: { permission: 'marketplace_accounts:read' } },
    schema: {
      tags: TAGS,
      summary: 'My connected accounts as cards',
      description: 'One card per marketplace account with live numbers: active listings, pending orders, sync state and progress, last and next sync, token expiry, a 0-100 health score (40% connection state, 40% sync success of the last 24 h, 20% token health), friction points and the capability list.',
      querystring: z.object({ 'filter[marketplace]': z.string().max(40).optional(), 'filter[status]': HealthStatusSchema.optional(), q: z.string().trim().min(1).max(80).optional() }),
      response: { 200: successEnvelope(z.object({ items: z.array(AccountCardSchema), summary: SummarySchema })) },
    },
  }, async (req) => {
    const q = req.query;
    const list = await vendorTx(req, (tx, vendorId) => cards(tx, vendorId, c.connectors, new Date(), { marketplace: q['filter[marketplace]'], q: q.q }));
    const all = list.map((x) => x.card);
    return ok(req, { items: q['filter[status]'] ? all.filter((x) => x.status === q['filter[status]']) : all, summary: summarize(all) });
  });

  r.get('/marketplace-hub/accounts/:id', {
    config: { access: { permission: 'marketplace_accounts:read' } },
    schema: {
      tags: TAGS,
      summary: 'One account for the detail page',
      description: 'The card plus the capability matrix, readiness notes, the last sync jobs, per-lane success of the last 24 hours, webhook status, the inventory policy and the listing counts by status.',
      params: IdParamSchema,
      response: { 200: successEnvelope(AccountDetailSchema) },
    },
  }, async (req) => {
    const now = new Date();
    const detail = await vendorTx(req, async (tx, vendorId) => {
      const [hit] = await cards(tx, vendorId, c.connectors, now, { id: req.params.id });
      if (!hit) throw new AppError('NOT_FOUND', 'Marketplace account not found', { details: { resource: 'marketplace_account', id: req.params.id } });
      const connector = c.connectors.get(hit.row.a.marketplace);
      const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000);
      const jobs = await tx.select().from(JOBS).where(and(eq(JOBS.vendorId, vendorId), eq(JOBS.marketplaceAccountId, req.params.id))).orderBy(desc(JOBS.createdAt)).limit(10);
      const [policy] = await tx.select().from(POLICY).where(and(eq(POLICY.vendorId, vendorId), eq(POLICY.marketplaceAccountId, req.params.id)));
      const events = await tx.select({ status: WEBHOOKS.status, n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${WEBHOOKS.receivedAt})` }).from(WEBHOOKS)
        .where(and(eq(WEBHOOKS.vendorId, vendorId), eq(WEBHOOKS.marketplaceAccountId, req.params.id), gte(WEBHOOKS.receivedAt, since))).groupBy(WEBHOOKS.status);
      const [lastEvent] = await tx.select({ at: WEBHOOKS.receivedAt }).from(WEBHOOKS).where(and(eq(WEBHOOKS.vendorId, vendorId), eq(WEBHOOKS.marketplaceAccountId, req.params.id))).orderBy(desc(WEBHOOKS.receivedAt)).limit(1);
      const z = await getAuthorizationRow(tx, vendorId, req.params.id);
      return {
        ...hit.card,
        capabilityMatrix: connector.capabilities as unknown as Record<string, unknown>,
        readiness: connector.readiness,
        recentJobs: jobs.map(toSyncJobDto),
        lanes: buildLanes(hit.stats.jobCounts, WINDOW_HOURS),
        webhook: {
          supported: Boolean(connector.verifyWebhook), configured: Boolean(hit.row.a.webhookSecretRotatedAt), secretRotatedAt: hit.row.a.webhookSecretRotatedAt ? hit.row.a.webhookSecretRotatedAt.toISOString() : null,
          signatureHeader: connector.webhook?.signatureHeader ?? null, lastEventAt: lastEvent ? lastEvent.at.toISOString() : null, events24h: Object.fromEntries(events.map((e) => [e.status, e.n])),
        },
        inventoryPolicy: policy
          ? { mode: policy.mode as 'sync' | 'paused', safetyBuffer: policy.safetyBuffer, allocationPercent: policy.allocationPercent, maxQuantity: policy.maxQuantity, warehouseIds: policy.warehouseIds, isDefault: false }
          : { mode: 'sync' as const, safetyBuffer: 0, allocationPercent: 100, maxQuantity: null, warehouseIds: [], isDefault: true },
        listingsByStatus: hit.stats.listingsByStatus,
        authorization: z ? { status: z.status, scopes: z.scopes, lastRefreshedAt: z.lastRefreshedAt ? z.lastRefreshedAt.toISOString() : null, rotationCount: z.rotationCount } : null,
      };
    });
    return ok(req, detail);
  });

  // ------------------------------------------------------------------ network health
  r.get('/marketplace-hub/health', {
    config: { access: { permission: 'marketplace_accounts:read' } },
    schema: {
      tags: TAGS,
      summary: 'Connection health of the whole network',
      description: 'Overall pulse (average account health score), per-lane success rate and throughput from the sync jobs of the last 24 hours, totals, one row per account and the tokens that are expiring or expired. Rate-limit quotas are not tracked, so none are reported.',
      response: { 200: successEnvelope(HealthSchema) },
    },
  }, async (req) => {
    const now = new Date();
    const list = await vendorTx(req, (tx, vendorId) => cards(tx, vendorId, c.connectors, now));
    const live = list.filter((x) => x.card.accountStatus === 'active');
    const score = live.length ? Math.round(live.reduce((n, x) => n + x.card.health.pulseScore, 0) / live.length) : null;
    const counts: JobCount[] = list.flatMap((x) => x.stats.jobCounts);
    const rate = successRate(counts);
    return ok(req, {
      overallPulseScore: score,
      networkStatus: networkStatus(score),
      connectionsCount: live.length,
      totalActiveListings: list.reduce((n, x) => n + x.card.stats.activeListings, 0),
      totalPendingOrders: list.reduce((n, x) => n + x.card.stats.pendingOrders, 0),
      syncReliability: { windowHours: WINDOW_HOURS, finished: rate.finished, failed: rate.failed, successRate: rate.rate },
      dataFlowLanes: buildLanes(counts, WINDOW_HOURS),
      summary: summarize(list.map((x) => x.card)),
      connections: list.map((x) => x.card),
      tokenWarnings: list.filter((x) => x.card.accountStatus === 'active' || x.card.health.tokenExpiresAt).flatMap((x) => {
        const d = daysLeft(x.row.z?.accessTokenExpiresAt ?? null, now);
        const expired = x.row.z ? ['expired', 'error'].includes(x.row.z.status) || (d !== null && d < 0) : false;
        const renews = c.connectors.get(x.card.marketplace).capabilities.auth.refreshable;
        return expired || (!renews && d !== null && d < 14) ? [{ accountId: x.card.id, name: x.card.name, marketplace: x.card.marketplace, daysLeft: d, expired }] : [];
      }),
    });
  });

  // ------------------------------------------------------------------ sync
  r.post('/marketplace-hub/accounts/:id/sync', {
    config: { access: { permission: 'marketplace_accounts:write' } },
    schema: {
      tags: TAGS,
      summary: 'Sync an account now',
      description: 'Queues the sync jobs for the requested scopes (orders, inventory, listings = listing status checks, catalog = product import); default is everything the connector supports. Scopes the connector cannot do are reported in `skipped`. A queued job of the same kind is reused (`created: false`). Poll GET .../sync-status for progress.',
      params: IdParamSchema,
      body: SyncBody,
      response: { 202: successEnvelope(SyncStartSchema) },
    },
  }, async (req, reply) => {
    const vendorId = requireVendor(req);
    const account = await vendorTx(req, (tx, vid) => assertSyncable(tx, vid, req.params.id));
    const result = await startSync(c, vendorId, account, req.body.scopes, req.ctx.principal?.actorId ?? null);
    await vendorTx(req, (tx) => audit(tx, req, { action: 'marketplace_account.sync_requested', resourceType: 'marketplace_account', resourceId: account.id, after: { scopes: result.jobs.map((j) => j.scope), skipped: result.skipped.map((s) => s.scope) } }));
    reply.code(202);
    return ok(req, { accountId: result.accountId, jobs: result.jobs.map((j) => ({ scope: j.scope, job: toSyncJobDto(j.job), created: j.created })), skipped: result.skipped });
  });

  r.get('/marketplace-hub/accounts/:id/sync-status', {
    config: { access: { permission: 'marketplace_accounts:read' } },
    schema: { tags: TAGS, summary: 'Combined sync progress of an account', description: 'Percent done across the running jobs, the running jobs, and the latest job of each type from the last 24 hours.', params: IdParamSchema, response: { 200: successEnvelope(SyncStatusSchema) } },
  }, async (req) => {
    const vendorId = requireVendor(req);
    const s = await syncStatus(c, vendorId, req.params.id);
    const interval = c.connectors.get(s.a.marketplace).polling?.orders?.intervalSeconds;
    return ok(req, {
      accountId: s.a.id, state: s.state, progress: s.progress, active: s.active.map(toSyncJobDto), latest: s.latest.map(toSyncJobDto),
      lastSyncedAt: s.a.lastSyncedAt ? s.a.lastSyncedAt.toISOString() : null,
      nextSyncAt: s.a.status === 'active' && s.a.lastSyncedAt && interval ? new Date(s.a.lastSyncedAt.getTime() + interval * 1000).toISOString() : null,
    });
  });

  // ------------------------------------------------------------------ guided connect
  r.post('/marketplace-hub/connect', {
    config: { access: { permission: 'marketplace_accounts:write' } },
    schema: {
      tags: TAGS,
      summary: 'Connect a marketplace in one call',
      description: 'Creates the account, authorizes it, tests the connection and queues the first sync, reporting every step (`steps[{name, ok, message, durationMs}]`). Send `credentials` (the form from the directory `authFlow.fields`), or for redirect connectors send no credentials with `redirectUri` to get the URL to send the seller to, then finish with `code` + `state` (or POST /marketplace-hub/oauth/complete). A failed attempt removes the account it created. Requires a verified e-mail address (403 EMAIL_NOT_VERIFIED). The Idempotency-Key header makes a retry return the first result.',
      body: ConnectBody,
      response: { 200: successEnvelope(ConnectResultSchema) },
    },
  }, async (req) => ok(req, await runConnect(req, { c, host, secret }, req.body)));

  r.post('/marketplace-hub/oauth/complete', {
    config: { access: { permission: 'marketplace_accounts:write' } },
    schema: {
      tags: TAGS,
      summary: 'Finish a redirect connection',
      description: 'Call this from the page the marketplace redirects the seller back to, with the `state` and `code` of the redirect. The pending account is found from the signed state (10 minutes, bound to this business). Same steps and result as POST /marketplace-hub/connect.',
      body: OauthCompleteBody,
      response: { 200: successEnvelope(ConnectResultSchema) },
    },
  }, async (req) => {
    const vendorId = requireVendor(req);
    const peek = peekState(req.body.state);
    if (!peek) throw new AppError('BAD_REQUEST', 'Invalid or expired authorization state; restart the connection', { details: { field: 'state' } });
    const account = await vendorTx(req, (tx) => cards(tx, vendorId, c.connectors, new Date(), { id: peek.accountId }));
    if (!account[0]) throw new AppError('BAD_REQUEST', 'Invalid or expired authorization state; restart the connection', { details: { field: 'state' } });
    const a = account[0].row.a;
    return ok(req, await runConnect(req, { c, host, secret }, ConnectBody.parse({ marketplace: a.marketplace, displayName: a.displayName, code: req.body.code, state: req.body.state, redirectUri: req.body.redirectUri, externalAccountId: req.body.externalAccountId, syncOptions: req.body.syncOptions })));
  });

  r.get('/marketplace-hub/accounts/:id/connect-url', {
    config: { access: { permission: 'marketplace_accounts:write' } },
    schema: {
      tags: TAGS,
      summary: 'Where to send the seller to (re)authorize an account',
      description: 'For redirect connectors: the marketplace URL plus a signed 10-minute `state` bound to this account (CSRF protection). Use it to reconnect an expired account; to start a new connection use POST /marketplace-hub/connect.',
      params: IdParamSchema,
      querystring: z.object({ redirectUri: z.url() }),
      response: { 200: successEnvelope(z.object({ accountId: z.string(), authorizationUrl: z.string(), state: z.string(), expiresInSeconds: z.number().int() })) },
    },
  }, async (req) => {
    const { acc, connector } = await vendorTx(req, async (tx, vendorId) => {
      await assertEmailVerified(req, tx);
      const [row] = await cards(tx, vendorId, c.connectors, new Date(), { id: req.params.id });
      if (!row) throw new AppError('NOT_FOUND', 'Marketplace account not found', { details: { resource: 'marketplace_account', id: req.params.id } });
      return { acc: row.row.a, connector: host.connectorFor(row.row.a) };
    });
    if (!connector.buildAuthorizationUrl) throw new AppError('CAPABILITY_UNSUPPORTED', `${connector.displayName} has no redirect authorization flow; use POST /marketplace-hub/connect with credentials`, { details: { capability: 'auth.redirectFlow' } });
    const state = signState(secret, acc.vendorId, acc.id);
    return ok(req, { accountId: acc.id, authorizationUrl: connector.buildAuthorizationUrl({ state, redirectUri: req.query.redirectUri, config: acc.config as Record<string, unknown> }), state, expiresInSeconds: 600 });
  });
};
