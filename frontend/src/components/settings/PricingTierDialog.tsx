import { useState } from "react";
import { X, ShieldAlert, Calculator, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { PricingTierConfig } from "@/types/settings";

interface PricingTierDialogProps {
  tier: PricingTierConfig | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: PricingTierConfig) => void;
}

export function PricingTierDialog({ tier, open, onClose, onSave }: PricingTierDialogProps) {
  if (!open || !tier) return null;

  const [form, setForm] = useState<PricingTierConfig>({ ...tier });

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-tier-title"
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-50 zoom-in-95 space-y-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="pricing-tier-title" className="text-base font-bold text-foreground">
                Configure Pricing Tier: {tier.channelName}
              </h2>
              <Badge variant="outline" className="text-xs uppercase font-mono">
                {tier.channelCode}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Define the algorithmic pricing formula, dynamic Buy Box parameters, margin circuit breakers, and promo deal floors.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Part A: Formula Architecture */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Part A: Formula Architecture
            </h3>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Selling Price = (Base Catalog Price × (1 + Markup %)) + Fixed Marketplace Buffer
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Channel Markup (%)</label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  value={form.baseMarkupPercent}
                  onChange={(e) => setForm({ ...form, baseMarkupPercent: Number(e.target.value) })}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">%</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Fixed Marketplace Fee Buffer</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">₹</span>
                <Input
                  type="number"
                  value={form.fixedFeeBufferInr}
                  onChange={(e) => setForm({ ...form, fixedFeeBufferInr: Number(e.target.value) })}
                  className="pl-7"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Part B: Buy Box & Repricing Guardrails */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Part B: Dynamic Buy Box & Repricing Guardrails
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Hard Undercut Floor</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">₹</span>
                <Input
                  type="number"
                  value={form.hardUndercutFloorInr}
                  onChange={(e) => setForm({ ...form, hardUndercutFloorInr: Number(e.target.value) })}
                  className="pl-7 font-mono text-xs"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Absolute minimum selling price</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Max Discount Depth</label>
              <div className="relative">
                <Input
                  type="number"
                  value={form.maxDiscountDepthPercent}
                  onChange={(e) => setForm({ ...form, maxDiscountDepthPercent: Number(e.target.value) })}
                  className="pr-8 font-mono text-xs"
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Cap relative to registered MRP</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Reprice Evaluation Cycle</label>
              <select
                value={form.repriceIntervalMinutes}
                onChange={(e) => setForm({ ...form, repriceIntervalMinutes: Number(e.target.value) })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm"
              >
                <option value={15}>Every 15 mins (Fastest)</option>
                <option value={30}>Every 30 mins</option>
                <option value={60}>Every 60 mins</option>
              </select>
              <p className="text-[10px] text-muted-foreground">Automated crawler interval</p>
            </div>
          </div>
        </div>

        {/* Part C: Margin Floor & Delisting Circuit Breaker */}
        <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-destructive">
              Part C: Margin Floor & Delisting Circuit Breaker
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            <div>
              <p className="text-xs font-semibold text-foreground">Minimum Net Profit Margin Floor</p>
              <p className="text-[11px] text-muted-foreground">
                If commissions or return logistics erode margin below this threshold, algorithmic pricing triggers an alert.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                value={form.minNetMarginPercent}
                onChange={(e) => setForm({ ...form, minNetMarginPercent: Number(e.target.value) })}
                className="w-24 font-mono text-xs"
              />
              <span className="text-xs font-bold">%</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-destructive/20 pt-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Auto-delist SKU upon Margin Breach</p>
              <p className="text-[11px] text-muted-foreground">
                Sets marketplace available quantity to 0 automatically when price floor is violated.
              </p>
            </div>
            <Switch
              checked={form.autoDelistOnBreach}
              onCheckedChange={(c) => setForm({ ...form, autoDelistOnBreach: c })}
            />
          </div>
        </div>

        {/* Part D: Promotion & Deal Safeguards */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-foreground" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Part D: Promotion & Deal Safeguards
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Flash Sale Deal Floor</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">₹</span>
                <Input
                  type="number"
                  value={form.dealFloorInr}
                  onChange={(e) => setForm({ ...form, dealFloorInr: Number(e.target.value) })}
                  className="pl-7 font-mono text-xs"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Hard promotional pricing floor</p>
            </div>

            <div className="flex flex-col justify-center gap-2 rounded-lg border border-border/70 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Mandate 2FA on &gt;15% Markdown</p>
                  <p className="text-[10px] text-muted-foreground">Requires admin authorization</p>
                </div>
                <Switch
                  checked={form.mandate2faForMarkdown}
                  onCheckedChange={(c) => setForm({ ...form, mandate2faForMarkdown: c })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Pricing Tier
          </Button>
        </div>
      </div>
    </div>
  );
}
