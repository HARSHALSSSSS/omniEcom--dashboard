import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { DEFAULT_CATEGORY_TREE, defaultCategoryRows } from '../../packages/database/src/default-categories';

/**
 * A live listing makes its draft product active (and the data fix for products that were left in draft), and every business has the default
 * category tree (sign-up and the backfill migration), with its own categories untouched.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;

const MIGRATIONS = resolve(__dirname, '../../packages/database/migrations');
const sqlOf = (file: string) => readFileSync(resolve(MIGRATIONS, file), 'utf8');
const owner = async <R = any>(q: string, params: unknown[] = []): Promise<R[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<R>(q, params)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};
const runMigration = async (file: string) => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { await pg.exec(sqlOf(file)); } finally { await pg.exec('SET ROLE oms_app'); }
};

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());
beforeEach(async () => {
  mockControl.reset();
  mockControl.configure({ seedOrders: false });
  admin = await c.registerVendor({ businessName: 'Live Co' });
  await c.makeWarehouse(admin);
});

const productStatus = async (id: string) => (await c.get(`/api/v1/products/${id}`, admin)).body.data.status as string;
const stats = async () => (await c.get('/api/v1/products/stats', admin)).body.data;
const card = async (code: string) => ((await c.get(`/api/v1/products/catalog?q=${encodeURIComponent(code)}`, admin)).body.data.items as any[]).find((p) => p.productCode === code);

describe('a live listing makes its product active', () => {
  it('publishing a listing of a draft product activates it, with the usual event and audit; the tab counts follow', async () => {
    const account = await c.connectAccount(admin, 'mock', { displayName: 'Live Mock' });
    const v = await c.makeVariant(admin, { title: 'Draft shirt', brand: 'Acme', status: 'draft' });
    const wh = (await c.get('/api/v1/warehouses', admin)).body.data[0] as { id: string };
    await c.stock(admin, v.variantId, wh.id, 10);
    expect(await productStatus(v.productId)).toBe('draft');
    expect(await stats()).toMatchObject({ draft: 1, activeProducts: 0 });
    const made = await c.post('/api/v1/listings', { marketplaceAccountId: account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const flow = await c.post(`/api/v1/listings/${made.body.data.id}/publish-flow`, {}, admin);
    expect(flow.status, JSON.stringify(flow.body)).toBe(202);
    await t.pump();
    expect((await owner(`select status from marketplace_listings where id = $1`, [made.body.data.id]))[0].status).toBe('active');
    expect(await productStatus(v.productId)).toBe('active');
    expect(await stats()).toMatchObject({ draft: 0, activeProducts: 1 });
    const audits = await owner(`select action, after from audit_logs where vendor_id = $1 and resource_id = $2 and action = 'product.update'`, [admin.vendorId, v.productId]);
    expect(audits.length).toBe(1);
    expect(audits[0].after.status).toBe('active');
    // the card no longer says "ready to publish"
    const hint = (await card(`P-${v.sku}`)).summary.hint.key;
    expect(['draft_ready', 'draft_incomplete', 'draft_missing_content']).not.toContain(hint);
  });
});

describe('legacy draft products with a live listing', () => {
  it('the card says it is live while the data is not yet fixed, and migration 0027 fixes it: draft to active, archived and idle drafts untouched, idempotent', async () => {
    const account = await c.connectAccount(admin, 'mock', { displayName: 'Legacy Mock' });
    const live = await c.makeVariant(admin, { title: 'Legacy live', brand: 'Acme', status: 'draft' });
    const idle = await c.makeVariant(admin, { title: 'Idle draft', brand: 'Acme', status: 'draft' });
    const archived = await c.makeVariant(admin, { title: 'Archived live', brand: 'Acme' });
    for (const v of [live, archived]) {
      const made = await c.post('/api/v1/listings', { marketplaceAccountId: account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, admin);
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      await owner(`update marketplace_listings set status = 'active' where id = $1`, [made.body.data.id]);
    }
    expect((await c.patch(`/api/v1/products/${archived.productId}`, { status: 'archived' }, admin)).status).toBe(200);
    expect(await productStatus(live.productId)).toBe('draft');
    // before the fix: a live product that is still a draft is not offered as "ready to publish"
    expect((await card(`P-${live.sku}`)).summary.hint.key).toBe('live_on_channels');
    expect((await card(`P-${idle.sku}`)).summary.hint.key).not.toBe('live_on_channels');

    await runMigration('0027_products_live_listing_active.sql');
    expect(await productStatus(live.productId)).toBe('active');
    expect(await productStatus(idle.productId)).toBe('draft');
    expect(await productStatus(archived.productId)).toBe('archived');
    const versions = await owner(`select version from products where id = $1`, [live.productId]);
    await runMigration('0027_products_live_listing_active.sql');
    expect((await owner(`select version from products where id = $1`, [live.productId]))[0].version).toBe(versions[0].version);
    expect(await stats()).toMatchObject({ draft: 1, archived: 1, activeProducts: 1 });
  });
});

describe('default categories', () => {
  it('the tree is well formed: unique slugs, every child under a known parent', () => {
    const rows = defaultCategoryRows();
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
    expect(DEFAULT_CATEGORY_TREE.map((r) => r.name)).toEqual(expect.arrayContaining(['Fashion', 'Electronics', 'Home & Kitchen', 'Beauty & Personal Care', 'Pet Supplies']));
    const roots = new Set(rows.filter((r) => !r.parentSlug).map((r) => r.slug));
    expect(rows.filter((r) => r.parentSlug).every((r) => roots.has(r.parentSlug!))).toBe(true);
  });

  it('a new business starts with the tree, with the hierarchy and paths', async () => {
    const tree = (await c.get('/api/v1/categories/tree', admin)).body.data as Array<{ name: string; slug: string; path: string; children: Array<{ name: string; path: string }> }>;
    const fashion = tree.find((n) => n.name === 'Fashion')!;
    expect(fashion.children.map((x) => x.name)).toContain('Footwear');
    expect(fashion.children.find((x) => x.name === 'Footwear')!.path).toBe('fashion/footwear');
    expect(tree.length).toBe(DEFAULT_CATEGORY_TREE.length);
  });

  it('the seller adds a category (also under a parent), and a duplicate is refused', async () => {
    const tree = (await c.get('/api/v1/categories/tree', admin)).body.data as Array<{ id: string; name: string }>;
    const parent = tree.find((n) => n.name === 'Fashion')!;
    const own = await c.post('/api/v1/categories', { name: 'Handloom Sarees', parentId: parent.id }, admin);
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    expect(own.body.data.path).toBe('fashion/handloom-sarees');
    expect((await c.post('/api/v1/categories', { name: 'Handloom Sarees', parentId: parent.id }, admin)).status).toBe(409);
  });

  it('the backfill migration fills a business that only had a few categories, never duplicating or renaming theirs, and is idempotent', async () => {
    const old = await c.registerVendor({ businessName: 'Old Business' });
    await owner(`delete from categories where vendor_id = $1`, [old.vendorId!]);
    const mine = (await c.post('/api/v1/categories', { name: 'Accessories' }, old)).body.data.id as string;
    const custom = (await c.post('/api/v1/categories', { name: 'Electronics', slug: 'my-electronics' }, old)).body.data.id as string;
    const counts = async (vendorId: string) => Number((await owner(`select count(*)::int n from categories where vendor_id = $1 and deleted_at is null`, [vendorId]))[0].n);
    const otherBefore = await counts(admin.vendorId!);
    await runMigration('0028_default_categories_backfill.sql');
    const after = await counts(old.vendorId!);
    // the tree without the seller's own "Electronics" root and its 6 default children (they stay out: the name exists), plus their two own categories
    expect(after).toBe(defaultCategoryRows().length - 7 + 2);
    expect((await owner(`select name, slug from categories where id = $1`, [mine]))[0]).toMatchObject({ name: 'Accessories', slug: 'accessories' });
    expect((await owner(`select name, slug from categories where id = $1`, [custom]))[0]).toMatchObject({ name: 'Electronics', slug: 'my-electronics' });
    const dupes = await owner(`select slug, count(*)::int n from categories where vendor_id = $1 and deleted_at is null group by slug having count(*) > 1`, [old.vendorId!]);
    expect(dupes).toEqual([]);
    expect(await counts(admin.vendorId!)).toBe(otherBefore);
    await runMigration('0028_default_categories_backfill.sql');
    expect(await counts(old.vendorId!)).toBe(after);
  });

  it('a product in a category with no marketplace mapping gets a clear message, not an error', async () => {
    const account = await c.connectAccount(admin, 'mock', { displayName: 'Map Mock' });
    const tree = (await c.get('/api/v1/categories/tree', admin)).body.data as Array<{ id: string; name: string; children: Array<{ id: string; name: string }> }>;
    const pets = tree.find((n) => n.name === 'Pet Supplies')!.children[0]!;
    const v = await c.makeVariant(admin, { title: 'Pet bowl', brand: 'Acme', categoryId: pets.id });
    const made = await c.post('/api/v1/listings', { marketplaceAccountId: account.id, variantId: v.variantId }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const res = await c.post(`/api/v1/listings/${made.body.data.id}/validate`, {}, admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const errors = res.body.data.validation.errors as Array<{ code: string; message: string }>;
    expect(errors.find((e) => e.code === 'category_missing')?.message).toMatch(/Map this product to a marketplace category/);
  });
});
