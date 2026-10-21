import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  LeadTimeResult,
  QuickAdjustPayload,
  QuickAdjustResult,
  VariantBulkAction,
  VariantBulkResult,
  VariantCounts,
  VariantDetail,
  VariantGridPage,
  VariantGridParams,
  VariantsProductHeader,
  VariantWritePayload,
  WarehouseOption,
} from "@/types/variants";

const productPath = (productId: string) => ENDPOINTS.PRODUCT(productId);

/** option names the API accepts in `filter[option.<name>]` */
export const FILTERABLE_OPTION = /^[A-Za-z0-9_ -]{1,40}$/;

/**
 * The grid query string as a flat object. `color` and `size` use the short `filter[color]` form, every other option
 * `filter[option.<name>]`. The Low stock / Out of stock tabs are inventory filters over active variants.
 */
export function gridQuery(p: VariantGridParams): Record<string, string | number> {
  const out: Record<string, string | number> = { page: p.page, pageSize: p.pageSize };
  if (p.q.trim()) out.q = p.q.trim();
  if (p.sort) out.sort = p.sort;

  let lifecycle: string | null = null;
  let inventory: string = p.inventory;
  switch (p.tab) {
    case "active":
      lifecycle = "active";
      break;
    case "low_stock":
      lifecycle = "active";
      inventory = "low";
      break;
    case "out_of_stock":
      lifecycle = "active";
      inventory = "out";
      break;
    case "draft":
    case "archived":
      lifecycle = p.tab;
      break;
    default:
      break;
  }
  if (lifecycle) out["filter[lifecycle]"] = lifecycle;
  if (inventory) out["filter[inventory]"] = inventory;
  if (p.channel) out["filter[channel]"] = p.channel;
  for (const [name, value] of Object.entries(p.options)) {
    if (!value || !FILTERABLE_OPTION.test(name)) continue;
    out[name === "color" || name === "size" ? `filter[${name}]` : `filter[option.${name}]`] = value;
  }
  return out;
}

interface OverviewSlice {
  product: { id: string; title: string; productCode: string; status: "draft" | "active" | "archived"; version: number };
  primaryImage: { id: string; url: string } | null;
  inventory: { available: number; lowStockVariants: number };
  variants: { count: number; sellable: number; options: Record<string, string[]> };
  channels: { connected: number; items: { channel: { code: string; name: string } }[] };
}

export const variantsApi = {
  /** product title / image / counters / option names for the screen header and the filter dropdowns */
  header: async (productId: string, signal?: AbortSignal): Promise<VariantsProductHeader> => {
    const o = unwrap<OverviewSlice>(await client.get(`${productPath(productId)}/overview`, { signal }));
    return {
      id: o.product.id,
      title: o.product.title,
      productCode: o.product.productCode,
      status: o.product.status,
      version: o.product.version,
      imageUrl: o.primaryImage?.url ?? null,
      variantCount: o.variants.count,
      sellableCount: o.variants.sellable,
      availableUnits: o.inventory.available,
      lowStockVariants: o.inventory.lowStockVariants,
      connectedChannels: o.channels.connected,
      options: o.variants.options,
      channels: o.channels.items.map((c) => ({ code: c.channel.code, name: c.channel.name })),
    };
  },

  grid: async (productId: string, params: VariantGridParams, signal?: AbortSignal) =>
    unwrap<VariantGridPage>(await client.get(`${productPath(productId)}/variant-grid`, { params: gridQuery(params), signal })),

  counts: async (productId: string, signal?: AbortSignal) =>
    unwrap<VariantCounts>(await client.get(`${productPath(productId)}/variant-grid/counts`, { signal })),

  get: async (variantId: string, signal?: AbortSignal) => unwrap<VariantDetail>(await client.get(ENDPOINTS.VARIANT(variantId), { signal })),

  create: async (productId: string, body: VariantWritePayload) =>
    unwrap<VariantDetail>(await client.post(ENDPOINTS.PRODUCT_VARIANTS(productId), body)),

  update: async (variantId: string, body: VariantWritePayload & { version: number }) =>
    unwrap<VariantDetail>(await client.patch(ENDPOINTS.VARIANT(variantId), body)),

  remove: async (variantId: string) => {
    await client.delete(ENDPOINTS.VARIANT(variantId));
  },

  bulk: async (productId: string, ids: string[], action: VariantBulkAction) =>
    unwrap<VariantBulkResult>(await client.post(`${productPath(productId)}/variants/bulk`, { ids, action })),

  setLeadTime: async (variantId: string, leadTimeDays: number | null) =>
    unwrap<LeadTimeResult>(await client.put(`${ENDPOINTS.VARIANT(variantId)}/lead-time`, { leadTimeDays })),

  warehouses: async (signal?: AbortSignal) => {
    const data = unwrap<WarehouseOption[]>(await client.get(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" }, signal }));
    return data;
  },

  quickAdjust: async (body: QuickAdjustPayload) => unwrap<QuickAdjustResult>(await client.post(ENDPOINTS.INVENTORY_QUICK_ADJUST, body)),

  /** image bytes for the variant thumbnails (the API serves them behind the bearer token) */
  image: async (url: string): Promise<Blob> => {
    const res = await client.get<Blob>(url, { responseType: "blob" });
    return res.data;
  },
};
