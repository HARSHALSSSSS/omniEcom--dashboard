import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 sm:px-6 py-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex flex-wrap items-center justify-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function LoadError({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title={`${what} could not be loaded.`} description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}

export function ListSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-px overflow-hidden rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}

/** the toolbar button look shared by the bulk bar and the table actions */
export const TOOLBAR_BUTTON =
  "h-[30px] rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export const SELECT_CLASS = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";
