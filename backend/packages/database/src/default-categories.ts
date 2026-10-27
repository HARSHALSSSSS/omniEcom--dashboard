import { and, eq, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

type AnyPgDb = PgDatabase<PgQueryResultHKT, typeof schema>;
type Executor = Pick<AnyPgDb, 'select' | 'insert'>;

/**
 * The starting category tree of every business (Indian e-commerce): top level categories with their sub-categories. Every business gets it at
 * sign-up and the backfill migration (0028) gave it to the businesses that existed before. The sellers' own categories are never touched:
 * a category that already exists (same slug, or the same name at the same level) is skipped, never renamed or duplicated.
 * Slugs are unique across the whole tree (a business keeps one slug per live category).
 */
export const DEFAULT_CATEGORY_TREE: ReadonlyArray<{ name: string; children: readonly string[] }> = [
  { name: 'Fashion', children: ["Men's Clothing", "Women's Clothing", "Kids' Clothing", 'Footwear', 'Bags & Luggage', 'Watches', 'Jewellery & Accessories'] },
  { name: 'Electronics', children: ['Mobiles & Accessories', 'Laptops & Computers', 'Audio & Headphones', 'Cameras & Photography', 'Smart Home', 'Wearables'] },
  { name: 'Home & Kitchen', children: ['Furniture', 'Home Decor', 'Kitchen & Dining', 'Storage & Organisation', 'Bedding & Linen'] },
  { name: 'Beauty & Personal Care', children: ['Skincare', 'Haircare', 'Makeup', 'Fragrances', 'Bath & Body'] },
  { name: 'Health & Wellness', children: ['Vitamins & Supplements', 'Fitness Equipment', 'Healthcare Devices'] },
  { name: 'Grocery & Gourmet', children: ['Staples & Grains', 'Snacks & Beverages', 'Spices & Condiments'] },
  { name: 'Toys & Games', children: ['Toys', 'Board Games & Puzzles'] },
  { name: 'Sports & Outdoors', children: ['Sports Equipment', 'Outdoor & Camping'] },
  { name: 'Books & Stationery', children: ['Books', 'Stationery & Craft'] },
  { name: 'Automotive', children: ['Car Accessories', 'Bike Accessories'] },
  { name: 'Pet Supplies', children: ['Pet Food', 'Pet Accessories'] },
  { name: 'Baby', children: ['Baby Care', 'Baby Gear'] },
  { name: 'Tools & Hardware', children: ['Hand Tools', 'Power Tools'] },
  { name: 'Office Products', children: ['Office Furniture', 'Office Supplies'] },
  { name: 'Industrial & Scientific', children: ['Industrial Supplies', 'Lab & Scientific'] },
];

export const categorySlug = (name: string): string =>
  name.toLowerCase().replace(/&/g, ' ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export interface DefaultCategoryRow { name: string; slug: string; parentSlug: string | null; order: number }

/** the tree as flat rows, parents first */
export function defaultCategoryRows(): DefaultCategoryRow[] {
  const rows: DefaultCategoryRow[] = [];
  DEFAULT_CATEGORY_TREE.forEach((root, i) => {
    rows.push({ name: root.name, slug: categorySlug(root.name), parentSlug: null, order: i + 1 });
    root.children.forEach((child, j) => rows.push({ name: child, slug: categorySlug(child), parentSlug: categorySlug(root.name), order: j + 1 }));
  });
  return rows;
}

/**
 * Gives one business the default categories it does not have yet (idempotent; call inside the business's own transaction or in system scope).
 * Existing categories win: same slug, or the same name (any case) under the same parent, is left exactly as it is.
 */
export async function seedDefaultCategories(tx: Executor, vendorId: string): Promise<number> {
  const C = schema.categories;
  const existing = await tx.select({ id: C.id, parentId: C.parentId, name: C.name, slug: C.slug, path: C.path }).from(C).where(and(eq(C.vendorId, vendorId), isNull(C.deletedAt)));
  const slugs = new Map(existing.map((c) => [c.slug, c]));
  const names = new Set(existing.map((c) => `${c.parentId ?? ''}|${c.name.toLowerCase()}`));
  let added = 0;
  // two bulk inserts (parents, then children) instead of one statement per category
  for (const level of [0, 1]) {
    const batch = defaultCategoryRows()
      .filter((r) => (level === 0 ? r.parentSlug === null : r.parentSlug !== null))
      .flatMap((r) => {
        if (slugs.has(r.slug)) return [];
        const parent = r.parentSlug ? slugs.get(r.parentSlug) : null;
        if (r.parentSlug && !parent) return [];
        if (names.has(`${parent?.id ?? ''}|${r.name.toLowerCase()}`)) return [];
        return [{ vendorId, parentId: parent?.id ?? null, name: r.name, slug: r.slug, path: parent ? `${parent.path}/${r.slug}` : r.slug, sortOrder: r.order }];
      });
    if (batch.length === 0) continue;
    const rows = await tx.insert(C).values(batch).returning({ id: C.id, parentId: C.parentId, name: C.name, slug: C.slug, path: C.path });
    for (const row of rows) {
      slugs.set(row.slug, row);
      names.add(`${row.parentId ?? ''}|${row.name.toLowerCase()}`);
    }
    added += rows.length;
  }
  return added;
}
