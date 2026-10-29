import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import type { Sla } from "@/types/fulfillment";

const SLA_TONE: Record<Sla["band"], string> = {
  safe: "text-emerald-700",
  approaching: "rounded bg-amber-100 px-1.5 py-0.5 text-amber-800",
  at_risk: "rounded bg-rose-100 px-1.5 py-0.5 text-rose-700",
  breached: "rounded bg-rose-600 px-1.5 py-0.5 text-white",
  none: "text-muted-foreground",
};

/** the dispatch deadline as the API words it ("Due in 2h", "Overdue by 40m") */
export function SlaChip({ sla }: { sla: Sla }) {
  return (
    <span data-sla={sla.band} className={cn("inline-block font-mono text-xs font-semibold", SLA_TONE[sla.band])}>
      {sla.label}
    </span>
  );
}

function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="w-full flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <StateBox title="No orders match these filters." description="Try a different search, warehouse or carrier to find the orders you need.">
      <Button variant="outline" size="sm" className="text-xs" onClick={onClear}>
        Clear filters
      </Button>
    </StateBox>
  );
}

export function EmptyQueue({ stage }: { stage: string | null }) {
  return (
    <StateBox
      title={stage ? `Nothing is ${stage.toLowerCase()}.` : "The warehouse queue is empty."}
      description="Confirmed orders appear here once fulfillment starts, and leave when they are handed over to the carrier."
    />
  );
}

export function EmptyExceptions({ status }: { status: string }) {
  return <StateBox title={`No ${status} exceptions.`} description="Pick shortages, damaged items and other blockers raised on an order show up here." />;
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title={title} description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}

export function TableSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-px overflow-hidden rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}
