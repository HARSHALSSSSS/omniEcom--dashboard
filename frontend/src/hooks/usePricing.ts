import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { pricingApi } from "@/api/pricing.api";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CompetitorWrite, CompetitorsQuery, DecisionAction, GenerateInput, HistoryQuery, PolicyWrite, PriceTableQuery, ProposalsQuery } from "@/types/pricing";

export const pricingKeys = {
  all: ["pricing"] as const,
  overview: (b: string | undefined) => ["pricing", "overview", b] as const,
  marginOverview: (b: string | undefined, a: string | undefined) => ["pricing", "margin-overview", b, a] as const,
  priceTable: (b: string | undefined, q: PriceTableQuery) => ["pricing", "price-table", b, q] as const,
  proposals: (b: string | undefined, q: ProposalsQuery) => ["pricing", "proposals", b, q] as const,
  policies: (b: string | undefined) => ["pricing", "policies", b] as const,
  competitors: (b: string | undefined, q: CompetitorsQuery) => ["pricing", "competitors", b, q] as const,
  history: (b: string | undefined, q: HistoryQuery) => ["pricing", "history", b, q] as const,
  variants: (q: string) => ["pricing", "variant-search", q] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** the KPI strip: pending proposals, estimated margin gain, policies, channels covered */
export function usePricingOverview() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: pricingKeys.overview(businessId), queryFn: ({ signal }) => pricingApi.overview(signal), staleTime: 30_000 });
}

/** per-channel margin rows and totals (real cost + fee data) */
export function useMarginOverview(accountId?: string) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: pricingKeys.marginOverview(businessId, accountId), queryFn: ({ signal }) => pricingApi.marginOverview(accountId, signal), staleTime: 30_000 });
}

/** one numbered page of the product / channel price table; the previous page stays while the next loads */
export function usePriceTable(query: PriceTableQuery) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: pricingKeys.priceTable(businessId, query),
    queryFn: ({ signal }) => pricingApi.priceTable(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/** one numbered page of the review queue; the previous page stays on screen while the next one loads */
export function useProposals(query: ProposalsQuery) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: pricingKeys.proposals(businessId, query),
    queryFn: ({ signal }) => pricingApi.proposals(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function usePolicies(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: pricingKeys.policies(businessId), queryFn: ({ signal }) => pricingApi.policies(signal), staleTime: 30_000, enabled });
}

/** how many variants a policy for this channel (null = all) would look at */
export function usePolicyPreview(accountId: string | null, enabled: boolean) {
  return useQuery({ queryKey: ["pricing", "policy-preview", accountId], queryFn: ({ signal }) => pricingApi.policyPreview(accountId, signal), enabled, staleTime: 30_000 });
}

export function useCompetitorPrices(query: CompetitorsQuery, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: pricingKeys.competitors(businessId, query),
    queryFn: ({ signal }) => pricingApi.competitors(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** the audit log: "Load more" fetches the next older block */
export function usePriceHistory(query: HistoryQuery, enabled = true) {
  const businessId = useBusinessId();
  return useInfiniteQuery({
    queryKey: pricingKeys.history(businessId, query),
    queryFn: ({ pageParam, signal }) => pricingApi.history(query, pageParam, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore,
    staleTime: 15_000,
    enabled,
  });
}

/** catalog variants matching the text (the competitor form's picker) */
export function useVariantSearch(text: string) {
  const q = text.trim();
  return useQuery({ queryKey: pricingKeys.variants(q), queryFn: ({ signal }) => pricingApi.searchVariants(q, signal), enabled: q.length >= 2, staleTime: 30_000 });
}

/** a decision changes prices: the queue, the tiles, the listings' prices and the sidebar badges all move */
function useAfterDecision() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: pricingKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["listings"] });
    void queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] === "products" && q.queryKey[1] !== "thumbnail") || q.queryKey[0] === "productDetail" });
    refreshShell().catch(() => undefined);
  };
}

export function useDecideProposal() {
  const afterWrite = useAfterDecision();
  return useGuardedMutation({
    mutationFn: (input: { id: string; action: DecisionAction; version: number; note?: string }) => pricingApi.decide(input.id, input.action, { version: input.version, note: input.note }),
    onSettled: afterWrite,
  });
}

export function useBulkDecide() {
  const afterWrite = useAfterDecision();
  return useGuardedMutation({
    mutationFn: (input: { ids: string[]; action: DecisionAction; note?: string }) => pricingApi.bulkDecide(input.ids, input.action, input.note),
    onSettled: afterWrite,
  });
}

export function useGenerateProposals() {
  const afterWrite = useAfterDecision();
  return useGuardedMutation({
    mutationFn: (input: GenerateInput) => pricingApi.generate(input),
    // a dry run writes nothing
    onSuccess: (_res, input) => {
      if (!input.dryRun) afterWrite();
    },
  });
}

function useAfterPolicy() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: pricingKeys.all });
}

export function useCreatePolicy() {
  const after = useAfterPolicy();
  return useGuardedMutation({ mutationFn: (body: PolicyWrite) => pricingApi.createPolicy(body), onSuccess: after });
}

export function useUpdatePolicy() {
  const after = useAfterPolicy();
  return useGuardedMutation({
    mutationFn: (input: { id: string; patch: Partial<PolicyWrite>; version: number }) => pricingApi.updatePolicy(input.id, input.patch, input.version),
    onSettled: after,
  });
}

export function useDeletePolicy() {
  const after = useAfterPolicy();
  return useGuardedMutation({ mutationFn: (id: string) => pricingApi.deletePolicy(id), onSuccess: after });
}

/** new fees change every margin: the overview, the price table and the proposals all reload */
export function useSetFeeProfile() {
  const after = useAfterPolicy();
  return useGuardedMutation({
    mutationFn: (input: { accountId: string; feePercentBps: number; fixedFeeMinor: number }) => pricingApi.setFeeProfile(input.accountId, { feePercentBps: input.feePercentBps, fixedFeeMinor: input.fixedFeeMinor }),
    onSuccess: after,
  });
}

export function useAddCompetitor() {
  const after = useAfterPolicy();
  return useGuardedMutation({ mutationFn: (body: CompetitorWrite) => pricingApi.addCompetitor(body), onSuccess: after });
}

export function useImportCompetitors() {
  const after = useAfterPolicy();
  return useGuardedMutation({ mutationFn: (csv: string) => pricingApi.importCompetitors(csv), onSuccess: after });
}

export function useDeleteCompetitor() {
  const after = useAfterPolicy();
  return useGuardedMutation({ mutationFn: (id: string) => pricingApi.deleteCompetitor(id), onSuccess: after });
}
