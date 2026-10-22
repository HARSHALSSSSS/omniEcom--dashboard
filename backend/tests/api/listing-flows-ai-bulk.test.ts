import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let viewer: Actor;
let other: Actor;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
beforeEach(async () => {
  mockControl.reset();
  mockControl.configure({ seedOrders: false });
  admin = await c.registerVendor({ businessName: 'Flows AI Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival AI Co' });
});
afterAll(() => t.close());

const ok = async (r: Promise<{ status: number; body: any }>, status = 200) => { const x = await r; expect(x.status, JSON.stringify(x.body)).toBe(status); return x.body.data; };
const listing = (accountId: string, variantId: string, marketplaceCategoryId = 'mock-apparel') => ok(c.post('/api/v1/listings', { marketplaceAccountId: accountId, variantId, marketplaceCategoryId }, admin), 201);
const product = async (code: string, extra: Record<string, unknown> = {}, variants: Array<Record<string, unknown>> = [{ sku: `${code}-A`, sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { color: 'Blue', size: 'M' } }]) =>
  ok(c.post('/api/v1/products', { productCode: code, title: 'Cotton overshirt', brand: 'Acme', description: 'A comfortable everyday overshirt', countryOfOrigin: 'IN', hsnCode: '6109', gstRateBps: 1200, status: 'active', variants, ...extra }, admin), 201);

describe('flow details: category paths and the fixed completeness list', () => {
  it('gives the full marketplace and master category paths, the variant count and Title/Images/SKU/Category/Weight', async () => {
    const mock = await c.connectAccount(admin, 'mock', { displayName: 'Mock One' });
    const root = await ok(c.post('/api/v1/categories', { name: 'Apparel' }, admin), 201);
    const tops = await ok(c.post('/api/v1/categories', { name: 'Tops', parentId: root.id }, admin), 201);
    const shirts = await ok(c.post('/api/v1/categories', { name: 'Shirts', parentId: tops.id }, admin), 201);
    const p = await product('FD-1', { categoryId: shirts.id }, [
      { sku: 'FD-1-A', sellingPriceMinor: 49900, mrpMinor: 59900, weightGrams: 250, optionValues: { color: 'Blue', size: 'M' } },
      { sku: 'FD-1-B', sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { color: 'Red', size: 'L' } },
    ]);
    const [a, b] = p.variants;
    const la = await listing(mock.id, a.id);
    const lb = await listing(mock.id, b.id);

    const da = await ok(c.get(`/api/v1/listings/${la.id}/flow-details`, admin));
    expect(da).toMatchObject({ listingId: la.id, sku: 'FD-1-A', variantsCount: 2 });
    expect(da.category).toMatchObject({ marketplaceCategoryId: 'mock-apparel', marketplacePath: 'Fashion > Apparel', masterPath: 'Apparel > Tops > Shirts', masterName: 'Shirts', fullPath: 'Fashion > Apparel' });
    expect(da.category.channelCategory).toContain('Apparel');
    expect(da.completeness.map((x: any) => x.key)).toEqual(['title', 'images', 'sku', 'category', 'weight']);
    const by = (d: any) => Object.fromEntries(d.completeness.map((x: any) => [x.key, x]));
    expect(by(da)).toMatchObject({ title: { status: 'pass', detail: 'Cotton overshirt' }, sku: { status: 'pass', detail: 'FD-1-A' }, category: { status: 'pass' }, weight: { status: 'pass', detail: '250 g' }, images: { status: 'warn' } });

    // no weight on the variant or the product: a warning, never a made-up number
    const db = await ok(c.get(`/api/v1/listings/${lb.id}/flow-details`, admin));
    expect(by(db).weight.status).toBe('warn');

    // viewers read it, other tenants do not see it
    expect((await ok(c.get(`/api/v1/listings/${la.id}/flow-details`, viewer))).listingId).toBe(la.id);
    expect((await c.get(`/api/v1/listings/${la.id}/flow-details`, other)).status).toBe(404);
  });

  it('falls back to the master category path when the listing has no marketplace category yet', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const root = await ok(c.post('/api/v1/categories', { name: 'Bags' }, admin), 201);
    const p = await product('FD-2', { categoryId: root.id });
    const l = await ok(c.post('/api/v1/listings', { marketplaceAccountId: mock.id, variantId: p.variants[0].id }, admin), 201);
    const d = await ok(c.get(`/api/v1/listings/${l.id}/flow-details`, admin));
    expect(d.category).toMatchObject({ marketplaceCategoryId: null, marketplacePath: null, masterPath: 'Bags', fullPath: 'Bags' });
    expect(d.completeness.find((x: any) => x.key === 'category').status).toBe('fail');
  });
});

