import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { catalogApi, productsApi, type DownloadedFile } from "@/api/products";
import { isApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type {
  BulkProductAction,
  CatalogFilters,
  CatalogQuery,
  CategoryNode,
  CreateProductInput,
  Product,
  SavedView,
} from "@/types/product";

export const PRODUCT_QUERY_KEYS = {
  all: ["products"] as const,
  detail: (id: string) => ["products", "detail", id] as const,
  stats: (businessId: string | undefined, filters: CatalogFilters) => ["products", "stats", businessId, filters] as const,
  catalog: (businessId: string | undefined, query: CatalogQuery) => ["products", "catalog", businessId, query] as const,
  views: (businessId: string | undefined) => ["products", "views", businessId] as const,
  categories: (businessId: string | undefined) => ["products", "categories", businessId] as const,
  channels: (businessId: string | undefined) => ["products", "channels", businessId] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

// ---- the Products list --------------------------------------------------------------------------------------

/** tab counts and the KPI strip (the numbers narrow by the non-status filters) */
export function useCatalogStats(filters: CatalogFilters) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.stats(businessId, filters),
    queryFn: ({ signal }) => catalogApi.stats(filters, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** one numbered page; the previous page stays on screen while the next one loads */
export function useCatalog(query: CatalogQuery) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.catalog(businessId, query),
    queryFn: ({ signal }) => catalogApi.list(query, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export interface CategoryOption {
  id: string;
  /** the full path, "Apparel > Shirts" */
  label: string;
}

function flatten(nodes: CategoryNode[], trail: string[] = []): CategoryOption[] {
  return nodes.flatMap((n) => {
    const path = [...trail, n.name];
    return [{ id: n.id, label: path.join(" > ") }, ...flatten(n.children, path)];
  });
}

export function useCategoryOptions() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.categories(businessId),
    queryFn: ({ signal }) => catalogApi.categoryTree(signal),
    staleTime: 5 * 60_000,
    select: flatten,
  });
}

export function useChannelOptions() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.channels(businessId),
    queryFn: ({ signal }) => catalogApi.channels(signal),
    staleTime: 5 * 60_000,
  });
}

export function useSavedViews() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.views(businessId),
    queryFn: ({ signal }) => catalogApi.views(signal),
    staleTime: 60_000,
  });
}

export function useCreateView() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: (input: Parameters<typeof catalogApi.createView>[0]) => catalogApi.createView(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", "views"] }),
  });
}

export function useDeleteView() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: (view: SavedView) => catalogApi.deleteView(view.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", "views"] }),
  });
}

/** archive / unarchive / duplicate / check_publish_readiness: HTTP 200 with a result per product (partial success) */
export function useBulkProducts() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: BulkProductAction }) => catalogApi.bulk(ids, action),
    onSuccess: (res) => {
      if (res.action !== "check_publish_readiness") void queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all });
    },
  });
}

export function useDuplicateProduct() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: (id: string) => catalogApi.duplicate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: (id: string) => catalogApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all }),
  });
}

/** how long the asynchronous export is waited for, and how often it is asked */
const EXPORT_POLL_MS = 1500;
const EXPORT_POLL_TRIES = 40;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** the asynchronous export only understands these filters */
const canQueueExport = (f: CatalogFilters) => !f.channel && !f.inventory && !f.productType && !f.needsAttention;

/**
 * CSV of the current filters. Past 50,000 rows the API answers 413: the export is then queued, waited for and
 * downloaded (`onQueued` lets the screen say so), when the filters allow it.
 */
export function useExportCatalog() {
  return useGuardedMutation({
    mutationFn: async ({ query, onQueued }: { query: CatalogQuery; onQueued?: () => void }): Promise<DownloadedFile> => {
      try {
        return await catalogApi.exportCsv(query);
      } catch (e) {
        if (!isApiError(e) || e.status !== 413 || !canQueueExport(query)) throw e;
      }
      onQueued?.();
      let job = await catalogApi.queueExport(query);
      for (let i = 0; !job.hasOutput && i < EXPORT_POLL_TRIES; i += 1) {
        if (job.status === "failed") throw new Error("The export failed. Try again or narrow the filters.");
        await wait(EXPORT_POLL_MS);
        job = await catalogApi.dataJob(job.id);
      }
      if (!job.hasOutput) throw new Error("The export is taking longer than expected. Try again in a moment.");
      return catalogApi.downloadDataJob(job.id);
    },
  });
}

// ---- the other product screens (replaced section by section) ----------------------------------------------------

export function useProduct(id: string) {
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.detail(id),
    queryFn: () => productsApi.getProduct(id),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useGuardedMutation({
    mutationFn: (input: CreateProductInput) => productsApi.createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();

  return useGuardedMutation({
    mutationFn: (input: Partial<Product>) => productsApi.updateProduct(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(PRODUCT_QUERY_KEYS.detail(id), data);
      queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all });
    },
  });
}

export function useProductAiSuggest() {
  return useGuardedMutation({
    mutationFn: ({ title, description }: { title: string; description: string }) =>
      productsApi.getAiSuggestions(title, description),
  });
}
