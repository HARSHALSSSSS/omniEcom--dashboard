import { useState } from "react";
import {
  Check,
  Edit,
  Pause,
  Shield,
  TestTube,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface InspectorRuleData {
  id: string;
  code: string;
  title: string;
  description: string;
  triggerName: string;
  triggerEvent: string;
  conditionText: string;
  actionText: string;
  safeguardWarning?: string;
  pendingItem?: {
    asin: string;
    productTitle: string;
    dropLabel: string;
    competitorPrice: string;
    originalPrice: string;
    predictedMargin: string;
  };
  auditLogs?: Array<{
    event: string;
    timeText: string;
    detail: string;
  }>;
}

const DEFAULT_INSPECTOR_RULE: InspectorRuleData = {
  id: "rule-price-guard",
  code: "RUL-8829-AZFK",
  title: "Automated Price War Margin Guard",
  description:
    "Monitors competitor repricing bots across Flipkart and Amazon. Freezes algorithmic price slashing when projected margins cross unsafe boundaries.",
  triggerName: "Price Event Ingestion",
  triggerEvent: "Amazon SP-API AnyOfferChangedNotification / Flipkart Price Stream",
  conditionText: "Realized Margin < 18.0% OR Runway < 10 Days",
  actionText: "Stage Price Floor Recommendation (Do not push live)",
  safeguardWarning:
    "Price modifications carry material GMV risks. Per enterprise governance rules, full automated repricing below ₹699 floor is locked behind merchant authorization.",
  pendingItem: {
    asin: "ASIN B08N5WRWNW",
    productTitle: "Classic Oxford Shirt (Navy, L)",
    dropLabel: "₹140 DROP",
    competitorPrice: "₹749",
    originalPrice: "₹889",
    predictedMargin: "14.1% (< 18% floor)",
  },
  auditLogs: [
    {
      event: "Flipkart Price Ingestion Event",
      timeText: "14:20 UTC",
      detail: "Staged review assigned to Abhishek D.",
    },
    {
      event: "Manual Override Confirmed",
      timeText: "Yesterday",
      detail: "Margin preserved at 19.2% on Amazon",
    },
    {
      event: "Rule Dry-Run Test Payload",
      timeText: "May 12",
      detail: "100 simulated SKUs evaluated",
    },
  ],
};

interface RuleInspectorDrawerProps {
  rule?: InspectorRuleData | null;
  open: boolean;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onTestPayload?: () => void;
  onEditLogic?: () => void;
  onPauseExecution?: () => void;
}

export function RuleInspectorDrawer({
  rule = DEFAULT_INSPECTOR_RULE,
  open,
  onClose,
  onApprove,
  onReject,
  onTestPayload,
  onEditLogic,
  onPauseExecution,
}: RuleInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<"inspector" | "builder">("inspector");

  if (!open || !rule) return null;

  return (
    <div
      role="dialog"
      aria-label="Rule Inspector & Audit"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl transition-transform"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("inspector")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
              activeTab === "inspector" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Rule Inspector &amp; Audit
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("builder")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
              activeTab === "builder" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            + Rule Builder Preview
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onClose}
          aria-label="Close drawer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Drawer Body */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
        {/* Title & Metadata */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              APPROVAL REQUIRED
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">ID: {rule.code}</span>
          </div>
          <h2 className="text-base font-bold text-foreground">{rule.title}</h2>
          <p className="text-muted-foreground leading-relaxed">{rule.description}</p>
        </div>

        {/* Execution Pipeline */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <span className="font-bold uppercase tracking-wider text-muted-foreground">
            EXECUTION PIPELINE
          </span>

          <div className="space-y-3 pt-1">
            {/* Step 1: Trigger */}
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                1
              </span>
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground">Trigger: {rule.triggerName}</span>
                <p className="text-muted-foreground leading-relaxed">{rule.triggerEvent}</p>
              </div>
            </div>

            {/* Step 2: Condition Guard */}
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                2
              </span>
              <div className="space-y-1">
                <span className="font-semibold text-foreground">Condition Guard</span>
                <div className="inline-block rounded bg-amber-100/80 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-900">
                  {rule.conditionText}
                </div>
              </div>
            </div>

            {/* Step 3: Target Action */}
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                3
              </span>
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground">Target Action</span>
                <p className="text-muted-foreground leading-relaxed">{rule.actionText}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Commercial Safeguard Active banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-1.5 text-amber-900">
          <div className="flex items-center gap-1.5 font-bold">
            <Shield className="h-4 w-4" />
            Commercial Safeguard Active
          </div>
          <p className="text-[11px] leading-relaxed">
            {rule.safeguardWarning ||
              "Price modifications carry material GMV risks. Per enterprise governance rules, full automated repricing below ₹699 floor is locked behind merchant authorization."}
          </p>
        </div>

        {/* Awaiting Merchant Sign-Off Card */}
        {rule.pendingItem && (
          <div className="rounded-xl border-2 border-amber-300 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">
                AWAITING MERCHANT SIGN-OFF
              </span>
              <span className="font-bold text-amber-700">1 Execution Pending</span>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-foreground">{rule.pendingItem.asin}</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                  {rule.pendingItem.dropLabel}
                </span>
              </div>

              <h4 className="font-semibold text-foreground">{rule.pendingItem.productTitle}</h4>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase">Competitor On FK</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono font-bold text-foreground">{rule.pendingItem.competitorPrice}</span>
                    <span className="text-[10px] text-muted-foreground line-through">
                      {rule.pendingItem.originalPrice}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground uppercase">Predicted Margin</span>
                  <span className="font-mono font-bold text-red-700">
                    {rule.pendingItem.predictedMargin}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-black text-xs text-white hover:bg-neutral-800"
                onClick={onApprove}
              >
                <Check className="h-3.5 w-3.5" />
                Approve Price Match
              </Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={onReject}>
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* Execution Audit Log */}
        {rule.auditLogs && rule.auditLogs.length > 0 && (
          <div className="space-y-3 border-t border-border pt-3">
            <span className="font-bold uppercase tracking-wider text-muted-foreground">
              EXECUTION AUDIT LOG
            </span>

            <div className="space-y-2.5">
              {rule.auditLogs.map((log, idx) => (
                <div key={idx} className="flex justify-between items-start text-[11px]">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">{log.event}</span>
                    <p className="text-muted-foreground">{log.detail}</p>
                  </div>
                  <span className="font-mono text-muted-foreground shrink-0">{log.timeText}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-border p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onTestPayload}>
            <TestTube className="h-3.5 w-3.5" />
            Test with Payload
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onEditLogic}>
            <Edit className="h-3.5 w-3.5" />
            Edit Logic
          </Button>
        </div>

        <button
          type="button"
          onClick={onPauseExecution}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-red-600 hover:underline"
        >
          <Pause className="h-3.5 w-3.5" />
          Pause Rule Execution
        </button>
      </div>
    </div>
  );
}
