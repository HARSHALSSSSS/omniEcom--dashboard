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
    <StateBox title="No shipments match these filters." description="Try a different search, carrier or status to find the shipments you need.">
      <Button variant="outline" size="sm" className="text-xs" onClick={onClear}>
        Clear filters
      </Button>
    </StateBox>
  );
}

interface NoCarrierProps {
  canConfigure: boolean;
  onSetup: () => void;
}

/** nothing shipped and no carrier configured: explain and offer the setup */
export function NoCarrier({ canConfigure, onSetup }: NoCarrierProps) {
  return (
    <StateBox
      title="No carrier is set up yet."
      description="Shipments, AWBs and labels appear here once a carrier is connected and packed orders are booked with it. Add a carrier to get started."
    >
      {canConfigure ? (
        <Button size="sm" className="text-xs" onClick={onSetup}>
          Add a carrier
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Ask an admin of your business to add a carrier.</span>
      )}
    </StateBox>
  );
}

export function NoShipments() {
  return <StateBox title="No shipments yet." description="Carriers are set up. Shipments appear here once packed orders are booked with a carrier in Fulfillment." />;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title="Shipments could not be loaded." description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}
