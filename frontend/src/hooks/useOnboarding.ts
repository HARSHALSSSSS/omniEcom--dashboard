import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import {
  onboardingApi,
  SYNC_JOB_TERMINAL,
  type BusinessInput,
  type FulfillmentInput,
  type InventoryInput,
  type OnboardingProgress,
  type StepKey,
} from "@/api/onboarding.api";
import { refreshOnboarding } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";

export const ONBOARDING_KEYS = {
  all: ["onboarding"] as const,
  state: ["onboarding", "state"] as const,
  options: ["onboarding", "options"] as const,
  channels: ["onboarding", "channels"] as const,
  connector: (code: string) => ["onboarding", "connector", code] as const,
  products: ["onboarding", "products"] as const,
  job: (id: string) => ["onboarding", "job", id] as const,
  inventory: ["onboarding", "inventory"] as const,
  inventoryOverview: ["onboarding", "inventory-overview"] as const,
  fulfillment: ["onboarding", "fulfillment"] as const,
  readiness: ["onboarding", "readiness"] as const,
};

/** the server answered with the new state of the wizard: cache it and tell the route guards */
function applyState(qc: QueryClient, state: OnboardingProgress) {
  qc.setQueryData(ONBOARDING_KEYS.state, state);
  useWorkspaceStore.getState().setOnboardingProgress({ status: state.status, resumeStep: state.resumeStep });
}

/** what a save changed can show up on every screen (readiness, previews, counts): refresh whatever is on screen */
function refreshRest(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "onboarding" && q.queryKey[1] !== "state" && q.queryKey[1] !== "options" && q.queryKey[1] !== "connector",
  });
}

// ------------------------------------------------------------------------------------------------ state
export const useOnboardingState = () =>
  useQuery({ queryKey: ONBOARDING_KEYS.state, queryFn: onboardingApi.get, staleTime: 0, refetchOnMount: "always" });

export const useOnboardingOptions = () =>
  useQuery({ queryKey: ONBOARDING_KEYS.options, queryFn: onboardingApi.options, staleTime: 60 * 60 * 1000 });

function useStateMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, pick: (result: TResult) => OnboardingProgress) {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      applyState(qc, pick(result));
      void refreshRest(qc);
    },
  });
}

export const useSaveBusiness = () => useStateMutation((input: BusinessInput) => onboardingApi.saveBusiness(input), (r) => r.state);
export const useSaveDraft = () =>
  useStateMutation((v: { step: StepKey; data: Record<string, unknown> }) => onboardingApi.saveDraft(v.step, v.data), (r) => r);
export const useSkipStep = () => useStateMutation((step: StepKey) => onboardingApi.skip(step), (r) => r);
export const useContinueProducts = () => useStateMutation(() => onboardingApi.continueProducts(), (r) => r);

// ------------------------------------------------------------------------------------------------ channels
export const useChannels = () => useQuery({ queryKey: ONBOARDING_KEYS.channels, queryFn: onboardingApi.channels, staleTime: 0, refetchOnMount: "always" });

export const useSaveChannels = () => useStateMutation((selected: string[]) => onboardingApi.saveChannels(selected), (r) => r.state);

export const useConnectorForm = (code: string | null) =>
  useQuery({
    queryKey: ONBOARDING_KEYS.connector(code ?? ""),
    queryFn: () => onboardingApi.connectorForm(code as string),
    enabled: !!code,
    staleTime: 10 * 60 * 1000,
  });

/**
 * Connects a channel for real: registers the marketplace account (idempotent), then sends the credentials; the server
 * checks them with the marketplace before it stores anything. A rejected check leaves the account pending, so the seller can retry.
 */
export function useConnectChannel() {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: async (v: { code: string; displayName?: string; credentials: Record<string, string> }) => {
      const account = await onboardingApi.connectChannel(v.code, v.displayName ? { displayName: v.displayName } : {});
      return onboardingApi.authorizeAccount(account.accountId, v.credentials);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ONBOARDING_KEYS.all });
    },
  });
}

// ------------------------------------------------------------------------------------------------ products
export const useCatalog = () =>
  useQuery({
    queryKey: ONBOARDING_KEYS.products,
    queryFn: onboardingApi.products,
    staleTime: 0,
    refetchOnMount: "always",
    // an import keeps running on the server (even across a reload): watch it until it settles
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.importStatus === "importing") ? 3000 : false),
  });

export function useRefreshCounts() {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: (accountId?: string) => onboardingApi.refreshCounts(accountId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ONBOARDING_KEYS.products });
    },
  });
}

export function useImportCatalog() {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: (accountId: string) => onboardingApi.importCatalog(accountId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ONBOARDING_KEYS.products });
    },
  });
}

/** polls GET /sync/jobs/{id} until the job reaches a final status */
export const useSyncJob = (jobId: string | null) =>
  useQuery({
    queryKey: ONBOARDING_KEYS.job(jobId ?? ""),
    queryFn: () => onboardingApi.syncJob(jobId as string),
    enabled: !!jobId,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (q) => (q.state.data && SYNC_JOB_TERMINAL.includes(q.state.data.status) ? false : 1500),
  });

// ------------------------------------------------------------------------------------------------ inventory
export const useInventorySetup = () => useQuery({ queryKey: ONBOARDING_KEYS.inventory, queryFn: onboardingApi.inventory, staleTime: 0, refetchOnMount: "always" });
export const useInventoryOverview = () => useQuery({ queryKey: ONBOARDING_KEYS.inventoryOverview, queryFn: onboardingApi.inventoryOverview, staleTime: 0, refetchOnMount: "always" });
export const useSaveInventory = () => useStateMutation((input: InventoryInput) => onboardingApi.saveInventory(input), (r) => r.state);

// ------------------------------------------------------------------------------------------------ fulfillment
export const useFulfillment = () => useQuery({ queryKey: ONBOARDING_KEYS.fulfillment, queryFn: onboardingApi.fulfillment, staleTime: 0, refetchOnMount: "always" });
export const useSaveFulfillment = () => useStateMutation((input: FulfillmentInput) => onboardingApi.saveFulfillment(input), (r) => r.state);

// ------------------------------------------------------------------------------------------------ ready
export const useReadiness = () => useQuery({ queryKey: ONBOARDING_KEYS.readiness, queryFn: onboardingApi.readiness, staleTime: 0, refetchOnMount: "always" });

/** "Go to dashboard": finishes onboarding on the server, then re-reads it so the guards let the user into the workspace */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: async () => {
      await onboardingApi.complete();
      return refreshOnboarding();
    },
    onSuccess: (state) => {
      applyState(qc, state);
    },
  });
}
