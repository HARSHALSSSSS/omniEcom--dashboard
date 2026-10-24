import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { buildReadiness, type ReadinessFacts } from '../../modules/listings/src/workspace-domain';
import { cohortOf, healthOf, jobPercent, journeyOf, spectrumOf, syncStateOf, syncStepsOf, type AuditListing, type SyncFacts } from '../../modules/listings/src/audit-domain';

import { complianceChecks, qualityScores, variantChecks, type ProductFacts } from '../../modules/listings/src/audit-quality';
import { pricingRuleOf, syncModeOf, type PolicyFacts } from '../../modules/listings/src/audit-prep';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let viewer: Actor;
let other: Actor;
let wh: { id: string };

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
beforeEach(async () => {
  mockControl.reset();
  mockControl.configure({ seedOrders: false });
  admin = await c.registerVendor({ businessName: 'Audit Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival Audit Co' });
  wh = await c.makeWarehouse(admin);
});
afterAll(() => t.close());

const get = async (url: string, as: Actor = admin) => { const r = await c.get(url, as); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data; };
const newListing = async (accountId: string, variantId: string, extra: Record<string, unknown> = { marketplaceCategoryId: 'mock-apparel' }) => {
  const r = await c.post('/api/v1/listings', { marketplaceAccountId: accountId, variantId, ...extra }, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data;
};
const validate = async (id: string) => { const r = await c.post(`/api/v1/listings/${id}/validate`, {}, admin); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data.validation; };
const goLive = async (accountId: string, variantId: string) => {
  const l = await newListing(accountId, variantId);
  const r = await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(202);
  await t.pump();
  return l;
};

// ================================================================================================
describe('pure rules', () => {
  const facts = (o: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
    title: 'Premium cotton tee', description: 'A comfortable cotton tee for every day', brand: 'Acme', barcode: '8901234567890', imageCount: 3, primaryImage: { width: 1200, height: 1200 },
    priceMinor: 49900, mrpMinor: 59900, marketplaceCategoryId: 'cat-1', categoryRequired: true, available: 20, sellable: 18,
    validation: { validated: true, errors: [], warnings: [], requiredAttributes: 3 }, marketplaceIssues: [], ...o,
  });
  const listing = (id: string, o: Partial<AuditListing> = {}, f: Partial<ReadinessFacts> = {}): AuditListing => ({
    id, productId: `p-${id}`, variantId: `v-${id}`, sku: `SKU-${id}`, productTitle: `Product ${id}`, marketplace: 'mock', marketplaceName: 'Mock', accountName: 'Acct', accountId: 'a1',
    status: 'draft', screenStatus: 'ready', marketplaceCategoryId: 'cat-1', marketplaceCategoryName: 'Apparel', attributeValues: {}, missingAttributes: [], readiness: buildReadiness(facts(f)), ...o,
  });

  it('maps screen states to the four spectrum states', () => {
    expect(['live', 'ready', 'syncing'].map((s) => spectrumOf(s as never))).toEqual(['ready', 'ready', 'ready']);
    expect(spectrumOf('needs_review')).toBe('needs_review');
    expect(spectrumOf('blocked')).toBe('blocked');
    expect(spectrumOf('failed')).toBe('blocked');
  });

  it('scores groups with pass 1, warn 0.5, fail 0 and leaves unvalidated attributes out of the score', () => {
    const good = buildReadiness(facts());
    const noBrand = buildReadiness(facts({ brand: null }));
    const unvalidated = buildReadiness(facts({ validation: { validated: false, errors: [], warnings: [], requiredAttributes: null } }));
    const h = Object.fromEntries(healthOf([good, noBrand, unvalidated]).map((x) => [x.key, x]));
    // content: title+description+brand per listing: 3 pass, then 2 pass + 1 warn, then 3 pass => 8.5 / 9
    expect(h.content).toMatchObject({ scorePct: Math.round((100 * 8.5) / 9), checks: 9, listings: 3 });
    expect(h.attributes).toMatchObject({ unchecked: 1, listings: 2, scorePct: 100 });
  });

  it('builds the cohort: ready = no blocking check, issues list blockers first, unvalidated is not an issue', () => {
    const ok = listing('1');
    const warnOnly = listing('2', {}, { brand: null });
    const blocked = listing('3', {}, { priceMinor: 0 });
    const unvalidated = listing('4', {}, { validation: { validated: false, errors: [], warnings: [], requiredAttributes: null } });
    const c = cohortOf([ok, warnOnly, blocked, unvalidated]);
    expect(c.readyListings.map((l) => l.id)).toEqual(['1', '2', '4']);
    expect(c.blockedListings.map((l) => l.id)).toEqual(['3']);
    expect(c.readyProducts).toBe(3);
    expect(c.issueProducts).toBe(2);
    expect(c.unvalidated).toBe(1);
    expect(c.issues[0]).toMatchObject({ severity: 'blocker', listingId: '3', fixAction: 'set_price' });
    expect(c.issues.at(-1)).toMatchObject({ severity: 'warning', listingId: '2' });
  });

  it('walks the listing journey from the real status and blocker', () => {
    const blocked = listing('1', { status: 'draft' }, { validation: { validated: true, errors: [{ code: 'attribute_missing', message: 'Material is required', attribute: 'Material' }], warnings: [], requiredAttributes: 3 } });
    const steps = journeyOf(blocked);
    expect(steps.map((s) => s.state)).toEqual(['complete', 'complete', 'warning', 'pending', 'pending']);
    expect(steps[2]).toMatchObject({ title: 'Content ready', statusText: 'Material missing' });
    expect(journeyOf(listing('2', { status: 'pending' })).map((s) => s.state)).toEqual(['complete', 'complete', 'complete', 'current', 'pending']);
    expect(journeyOf(listing('3', { status: 'active' })).every((s) => s.state === 'complete')).toBe(true);
    expect(journeyOf(listing('4', { status: 'rejected' }))[3]).toMatchObject({ statusText: 'Rejected', state: 'warning' });
  });

  it('derives sync steps from states and jobs, never from invented percentages', () => {
    const job = (status: string, p = { total: 0, done: 0, failed: 0 }) => ({ id: 'j1', type: 'x', status, progress: p, startedAt: new Date('2026-01-01T10:00:00Z'), scheduledAt: new Date('2026-01-01T09:59:00Z'), finishedAt: null, error: null });
    expect(jobPercent(job('succeeded'))).toBe(100);
    expect(jobPercent(job('queued'))).toBe(0);
    expect(jobPercent(job('running'))).toBeNull();
    expect(jobPercent(job('running', { total: 4, done: 1, failed: 0 }))).toBe(25);
    const base: SyncFacts = {
      status: 'active', contentState: 'synced', contentError: null, contentSyncedAt: new Date('2026-01-01T08:00:00Z'), quantityDirty: false, sellableQuantity: 5, pushedQuantity: 5, quantityPushedAt: new Date('2026-01-01T08:30:00Z'),
      publishedAt: new Date('2026-01-01T07:00:00Z'), issueCount: 0, publishJob: null, contentJob: null, inventoryJob: null, statusJob: null,
    };
    const settled = syncStepsOf(base);
    expect(settled.map((s) => [s.key, s.status, s.progressPct])).toEqual([['content', 'complete', 100], ['stock', 'complete', 100], ['listing', 'complete', 100]]);
    expect(syncStateOf(settled, 'active')).toBe('synced');

    const busy = syncStepsOf({ ...base, contentState: 'sync_pending', contentJob: job('running', { total: 2, done: 1, failed: 0 }), quantityDirty: true, inventoryJob: job('queued') });
    expect(busy[0]).toMatchObject({ key: 'content', status: 'in_progress', progressPct: 50 });
    expect(busy[1]).toMatchObject({ key: 'stock', status: 'in_progress', progressPct: 0 });
    expect(syncStateOf(busy, 'active')).toBe('syncing');

    const pending = syncStepsOf({ ...base, status: 'pending', publishedAt: null, publishJob: job('running') });
    expect(pending[2]).toMatchObject({ key: 'listing', status: 'in_progress', progressPct: null, detail: expect.stringMatching(/review/) });
    expect(pending[1]?.status).toBe('pending');

    const failed = syncStepsOf({ ...base, contentState: 'failed', contentError: 'Marketplace said no' });
    expect(failed[0]).toMatchObject({ status: 'failed', detail: 'Marketplace said no' });
    expect(syncStateOf(failed, 'active')).toBe('attention');
    expect(syncStateOf(syncStepsOf({ ...base, status: 'draft', publishedAt: null }), 'draft')).toBe('idle');
  });
});

