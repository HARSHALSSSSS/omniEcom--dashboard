import { Check, Clock, Lock, Shield, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConnectResult, DirectoryItem } from "@/types/directory";
import { SetupFooterNote } from "./SetupNotices";
import { StepResults } from "./StepResults";
import { capabilityLabels } from "./setupUtils";

interface SetupVerifyStepProps {
  item: DirectoryItem;
  businessName: string;
  /** what POST /marketplace-hub/connect reported: the steps it ran, the account, the jobs it queued */
  result: ConnectResult;
  onStartSync: () => void;
  onReviewSettings: () => void;
  onGoToHub: () => void;
}

export function SetupVerifyStep({ item, businessName, result, onStartSync, onReviewSettings, onGoToHub }: SetupVerifyStepProps) {
  const account = result.account;
  const test = result.steps.find((s) => s.name === "test");
  const verified = Boolean(test?.ok && !test.skipped);
  const labels = capabilityLabels(item);
  const queued = [...new Set(result.jobs.map((j) => j.type))];
  const firstSync = result.steps.find((s) => s.name === "first_sync");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{item.name}</span>
            <span className="text-muted-foreground capitalize">
              {item.category === "storefront" ? "Storefront" : item.category === "shipping" ? "Shipping carrier" : "Marketplace"}
            </span>
          </div>
          <span className="font-medium text-foreground">{account?.name ?? businessName}</span>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Account authorized</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {queued.length > 0 ? "The first sync was queued with the connection. Review it on the next step." : "Ready to start the initial sync."}
          </p>
        </div>

        <div className="divide-y divide-neutral-100 text-xs">
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium text-foreground">
              {account?.name ?? businessName}
              {account?.accountIdentifier ? ` · ${account.accountIdentifier}` : ""}
            </span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Environment</span>
            <span className="font-semibold text-foreground">{account?.mode === "sandbox" ? "Sandbox" : "Live"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Access</span>
            <span className="font-semibold text-foreground">{result.steps.find((s) => s.name === "authorize")?.ok ? "Approved" : "Not confirmed"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Verification</span>
            <span className="font-semibold text-foreground">{verified ? "Complete" : test?.skipped ? "Skipped" : "Not confirmed"}</span>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-5 space-y-4">
          <h3 className="text-sm font-bold text-foreground">Access confirmed</h3>

          {labels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              {labels.map((l) => (
                <div key={l}>
                  <p className="font-semibold text-foreground">{l}</p>
                  <p className="text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                    <Check className="h-3.5 w-3.5" /> Enabled
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">This connector has no enabled capabilities yet.</p>
          )}

          <div className="pt-2 border-t border-neutral-200 space-y-2">
            <p className="text-xs font-semibold text-foreground">What the connection test did</p>
            <StepResults steps={result.steps} />
          </div>

          <p className="text-xs text-muted-foreground pt-1 border-t border-neutral-200" data-testid="first-sync-summary">
            {queued.length > 0
              ? `First sync queued for ${queued.join(", ")}.`
              : firstSync?.message
                ? `No first sync was queued: ${firstSync.message}.`
                : "No first sync was requested. You can start it on the next step or from the Marketplace Hub."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button onClick={onStartSync} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold">
            {queued.length > 0 ? "Review the sync" : "Start sync"}
          </Button>
          <Button variant="outline" onClick={onReviewSettings} className="text-xs h-9 px-4">
            Review settings
          </Button>
          <Button variant="outline" onClick={onGoToHub} className="text-xs h-9 px-4">
            Go to Marketplace Hub
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">This account is already connected. If you leave now it stays in your Marketplace Hub, and you can sync from there at any time.</p>

        <SetupFooterNote connectorName={item.name} />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Shield className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Secure authorization</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Lock className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Encrypted credentials</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Sliders className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Controlled access</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Clock className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Audit trail</span>
          </div>
        </div>
      </div>
    </div>
  );
}
