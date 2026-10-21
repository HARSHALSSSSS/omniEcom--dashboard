import { schema } from '@oms/database';

export type StepKey = (typeof schema.ONBOARDING_STEPS)[number];
export type StepStatus = (typeof schema.ONBOARDING_STEP_STATUSES)[number];
export type BusinessType = (typeof schema.BUSINESS_TYPES)[number];
export type TeamSize = (typeof schema.TEAM_SIZES)[number];
export type FulfillmentMethod = (typeof schema.FULFILLMENT_METHODS)[number];

/** The guided setup, in order. `optional` steps may be skipped; the business step may not. */
export const STEP_META: Record<StepKey, { title: string; order: number; skippable: boolean }> = {
  business: { title: 'Business', order: 1, skippable: false },
  channels: { title: 'Sales Channels', order: 2, skippable: true },
  products: { title: 'Products', order: 3, skippable: true },
  inventory: { title: 'Inventory', order: 4, skippable: true },
  fulfillment: { title: 'Fulfillment', order: 5, skippable: true },
  ready: { title: 'Ready', order: 6, skippable: false },
};

/** "Starter -> Growing -> Scale" preview on the business screen */
export const workspaceTier = (size: TeamSize | null): 'starter' | 'growing' | 'scale' =>
  size === '21_50' || size === '50_plus' ? 'scale' : size === '6_20' ? 'growing' : 'starter';

export const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessType; label: string; description: string }> = [
  { value: 'd2c_brand', label: 'D2C Brand', description: 'Sell your own brand directly.' },
  { value: 'marketplace_seller', label: 'Marketplace Seller', description: 'Sell on online marketplaces.' },
  { value: 'retail', label: 'Retail Business', description: 'Sell through physical stores.' },
  { value: 'wholesaler', label: 'Wholesaler', description: 'Supply products to businesses.' },
  { value: 'social_commerce', label: 'Social Commerce', description: 'Sell through social channels.' },
  { value: 'other', label: 'Other', description: 'Build a business your way.' },
];

export const TEAM_SIZE_OPTIONS: Array<{ value: TeamSize; label: string }> = [
  { value: 'just_me', label: 'Just me' }, { value: '2_5', label: '2–5' }, { value: '6_20', label: '6–20' }, { value: '21_50', label: '21–50' }, { value: '50_plus', label: '50+' },
];

/**
 * Sales channels shown during setup. `connector` is the marketplace code the platform can really talk to; channels without one are
 * listed as "coming soon" (the seller can register interest by ticking them, but cannot connect yet).
 */
export interface ChannelDef { code: string; name: string; kind: 'marketplace' | 'online_store' | 'social'; description: string; connector: string | null }
export const CHANNELS: ChannelDef[] = [
  { code: 'amazon_in', name: 'Amazon', kind: 'marketplace', description: 'Products, orders, inventory and listings', connector: 'amazon_in' },
  { code: 'flipkart', name: 'Flipkart', kind: 'marketplace', description: 'Products, orders, inventory and listings', connector: 'flipkart' },
  { code: 'myntra', name: 'Myntra', kind: 'marketplace', description: 'Products, orders, inventory and listings', connector: 'myntra' },
  { code: 'meesho', name: 'Meesho', kind: 'marketplace', description: 'Catalog, orders and inventory', connector: 'meesho' },
  { code: 'shopify', name: 'Shopify', kind: 'online_store', description: 'Products, orders, customers and inventory', connector: 'shopify' },
  { code: 'snapdeal', name: 'Snapdeal', kind: 'marketplace', description: 'Products, orders and inventory', connector: 'snapdeal' },
  { code: 'social_commerce', name: 'Social Commerce', kind: 'social', description: 'Catalog and orders from social channels', connector: null },
];
/** the built-in sandbox marketplace, offered outside production only */
export const SANDBOX_CHANNEL: ChannelDef = { code: 'mock', name: 'Sandbox marketplace', kind: 'marketplace', description: 'A simulated marketplace for trying the platform', connector: 'mock' };

export const FULFILLMENT_METHOD_OPTIONS: Array<{ value: FulfillmentMethod; label: string; description: string; hint: string }> = [
  { value: 'marketplace', label: 'Marketplace Shipping', description: 'Use the shipping service provided by the marketplace when available.', hint: 'Marketplace service · When supported' },
  { value: 'seller', label: 'Seller Shipping', description: 'Manage shipping through your own configured logistics provider.', hint: 'Your logistics · Your control' },
  { value: 'third_party', label: 'Third-party Shipping', description: 'Use a connected shipping or logistics provider.', hint: 'Connected provider · Connection required' },
];
export const FULFILLMENT_PREFERENCE_OPTIONS: Array<{ value: (typeof schema.FULFILLMENT_PREFERENCES)[number]; label: string }> = [
  { value: 'recommended', label: 'Recommended for most orders' }, { value: 'fastest', label: 'Fastest delivery' },
  { value: 'lowest_cost', label: 'Lowest cost' }, { value: 'best_rated', label: 'Best rated carrier' },
];

/** split "Mumbai, Maharashtra" into city / state for a warehouse address */
export function splitLocation(location: string | undefined): { city?: string; state?: string } {
  if (!location) return {};
  const [city, ...rest] = location.split(',').map((s) => s.trim()).filter(Boolean);
  return { city, state: rest.join(', ') || undefined };
}
