import { FEE_NOTE, FEE_TEXT } from "@/pages/marketplace-hub/components/connectorFacts";

/** the closing notice of every setup card: nothing publishes by itself, and what the connector costs (the platform bills nothing) */
export function SetupFooterNote({ connectorName }: { connectorName: string }) {
  return (
    <div className="border-t border-neutral-100 pt-4 text-xs text-muted-foreground space-y-1">
      <p className="text-[11px]">
        Connecting does not publish products automatically. You will review catalog mapping and marketplace workflows before activating them.
      </p>
      <div className="text-[11px] text-neutral-500 pt-1">
        <span className="font-medium text-foreground">
          {connectorName} connector · {FEE_TEXT}
        </span>
        <span className="block mt-0.5">{FEE_NOTE}</span>
      </div>
    </div>
  );
}
