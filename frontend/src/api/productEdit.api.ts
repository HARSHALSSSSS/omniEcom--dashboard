import { client, unwrap, API_BASE } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AiApplied,
  AiMode,
  AiSuggestion,
  CategoryAttributeDef,
  CategoryOption,
  ChangeImpact,
  EditChanges,
  EditSaveResult,
  EditorView,
  InsightDecision,
  InsightKey,
  InsightList,
} from "@/types/productEdit";

const product = (id: string) => ENDPOINTS.PRODUCT(id);

/** The Edit product screen's endpoints (backend module product-edit + the AI description suggestions of the catalog). */
export const productEditApi = {
  /** GET /products/{id}/edit: everything the page needs in one call */
  getEditor: async (id: string): Promise<EditorView> => unwrap(await client.get(`${product(id)}/edit`)),

  /** POST /products/{id}/change-impact: preview only, nothing is written */
  changeImpact: async (id: string, changes: EditChanges, signal?: AbortSignal): Promise<ChangeImpact> =>
    unwrap(await client.post(`${product(id)}/change-impact`, { changes }, { signal })),

  /** POST /products/{id}/edit/save */
  save: async (id: string, body: { version: number; changes: EditChanges; confirm?: boolean }): Promise<EditSaveResult> =>
    unwrap(await client.post(`${product(id)}/edit/save`, body)),

  getInsights: async (id: string): Promise<InsightList> => unwrap(await client.get(`${product(id)}/insights`)),
  dismissInsight: async (id: string, key: InsightKey): Promise<InsightDecision> =>
    unwrap(await client.post(`${product(id)}/insights/${key}/dismiss`, {})),
  restoreInsight: async (id: string, key: InsightKey): Promise<InsightDecision> =>
    unwrap(await client.post(`${product(id)}/insights/${key}/restore`)),

  /** POST /products/{id}/ai/description: `text` is the editor content (may be unsaved) */
  suggestDescription: async (id: string, body: { mode: AiMode; text?: string; alsoSuggest?: AiMode[] }): Promise<AiSuggestion> =>
    unwrap(await client.post(`${product(id)}/ai/description`, body)),
  /** apply with persist:false only accepts the suggestion into the editor; the page's Save writes it */
  acceptDescription: async (id: string, suggestionId: string): Promise<AiApplied> =>
    unwrap(await client.post(`${product(id)}/ai/description/${suggestionId}/apply`, { persist: false })),
  dismissDescription: async (id: string, suggestionId: string): Promise<AiSuggestion> =>
    unwrap(await client.post(`${product(id)}/ai/description/${suggestionId}/dismiss`)),

  /** GET /categories/{id}/attributes: the product-level attributes a category expects (the "Additional attributes" of the edit screen follow the chosen category) */
  listCategoryAttributes: async (categoryId: string): Promise<CategoryAttributeDef[]> => {
    const rows = unwrap<
      Array<{ isRequired: boolean; attribute: { id: string; code: string; name: string; dataType: CategoryAttributeDef["dataType"]; appliesTo: "product" | "variant"; unit: string | null; values: Array<{ value: string; label: string }> } }>
    >(await client.get(`${API_BASE}/categories/${categoryId}/attributes`));
    return rows
      .filter((r) => r.attribute.appliesTo === "product")
      .map((r) => ({
        attributeId: r.attribute.id,
        code: r.attribute.code,
        name: r.attribute.name,
        dataType: r.attribute.dataType,
        unit: r.attribute.unit,
        isRequired: r.isRequired,
        options: r.attribute.values.map((v) => ({ value: v.value, label: v.label })),
      }));
  },

  /** GET /categories (all pages, the picker needs the whole tree) */
  listCategories: async (): Promise<CategoryOption[]> => {
    const out: CategoryOption[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const res: { data: { data: CategoryOption[]; meta?: { nextCursor: string | null; hasMore: boolean } } } = await client.get(`${API_BASE}/categories`, {
        params: { limit: 100, sort: "name", ...(cursor ? { cursor } : {}) },
      });
      out.push(...res.data.data.map((c) => ({ id: c.id, parentId: c.parentId, name: c.name, path: c.path })));
      cursor = res.data.meta?.hasMore ? (res.data.meta.nextCursor ?? null) : null;
      if (!cursor) break;
    }
    return out;
  },
};
