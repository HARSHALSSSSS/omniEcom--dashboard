import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import {
  initialImportJob,
  initialImportIssues,
} from "@/mocks/data/imports.data";
import { ImportJob, ImportIssue } from "@/types/import";

let currentJob: ImportJob = { ...initialImportJob };
let currentIssues: ImportIssue[] = [...initialImportIssues];

export const importHandlers = [
  // Get active or specific import job
  http.get(ENDPOINTS.IMPORTS, async () => {
    await delay(200);
    return HttpResponse.json({
      data: [currentJob],
      meta: { total: 1 },
    });
  }),

  // Get specific import job
  http.get(`${ENDPOINTS.IMPORTS}/:id`, async ({ params }) => {
    await delay(150);
    return HttpResponse.json({
      data: {
        ...currentJob,
        id: params.id as string,
      },
    });
  }),

  // Upload file / Start import wizard
  http.post(ENDPOINTS.IMPORTS, async () => {
    await delay(400);
    currentJob = {
      ...initialImportJob,
      id: `imp-${Date.now().toString().slice(-4)}`,
      status: "processing",
      processedRows: 0,
      createdAt: new Date().toISOString(),
    };
    return HttpResponse.json({
      data: currentJob,
    });
  }),

  // Update column mapping
  http.put(`${ENDPOINTS.IMPORTS}/:id/mapping`, async ({ request }) => {
    await delay(150);
    const body = (await request.json()) as {
      sourceColumn: string;
      targetField: string;
    };
    currentJob.mappings = currentJob.mappings.map((m) =>
      m.sourceColumn === body.sourceColumn
        ? { ...m, targetField: body.targetField, status: "manual" }
        : m,
    );
    return HttpResponse.json({ data: currentJob.mappings });
  }),

  // Get issues for an import job
  http.get(`${ENDPOINTS.IMPORTS}/:id/issues`, async () => {
    await delay(200);
    const resolved = currentIssues.filter((i) => i.status === "resolved").length;
    const remaining = currentIssues.length - resolved;

    return HttpResponse.json({
      data: currentIssues,
      summary: {
        total: currentIssues.length,
        resolved,
        remaining,
      },
    });
  }),

  // Resolve an issue
  http.post(
    `${ENDPOINTS.IMPORTS}/:id/issues/:issueId`,
    async ({ params, request }) => {
      await delay(150);
      const { issueId } = params;
      const body = (await request.json()) as {
        action: "accept_suggestion" | "custom_value" | "ignore";
        customValue?: string;
      };

      currentIssues = currentIssues.map((issue) => {
        if (issue.id === issueId) {
          const newFix =
            body.action === "accept_suggestion"
              ? issue.suggestedFix ?? ""
              : body.action === "custom_value"
                ? body.customValue ?? ""
                : "Ignored";
          return {
            ...issue,
            status: "resolved",
            currentFix: newFix,
          };
        }
        return issue;
      });

      const resolved = currentIssues.filter(
        (i) => i.status === "resolved",
      ).length;
      const remaining = currentIssues.length - resolved;

      currentJob.issuesCount = {
        total: currentIssues.length,
        resolved,
        remaining,
      };

      const updated = currentIssues.find((i) => i.id === issueId);
      return HttpResponse.json({ data: updated });
    },
  ),

  // Batch Revalidate
  http.post(`${ENDPOINTS.IMPORTS}/:id/revalidate`, async () => {
    await delay(600);
    const openIssues = currentIssues.filter((i) => i.status === "open");
    const resolvedCount = currentIssues.length - openIssues.length;

    if (openIssues.length === 0) {
      currentJob.status = "completed";
    }

    return HttpResponse.json({
      data: {
        revalidatedCount: currentIssues.length,
        resolvedCount,
        remainingIssuesCount: openIssues.length,
        status: openIssues.length === 0 ? "clean" : "issues_remain",
      },
    });
  }),

  // Commit import
  http.post(`${ENDPOINTS.IMPORTS}/:id/commit`, async () => {
    await delay(500);
    currentJob.status = "completed";
    currentJob.completedAt = new Date().toISOString();
    return HttpResponse.json({
      data: {
        success: true,
        importedCount: currentJob.validRows + currentJob.issuesCount.resolved,
        timestamp: currentJob.completedAt,
      },
    });
  }),

  // Job Polling endpoint
  http.get(`${ENDPOINTS.JOB(":id")}`, async ({ params }) => {
    await delay(100);
    // Simulate real-time progress if still processing
    if (currentJob.status === "processing" && currentJob.processedRows < currentJob.totalRows) {
      currentJob.processedRows = Math.min(
        currentJob.totalRows,
        currentJob.processedRows + 85,
      );
      if (currentJob.processedRows >= currentJob.totalRows) {
        currentJob.status = "needs_attention";
      }
    }

    return HttpResponse.json({
      data: {
        id: params.id,
        status: currentJob.status,
        progress: Math.round(
          (currentJob.processedRows / currentJob.totalRows) * 100,
        ),
        total: currentJob.totalRows,
        processed: currentJob.processedRows,
        valid: currentJob.validRows,
        errors: currentJob.errorRows,
      },
    });
  }),
];
