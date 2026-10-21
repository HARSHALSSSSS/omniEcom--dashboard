import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <StateBox title="No returns match these filters." description="Try a different search, queue, channel or status to find the returns you need.">
      <Button variant="outline" size="sm" className="text-xs" onClick={onClear}>
        Clear filters
      </Button>
    </StateBox>
  );
}

export function EmptyReturns({ onCreate }: { onCreate: (() => void) | null }) {
  return (
    <StateBox title="No returns yet." description="Return requests from your marketplaces and from your own team appear here.">
      {onCreate && (
        <Button size="sm" className="text-xs" onClick={onCreate}>
          Create a return
        </Button>
      )}
    </StateBox>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title="Returns could not be loaded." description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}
