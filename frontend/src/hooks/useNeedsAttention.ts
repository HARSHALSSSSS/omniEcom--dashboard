import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { attentionApi, AttentionListResponse } from "@/api/attention.api";
import { useToast } from "@/hooks/useToast";

export const ATTENTION_KEYS = {
  all: ["attention"] as const,
  list: (params?: { status?: string; priority?: string }) =>
    ["attention", "list", params] as const,
};

export function useNeedsAttention(params?: {
  status?: string;
  priority?: string;
}) {
  return useQuery<AttentionListResponse>({
    queryKey: ATTENTION_KEYS.list(params),
    queryFn: () => attentionApi.getItems(params),
  });
}

export function useResolveAttention() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      id,
      action,
      snoozeHours,
    }: {
      id: string;
      action: "resolve" | "snooze" | "in_progress";
      snoozeHours?: number;
    }) => attentionApi.takeAction(id, action, snoozeHours),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ATTENTION_KEYS.all });
      toast({
        title:
          updated.status === "resolved"
            ? "Issue resolved"
            : updated.status === "snoozed"
              ? "Issue snoozed"
              : "Marked in progress",
        description: updated.headline,
      });
    },
  });
}