// ================================================================================================
describe('readiness audit, publishing preparation and sync telemetry', () => {
  const setup = async () => {
    const a = await c.connectAccount(admin, 'mock', { displayName: 'Mock A' });
    const b = await c.connectAccount(admin, 'mock', { displayName: 'Mock B', sellerId: 'SELLER-B' });
    const v1 = await c.makeVariant(admin, { title: 'Canvas travel bag', brand: 'Acme' });
    const v2 = await c.makeVariant(admin, { title: 'Leather belt', brand: 'Acme' });
    const v3 = await c.makeVariant(admin, { title: 'Silk scarf', brand: 'Acme' });
    await c.stock(admin, v1.variantId, wh.id, 20);
    await c.stock(admin, v2.variantId, wh.id, 20);
    const live = await goLive(a.id, v1.variantId);
    const l2 = await newListing(a.id, v2.variantId, { marketplaceCategoryId: 'mock-accessories' });
    const l3 = await newListing(a.id, v3.variantId, { marketplaceCategoryId: 'mock-accessories' });
    // the same belt on the second account already carries a material
    const l2b = await newListing(b.id, v2.variantId, { marketplaceCategoryId: 'mock-accessories', attributeValues: { material: 'Cotton' } });
    expect((await validate(l2.id)).ready).toBe(false);
    expect((await validate(l3.id)).ready).toBe(false);
    return { a, b, v1, v2, v3, live, l2, l3, l2b };
  };

  it('audits readiness from the real listings: spectrum, health, coverage, journey and a confirmable suggestion', async () => {
    const s = await setup();
    const audit = await get('/api/v1/listings/audit/readiness');
    expect(audit).toMatchObject({ listingsEvaluated: 4, totalListings: 4, truncated: false });
    // live = ready, the two validated listings are blocked, the unvalidated belt on B needs review
    expect(audit.spectrum).toMatchObject({ ready: 1, needs_review: 1, blocked: 2 });
    expect(audit.overall).toMatchObject({ cohortListings: 3, readyListings: 1, readyProducts: 1, readinessPct: 33 });
    const keys = audit.health.map((h: any) => h.key);
    expect(keys).toEqual(expect.arrayContaining(['content', 'attributes', 'media', 'price']));
    for (const h of audit.health) {
      expect(h.scorePct).toBeGreaterThanOrEqual(0);
      expect(h.scorePct).toBeLessThanOrEqual(100);
    }
    expect(audit.health.find((h: any) => h.key === 'attributes')).toMatchObject({ unchecked: 0 }); // the never-validated belt is checked live, like the publish flow would
    expect(audit.coverage).toEqual([{ marketplace: 'mock', name: expect.any(String), activeProducts: 1, totalProducts: 3, percent: 33 }]);
    expect(audit.unlistedProducts).toBeGreaterThanOrEqual(1);
    expect(audit.journey).toMatchObject({ listingId: expect.any(String), steps: expect.any(Array) });
    expect(audit.journey.steps).toHaveLength(5);

    const [sug] = audit.suggestions;
    expect(sug).toMatchObject({ attribute: 'material', total: 2, suggestedValue: 'Cotton', note: 'Requires merchant confirmation before applying' });
    expect(sug.listingIds.sort()).toEqual([s.l2.id, s.l3.id].sort());
    expect(sug.valueSource).toMatch(/Already set on/);

    // applying it is the existing PATCH: the listing loses its stale validation and the suggestion shrinks
    const patched = await c.patch(`/api/v1/listings/${s.l2.id}`, { attributeOverrides: { [sug.attribute]: sug.suggestedValue } }, admin);
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.data.attributeValues).toMatchObject({ material: 'Cotton' });
    const after = await get('/api/v1/listings/audit/readiness');
    expect(after.suggestions[0]).toMatchObject({ attribute: 'material', total: 1, listingIds: [s.l3.id], suggestedValue: null });
  });

  it('prepares publishing: cohort counts, issues with fix actions, channels, ids for bulk-publish', async () => {
    const s = await setup();
    const prep = await get('/api/v1/listings/audit/publishing');
    expect(prep).toMatchObject({ candidateListings: 3, readyListings: 1, blockedListings: 2, readyProducts: 1, readyVariants: 1, readyListingIds: [s.l2b.id], readyIdsTruncated: false, unvalidatedListings: 0 }); // the never-validated belt was validated live (not written) and passes
    expect(prep.potentialIssueProducts).toBeGreaterThanOrEqual(2);
    expect(prep.issues[0]).toMatchObject({ severity: 'blocker', fixAction: 'fill_attribute', field: 'material', marketplaceName: expect.any(String) });
    expect(prep.issues.filter((i: any) => i.severity === 'blocker').map((i: any) => i.listingId).sort()).toEqual([s.l2.id, s.l3.id].sort());
    expect(prep.issuesTotal).toBeGreaterThanOrEqual(prep.issues.length);
    expect(prep.channels).toEqual([expect.objectContaining({ marketplace: 'mock', ready: 1, blocked: 2, accounts: expect.arrayContaining([expect.objectContaining({ name: 'Mock A' }), expect.objectContaining({ name: 'Mock B' })]) })]);

    // the screen publishes exactly the ready ids through the existing bulk endpoint
    const pub = await c.post('/api/v1/listings/bulk-publish', { ids: prep.readyListingIds }, admin);
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    expect(pub.body.data.summary).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
    await t.pump();
    const after = await get('/api/v1/listings/audit/publishing');
    expect(after).toMatchObject({ candidateListings: 2, readyListings: 0, readyListingIds: [] });
  });

  it('never calls a listing ready that the publish validation would refuse, also when nobody validated it yet', async () => {
    const s = await setup();
    // never validated, and the category needs a material that this listing does not have: the stored readiness could not see that
    const l3b = await newListing(s.b.id, s.v3.variantId, { marketplaceCategoryId: 'mock-accessories' });
    const prep = await get('/api/v1/listings/audit/publishing');
    expect(prep.readyListingIds).toEqual([s.l2b.id]);
    expect(prep).toMatchObject({ candidateListings: 4, readyListings: 1, blockedListings: 3, unvalidatedListings: 0 });
    expect(prep.issues.find((i: any) => i.listingId === l3b.id && i.severity === 'blocker')).toMatchObject({ field: 'material', fixAction: 'fill_attribute', issue: expect.stringMatching(/material/i) });
    const audit = await get('/api/v1/listings/audit/readiness');
    expect(audit.overall).toMatchObject({ cohortListings: 4, readyListings: 1, readinessPct: 25 });
    expect(audit.health.find((h: any) => h.key === 'attributes')).toMatchObject({ unchecked: 0 });
    // the read validates live but writes nothing: the listing still has no stored validation
    const row = (await get('/api/v1/listings/table?pageSize=50')).items.find((i: any) => i.id === l3b.id);
    expect(row.table.readiness).toMatchObject({ attributesChecked: false });

    // everything the screen calls ready goes through the publish flow; the one it called blocked is refused for exactly that reason
    const pub = await c.post('/api/v1/listings/bulk-publish', { ids: prep.readyListingIds }, admin);
    expect(pub.body.data.summary).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
    const refused = await c.post('/api/v1/listings/bulk-publish', { ids: [l3b.id] }, admin);
    expect(refused.body.data.results[0]).toMatchObject({ ok: false, outcome: 'blocked', error: { code: 'LISTING_NOT_READY' }, message: expect.stringMatching(/material is required/i) });
  });

  it('shows sync telemetry from the listing state and its jobs', async () => {
    const s = await setup();
    // a published listing that is settled
    const settled = await get(`/api/v1/listings/${s.live.id}/sync`);
    expect(settled).toMatchObject({ listingId: s.live.id, state: 'synced', listing: { productTitle: 'Canvas travel bag', status: 'active', screenStatus: 'live', variantsCount: 1 } });
    expect(settled.steps.map((x: any) => x.key)).toEqual(['content', 'stock', 'listing']);
    expect(settled.steps.every((x: any) => x.status === 'complete' && x.progressPct === 100)).toBe(true);
    expect(settled.jobs.some((j: any) => j.type === 'listing_publish' && j.status === 'succeeded')).toBe(true);

    // a draft has nothing in flight
    const draft = await get(`/api/v1/listings/${s.l3.id}/sync`);
    expect(draft.state).toBe('idle');
    expect(draft.steps.map((x: any) => x.status)).toEqual(['pending', 'pending', 'pending']);

    // publishing queues a job: the listing step is in progress until the worker has run
    const flow = await c.post(`/api/v1/listings/${s.l2b.id}/publish-flow`, {}, admin);
    expect(flow.status, JSON.stringify(flow.body)).toBe(202);
    const busy = await get(`/api/v1/listings/${s.l2b.id}/sync`);
    expect(busy.state).toBe('syncing');
    expect(busy.steps.find((x: any) => x.key === 'listing')).toMatchObject({ status: 'in_progress', jobId: flow.body.data.job.id });
    expect(busy.startedAt).toEqual(expect.any(String));
    await t.pump();
    expect((await get(`/api/v1/listings/${s.l2b.id}/sync`)).state).toBe('synced');

    expect((await c.get('/api/v1/listings/00000000-0000-4000-8000-000000000000/sync', admin)).status).toBe(404);
  });

  it('is read-only for a viewer and invisible to another vendor', async () => {
    const s = await setup();
    expect((await get('/api/v1/listings/audit/readiness', viewer)).listingsEvaluated).toBe(4);
    expect((await get('/api/v1/listings/audit/publishing', viewer)).candidateListings).toBe(3);
    expect((await get(`/api/v1/listings/${s.live.id}/sync`, viewer)).state).toBe('synced');

    const mine = await get('/api/v1/listings/audit/readiness', other);
    expect(mine).toMatchObject({ listingsEvaluated: 0, overall: { readinessPct: null, cohortListings: 0 }, suggestions: [], journey: null });
    expect((await get('/api/v1/listings/audit/publishing', other)).candidateListings).toBe(0);
    expect((await c.get(`/api/v1/listings/${s.live.id}/sync`, other)).status).toBe(404);
  });

  it('scores Variants and Compliance from the catalogue and puts them in the design order', async () => {
    await setup();
    const audit = await get('/api/v1/listings/audit/readiness');
    const keys = audit.health.map((h: any) => h.key);
    expect(keys.slice(0, 5)).toEqual(['content', 'attributes', 'media', 'variants', 'compliance']);
    // single-variant products without barcode or image: SKU and price pass, barcode and image fail => 2 of 4 checks, over 4 listings
    expect(audit.health.find((h: any) => h.key === 'variants')).toEqual({ key: 'variants', label: 'Variants', scorePct: 50, listings: 4, checks: 16, unchecked: 0 });
    // every listing misses the weight; all 4 answer the category attributes check, the never-validated belt too (validated live like the publish flow does):
    // the live one and the belt with a material pass, the two blocked ones miss material
    const compliance = audit.health.find((h: any) => h.key === 'compliance');
    expect(compliance).toMatchObject({ label: 'Compliance', listings: 4, checks: 32, unchecked: 0 });
    expect(compliance.scorePct).toBe(Math.round((100 * 26) / 32));
  });

  it('shows the pricing rule and the sync mode of every channel, and what the approval locks', async () => {
    await setup();
    expect((await get('/api/v1/listings/audit/publishing')).channels[0].pricingRule).toBeNull();
    const pol = await c.post('/api/v1/pricing/policies', { name: 'Mock margin floor', strategy: 'margin_floor', targetMarginMinBps: 1500, status: 'active' }, admin);
    expect(pol.status, JSON.stringify(pol.body)).toBe(201);
    const paused = await c.post('/api/v1/pricing/policies', { name: 'Paused one', strategy: 'custom', params: { targetMarginBps: 2000 }, status: 'paused' }, admin);
    expect(paused.status, JSON.stringify(paused.body)).toBe(201);
    const prep = await get('/api/v1/listings/audit/publishing');
    expect(prep.channels[0].pricingRule).toEqual({ policyId: pol.body.data.id, name: 'Mock margin floor', strategy: 'margin_floor', strategyLabel: 'Margin floor', scope: 'all_channels', summary: 'Margin floor · margin never under 15%' });
    expect(prep.channels[0].sync).toMatchObject({ mode: expect.stringMatching(/^(real_time|polling)$/), label: expect.any(String), detail: expect.stringMatching(/listing status checked every 2 min/) });
    expect(prep.publishLock.locked).toEqual(expect.arrayContaining(['price', 'MRP']));
    expect(prep.publishLock.notLocked).toEqual(['stock']);
    expect(prep.publishLock.statement).toMatch(/approved again/);
  });

  it('reports the counts of the running publish job on the sync steps', async () => {
    const s = await setup();
    const flow = await c.post(`/api/v1/listings/${s.l2b.id}/publish-flow`, {}, admin);
    expect(flow.status, JSON.stringify(flow.body)).toBe(202);
    const queued = await get(`/api/v1/listings/${s.l2b.id}/sync`);
    expect(queued.steps.find((x: any) => x.key === 'listing')).toMatchObject({ status: 'in_progress', progressPct: 0, progress: null });
    await t.pump();
    const done = await get(`/api/v1/listings/${s.l2b.id}/sync`);
    expect(done.steps.every((x: any) => x.progress === null)).toBe(true);
    const job = done.jobs.find((j: any) => j.type === 'listing_publish');
    expect(job).toMatchObject({ status: 'succeeded', progress: { total: 3 } });
    expect(job.progress.done).toBeGreaterThanOrEqual(2);
  });
});

