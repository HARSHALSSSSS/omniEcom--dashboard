import { Check, Clock, Lock, Shield, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DirectoryItem } from "@/types/directory";

interface SetupVerifyStepProps {
  item: DirectoryItem;
  businessName: string;
  onStartSync: () => void;
  onReviewSettings: () => void;
}

export function SetupVerifyStep({
  item,
  businessName,
  onStartSync,
  onReviewSettings,
}: SetupVerifyStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
        {/* Top Header Row */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{item.name}</span>
            <span className="text-muted-foreground capitalize">
              {item.category === "storefront"
                ? "Storefront"
                : item.category === "shipping"
                  ? "Shipping carrier"
                  : "Marketplace"}
            </span>
          </div>
          <span className="font-medium text-foreground">{businessName}</span>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Account authorized
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ready to start initial sync.
          </p>
        </div>

        {/* Verification Summary Table */}
        <div className="divide-y divide-neutral-100 text-xs">
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium text-foreground">{businessName}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Access</span>
            <span className="font-semibold text-foreground">Approved</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Verification</span>
            <span className="font-semibold text-foreground">Complete</span>
          </div>
        </div>

        {/* Access Confirmed Card */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-5 space-y-4">
          <h3 className="text-sm font-bold text-foreground">Access confirmed</h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="font-semibold text-foreground">Catalog</p>
              <p className="text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                <Check className="h-3.5 w-3.5" /> Approved
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Inventory</p>
              <p className="text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                <Check className="h-3.5 w-3.5" /> Approved
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Orders</p>
              <p className="text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                <Check className="h-3.5 w-3.5" /> Approved
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Listings</p>
              <p className="text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                <Check className="h-3.5 w-3.5" /> Approved
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-1 border-t border-neutral-200">
            The account has been verified. Initial synchronization has not started; review the scope before continuing.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={onStartSync}
            className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
          >
            Start sync
          </Button>
          <Button
            variant="outline"
            onClick={onReviewSettings}
            className="text-xs h-9 px-4"
          >
            Review settings
          </Button>
        </div>

        {/* Pricing notice */}
        <div className="border-t border-neutral-100 pt-4 text-xs text-muted-foreground space-y-1">
          <p className="text-[11px]">
            Connecting does not publish products automatically. You will review catalog mapping and marketplace workflows before activating them.
          </p>
          <div className="text-[11px] text-neutral-500 pt-1">
            <span className="font-medium text-foreground">Connector add-on · ₹499 / month · ₹4,999 / year</span>
            <span className="block mt-0.5">Monthly billing · Demo pricing only · Separate from workspace plan</span>
          </div>
        </div>
      </div>

      {/* Trust strip */}
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
