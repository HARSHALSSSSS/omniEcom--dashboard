import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useManifests } from "@/hooks/useShipping";
import { dateOrDash } from "./shippingFormat";

interface ManifestsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** the hand-over documents created in Fulfillment (read-only here) */
export function ManifestsDialog({ open, onClose }: ManifestsDialogProps) {
  const manifests = useManifests(open);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manifests</DialogTitle>
          <DialogDescription>The latest hand-over documents. Manifests are created when orders are handed to a carrier in Fulfillment.</DialogDescription>
        </DialogHeader>
        {manifests.isLoading ? (
          <div role="status" aria-label="Loading manifests" className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : manifests.isError ? (
          <div role="alert" className="space-y-2 text-xs">
            <p className="text-muted-foreground">Manifests could not be loaded. {errorMessage(manifests.error)}</p>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => void manifests.refetch()}>
              Retry
            </Button>
          </div>
        ) : (manifests.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No manifest has been created yet.</p>
        ) : (
          <ul className="max-h-[360px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {(manifests.data ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                <div>
                  <p className="font-mono font-semibold text-foreground">{m.number}</p>
                  <p className="text-muted-foreground">
                    {m.providerCode} · {m.shipmentCount} {m.shipmentCount === 1 ? "shipment" : "shipments"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold capitalize text-foreground">{m.status}</p>
                  <p className="text-muted-foreground">{dateOrDash(m.dispatchedAt ?? m.closedAt ?? m.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
