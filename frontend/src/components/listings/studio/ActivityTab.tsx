import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActivityItem } from "@/types/listingStudio";
import { formatRelativeTime } from "@/utils/format";

interface Props {
  items: ActivityItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoadMore: () => void;
}

/** Publication history and activity: the audit trail, newest first, paged */
export function ActivityTab({ items, total, hasMore, loading, failed, onLoadMore }: Props) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">Publication History &amp; Activity</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing has happened to this listing yet.</p>
      ) : (
        <ol className="space-y-4 pt-2" aria-label="Activity timeline">
          {items.map((act) => (
            <li key={act.id} className="flex items-start gap-3 border-b border-border pb-3 text-xs">
              <History className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{act.title}</p>
                  <time dateTime={act.at} className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(act.at)}
                  </time>
                </div>
                {act.details && <p className="text-muted-foreground">{act.details}</p>}
                <p className="font-mono text-[10px] text-muted-foreground">Actor: {act.actor.name}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {items.length} of {total}
        </span>
        {failed && <span role="alert" className="text-destructive">Could not load more.</span>}
        {hasMore && (
          <Button type="button" variant="outline" size="sm" className="text-xs" loading={loading} onClick={onLoadMore}>
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