describe('fix suggestions ("Fix with AI")', () => {
  it('proposes the missing material from the title with a reason and a confidence, saves nothing, and applies through PATCH', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p = await product('FS-1', { title: 'Premium Cotton Travel Pouch' });
    const l = await listing(mock.id, p.variants[0].id, 'mock-accessories');
    await ok(c.post(`/api/v1/listings/${l.id}/validate`, {}, admin));
    const studio = await ok(c.get(`/api/v1/listings/${l.id}/studio`, admin));
    expect(studio.readiness.groups.flatMap((g: any) => g.items).some((i: any) => i.status === 'fail' && i.field === 'material')).toBe(true);

    const s = await ok(c.get(`/api/v1/listings/${l.id}/fix-suggestions`, admin));
    expect(s).toMatchObject({ listingId: l.id, engine: 'rules', version: studio.listing.version });
    const material = s.suggestions.find((x: any) => x.key === 'material');
    expect(material).toMatchObject({ kind: 'attribute', severity: 'fail', value: 'Cotton', source: 'keyword_match', confidenceLevel: expect.stringMatching(/high|medium/), apply: { attributeOverrides: { material: 'Cotton' } } });
    expect(material.confidence).toBeGreaterThan(0.5);
    expect(material.reason).toMatch(/cotton/i);
    // reading suggestions changes nothing
    expect((await ok(c.get(`/api/v1/listings/${l.id}/studio`, admin))).listing.version).toBe(studio.listing.version);

    // accepting = the existing save with the version, then the validation
    await ok(c.patch(`/api/v1/listings/${l.id}`, { version: s.version, ...material.apply }, admin));
    await ok(c.post(`/api/v1/listings/${l.id}/validate`, {}, admin));
    const after = await ok(c.get(`/api/v1/listings/${l.id}/fix-suggestions`, admin));
    expect(after.suggestions.find((x: any) => x.key === 'material')).toBeUndefined();
    expect((await ok(c.get(`/api/v1/listings/${l.id}/studio`, admin))).readiness.ready).toBe(true);
  });

  it('prefers what the same product already has on another listing and says so', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p = await product('FS-2', { title: 'Everyday carry pouch', description: 'Simple and light' }, [
      { sku: 'FS-2-A', sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { color: 'Blue' } },
      { sku: 'FS-2-B', sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { color: 'Red' } },
    ]);
    const first = await listing(mock.id, p.variants[0].id, 'mock-accessories');
    const second = await listing(mock.id, p.variants[1].id, 'mock-accessories');
    await ok(c.patch(`/api/v1/listings/${first.id}`, { attributeOverrides: { material: 'Jute' } }, admin));
    await ok(c.post(`/api/v1/listings/${second.id}/validate`, {}, admin));
    const s = await ok(c.get(`/api/v1/listings/${second.id}/fix-suggestions`, admin));
    const material = s.suggestions.find((x: any) => x.key === 'material');
    expect(material).toMatchObject({ value: 'Jute', source: 'other_listing', confidenceLevel: 'high' });
    expect(material.reason).toContain('FS-2-A');
  });

  it('matches the marketplace\'s allowed values and the variant option, and reports what it cannot find', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p = await product('FS-3', { title: 'Plain tee' }, [{ sku: 'FS-3-A', sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { size: 'xl' } }]);
    const l = await listing(mock.id, p.variants[0].id, 'mock-apparel');
    // the size is an option of the variant (any case), the colour has no signal at all
    await ok(c.patch(`/api/v1/listings/${l.id}`, { attributeOverrides: { size: 'Huge' } }, admin));
    await ok(c.post(`/api/v1/listings/${l.id}/validate`, {}, admin));
    const s = await ok(c.get(`/api/v1/listings/${l.id}/fix-suggestions`, admin));
    expect(s.suggestions.find((x: any) => x.key === 'size')).toMatchObject({ value: 'XL', source: 'variant_option' });
    expect(s.suggestions.find((x: any) => x.key === 'size').apply).toEqual({ attributeOverrides: { size: 'XL' } });
    expect(s.unresolved.map((x: any) => x.key)).toContain('color');
  });

  it('is tenant-isolated and readable by viewers', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p = await product('FS-4', { title: 'Premium Cotton Travel Pouch' });
    const l = await listing(mock.id, p.variants[0].id, 'mock-accessories');
    expect((await c.get(`/api/v1/listings/${l.id}/fix-suggestions`, other)).status).toBe(404);
    expect((await ok(c.get(`/api/v1/listings/${l.id}/fix-suggestions`, viewer))).listingId).toBe(l.id);
  });
});

