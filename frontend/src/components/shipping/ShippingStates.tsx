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

interface ShippingWelcomeProps {
  canConfigure: boolean;
  onConfigure: () => void;
  onMarketplaces: () => void;
}

/** nothing is configured yet: the guided start of the design */
export function ShippingWelcome({ canConfigure, onConfigure, onMarketplaces }: ShippingWelcomeProps) {
  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center py-12">
      <div className="w-full max-w-[900px] rounded-xl border border-[#EAEAEA] bg-[#FAF9F7] p-8 shadow-sm sm:p-10">
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
          <div className="space-y-3 md:col-span-7">
            <h2 className="text-[22px] font-semibold tracking-tight text-black">Shipping is ready when you are.</h2>
            <p className="max-w-[440px] text-[13px] leading-relaxed text-[#666666]">Connect a marketplace or configure a shipping method to start processing orders.</p>
            <div className="flex flex-wrap items-center gap-3 pt-3">
              {canConfigure ? (
                <button type="button" onClick={onConfigure} className="h-9 rounded-lg bg-black px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800">
                  Configure Shipping
                </button>
              ) : (
                <span className="text-[12px] text-[#666666]">Ask an admin of your business to configure shipping.</span>
              )}
              <button type="button" onClick={onMarketplaces} className="h-9 rounded-lg border border-[#EAEAEA] bg-white px-4 text-[12px] font-medium text-black shadow-2xs transition-colors hover:bg-neutral-50">
                View Connected Marketplaces
              </button>
            </div>
          </div>
          <div className="space-y-3 border-t border-[#EAEAEA] pt-6 md:col-span-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <span className="text-[12px] font-semibold text-black">Start with what you need</span>
            <ul className="space-y-2 text-[12px] text-[#666666]">
              {["Connect your marketplace", "Configure one shipping method", "Review and confirm your first order"].map((step, i) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EAEAEA] text-[10px] font-semibold text-black">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
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
