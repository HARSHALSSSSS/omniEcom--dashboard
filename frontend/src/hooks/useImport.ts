import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  importApi,
  RevalidationResult,
  CommitResult,
} from "@/api/import.api";
import {
  UpdateMappingInput,
  ResolveIssueInput,
} from "@/types/import";
import { useToast } from "@/hooks/useToast";

export const IMPORT_KEYS = {
  all: ["imports"] as const,
  job: (id: string) => ["imports", "job", id] as const,
  issues: (id: string) => ["imports", "issues", id] as const,
};

export function useImportJob(id: string | null) {
  return useQuery({
    queryKey: IMPORT_KEYS.job(id ?? ""),
    queryFn: () => (id ? importApi.getJob(id) : Promise.reject(new Error("No job id"))),
    enabled: Boolean(id),
  });
}

export function useImportIssues(id: string | null) {
  return useQuery({
    queryKey: IMPORT_KEYS.issues(id ?? ""),
    queryFn: () => (id ? importApi.getIssues(id) : Promise.reject(new Error("No job id"))),
    enabled: Boolean(id),
  });
}

export function useStartImport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: {
      sourceType: string;
      fileName: string;
      fileSizeBytes: number;
    }) => importApi.startImport(payload),
    onSuccess: (job) => {
      queryClient.setQueryData(IMPORT_KEYS.job(job.id), job);
    },
    onError: () => {
      toast({
        title: "Import upload failed",
        description: "Could not initialize catalog import. Check file format.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateMapping(jobId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: UpdateMappingInput) =>
      importApi.updateMapping(jobId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IMPORT_KEYS.job(jobId) });
      toast({
        title: "Mapping updated",
        description: "Column mapping saved successfully.",
      });
    },
  });
}

export function useResolveIssue(jobId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: ResolveIssueInput) =>
      importApi.resolveIssue(jobId, payload),
    onSuccess: (updatedIssue) => {
      queryClient.invalidateQueries({ queryKey: IMPORT_KEYS.issues(jobId) });
      queryClient.invalidateQueries({ queryKey: IMPORT_KEYS.job(jobId) });
      toast({
        title: "Issue resolved",
        description: `Row ${updatedIssue.rowNumber}: Fix applied.`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to resolve issue",
        description: "Please check the input value and try again.",
        variant: "destructive",
      });
    },
  });
}

export function useRevalidateImport(jobId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<RevalidationResult, Error>({
    mutationFn: () => importApi.revalidate(jobId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: IMPORT_KEYS.issues(jobId) });
      queryClient.invalidateQueries({ queryKey: IMPORT_KEYS.job(jobId) });

      if (result.status === "clean") {
        toast({
          title: "All issues resolved!",
          description: "All products verified and ready for import commit.",
        });
      } else {
        toast({
          title: "Revalidation complete",
          description: `${result.resolvedCount} fixed, ${result.remainingIssuesCount} issue(s) still require attention.`,
        });
      }
    },
  });
}

export function useCommitImport(jobId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<CommitResult, Error>({
    mutationFn: () => importApi.commitImport(jobId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: IMPORT_KEYS.job(jobId) });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Import committed successfully!",
        description: `${res.importedCount} products added to your master catalog.`,
      });
    },
    onError: () => {
      toast({
        title: "Commit failed",
        description: "Failed to commit imported records into catalog.",
        variant: "destructive",
      });
    },
  });
}
