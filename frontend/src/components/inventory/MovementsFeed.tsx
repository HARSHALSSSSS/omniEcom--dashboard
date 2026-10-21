import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useMovementsFeed } from "@/hooks/useInventory";
import { formatRelativeTime } from "@/utils/format";
import type { MovementType } from "@/types/inventory";

const TYPES: ReadonlyArray<{ id: MovementType; label: string }> = [
  { id: "order_deduction", label: "Order deductions" },
  { id: "order_release", label: "Order releases" },
  { id: "inward", label: "Inward" },
  { id: "transfer", label: "Transfers" },
  { id: "manual_adjustment", label: "Manual adjustments" },
  { id: "damage", label: "Damage" },
  { id: "return", label: "Returns" },
  { id: "quarantine", label: "Quarantine" },
];

/** GET /inventory/movements/feed: newest first, keyset paging ("Load more"), follows the warehouse filter of the page */
export function MovementsFeed({ warehouseId }: { warehouseId: string | undefined }) {
  const [type, setType] = useState<MovementType | "">("");
  const feed = useMovementsFeed({ type: type || undefined, warehouseId });
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm" aria-label="Recent stock movements">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h3 className="text-base font-semibold text-foreground">Recent Stock Movements & Audit Trail</h3>
        </div>
        <select aria-label="Movement type" value={type} onChange={(e) => setType(e.target.value as MovementType | "")} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="">All movements</option>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {feed.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading movements">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {feed.isError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <span>The movements could not be loaded. {errorMessage(feed.error)}</span>
          <Button variant="outline" size="sm" onClick={() => void feed.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {feed.isSuccess && items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No stock movements {type ? "of this type " : ""}yet.</p>}

      {items.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {items.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 p-3.5 text-xs hover:bg-muted/20">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{m.productTitle}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">({m.sku})</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{m.typeLabel}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {m.warehouse.name}
                  {m.reference?.label && ` · Ref: ${m.reference.label}`}
                  {m.reason && ` · Note: ${m.reason}`}
                  {` · by ${m.operator.name}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`font-mono font-bold ${m.quantityDelta < 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta} units
                </span>
                <p className="text-[11px] text-muted-foreground">
                  {m.resultingAvailable} available · {formatRelativeTime(m.at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {feed.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
