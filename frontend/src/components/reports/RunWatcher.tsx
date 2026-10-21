import { useEffect, useRef } from "react";
import { toast } from "@/hooks/useToast";
import { isActiveRun, useReportRun } from "@/hooks/useReports";
import type { ReportRun } from "@/types/reports";
import { downloadRunFile } from "./downloadRun";
import { runFailure } from "./reportsFormat";

export interface WatchedRun {
  id: string;
  title: string;
  /** an export the person asked for downloads itself; a "run now" of a schedule only tells them */
  download: boolean;
}

interface Props {
  run: WatchedRun;
  onSettled: (id: string) => void;
}

/** Polls one queued run (GET /reports/runs/{id}) and, once it has finished, tells the person and downloads the file. Renders nothing. */
export function RunWatcher({ run, onSettled }: Props) {
  const query = useReportRun(run.id);
  const done = useRef(false);
  const data: ReportRun | undefined = query.data;

  useEffect(() => {
    if (done.current) return;
    if (data && !isActiveRun(data)) {
      done.current = true;
      if (data.status === "succeeded") {
        if (run.download && data.downloadable) void downloadRunFile(data);
        else toast({ title: `${data.reportTitle} is ready`, description: data.fileName ?? undefined, variant: "success" });
      } else {
        toast({ title: `${data.reportTitle} failed`, description: runFailure(data), variant: "destructive" });
      }
      onSettled(run.id);
    } else if (query.isError && !data) {
      done.current = true;
      toast({ title: `Could not check ${run.title}`, description: "Open the History tab to see its status.", variant: "destructive" });
      onSettled(run.id);
    }
  }, [data, query.isError, run, onSettled]);

  return null;
}
