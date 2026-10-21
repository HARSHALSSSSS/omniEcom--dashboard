import { and, eq, inArray, schema, type Tx } from '@oms/database';
import type { ProductRow } from '@oms/mod-catalog';
import { summaryOf, type ChangeSet } from '../domain/diff';
import { previewProductChange, type ContentField, type ListingImpact, type ListingOpts, type ProductChange } from '../infrastructure/listings-port';

/**
 * Change impact (the right-hand "Change impact" panel and the "This change may affect connected listings" modal): what an edit WOULD do to the
 * connected listings, computed from the same ChangeSet the save uses. Reads only: nothing is written and nothing is sent to a listing.
 */
export type ChannelEffect = 'name_inherited' | 'description_inherited' | 'brand_inherited' | 'attribute_inherited' | 'type_inherited' | 'may_need_remapping' | 'independent' | 'not_live' | 'unaffected';

export interface ImpactChannel {
  code: string; name: string; accountId: string; accountName: string; listingId: string; listings: number;
  effect: ChannelEffect; independentFields: ContentField[]; supportsUpdate: boolean;
  mappingState?: 'mapped' | 'needs_review';
  suggested?: { marketplaceCategoryId: string | null; marketplaceCategoryName: string | null };
}

export interface ImpactDto {
  hasChanges: boolean;
  items: Array<{ field: string; label: string; message: string; formattingOnly?: boolean }>;
  summary: string;
  detail: string | null;
  listings: { potential: number; live: number };
  channels: ImpactChannel[];
  independentNote: string | null;
  notSentNote: string | null;
  requiresConfirmation: boolean;
  confirmation?: {
    title: string; message: string;
    mapping?: { from: string | null; to: string | null };
    channels: Array<{ code: string; action: 'category_mapping_review' }>;
  };
  errors: Array<{ field: string; code: string; message: string }>;
}

/** what the change would do to each listing of the product (the listings module bounds the work: more than 500 listings is a 413) */
export const previewListings = (tx: Tx, vendorId: string, productId: string, change: ProductChange, opts: ListingOpts): Promise<ListingImpact[]> => previewProductChange(tx, vendorId, productId, change, opts);

function inheritedEffect(fields: ContentField[]): ChannelEffect {
  if (fields.includes('title')) return 'name_inherited';
  if (fields.includes('description')) return 'description_inherited';
  if (fields.includes('brand')) return 'brand_inherited';
  if (fields.includes('productType')) return 'type_inherited';
  return 'attribute_inherited';
}

const RANK: Record<ListingImpact['effect'], number> = { may_need_remapping: 5, inherited: 4, independent: 3, not_live: 2, unaffected: 1 };

/** one entry per marketplace account (the design lists channels, not variants) */
export function groupChannels(impacts: ListingImpact[]): ImpactChannel[] {
  const byAccount = new Map<string, ListingImpact[]>();
  for (const l of impacts) byAccount.set(l.accountId, [...(byAccount.get(l.accountId) ?? []), l]);
  return [...byAccount.values()].map((group) => {
    const best = group.reduce((a, b) => (RANK[b.effect] > RANK[a.effect] ? b : a));
    const first = group[0]!;
    const inherited = [...new Set(group.flatMap((l) => l.inheritedFields))];
    const independentFields = [...new Set(group.flatMap((l) => l.independentFields))];
    const effect: ChannelEffect = best.effect === 'inherited' ? inheritedEffect(inherited) : best.effect;
    const states = group.map((l) => l.mappingState).filter(Boolean);
    const suggested = group.find((l) => l.suggestedMarketplaceCategoryId != null || l.suggestedMarketplaceCategoryName != null);
    return {
      code: first.marketplace, name: first.marketplaceName, accountId: first.accountId, accountName: first.accountName, listingId: best.listingId, listings: group.length,
      effect, independentFields, supportsUpdate: group.every((l) => l.supportsUpdate),
      ...(states.length ? { mappingState: states.includes('needs_review') ? ('needs_review' as const) : ('mapped' as const) } : {}),
      ...(suggested ? { suggested: { marketplaceCategoryId: suggested.suggestedMarketplaceCategoryId ?? null, marketplaceCategoryName: suggested.suggestedMarketplaceCategoryName ?? null } } : {}),
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.accountName.localeCompare(b.accountName));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

async function categoryNames(tx: Tx, vendorId: string, ids: Array<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), inArray(schema.categories.id, wanted)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function computeImpact(tx: Tx, vendorId: string, p: Pick<ProductRow, 'id' | 'status'>, change: ChangeSet, opts: ListingOpts): Promise<{ dto: ImpactDto; impacts: ListingImpact[] }> {
  const errors = change.issues.map((i) => ({ field: i.field, code: i.code, message: i.message }));
  const hasChanges = change.items.length > 0;
  if (!hasChanges) {
    return {
      impacts: [],
      dto: {
        hasChanges: false, items: [], summary: 'No changes yet', detail: 'Edit a field to see what may be affected.', listings: { potential: 0, live: 0 }, channels: [],
        independentNote: null, notSentNote: null, requiresConfirmation: false, errors,
      },
    };
  }

  const impacts = change.contentFields.length
    ? await previewListings(tx, vendorId, p.id, { fields: change.contentFields, ...(change.category ? { category: change.category } : {}) }, opts)
    : [];
  const channels = groupChannels(impacts);
  const live = impacts.filter((l) => l.effect === 'inherited' || l.effect === 'may_need_remapping');
  const potential = impacts.filter((l) => l.effect === 'inherited' || l.effect === 'may_need_remapping' || l.effect === 'not_live');
  const independentNames = [...new Set(channels.filter((c) => c.effect === 'independent').map((c) => c.name))];
  const requiresConfirmation = (change.categoryChanged || change.typeChanged) && live.length > 0;

  let confirmation: ImpactDto['confirmation'];
  if (requiresConfirmation) {
    const remap = impacts.filter((l) => l.effect === 'may_need_remapping');
    const names = change.category ? await categoryNames(tx, vendorId, [change.category.fromId, change.category.toId]) : new Map<string, string>();
    confirmation = {
      title: 'This change may affect connected listings.',
      message: change.categoryChanged
        ? `${plural(remap.length, 'marketplace listing', 'marketplace listings')} may need to be remapped.`
        : `${plural(live.length, 'marketplace listing', 'marketplace listings')} may be affected.`,
      ...(change.category ? { mapping: { from: change.category.fromId ? names.get(change.category.fromId) ?? null : null, to: change.category.toId ? names.get(change.category.toId) ?? null : null } } : {}),
      channels: channels.filter((c) => c.effect === 'may_need_remapping').map((c) => ({ code: c.code, action: 'category_mapping_review' as const })),
    };
  }

  return {
    impacts,
    dto: {
      hasChanges: true,
      items: change.items.map((i) => ({ field: i.field, label: i.label, message: i.message, ...(i.formattingOnly ? { formattingOnly: true } : {}) })),
      summary: summaryOf(change.items),
      detail: null,
      listings: { potential: potential.length, live: live.length },
      channels,
      independentNote: independentNames.length ? `${list(independentNames)} content is independently managed.` : null,
      notSentNote: 'Updates are not sent to listings until you save.',
      requiresConfirmation,
      ...(confirmation ? { confirmation } : {}),
      errors,
    },
  };
}
