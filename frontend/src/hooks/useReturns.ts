import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { returnsApi } from "@/api/returns.api";
import {
  ReturnOrder,
  CreateReturnInput,
  SubmitInspectionInput,
  ConfirmDispositionInput,
  ProcessRefundInput,
} from "@/types/returns";
import { useToast } from "@/hooks/useToast";

export const RETURN_KEYS = {
  all: ["returns"] as const,
  list: (params?: { status?: string; channel?: string; search?: string }) =>
    ["returns", "list", params] as const,
  detail: (id: string) => ["returns", "detail", id] as const,
};

export function useReturns(params?: {
  status?: string;
  channel?: string;
  search?: string;
}) {
  return useQuery<ReturnOrder[]>({
    queryKey: RETURN_KEYS.list(params),
    queryFn: () => returnsApi.getReturns(params),
  });
}

export function useReturn(id: string | null) {
  return useQuery<ReturnOrder>({
    queryKey: RETURN_KEYS.detail(id ?? ""),
    queryFn: () => (id ? returnsApi.getReturn(id) : Promise.reject(new Error("No id"))),
    enabled: Boolean(id),
  });
}

export function useCreateReturn() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: CreateReturnInput) => returnsApi.createReturn(payload),
    onSuccess: (newReturn) => {
      queryClient.invalidateQueries({ queryKey: RETURN_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Return created",
        description: `Return ${newReturn.returnNumber || newReturn.id} for order ${newReturn.orderNumber} has been logged.`,
      });
    },
    onError: () => {
      toast({
        title: "Creation failed",
        description: "Could not create return. Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useSubmitInspection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SubmitInspectionInput }) =>
      returnsApi.submitInspection(id, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: RETURN_KEYS.all });
      toast({
        title: "Inspection recorded",
        description: `Inspection for ${updated.returnNumber || updated.id} marked as ${updated.inspectionStatus}.`,
      });
    },
    onError: () => {
      toast({
        title: "Inspection failed",
        description: "Could not submit inspection results.",
        variant: "destructive",
      });
    },
  });
}

export function useConfirmDisposition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConfirmDispositionInput }) =>
      returnsApi.confirmDisposition(id, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: RETURN_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast({
        title: "Disposition confirmed",
        description: `Stock destination confirmed for ${updated.returnNumber || updated.id}.`,
      });
    },
    onError: () => {
      toast({
        title: "Disposition failed",
        description: "Could not confirm inventory disposition.",
        variant: "destructive",
      });
    },
  });
}

export function useProcessRefund() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: ProcessRefundInput }) =>
      returnsApi.processRefund(id, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: RETURN_KEYS.all });
      toast({
        title: "Refund initiated",
        description: `Refund batch for ${updated.returnNumber || updated.id} sent to ${updated.channel}.`,
      });
    },
    onError: () => {
      toast({
        title: "Refund failed",
        description: "Could not process refund via connector.",
        variant: "destructive",
      });
    },
  });
}

export function useRetryRefund() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => returnsApi.retryRefund(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: RETURN_KEYS.all });
      toast({
        title: "Retry submitted",
        description: `Resubmitted refund payload for ${updated.returnNumber || updated.id}.`,
      });
    },
    onError: () => {
      toast({
        title: "Retry failed",
        description: "Connector could not resubmit refund request.",
        variant: "destructive",
      });
    },
  });
}
