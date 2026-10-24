import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { listingFlowsApi } from "@/api/listingFlows.api";
import { listingStudioApi } from "@/api/listingStudio.api";
import { refreshShell } from "@/lib/session";
import { listingKeys } from "@/hooks/useListings";
import type { AttributeValue } from "@/components/listings/flows/flowFormat";
import type { BulkContentEdits } from "@/types/listingFlows";

export const flowKeys = {
  channels: (listingId: string) => ["listings", "flows", "channels", listingId] as const,
  unlisted: (variantId: string, accountId: string) => ["listings", "flows", "unlisted", variantId, accountId] as const,
  selection: (ids: string[]) => ["listings", "flows", "selection", ids.join(",")] as const,
  details: (listingId: string) => ["listings", "flows", "details", listingId] as const,
  suggestions: (listingId: string) => ["listings", "flows", "suggestions", listingId] as const,
};

/** the full category paths and the fixed completeness rows of a listing (the quick view and the blocker screen degrade without them) */
export const useFlowDetails = (listingId: string | null) =>
  useQuery({
    queryKey: flowKeys.details(listingId ?? ""),
    queryFn: () => listingFlowsApi.details(listingId as string),
    enabled: !!listingId,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });

/**
 * "Fix with AI": the values the engine would enter for the failing checks. Reading them saves nothing; `refetch()` runs the engine again
 * (the "Fix with AI" button), and the user confirms a value before it goes through the one save.
 */
export const useFixSuggestions = (listingId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: flowKeys.suggestions(listingId ?? ""),
    queryFn: () => listingFlowsApi.fixSuggestions(listingId as string),
    enabled: !!listingId && enabled,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });

export interface BulkContentInput {
  ids: string[];
  edits: BulkContentEdits;
  dryRun?: boolean;
  versions?: Record<string, number>;
}

/** edits the content of many listings; a real run refreshes every list and the badges, a preview (dryRun) changes nothing */
export function useBulkContentEdit() {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: (input: BulkContentInput) => listingFlowsApi.bulkContent(input),
    onSuccess: async (res) => {
      if (res.dryRun) return;
      await qc.invalidateQueries({ queryKey: listingKeys.all });
      await qc.invalidateQueries({ queryKey: ["listing-studio"] });
      refreshShell().catch(() => undefined);
    },
  });
}

/** the other channels of the product behind a listing */
export const useListingChannelsView = (listingId: string | null) =>
  useQuery({
    queryKey: flowKeys.channels(listingId ?? ""),
    queryFn: () => listingFlowsApi.channels(listingId as string),
    enabled: !!listingId,
    staleTime: 0,
    refetchOnMount: "always",
  });

export const useUnlistedContext = (variantId: string | null, accountId: string | null) =>
  useQuery({
    queryKey: flowKeys.unlisted(variantId ?? "", accountId ?? ""),
    queryFn: () => listingFlowsApi.unlistedContext(variantId as string, accountId as string),
    enabled: !!variantId && !!accountId,
    staleTime: 0,
    refetchOnMount: "always",
  });

export const useListingSelection = (ids: string[]) =>
  useQuery({
    queryKey: flowKeys.selection(ids),
    queryFn: () => listingFlowsApi.selection(ids),
    enabled: ids.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });

/** every write here changes the listing on screen, the lists behind it and the sidebar badges */
function useRefreshAfterWrite(listingId?: string) {
  const qc = useQueryClient();
  return async () => {
    if (listingId) await qc.invalidateQueries({ queryKey: ["listing-studio", listingId] });
    await qc.invalidateQueries({ queryKey: listingKeys.all });
    refreshShell().catch(() => undefined);
  };
}

/** starts the listing of a variant on an account (a draft the Studio takes over) */
export function usePrepareListing() {
  const refresh = useRefreshAfterWrite();
  return useGuardedMutation({
    mutationFn: (input: { variantId: string; accountId: string }) => listingFlowsApi.prepare(input.variantId, input.accountId),
    onSuccess: refresh,
  });
}

export interface FixAttributeInput {
  key: string;
  value: AttributeValue;
  /** the version the screen was showing: a change by someone else answers VERSION_CONFLICT */
  version: number;
}

/**
 * Resolves a blocker for real: the attribute value goes through the one save (PATCH /listings/{id}), then the listing is validated
 * again so the stored status (blocked / ready) follows, then the studio and the lists are read again.
 */
export function useFixAttribute(listingId: string) {
  const refresh = useRefreshAfterWrite(listingId);
  return useGuardedMutation({
    mutationFn: async (input: FixAttributeInput) => {
      const saved = await listingStudioApi.save(listingId, { version: input.version, attributeOverrides: { [input.key]: input.value } });
      const validation = await listingStudioApi
        .validate(listingId)
        .then((v) => v.validation)
        .catch(() => null);
      return { saved, validation };
    },
    onSettled: refresh,
  });
}

/** publish-flow for one listing (validate, approve, publish) */
export function usePublishListing(listingId: string) {
  const refresh = useRefreshAfterWrite(listingId);
  return useGuardedMutation({ mutationFn: () => listingStudioApi.publishFlow(listingId), onSettled: refresh });
}
