import type { FastifyRequest } from 'fastify';
import { and, eq, PG, pgError, schema } from '@oms/database';
import { ConnectorError, type MarketplaceConnector } from '@oms/marketplace-core';
import { AppError, Errors } from '@oms/shared';
import { assertEmailVerified, audit, requireVendor, vendorTx, type Container } from '@oms/module-kit';
import { createAccount, deleteAccount, getAccountRow } from '@oms/mod-marketplace-accounts';
import { connectorProfile, signState, splitConnectInput, verifyState, type ConnectorHost } from '@oms/mod-marketplace-connectors';
import { toSyncJobDto } from '@oms/mod-sync';
import type { z } from 'zod';
import { cards } from './queries';
import type { ConnectBody, ConnectResultSchema } from './schemas';
import { startSync, type SyncScope } from './sync';

type Body = z.infer<typeof ConnectBody>;
type Result = z.infer<typeof ConnectResultSchema>;
type Step = Result['steps'][number];

const A = schema.marketplaceAccounts;

/** the signed `state` carries the account it was issued for; reading it does not trust it (verifyState checks the signature afterwards) */
export function peekState(state: string): { accountId: string } | null {
  try {
    const p = JSON.parse(Buffer.from(state.split('.')[0] ?? '', 'base64url').toString('utf8')) as { a?: unknown };
    return typeof p.a === 'string' ? { accountId: p.a } : null;
  } catch { return null; }
}

/** runs one step, times it and turns a platform error into a failed step instead of aborting the whole attempt */
async function step<T>(steps: Step[], name: Step['name'], fn: () => Promise<{ value: T; message?: string; skipped?: boolean }>): Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }> {
  const started = Date.now();
  try {
    const r = await fn();
    steps.push({ name, ok: true, skipped: r.skipped ?? false, message: r.message ?? null, durationMs: Date.now() - started });
    return { ok: true, value: r.value };
  } catch (e) {
    const error = describeError(e);
    if (!error) throw e;
    steps.push({ name, ok: false, skipped: false, message: error.message, durationMs: Date.now() - started });
    return { ok: false, error };
  }
}

function describeError(e: unknown): { code: string; message: string } | null {
  if (e instanceof AppError) return { code: e.code, message: e.message };
  if (e instanceof ConnectorError) return { code: e.kind === 'auth' ? 'INVALID_CREDENTIALS' : 'UPSTREAM_ERROR', message: e.message };
  if (pgError(e)?.code === PG.UNIQUE_VIOLATION) return { code: 'CONFLICT', message: 'This marketplace account is already connected to your business' };
  return null;
}

export interface ConnectDeps { c: Container; host: ConnectorHost; secret: string }

function chooseMode(connector: MarketplaceConnector, mode: Body['mode']): 'live' | 'sandbox' {
  return mode ?? (connector.readiness.live ? 'live' : 'sandbox');
}

function missingRedirectFields(connector: MarketplaceConnector, config: Record<string, unknown>): string[] {
  return connectorProfile(connector).authFlow.redirectFields.filter((f) => f.required && (typeof config[f.key] !== 'string' || !String(config[f.key]).trim())).map((f) => f.key);
}

/** the seller's choices become the sync jobs that run right after connecting */
function firstSyncScopes(o: Body['syncOptions']): SyncScope[] {
  if (!o.runFirstSync) return [];
  return ([['orders', o.syncOrders], ['inventory', o.syncInventory], ['catalog', o.syncCatalog]] as const).filter(([, on]) => on).map(([scope]) => scope);
}

const failed = (steps: Step[], error: { code: string; message: string }, cleanedUp: boolean): Result => ({ status: 'failed', ok: false, steps, account: null, cleanedUp, redirect: null, jobs: [], error });

/**
 * Guided connect: create account -> authorize -> test -> (queue the first sync), with a result per step.
 *  - credentials  : the whole chain in one call
 *  - nothing      : redirect connectors only; creates the pending account and returns the URL to send the seller to
 *  - code + state : finishes a redirect started earlier
 * A failure removes the account this call created, so retries never leave half-connected accounts behind.
 */