describe('catalogue quality and preparation rules', () => {
  const variant = (o: Partial<ProductFacts['variants'][number]> = {}) => ({ id: 'v1', sku: 'S1', barcode: '890', optionValues: { size: 'M' }, sellingPriceMinor: 100, imageCount: 1, listedOn: ['a1'], taxRateBps: null, weightGrams: 200, ...o });
  const product = (variants: ProductFacts['variants'], o: Partial<ProductFacts> = {}): ProductFacts => ({ hsnCode: '6109', gstRateBps: 1200, countryOfOrigin: 'IN', manufacturer: null, brand: 'Acme', weightGrams: null, imageCount: 0, variants, ...o });

  it('scores variants by the share that is complete', () => {
    const full = variantChecks(product([variant(), variant({ id: 'v2', sku: 'S2', optionValues: { size: 'L' } })]), 'a1');
    expect(full.every((x) => x.ratio === 1)).toBe(true);
    expect(full.map((x) => x.key)).toEqual(['options', 'sku', 'barcode', 'price', 'image', 'listed']);
    const gaps = variantChecks(product([variant(), variant({ id: 'v2', sku: 'S2', optionValues: {}, barcode: null, sellingPriceMinor: 0, imageCount: 0, listedOn: ['other'] })]), 'a1');
    expect(Object.fromEntries(gaps.map((x) => [x.key, x.ratio]))).toEqual({ options: 0.5, sku: 1, barcode: 0.5, price: 0.5, image: 0.5, listed: 0.5 });
    // one variant: options and "all listed" do not apply, the product images count as its images
    const single = variantChecks(product([variant({ imageCount: 0 })], { imageCount: 2 }), 'a1');
    expect(single.map((x) => x.key)).toEqual(['sku', 'barcode', 'price', 'image']);
    expect(single.find((x) => x.key === 'image')!.ratio).toBe(1);
    expect(variantChecks(product([]), 'a1')).toEqual([]);
  });

  it('checks compliance fields, price against MRP and the category attributes only once validated', () => {
    const p = product([variant({ taxRateBps: 500 })], { gstRateBps: null, hsnCode: null, brand: null, manufacturer: 'Acme Mfg' });
    const base = { accountId: 'a1', variantId: 'v1', priceMinor: 500, mrpMinor: 400, attributesChecked: false, missingAttributes: [] as string[] };
    const r = Object.fromEntries(complianceChecks(p, base).map((x) => [x.key, x.ratio]));
    expect(r).toEqual({ hsn: 0, gst: 1, origin: 1, manufacturer: 1, weight: 1, mrp: 1, price_within_mrp: 0 });
    const validated = Object.fromEntries(complianceChecks(p, { ...base, priceMinor: 300, attributesChecked: true, missingAttributes: ['material'] }).map((x) => [x.key, x.ratio]));
    expect(validated).toMatchObject({ price_within_mrp: 1, category_attributes: 0 });
    expect(complianceChecks(p, { ...base, mrpMinor: null }).find((x) => x.key === 'mrp')!.ratio).toBe(0);
    const scores = qualityScores([{ variants: [], compliance: complianceChecks(p, base), attributesChecked: false }]);
    expect(scores).toEqual([{ key: 'compliance', label: 'Compliance', scorePct: Math.round((100 * 5) / 7), listings: 1, checks: 7, unchecked: 1 }]);
  });

  it('picks the pricing rule like proposal generation does and names the sync mode truthfully', () => {
    const pol = (id: string, accountId: string | null): PolicyFacts => ({ id, name: id, accountId, strategy: 'automated_match', targetMarginMinBps: 0, maxDiscountBps: 250, autoApproveUnderBps: 0 });
    expect(pricingRuleOf([pol('all', null), pol('own', 'a1')], ['a1'])).toMatchObject({ policyId: 'own', scope: 'account', summary: 'Competitor match · discount up to 2.50%' });
    expect(pricingRuleOf([pol('all', null), pol('own', 'a9')], ['a1'])).toMatchObject({ policyId: 'all', scope: 'all_channels' });
    expect(pricingRuleOf([pol('own', 'a9')], ['a1'])).toBeNull();

    const facts = { ordersWebhook: false, returnsWebhook: false, inventoryPush: true, pricingPush: false, listingUpdate: true, ordersPollSeconds: 300, listingStatusPollSeconds: 120 };
    expect(syncModeOf({ ...facts, ordersWebhook: true })).toMatchObject({ mode: 'real_time', label: 'Real-time', detail: 'Orders arrive by webhook; stock is pushed when it changes; listing status checked every 2 min' });
    expect(syncModeOf(facts)).toMatchObject({ mode: 'polling', label: 'Polling every 2 min' });
    expect(syncModeOf({ ...facts, inventoryPush: false, ordersPollSeconds: null, listingStatusPollSeconds: null })).toMatchObject({ mode: 'manual', label: 'On demand' });
    expect(syncModeOf(null).mode).toBe('manual');
  });
});