describe('bulk content edit', () => {
  const content = async (id: string) => (await ok(c.get(`/api/v1/listings/${id}/studio`, admin))).content;

  it('prefixes titles, adds bullets and terms, sets the brand, per listing results, applied once per product and marketplace', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p1 = await product('BC-1', { title: 'Cotton overshirt' }, [
      { sku: 'BC-1-A', sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { size: 'M' } },
      { sku: 'BC-1-B', sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { size: 'L' } },
    ]);
    const p2 = await product('BC-2', { title: 'Linen trousers' });
    const l1a = await listing(mock.id, p1.variants[0].id);
    const l1b = await listing(mock.id, p1.variants[1].id);
    const l2 = await listing(mock.id, p2.variants[0].id);
    const ghost = '00000000-0000-4000-8000-000000000000';

    const res = await ok(c.post('/api/v1/listings/bulk-content', {
      ids: [l1a.id, l1b.id, l2.id, ghost],
      edits: { title: { op: 'prefix', value: 'Summer ' }, bulletPoints: { op: 'add', values: ['100% cotton', 'Machine washable'] }, searchTerms: { op: 'add', values: ['overshirt'] }, brand: { op: 'set', value: 'Nova' } },
    }, admin));
    expect(res).toMatchObject({ action: 'edit_content', dryRun: false, summary: { total: 4, succeeded: 3, failed: 1, skipped: 0 } });
    expect(res.results.map((x: any) => [x.id, x.status])).toEqual([[l1a.id, 'done'], [l1b.id, 'done'], [l2.id, 'done'], [ghost, 'failed']]);
    expect(res.results[0]).toMatchObject({ outcome: 'updated', changedFields: expect.arrayContaining(['title', 'bulletPoints', 'searchTerms', 'brand']), changes: { title: { before: 'Cotton overshirt', after: 'Summer Cotton overshirt' } } });
    expect(res.results[1].message).toContain('BC-1-A');
    expect(res.results[3].error).toMatchObject({ code: 'NOT_FOUND' });

    // the sibling is not prefixed twice
    for (const [id, title] of [[l1a.id, 'Summer Cotton overshirt'], [l1b.id, 'Summer Cotton overshirt'], [l2.id, 'Summer Linen trousers']]) {
      const cnt = await content(id as string);
      expect(cnt.title.effective).toBe(title);
      expect(cnt.title.overridden).toBe(true);
      expect(cnt.bulletPoints.effective).toEqual(['100% cotton', 'Machine washable']);
      expect(cnt.brand.effective).toBe('Nova');
    }
    expect((await content(l2.id)).searchTerms.effective).toContain('overshirt');

    // the same edit again: a replace that finds nothing and a suffix are different, an identical set changes nothing
    const again = await ok(c.post('/api/v1/listings/bulk-content', { ids: [l2.id], edits: { brand: { op: 'set', value: 'Nova' }, bulletPoints: { op: 'add', values: ['machine washable'] } } }, admin));
    expect(again.results[0]).toMatchObject({ status: 'skipped', outcome: 'unchanged' });
  });

  it('replaces text, appends to the description and clears terms', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p = await product('BC-3', { title: 'Cotton overshirt blue', description: 'Soft cotton overshirt for every day' });
    const l = await listing(mock.id, p.variants[0].id);
    const res = await ok(c.post('/api/v1/listings/bulk-content', { ids: [l.id], edits: { title: { op: 'replace', find: 'BLUE', value: 'Navy' }, description: { op: 'append', value: 'Free shipping.' }, searchTerms: { op: 'clear' } } }, admin));
    expect(res.results[0]).toMatchObject({ status: 'done' });
    const cnt = await content(l.id);
    expect(cnt.title.effective).toBe('Cotton overshirt Navy');
    expect(cnt.description.effective).toBe('Soft cotton overshirt for every day\n\nFree shipping.');
    // the master product is untouched
    expect(cnt.title.master).toBe('Cotton overshirt blue');
  });

  it('previews with dryRun and saves nothing', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p = await product('BC-4', { title: 'Cotton overshirt' });
    const l = await listing(mock.id, p.variants[0].id);
    const before = await ok(c.get(`/api/v1/listings/${l.id}/studio`, admin));
    const res = await ok(c.post('/api/v1/listings/bulk-content', { ids: [l.id], dryRun: true, edits: { title: { op: 'suffix', value: ' - New' } } }, admin));
    expect(res).toMatchObject({ dryRun: true, summary: { succeeded: 1 } });
    expect(res.results[0]).toMatchObject({ outcome: 'preview', changes: { title: { after: 'Cotton overshirt - New' } } });
    const after = await ok(c.get(`/api/v1/listings/${l.id}/studio`, admin));
    expect(after.content.title.effective).toBe('Cotton overshirt');
    expect(after.listing.version).toBe(before.listing.version);
  });

  it('is version-safe: a listing that changed since the screen showed it is left alone, the others go through', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p1 = await product('BC-5', { title: 'Cotton overshirt' });
    const p2 = await product('BC-6', { title: 'Linen trousers' });
    const l1 = await listing(mock.id, p1.variants[0].id);
    const l2 = await listing(mock.id, p2.variants[0].id);
    const res = await ok(c.post('/api/v1/listings/bulk-content', { ids: [l1.id, l2.id], versions: { [l1.id]: l1.version + 5, [l2.id]: l2.version }, edits: { title: { op: 'prefix', value: 'New ' } } }, admin));
    expect(res.summary).toMatchObject({ succeeded: 1, failed: 1 });
    expect(res.results[0]).toMatchObject({ id: l1.id, status: 'failed', error: { code: 'VERSION_CONFLICT' } });
    expect(res.results[1]).toMatchObject({ id: l2.id, status: 'done' });
    expect((await content(l1.id)).title.overridden).toBe(false);
  });

  it('rejects results that break the limits for that listing only, validates the body and needs listings:write', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const p = await product('BC-7', { title: 'Cotton overshirt' });
    const l = await listing(mock.id, p.variants[0].id);
    const long = await ok(c.post('/api/v1/listings/bulk-content', { ids: [l.id], edits: { title: { op: 'suffix', value: 'x'.repeat(500) } } }, admin));
    expect(long.results[0]).toMatchObject({ status: 'failed', error: { code: 'VALIDATION_FAILED' } });

    const bad = (body: unknown, as: Actor = admin) => c.post('/api/v1/listings/bulk-content', body, as);
    expect((await bad({ ids: [l.id], edits: {} })).status).toBe(400);
    expect((await bad({ ids: [], edits: { brand: { op: 'clear' } } })).status).toBe(400);
    expect((await bad({ ids: [l.id], edits: { title: { op: 'replace', find: '', value: 'x' } } })).status).toBe(400);
    expect((await bad({ ids: Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), edits: { brand: { op: 'clear' } } })).status).toBe(400);
    expect((await bad({ ids: [l.id], edits: { brand: { op: 'clear' } } }, viewer)).status).toBe(403);

    // another tenant's listing is "not found", never edited
    const foreign = await ok(c.post('/api/v1/listings/bulk-content', { ids: [l.id], edits: { brand: { op: 'set', value: 'Hijack' } } }, other));
    expect(foreign.results[0]).toMatchObject({ status: 'failed', error: { code: 'NOT_FOUND' } });
    expect((await content(l.id)).brand.overridden).toBe(false);
  });
});
