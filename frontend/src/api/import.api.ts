import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  ImportJob,
  ImportIssue,
  ColumnMappingField,
  UpdateMappingInput,
  ResolveIssueInput,
} from "@/types/import";

export interface RevalidationResult {
  revalidatedCount: number;
  resolvedCount: number;
  remainingIssuesCount: number;
  status: "clean" | "issues_remain";
}

export interface CommitResult {
  success: boolean;
  importedCount: number;
  timestamp: string;
}

export interface JobStatusResponse {
  id: string;
  status: ImportJob["status"];
  progress: number;
  total: number;
  processed: number;
  valid: number;
  errors: number;
}

export const importApi = {
  getJob: async (id: string): Promise<ImportJob> => {
    const res = await client.get<{ data: ImportJob }>(
      `${ENDPOINTS.IMPORTS}/${id}`,
    );
    return res.data.data;
  },

  startImport: async (payload: {
    sourceType: string;
    fileName: string;
    fileSizeBytes: number;
  }): Promise<ImportJob> => {
    const res = await client.post<{ data: ImportJob }>(
      ENDPOINTS.IMPORTS,
      payload,
    );
    return res.data.data;
  },

  updateMapping: async (
    jobId: string,
    payload: UpdateMappingInput,
  ): Promise<ColumnMappingField[]> => {
    const res = await client.put<{ data: ColumnMappingField[] }>(
      `${ENDPOINTS.IMPORTS}/${jobId}/mapping`,
      payload,
    );
    return res.data.data;
  },

  getIssues: async (
    jobId: string,
  ): Promise<{
    issues: ImportIssue[];
    summary: { total: number; resolved: number; remaining: number };
  }> => {
    const res = await client.get<{
      data: ImportIssue[];
      summary: { total: number; resolved: number; remaining: number };
    }>(`${ENDPOINTS.IMPORTS}/${jobId}/issues`);
    return {
      issues: res.data.data,
      summary: res.data.summary,
    };
  },

  resolveIssue: async (
    jobId: string,
    payload: ResolveIssueInput,
  ): Promise<ImportIssue> => {
    const res = await client.post<{ data: ImportIssue }>(
      `${ENDPOINTS.IMPORTS}/${jobId}/issues/${payload.issueId}`,
      {
        action: payload.action,
        customValue: payload.customValue,
      },
    );
    return res.data.data;
  },

  revalidate: async (jobId: string): Promise<RevalidationResult> => {
    const res = await client.post<{ data: RevalidationResult }>(
      `${ENDPOINTS.IMPORTS}/${jobId}/revalidate`,
    );
    return res.data.data;
  },

  commitImport: async (jobId: string): Promise<CommitResult> => {
    const res = await client.post<{ data: CommitResult }>(
      `${ENDPOINTS.IMPORTS}/${jobId}/commit`,
    );
    return res.data.data;
  },

  getJobStatus: async (jobId: string): Promise<JobStatusResponse> => {
    const res = await client.get<{ data: JobStatusResponse }>(
      ENDPOINTS.JOB(jobId),
    );
    return res.data.data;
  },
};
