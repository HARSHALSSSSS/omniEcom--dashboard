import { reportsApi } from "@/api/reports.api";
import { saveBlob } from "@/components/products/list/saveBlob";
import { toast } from "@/hooks/useToast";
import type { ReportRun } from "@/types/reports";
import { reportErrorMessage } from "./reportsFormat";

/** fetches the file of a finished run with the bearer token and hands it to the browser; failures become a toast */
export async function downloadRunFile(run: Pick<ReportRun, "id" | "fileName" | "format" | "reportTitle">): Promise<boolean> {
  try {
    const file = await reportsApi.downloadRun(run);
    saveBlob(file.blob, file.fileName);
    toast({ title: "Report downloaded", description: file.fileName, variant: "success" });
    return true;
  } catch (e) {
    toast({ title: `Could not download ${run.reportTitle}`, description: reportErrorMessage(e, "The file could not be downloaded."), variant: "destructive" });
    return false;
  }
}
