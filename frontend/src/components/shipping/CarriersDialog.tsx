import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useAddCarrier, useCarriers, useProviderCatalog, useVerifyCarrier } from "@/hooks/useShipping";
import { formatNumber } from "@/utils/format";
import type { CarrierMethod, CarrierStatus, ProviderCatalogEntry, VerifyResult } from "@/types/shipping";
import { NO_CONFIGURE_REASON, dateOrDash } from "./shippingFormat";

const STATUS_TEXT: Record<CarrierStatus, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-emerald-50 text-emerald-700" },
  needs_configuration: { label: "Needs setup", tone: "bg-amber-50 text-amber-700" },
  disabled: { label: "Disabled", tone: "bg-neutral-100 text-neutral-600" },
};

function failedChecks(result: VerifyResult): string {
  return result.checks.filter((c) => !c.ok).map((c) => c.message).join(" ");
}

interface AddFormProps {
  provider: ProviderCatalogEntry;
  onBack: () => void;
  onDone: () => void;
}

/** the setup form is driven by the settings the provider declares; the carrier is created, then checked (nothing is booked) */
function AddCarrierForm({ provider, onBack, onDone }: AddFormProps) {
  const add = useAddCarrier();
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const missing = provider.configFields.filter((f) => f.required && !values[f.key]?.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const config = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    add.mutate(
      { providerCode: provider.code, label: label.trim() || undefined, config },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast({ title: `${provider.name} added`, description: "The check passed: it is ready to book shipments.", variant: "success" });
            onDone();
          } else {
            setError(`${provider.name} was added but its check failed. ${failedChecks(result)} Fix the settings and verify it again from the list.`);
          }
        },
        onError: (e2) => setError(isApiError(e2) && e2.status === 409 ? `${provider.name} is already added.` : errorMessage(e2)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label={`Add ${provider.name}`}>
      <p className="text-xs text-muted-foreground">{provider.description}</p>
      {provider.configFields.map((f) => (
        <label key={f.key} className="block space-y-1 text-xs font-medium text-foreground">
          <span>
            {f.key}
            {f.required ? " *" : ""}
          </span>
          <Input
            aria-label={f.key}
            value={values[f.key] ?? ""}
            required={f.required}
            className="text-xs"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
          <span className="block text-[11px] font-normal text-muted-foreground">{f.description}</span>
        </label>
      ))}
      <label className="block space-y-1 text-xs font-medium text-foreground">
        <span>Display name (optional)</span>
        <Input aria-label="Display name" value={label} maxLength={80} className="text-xs" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" className="text-xs" onClick={onBack} disabled={add.isPending}>
          Back
        </Button>
        <Button type="submit" size="sm" className="text-xs" disabled={add.isPending || missing.length > 0}>
          {add.isPending ? "Adding..." : `Add ${provider.name}`}
        </Button>
      </div>
    </form>
  );
}

function CarrierRow({ carrier, canConfigure, verifying, onVerify }: { carrier: CarrierMethod; canConfigure: boolean; verifying: boolean; onVerify: () => void }) {
  const status = STATUS_TEXT[carrier.status];
  return (
    <li className="flex items-start gap-3 px-3 py-3 text-xs">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
          {carrier.name}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
          {carrier.isDefault && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">Default</span>}
        </p>
        <p className="text-muted-foreground">
          {formatNumber(carrier.shipmentsLast30d)} shipments in 30 days · {formatNumber(carrier.inTransit)} in transit · last shipment {dateOrDash(carrier.lastShipmentAt)}
        </p>
        <p className="text-muted-foreground">{carrier.verification.state === "verified" ? `Verified ${dateOrDash(carrier.verification.verifiedAt)}` : "Not verified yet"}</p>
      </div>
      {carrier.status !== "disabled" && carrier.verification.state !== "verified" && (
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!canConfigure || verifying} title={canConfigure ? undefined : NO_CONFIGURE_REASON} onClick={onVerify}>
          {verifying ? "Checking..." : "Verify"}
        </Button>
      )}
    </li>
  );
}

interface CarriersDialogProps {
  open: boolean;
  canConfigure: boolean;
  onClose: () => void;
}

/** the configured carriers with their 30-day usage, and the providers that can still be added */
export function CarriersDialog({ open, canConfigure, onClose }: CarriersDialogProps) {
  const carriers = useCarriers(open);
  const catalog = useProviderCatalog(open && canConfigure);
  const verify = useVerifyCarrier();
  const [adding, setAdding] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const provider = catalog.data?.find((p) => p.code === adding);

  const onVerify = (id: string) => {
    setVerifyingId(id);
    verify.mutate(id, {
      onSuccess: (r) =>
        r.ok ? toast({ title: "Carrier verified", variant: "success" }) : toast({ title: "The check failed", description: failedChecks(r), variant: "destructive" }),
      onError: (e) => toast({ title: "Carrier could not be verified", description: errorMessage(e), variant: "destructive" }),
      onSettled: () => setVerifyingId(null),
    });
  };

  const close = () => {
    setAdding(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Carriers</DialogTitle>
          <DialogDescription>Couriers you ship with, how much they carried in the last 30 days, and the ones you can still add.</DialogDescription>
        </DialogHeader>

        {provider ? (
          <AddCarrierForm provider={provider} onBack={() => setAdding(null)} onDone={() => setAdding(null)} />
        ) : carriers.isLoading ? (
          <div role="status" aria-label="Loading carriers" className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : carriers.isError ? (
          <div role="alert" className="space-y-2 text-xs">
            <p className="text-muted-foreground">Carriers could not be loaded. {errorMessage(carriers.error)}</p>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => void carriers.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {(carriers.data?.items ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No carrier is configured yet. Add one below to start booking shipments.</p>
            ) : (
              <ul className="max-h-[300px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {(carriers.data?.items ?? []).map((c) => (
                  <CarrierRow key={c.id} carrier={c} canConfigure={canConfigure} verifying={verifyingId === c.id} onVerify={() => onVerify(c.id)} />
                ))}
              </ul>
            )}

            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Add a carrier</h4>
              {(carriers.data?.availableProviders ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Every available carrier is already added.</p>
              ) : (
                <ul className="space-y-2">
                  {(carriers.data?.availableProviders ?? []).map((p) => (
                    <li key={p.code} className="flex items-start gap-3 rounded-lg border border-border p-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">{p.name}</p>
                        <p className="text-muted-foreground">{p.description}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        aria-label={`Add ${p.name}`}
                        disabled={!canConfigure || catalog.isLoading || !catalog.data?.some((c) => c.code === p.code)}
                        title={canConfigure ? undefined : NO_CONFIGURE_REASON}
                        onClick={() => setAdding(p.code)}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {catalog.isError && <p className="text-xs text-rose-700">The setup fields could not be loaded. {errorMessage(catalog.error)}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