export async function runConnect(req: FastifyRequest, d: ConnectDeps, body: Body): Promise<Result> {
  const { c, host, secret } = d;
  const vendorId = requireVendor(req);
  await vendorTx(req, (tx) => assertEmailVerified(req, tx));
  const connector = c.connectors.get(body.marketplace); // 404 for unknown / disabled connectors
  const flow = connectorProfile(connector).authFlow;
  const steps: Step[] = [];

  const completing = body.code !== undefined;
  const startingRedirect = !completing && body.credentials === undefined;
  if (startingRedirect && flow.mode === 'credentials') throw Errors.validation({ issues: flow.fields.map((f) => ({ path: `credentials.${f.key}`, message: 'required: this connector takes its credentials in `credentials`' })) });
  if (startingRedirect && !body.redirectUri) throw Errors.validation({ issues: [{ path: 'redirectUri', message: 'required to start the authorization' }] });

  const split = splitConnectInput(connector, body.credentials ?? {});
  const config = { ...split.config, ...(body.config ?? {}) };
  if (startingRedirect) {
    const missing = missingRedirectFields(connector, config);
    if (missing.length) throw Errors.validation({ issues: missing.map((m) => ({ path: `config.${m}`, message: 'required' })) });
  }

  // ---- 1. the account: created now, reused when this seller already has a pending one with that name, or the one the state was issued for
  let accountId: string;
  let created = false;
  if (completing) {
    const peek = peekState(body.state!);
    if (!peek || !verifyState(secret, body.state!, vendorId, peek.accountId)) throw new AppError('BAD_REQUEST', 'Invalid or expired authorization state; restart the connection', { details: { field: 'state' } });
    const acc = await vendorTx(req, (tx) => getAccountRow(tx, vendorId, peek.accountId));
    if (acc.marketplace !== connector.code) throw new AppError('BAD_REQUEST', 'The authorization belongs to a different marketplace', { details: { field: 'marketplace' } });
    accountId = acc.id;
    steps.push({ name: 'create_account', ok: true, skipped: true, message: 'The account was created when the connection was started', durationMs: 0 });
  } else {
    const made = await vendorTx(req, async (tx) => {
      const [pending] = await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.marketplace, connector.code), eq(A.displayName, body.displayName), eq(A.status, 'pending_authorization')));
      if (pending) return { id: pending.id, created: false };
      const dto = await createAccount(tx, c, vendorId, { marketplace: connector.code, displayName: body.displayName, region: body.region, mode: chooseMode(connector, body.mode), config });
      await audit(tx, req, { action: 'marketplace_account.create', resourceType: 'marketplace_account', resourceId: dto.id, after: { marketplace: dto.marketplace, displayName: dto.displayName, mode: dto.mode, via: 'marketplace_hub' } });
      return { id: dto.id, created: true };
    });
    accountId = made.id;
    created = made.created;
    steps.push({ name: 'create_account', ok: true, skipped: !made.created, message: made.created ? null : 'Reused the pending account with this name', durationMs: 0 });
  }

  const rollback = async (): Promise<boolean> => {
    if (!created) return false;
    await vendorTx(req, async (tx) => {
      const a = await deleteAccount(tx, vendorId, accountId);
      await audit(tx, req, { action: 'marketplace_account.delete', resourceType: 'marketplace_account', resourceId: a.id, before: { marketplace: a.marketplace, displayName: a.displayName }, metadata: { reason: 'connect_failed', via: 'marketplace_hub' } });
    });
    return true;
  };

  // ---- 2. authorize (or hand back the redirect)
  if (startingRedirect) {
    const url = await step(steps, 'authorize', async () => {
      if (!connector.buildAuthorizationUrl) throw new AppError('CAPABILITY_UNSUPPORTED', `${connector.displayName} has no redirect authorization flow`, { details: { capability: 'auth.redirectFlow' } });
      const acc = await vendorTx(req, (tx) => getAccountRow(tx, vendorId, accountId));
      const state = signState(secret, vendorId, accountId);
      return { value: { state, url: connector.buildAuthorizationUrl({ state, redirectUri: body.redirectUri!, config: acc.config as Record<string, unknown> }) }, skipped: true, message: `Waiting for the seller to approve access on ${connector.displayName}` };
    });
    if (!url.ok) return failed(steps, url.error, await rollback());
    return { status: 'awaiting_authorization', ok: true, steps, account: await cardOf(req, d, vendorId, accountId), cleanedUp: false, redirect: { accountId, authorizationUrl: url.value.url, state: url.value.state, expiresInSeconds: 600 }, jobs: [], error: null };
  }

  const auth = await step(steps, 'authorize', async () => {
    await host.authorize(vendorId, accountId, completing ? { code: body.code, redirectUri: body.redirectUri, externalAccountId: body.externalAccountId } : { credentials: body.credentials });
    return { value: null, message: 'The marketplace accepted the credentials' };
  });
  if (!auth.ok) return failed(steps, auth.error, await rollback());

  // ---- 3. test the stored connection
  const test = await step(steps, 'test', async () => {
    const h = await host.healthCheck(vendorId, accountId);
    if (!h.ok) throw new AppError('UPSTREAM_ERROR', h.message ?? 'The connection test failed');
    return { value: null, message: h.message ?? 'Connected' };
  });

  // ---- 4. first sync (a problem here does not undo the connection)
  const scopes = firstSyncScopes(body.syncOptions);
  const jobs = test.ok && scopes.length
    ? await step(steps, 'first_sync', async () => {
      const acc = await vendorTx(req, (tx) => getAccountRow(tx, vendorId, accountId));
      const r = await startSync(c, vendorId, acc, scopes, req.ctx.principal?.actorId ?? null);
      return { value: r.jobs.map((j) => toSyncJobDto(j.job)), message: `Queued: ${r.jobs.map((j) => j.scope).join(', ')}${r.skipped.length ? `; skipped: ${r.skipped.map((s) => s.scope).join(', ')}` : ''}` };
    })
    : null;
  if (!jobs) steps.push({ name: 'first_sync', ok: true, skipped: true, message: test.ok ? 'No first sync requested' : 'Skipped because the connection test failed', durationMs: 0 });

  await vendorTx(req, (tx) => audit(tx, req, { action: 'marketplace_account.authorize', resourceType: 'marketplace_account', resourceId: accountId, after: { marketplace: connector.code, via: 'marketplace_hub', steps: steps.map((s) => `${s.name}:${s.ok ? 'ok' : 'failed'}`) } }));
  return {
    status: 'connected', ok: steps.every((s) => s.ok), steps, account: await cardOf(req, d, vendorId, accountId), cleanedUp: false, redirect: null,
    jobs: jobs && jobs.ok ? jobs.value : [], error: !test.ok ? test.error : jobs && !jobs.ok ? jobs.error : null,
  };
}

async function cardOf(req: FastifyRequest, d: ConnectDeps, vendorId: string, accountId: string) {
  const found = await vendorTx(req, (tx) => cards(tx, vendorId, d.c.connectors, new Date(), { id: accountId }));
  return found[0]!.card;
}
