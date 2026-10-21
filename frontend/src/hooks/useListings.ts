import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listingsApi } from "@/api/listings.api";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CreateOutcome, CreateTarget, JobStatus, ListingBulkAction, ListingFilters, ListingsQuery } from "@/types/listing";

export const listingKeys = {
  all: ["listings"] as const,
  overview: (businessId: string | undefined, f: Pick<ListingFilters, "marketplace" | "accountId">) => ["listings", "overview", businessId, f] as const,
  table: (businessId: string | undefined, q: ListingsQuery) => ["listings", "table", businessId, q] as const,
  notListed: (businessId: string | undefined, q: Pick<ListingsQuery, "q" | "marketplace" | "accountId" | "page" | "pageSize">) => ["listings", "not-listed", businessId, q] as const,
  channels: (businessId: string | undefined) => ["listings", "channels", businessId] as const,
  job: (id: string) => ["listings", "job", id] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** tab counts (the strip above the table); follows the marketplace and account filters */
export function useListingsOverview(filters: Pick<ListingFilters, "marketplace" | "accountId">, enabled = true) {
  const businessId = useBusinessId();
  const key = { marketplace: filters.marketplace, accountId: filters.accountId };
  return useQuery({ queryKey: listingKeys.overview(businessId, key), queryFn: ({ signal }) => listingsApi.overview(key, signal), staleTime: 30_000, enabled });
}

/** one numbered page of the listings table; the previous page stays on screen while the next one loads */
export function useListingsTable(query: ListingsQuery, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: listingKeys.table(businessId, query),
    queryFn: ({ signal }) => (query.productId ? listingsApi.productListings(query, signal) : listingsApi.table(query, signal)),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** the "Not listed" tab: variants that could be listed on a connected account */
export function useNotListed(query: ListingsQuery, enabled: boolean) {
  const businessId = useBusinessId();
  const key = { q: query.q, marketplace: query.marketplace, accountId: query.accountId, page: query.page, pageSize: query.pageSize };
  return useQuery({
    queryKey: listingKeys.notListed(businessId, key),
    queryFn: ({ signal }) => listingsApi.notListed(key, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** connected accounts and the marketplaces' names (filter chips, create-listing targets) */
export function useListingChannels() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: listingKeys.channels(businessId), queryFn: listingsApi.channels, staleTime: 5 * 60_000, retry: false });
}

const TERMINAL: readonly JobStatus[] = ["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"];
export const isTerminalJob = (status: JobStatus): boolean => TERMINAL.includes(status);
export const JOB_POLL_MS = 2000;

/** follows one publish/sync job until it ends (polling stops on its own) */
export function useJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: listingKeys.job(jobId ?? ""),
    queryFn: () => listingsApi.syncJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (q) => (q.state.data && isTerminalJob(q.state.data.status) ? false : JOB_POLL_MS),
    retry: false,
  });
}

/** every write changes the listings on screen, the product pages' channel statuses and the sidebar badges */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: listingKeys.all });
    void queryClient.invalidateQueries({
      predicate: (q) => (q.queryKey[0] === "products" && q.queryKey[1] !== "thumbnail") || q.queryKey[0] === "productDetail",
    });
    refreshShell().catch(() => undefined);
  };
}

export function useBulkListings() {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: (input: { action: ListingBulkAction; ids: string[] }) => listingsApi.bulk(input.action, input.ids),
    onSuccess: afterWrite,
  });
}

const CREATE_CONCURRENCY = 5;

/** starts a draft listing for each variant x account pair; a failure of one never stops the rest */
export function useCreateListings() {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: async (targets: CreateTarget[]): Promise<CreateOutcome[]> => {
      const out: CreateOutcome[] = [];
      for (let i = 0; i < targets.length; i += CREATE_CONCURRENCY) {
        out.push(...(await Promise.all(targets.slice(i, i + CREATE_CONCURRENCY).map((t) => listingsApi.create(t)))));
      }
      return out;
    },
    onSettled: afterWrite,
  });
}
