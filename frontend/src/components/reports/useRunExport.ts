import { useCallback, useState } from "react";
import { toast } from "@/hooks/useToast";
import { isActiveRun, useExportReport } from "@/hooks/useReports";
import type { ExportRequest, ReportRun } from "@/types/reports";
import { downloadRunFile } from "./downloadRun";
import { runFailure } from "./reportsFormat";

/**
 * POST /reports/exports and what follows: a finished run (201) is downloaded at once, a queued one (202) is handed to
 * `onQueued` so the page can poll it. A refused request throws (the caller shows the message next to its form).
 */
export function useRunExport(onQueued: (run: ReportRun) => void) {
  const mutation = useExportReport();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const start = useCallback(
    async (request: ExportRequest, key: string): Promise<ReportRun> => {
      setBusyKey(key);
      try {
        const run = await mutation.mutateAsync(request);
        if (run.status === "succeeded" && run.downloadable) {
          await downloadRunFile(run);
        } else if (isActiveRun(run)) {
          toast({ title: "Generating your report", description: `${run.reportTitle} is being prepared. It downloads when it is ready.` });
          onQueued(run);
        } else if (run.status === "failed") {
          toast({ title: `${run.reportTitle} failed`, description: runFailure(run), variant: "destructive" });
        }
        return run;
      } finally {
        setBusyKey(null);
      }
    },
    [mutation, onQueued],
  );

  return { start, busyKey, busy: busyKey !== null };
}
