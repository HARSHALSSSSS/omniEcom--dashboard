import axios from "axios";
import { API_BASE, client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ActivityScope,
  CreatedListing,
  DocumentUploadInstruction,
  MarketplaceAccountOption,
  Paged,
  ProductBulkResult,
  ProductContent,
  ProductDocument,
  ProductInventory,
  ProductListings,
  ProductOverview,
  VariantGridCounts,
  VariantGridRow,
} from "@/types/productDetail";

const product = (id: string) => ENDPOINTS.PRODUCT(id);
const documentUrl = (id: string) => `${API_BASE}/documents/${id}`;

/** an API content route needs the bearer token; an absolute URL (pre-signed storage link) must NOT receive it */
const isApiPath = (url: string) => url.startsWith("/");
/** the API writes its own paths with the `/api/v1` prefix; the client base may be another origin in staging / production */
const toClientUrl = (url: string) => (isApiPath(url) ? url.replace(/^\/api\/v1(?=\/)/, API_BASE) : url);

export interface UploadProgress {
  /** 0..100 */
  (percent: number): void;
}

export const productDetailApi = {
  overview: async (id: string, signal?: AbortSignal) => unwrap<ProductOverview>(await client.get(`${product(id)}/overview`, { signal })),

  inventory: async (id: string, signal?: AbortSignal) => unwrap<ProductInventory>(await client.get(`${product(id)}/inventory`, { signal })),

  listings: async (id: string, signal?: AbortSignal) => unwrap<ProductListings>(await client.get(`${product(id)}/listings`, { signal })),

  content: async (id: string, signal?: AbortSignal) => unwrap<ProductContent>(await client.get(`${product(id)}/content`, { signal })),

  activity: async (id: string, scope: ActivityScope, page: number, pageSize: number, signal?: AbortSignal) =>
    unwrap<Paged<ProductOverview["recentActivity"][number]>>(await client.get(`${product(id)}/activity`, { params: { scope, page, pageSize }, signal })),

  variants: async (id: string, page: number, pageSize: number, signal?: AbortSignal) =>
    unwrap<Paged<VariantGridRow>>(await client.get(`${product(id)}/variant-grid`, { params: { page, pageSize }, signal })),

  variantCounts: async (id: string, signal?: AbortSignal) =>
    unwrap<VariantGridCounts>(await client.get(`${product(id)}/variant-grid/counts`, { signal })),

  /** the product's images, primary first (sortOrder) */
  images: async (id: string, signal?: AbortSignal) =>
    unwrap<ProductDocument[]>(await client.get(`${product(id)}/documents`, { params: { "filter[purpose]": "product_image" }, signal })),

  /** make an image primary / move it in the order */
  updateDocument: async (documentId: string, patch: { isPrimary?: boolean; sortOrder?: number }) =>
    unwrap<ProductDocument>(await client.patch(documentUrl(documentId), patch)),

  /**
   * Two steps like the creation screen: register the file, then send the bytes (through the API, or straight to storage
   * with a pre-signed PUT that is confirmed afterwards).
   */
  uploadImage: async (id: string, file: File, onProgress?: UploadProgress) => {
    const registered = unwrap<{ document: ProductDocument; upload: DocumentUploadInstruction }>(
      await client.post(`${product(id)}/documents`, { fileName: file.name, mimeType: file.type, sizeBytes: file.size, purpose: "product_image" }),
    );
    const { document: doc, upload } = registered;
    const progress = (e: { loaded: number; total?: number }) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    try {
      if (upload.strategy === "presigned") {
        // storage link: no bearer token
        await axios.put(upload.url, file, { headers: upload.headers, onUploadProgress: progress });
        return unwrap<ProductDocument>(await client.post(`${documentUrl(doc.id)}/confirm`, {}));
      }
      return unwrap<ProductDocument>(
        await client.post(toClientUrl(upload.url), file, { headers: { "Content-Type": file.type }, onUploadProgress: progress }),
      );
    } catch (e) {
      // do not leave a half registered upload behind
      await client.delete(documentUrl(doc.id)).catch(() => undefined);
      throw e;
    }
  },

  /** the bytes of an image behind the authenticated content route (an <img> cannot send the bearer token) */
  imageBlob: async (url: string, signal?: AbortSignal): Promise<Blob> => {
    const res = isApiPath(url) ? await client.get<Blob>(toClientUrl(url), { responseType: "blob", signal }) : await axios.get<Blob>(url, { responseType: "blob", signal });
    return res.data;
  },

  duplicate: async (id: string) => unwrap<{ id: string; productCode: string; title: string }>(await client.post(`${product(id)}/duplicate`, {})),

  /** archive / unarchive through the same bulk action the catalog list uses (HTTP 200 even when the single id fails) */
  bulkAction: async (id: string, action: "archive" | "unarchive") =>
    unwrap<ProductBulkResult>(await client.post(`${ENDPOINTS.PRODUCTS}/bulk-actions`, { ids: [id], action })),

  /** the API hands the export link in actions[].href (`/api/v1/products/export?q=<code>`): a CSV download */
  exportCsv: async (href: string) => (await client.get<Blob>(toClientUrl(href), { responseType: "blob" })).data,

  marketplaceAccounts: async (signal?: AbortSignal) =>
    unwrap<MarketplaceAccountOption[]>(await client.get(ENDPOINTS.MARKETPLACE_ACCOUNTS, { params: { limit: 100, "filter[status]": "active" }, signal })),

  createListing: async (body: { marketplaceAccountId: string; variantId: string }) =>
    unwrap<CreatedListing>(await client.post(ENDPOINTS.LISTINGS, body)),
};
