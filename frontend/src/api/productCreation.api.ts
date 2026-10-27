import axios from "axios";
import { API_BASE, client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AiApplied,
  AiMode,
  AiSuggestion,
  Brand,
  CategoryNode,
  CreationDto,
  CreationReadiness,
  DocumentDto,
  DraftListItem,
  DraftValues,
  FormOptions,
  PreviewValues,
  PrimaryImage,
  RegisteredDocument,
  SkuCheck,
  SkuVerify,
  StandardCategorySuggestion,
  ValidateStepResult,
} from "@/types/productCreation";

export interface DraftPage {
  items: DraftListItem[];
  total: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/** `/api/v1/...` instructions from the server, resolved against the configured API base (absolute in staging / production) */
export function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith("/api/v1") && API_BASE !== "/api/v1" ? `${API_BASE}${url.slice("/api/v1".length)}` : url;
}

export const productCreationApi = {
  // ---------------------------------------------------------------------------------------- options
  formOptions: async (signalOrCtx?: AbortSignal | { signal?: AbortSignal }): Promise<FormOptions> => {
    const signal = signalOrCtx instanceof AbortSignal ? signalOrCtx : signalOrCtx?.signal;
    return unwrap(await client.get(ENDPOINTS.CREATION_FORM_OPTIONS, { signal }));
  },
  standardCategories: async (q?: string, signal?: AbortSignal): Promise<StandardCategorySuggestion[]> =>
    unwrap(await client.get(ENDPOINTS.CREATION_STANDARD_CATEGORIES, { params: { ...(q ? { q } : {}), limit: 20 }, signal })),
  categoryTree: async (signalOrCtx?: AbortSignal | { signal?: AbortSignal }): Promise<CategoryNode[]> => {
    const signal = signalOrCtx instanceof AbortSignal ? signalOrCtx : signalOrCtx?.signal;
    return unwrap(await client.get(ENDPOINTS.CATEGORIES_TREE, { signal }));
  },

  /** the seller's own category (optionally under a parent), the same way brands are added from the form */
  createCategory: async (input: { name: string; parentId?: string | null }): Promise<{ id: string; name: string; parentId: string | null; path: string }> =>
    unwrap(await client.post(ENDPOINTS.CATEGORIES, { name: input.name, ...(input.parentId ? { parentId: input.parentId } : {}) })),

  // ---------------------------------------------------------------------------------------- brands
  brands: async (signalOrCtx?: AbortSignal | { signal?: AbortSignal }): Promise<Brand[]> => {
    const signal = signalOrCtx instanceof AbortSignal ? signalOrCtx : signalOrCtx?.signal;
    return unwrap(await client.get(ENDPOINTS.BRANDS, { params: { limit: 100 }, signal }));
  },
  createBrand: async (name: string): Promise<Brand> => unwrap(await client.post(ENDPOINTS.BRANDS, { name })),
  confirmBrand: async (id: string): Promise<Brand> => unwrap(await client.post(ENDPOINTS.BRAND_CONFIRM(id))),

  // ---------------------------------------------------------------------------------------- master SKU
  skuCheck: async (code: string, excludeProductId?: string | null, signal?: AbortSignal): Promise<SkuCheck> =>
    unwrap(await client.get(ENDPOINTS.CREATION_SKU_CHECK, { params: { code, ...(excludeProductId ? { excludeProductId } : {}) }, signal })),
  verifySku: async (productId: string, code: string): Promise<SkuVerify> => unwrap(await client.post(ENDPOINTS.CREATION_SKU_VERIFY(productId), { code })),

  // ---------------------------------------------------------------------------------------- drafts
  createDraft: async (values: DraftValues & { title: string }): Promise<CreationDto> => unwrap(await client.post(ENDPOINTS.CREATION_DRAFTS, values)),
  patchDraft: async (id: string, values: DraftValues, version: number): Promise<CreationDto> =>
    unwrap(await client.patch(ENDPOINTS.CREATION_DRAFT(id), { ...values, version })),
  getCreation: async (id: string): Promise<CreationDto> => unwrap(await client.get(ENDPOINTS.CREATION_VIEW(id))),
  listDrafts: async (limit = 5): Promise<DraftPage> => {
    const page = unwrap<DraftPage>(await client.get(ENDPOINTS.CREATION_DRAFTS, { params: { pageSize: limit, sort: "-savedAt" } }));
    return { items: page.items, total: page.total };
  },
  discardDraft: async (id: string): Promise<void> => {
    await client.delete(ENDPOINTS.CREATION_DRAFT(id));
  },

  // ---------------------------------------------------------------------------------------- readiness + steps
  savedReadiness: async (id: string): Promise<CreationReadiness> => unwrap(await client.get(ENDPOINTS.CREATION_READINESS(id))),
  previewReadiness: async (values: PreviewValues, productId?: string | null, signal?: AbortSignal): Promise<CreationReadiness> =>
    unwrap(await client.post(ENDPOINTS.CREATION_READINESS_PREVIEW, { ...(productId ? { productId } : {}), values }, { signal })),
  validateStep: async (id: string, values: DraftValues): Promise<ValidateStepResult> =>
    unwrap(await client.post(ENDPOINTS.CREATION_VALIDATE_STEP(id), { step: "basic", values })),
  continueStep: async (id: string, version: number, values: DraftValues): Promise<CreationDto> =>
    unwrap(await client.post(ENDPOINTS.CREATION_CONTINUE(id), { step: "basic", version, values })),

  // ---------------------------------------------------------------------------------------- AI
  suggestDescription: async (id: string, mode: AiMode, text?: string): Promise<AiSuggestion> =>
    unwrap(await client.post(ENDPOINTS.PRODUCT_AI_DESCRIPTION(id), { mode, ...(text ? { text } : {}) })),
  applySuggestion: async (id: string, suggestionId: string, version: number): Promise<AiApplied> =>
    unwrap(await client.post(ENDPOINTS.PRODUCT_AI_DESCRIPTION_APPLY(id, suggestionId), { version, persist: true })),
  dismissSuggestion: async (id: string, suggestionId: string): Promise<AiSuggestion> =>
    unwrap(await client.post(ENDPOINTS.PRODUCT_AI_DESCRIPTION_DISMISS(id, suggestionId), {})),

  // ---------------------------------------------------------------------------------------- images
  primaryImage: async (id: string): Promise<PrimaryImage> => unwrap(await client.get(ENDPOINTS.PRODUCT_PRIMARY_IMAGE(id))),
  registerImage: async (id: string, file: { name: string; type: string; size: number }): Promise<RegisteredDocument> =>
    unwrap(
      await client.post(ENDPOINTS.PRODUCT_DOCUMENTS(id), {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        purpose: "product_image",
      }),
    ),
  /**
   * Step 2 of an upload: sends the raw bytes where the server said ("api": through the API with the bearer token; "presigned": straight to
   * storage without our token, then confirmed). Reports progress and can be aborted.
   */
  uploadImageBytes: async (
    registered: RegisteredDocument,
    file: File,
    opts: { signal?: AbortSignal; onProgress?: (p: UploadProgress) => void } = {},
  ): Promise<DocumentDto> => {
    const { document, upload } = registered;
    const onUploadProgress = (e: { loaded: number; total?: number }) => opts.onProgress?.({ loaded: e.loaded, total: e.total ?? file.size });
    if (upload.strategy === "presigned") {
      await axios.request({ url: upload.url, method: (upload.method || "PUT") as "PUT", data: file, headers: upload.headers, signal: opts.signal, onUploadProgress, withCredentials: false });
      return unwrap(await client.post(ENDPOINTS.DOCUMENT_CONFIRM(document.id), undefined, { signal: opts.signal }));
    }
    return unwrap(
      await client.post(`${resolveApiUrl(upload.url)}`, file, {
        params: { primary: "true" },
        headers: { "Content-Type": file.type },
        signal: opts.signal,
        onUploadProgress,
      }),
    );
  },
  cancelUpload: async (documentId: string): Promise<void> => {
    await client.post(ENDPOINTS.DOCUMENT_CANCEL(documentId));
  },
  deleteDocument: async (documentId: string): Promise<void> => {
    await client.delete(ENDPOINTS.DOCUMENT(documentId));
  },
  generatePlaceholder: async (id: string): Promise<DocumentDto> => unwrap(await client.post(ENDPOINTS.PRODUCT_PLACEHOLDER_IMAGE(id))),
  /** the bytes of a document through the authenticated API (an <img> tag cannot send the bearer token) */
  documentBlob: async (documentId: string): Promise<Blob> => (await client.get(ENDPOINTS.DOCUMENT_CONTENT(documentId), { responseType: "blob" })).data as Blob,
};
