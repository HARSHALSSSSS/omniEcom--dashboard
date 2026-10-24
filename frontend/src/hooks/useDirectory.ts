import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { directoryApi } from "@/api/directory.api";
import { refreshShell } from "@/lib/session";
import type { ConnectInput, OauthCompleteInput } from "@/types/directory";

export const DIRECTORY_KEYS = {
  all: ["marketplace-hub", "directory"] as const,
  readiness: (code: string) =>
    ["marketplace-hub", "connector-readiness", code] as const,
};

export const useDirectory = () =>
  useQuery({ queryKey: DIRECTORY_KEYS.all, queryFn: directoryApi.directory });

export const useConnectorReadiness = (code: string | null) =>
  useQuery({
    queryKey: DIRECTORY_KEYS.readiness(code ?? ""),
    queryFn: () => directoryApi.readiness(code as string),
    enabled: !!code,
    staleTime: 10 * 60 * 1000,
  });

/** after an account was created, removed or finished: the hub, the directory and the shell badges all change */
function useRefreshAfterConnect() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["marketplace-hub"] });
    void qc.invalidateQueries({ queryKey: ["marketplace-accounts"] });
    void refreshShell().catch(() => undefined);
  };
}

/** the guided connect: a failed attempt resolves with status "failed" (the API answers 200), real errors reject */
export function useConnect() {
  const refresh = useRefreshAfterConnect();
  return useGuardedMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: ConnectInput;
      idempotencyKey: string;
    }) => directoryApi.connect(input, idempotencyKey),
    onSuccess: refresh,
  });
}

export function useCompleteOauth() {
  const refresh = useRefreshAfterConnect();
  return useGuardedMutation({
    mutationFn: (input: OauthCompleteInput) =>
      directoryApi.oauthComplete(input),
    onSuccess: refresh,
  });
}
