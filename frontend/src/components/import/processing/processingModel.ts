import type { ImportSession } from "@/types/import";
import { formatInZone } from "@/utils/format";

export type StageState = "complete" | "in_progress" | "upcoming" | "failed";

export interface Stage {
  label: string;
  state: StageState;
}

export const processingUrl = (id: string) => `/products/import/${id}/processing`;

/** the import has been committed (fully or partly) and nothing runs any more */
export const isDone = (status: ImportSession["status"]): boolean => status === "committed" || status === "partially_committed";

/** the server has gone through every row at least once */
const validationReached = (s: ImportSession): boolean => s.counters.total > 0 && s.counters.processed >= s.counters.total;

/**
 * The six stages of the design, read from the real status: the file stages are complete once a file was analysed,
 * Validating follows `validating`, Creating products follows `committing`, Complete follows `committed` or `partially_committed`.
 */
export function stagesOf(s: ImportSession): Stage[] {
  const hasFile = s.headers.length > 0;
  const file: StageState = hasFile ? "complete" : "upcoming";
  const failed = s.status === "failed";
  const failedInCommit = failed && validationReached(s);

  let validating: StageState = "upcoming";
  let creating: StageState = "upcoming";
  let complete: StageState = "upcoming";
  switch (s.status) {
    case "validating":
      validating = "in_progress";
      break;
    case "validated":
      validating = "complete";
      break;
    case "committing":
      validating = "complete";
      creating = "in_progress";
      break;
    case "committed":
    case "partially_committed":
      validating = "complete";
      creating = "complete";
      complete = "complete";
      break;
    case "failed":
      validating = failedInCommit ? "complete" : "failed";
      creating = failedInCommit ? "failed" : "upcoming";
      break;
    default:
      break;
  }
  return [
    { label: "Uploading", state: file },
    { label: "Reading", state: file },
    { label: "Mapping", state: file },
    { label: "Validating", state: validating },
    { label: "Creating products", state: creating },
    { label: "Complete", state: complete },
  ];
}

/** the rows that count towards "processed of total" for the phase the import is in */
export function progressOf(s: ImportSession): { done: number; total: number; percent: number } {
  const c = s.counters;
  if (isDone(s.status)) {
    const total = Math.max(c.committed + c.failed, 0);
    return { done: total, total, percent: 100 };
  }
  const committing = s.status === "committing" || (s.status === "failed" && validationReached(s));
  if (committing) {
    const done = c.committed + c.failed;
    return { done, total: Math.max(c.valid + c.warning, done), percent: clamp(c.percent) };
  }
  return { done: c.processed, total: c.total, percent: clamp(c.percent) };
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export function etaText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "Estimating the remaining work…";
  if (seconds < 60) return "Estimated remaining work: < 1 minute";
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `Estimated remaining work: about ${minutes} min` : `Estimated remaining work: about ${Math.ceil(minutes / 60)} h`;
}

/** "17:42:08" in the business time zone */
export const clock = (iso: string | null | undefined, withSeconds = false): string =>
  iso ? formatInZone(iso, { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}), hour12: false }) : "–";
