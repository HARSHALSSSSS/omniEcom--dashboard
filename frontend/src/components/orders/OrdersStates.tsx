import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="w-full flex min-h-[260px] flex-col items-center justify-center gap-2 border-y border-[#EAEAEA] bg-white px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <StateBox title="No orders match these filters." description="Try a different search, marketplace or status to find the orders you need.">
      <Button variant="outline" size="sm" className="text-xs" onClick={onClear}>
        Clear filters
      </Button>
    </StateBox>
  );
}

interface EmptyOrdersProps {
  canSync: boolean;
  syncing: boolean;
  onSync: () => void;
}

export function EmptyOrders({ canSync, syncing, onSync }: EmptyOrdersProps) {
  return (
    <StateBox title="No orders yet." description="Orders from your connected marketplaces appear here once they are imported.">
      {canSync && (
        <Button size="sm" className="text-xs" disabled={syncing} onClick={onSync}>
          {syncing ? "Syncing..." : "Sync orders now"}
        </Button>
      )}
    </StateBox>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title="Orders could not be loaded." description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}
