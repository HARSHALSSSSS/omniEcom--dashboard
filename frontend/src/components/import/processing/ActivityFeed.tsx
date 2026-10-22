import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import type { ActivityItem, ActivityKind } from "@/types/importProcessing";
import { clock } from "./processingModel";

const OK = "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40";
const BADGE: Record<ActivityKind, { label: string; cls: string }> = {
  row_validated: { label: "Success", cls: OK },
  row_created: { label: "Success", cls: OK },
  row_updated: { label: "Success", cls: OK },
  issue_resolved: { label: "Success", cls: OK },
  stage: { label: "Success", cls: OK },
  row_warning: { label: "Warning", cls: "text-amber-700 bg-amber-50 dark:bg-amber-950/40" },
  row_error: { label: "Error", cls: "text-red-600 bg-red-50 dark:bg-red-950/40" },
  row_failed: { label: "Failed", cls: "text-red-600 bg-red-50 dark:bg-red-950/40" },
  row_skipped: { label: "Skipped", cls: "text-[#666666] bg-[#F6F6F6] dark:bg-muted" },
};

interface Props {
  items: ActivityItem[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  hasOlder: boolean;
  loadingOlder: boolean;
  olderError: unknown;
  onLoadOlder: () => void;
}

/** Real-time activity feed: what the import just did, newest first (GET /imports/{id}/activity). */
export function ActivityFeed({ items, loading, error, onRetry, hasOlder, loadingOlder, olderError, onLoadOlder }: Props) {
  return (
    <div className="p-6 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
      <h3 className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">REAL-TIME ACTIVITY FEED</h3>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="text-[12px] leading-[18px] text-[#666666]">
          The activity could not be loaded{error ? `: ${errorMessage(error, "try again")}` : ""}.{" "}
          <button type="button" className="font-medium text-[#000000] underline dark:text-white" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-[12px] leading-[18px] text-[#666666]">No activity yet. Entries appear here as the import works through your file.</p>
      ) : (
        <ul className="divide-y divide-[#E3E3E3] dark:divide-border text-[12px] leading-[18px]" aria-label="Import activity">
          {items.map((item) => {
            const badge = BADGE[item.kind] ?? BADGE.stage;
            return (
              <li key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-[#666666] text-[11px] shrink-0">{clock(item.at, true)}</span>
                  <span className="min-w-0 text-[#000000] dark:text-white">
                    {item.message}
                    {item.sku && !item.message.includes(item.sku) && <span className="ml-1.5 font-mono text-[11px] text-[#666666]">{item.sku}</span>}
                  </span>
                </div>
                <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-[3px] ${badge.cls}`}>{badge.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {olderError ? (
        <p role="alert" className="text-[11px] text-red-600">
          {errorMessage(olderError, "Older activity could not be loaded.")}
        </p>
      ) : null}
      {hasOlder && !loading && !error && (
        <Button variant="outline" size="sm" loading={loadingOlder} onClick={onLoadOlder} className="h-[32px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] font-medium">
          Load older
        </Button>
      )}
    </div>
  );
}
