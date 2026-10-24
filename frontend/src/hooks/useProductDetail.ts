import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { useEffect, useState } from "react";
import { productDetailApi, type UploadProgress } from "@/api/productDetail.api";
import type { ActivityScope } from "@/types/productDetail";

/** one cache entry per product and section; the top bar reads the overview entry too */
export const productDetailKeys = {
  all: ["productDetail"] as const,
  product: (id: string) => ["productDetail", id] as const,
  overview: (id: string) => ["productDetail", id, "overview"] as const,
  inventory: (id: string) => ["productDetail", id, "inventory"] as const,
  listings: (id: string) => ["productDetail", id, "listings"] as const,
  content: (id: string) => ["productDetail", id, "content"] as const,
  activity: (id: string, scope: ActivityScope, page: number) => ["productDetail", id, "activity", scope, page] as const,
  variants: (id: string, page: number) => ["productDetail", id, "variants", page] as const,
  variantCounts: (id: string) => ["productDetail", id, "variant-counts"] as const,
  images: (id: string) => ["productDetail", id, "images"] as const,
  accounts: ["productDetail", "marketplace-accounts"] as const,
};

export const ACTIVITY_PAGE_SIZE = 20;
export const VARIANTS_PAGE_SIZE = 25;

/** header, health strip and Overview tab in one call; the page and the top bar share this cache entry */
export function useProductOverview(id: string | undefined) {
  return useQuery({
    queryKey: productDetailKeys.overview(id ?? ""),
    queryFn: ({ signal }) => productDetailApi.overview(id ?? "", signal),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useProductInventory(id: string, enabled: boolean) {
  return useQuery({ queryKey: productDetailKeys.inventory(id), queryFn: ({ signal }) => productDetailApi.inventory(id, signal), enabled });
}

export function useProductListings(id: string, enabled: boolean) {
  return useQuery({ queryKey: productDetailKeys.listings(id), queryFn: ({ signal }) => productDetailApi.listings(id, signal), enabled });
}

export function useProductContent(id: string, enabled: boolean) {
  return useQuery({ queryKey: productDetailKeys.content(id), queryFn: ({ signal }) => productDetailApi.content(id, signal), enabled });
}

export function useProductActivity(id: string, scope: ActivityScope, page: number, enabled: boolean) {
  return useQuery({
    queryKey: productDetailKeys.activity(id, scope, page),
    queryFn: ({ signal }) => productDetailApi.activity(id, scope, page, ACTIVITY_PAGE_SIZE, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useProductVariants(id: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: productDetailKeys.variants(id, page),
    queryFn: ({ signal }) => productDetailApi.variants(id, page, VARIANTS_PAGE_SIZE, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useProductVariantCounts(id: string, enabled: boolean) {
  return useQuery({ queryKey: productDetailKeys.variantCounts(id), queryFn: ({ signal }) => productDetailApi.variantCounts(id, signal), enabled });
}

export function useProductImages(id: string, enabled: boolean) {
  return useQuery({ queryKey: productDetailKeys.images(id), queryFn: ({ signal }) => productDetailApi.images(id, signal), enabled });
}

export function useMarketplaceAccounts(enabled: boolean) {
  return useQuery({ queryKey: productDetailKeys.accounts, queryFn: ({ signal }) => productDetailApi.marketplaceAccounts(signal), enabled });
}

/** every section of one product plus the catalog list (status, counts) after a change */
function useRefreshProduct(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: productDetailKeys.product(id) });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };
}

export function useDuplicateProduct(id: string) {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: () => productDetailApi.duplicate(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

/** the bulk action answers 200 even when the id fails: turn a failed item into an error */
export function useArchiveProduct(id: string) {
  const refresh = useRefreshProduct(id);
  return useGuardedMutation({
    mutationFn: async (action: "archive" | "unarchive") => {
      const res = await productDetailApi.bulkAction(id, action);
      const item = res.results[0];
      if (!item || !item.ok) throw new Error(item?.error?.message ?? "The product could not be updated.");
      return res;
    },
    onSuccess: refresh,
  });
}

export function useExportProduct() {
  return useGuardedMutation({
    mutationFn: async ({ href, fileName }: { href: string; fileName: string }) => {
      const blob = await productDetailApi.exportCsv(href);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export function useSetPrimaryImage(id: string) {
  const refresh = useRefreshProduct(id);
  return useGuardedMutation({ mutationFn: (documentId: string) => productDetailApi.updateDocument(documentId, { isPrimary: true }), onSuccess: refresh });
}

/** writes the new position (sortOrder = index) of every image whose position changed */
export function useReorderImages(id: string) {
  const refresh = useRefreshProduct(id);
  return useGuardedMutation({
    mutationFn: async (changes: Array<{ documentId: string; sortOrder: number }>) => {
      for (const c of changes) await productDetailApi.updateDocument(c.documentId, { sortOrder: c.sortOrder });
    },
    onSettled: refresh,
  });
}

export function useUploadImages(id: string) {
  const refresh = useRefreshProduct(id);
  return useGuardedMutation({
    mutationFn: async ({ files, onProgress }: { files: File[]; onProgress?: UploadProgress }) => {
      for (const file of files) await productDetailApi.uploadImage(id, file, onProgress);
    },
    onSettled: refresh,
  });
}

/** the variants a publish creates listings for (first 100 active ones) */
export function usePublishVariants(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...productDetailKeys.product(id), "publish-variants"] as const,
    queryFn: async ({ signal }) => {
      const page = await productDetailApi.variants(id, 1, 100, signal);
      return { total: page.total, items: page.items.filter((v) => v.status === "active") };
    },
    enabled,
  });
}

/**
 * Creates one listing per variant on the chosen channel account; the listing studio takes over from there.
 * A variant that is refused (already listed there, missing data) does not stop the others.
 */
export function usePublishProduct(id: string) {
  const refresh = useRefreshProduct(id);
  return useGuardedMutation({
    mutationFn: async ({ marketplaceAccountId, variantIds }: { marketplaceAccountId: string; variantIds: string[] }) => {
      const created: Array<{ id: string; variantId: string }> = [];
      const failed: Array<{ variantId: string; error: unknown }> = [];
      for (const variantId of variantIds) {
        try {
          const listing = await productDetailApi.createListing({ marketplaceAccountId, variantId });
          created.push({ id: listing.id, variantId });
        } catch (error) {
          failed.push({ variantId, error });
        }
      }
      if (created.length === 0 && failed.length > 0) throw failed[0]?.error;
      return { created, failed };
    },
    onSettled: refresh,
  });
}

/**
 * Object URL for an image. The API serves bytes behind the bearer token (an <img> cannot send it), so the bytes are fetched
 * through the client; an absolute (pre-signed) URL is loaded directly.
 */
export function useImageSrc(url: string | null | undefined) {
  const absolute = !!url && /^https?:\/\//i.test(url);
  const { data: blob, isError } = useQuery({
    queryKey: ["productDetail", "image-bytes", url],
    queryFn: ({ signal }) => productDetailApi.imageBlob(url ?? "", signal),
    enabled: !!url && !absolute,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (!url) return { src: null, failed: false };
  if (absolute) return { src: url, failed: false };
  return { src: objectUrl, failed: isError };
}
