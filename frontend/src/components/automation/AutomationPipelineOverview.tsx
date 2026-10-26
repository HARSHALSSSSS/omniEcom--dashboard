import {
  ArrowRight,
  CheckCircle2,
  Eye,
  Lightbulb,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface PipelineCounts {
  observedSignals: number;
  recommendedActions: number;
  awaitingApproval: number;
  completedRuns: number;
}

export interface PendingApprovalItem {
  id: string;
  title: string;
  subtext: string;
  riskBadge: string;
  riskTone: "amber" | "green" | "red";
  timeText: string;
  categoryTag: string;
}

export interface ActivityRunItem {
  id: string;
  category: string;
  title: string;
  subtext: string;
  statusText: string;
  statusTone: "green" | "amber" | "red";
  timeText: string;
}

const DEFAULT_PIPELINE: PipelineCounts = {
  observedSignals: 24,
  recommendedActions: 8,
  awaitingApproval: 3,
  completedRuns: 42,
};

const DEFAULT_APPROVALS: PendingApprovalItem[] = [
  {
    id: "appr-1",
    title: "Update prices for 12 products",
    subtext: "12 products · Amazon · Configured margin threshold triggered",
    riskBadge: "Medium · Commercial risk",
    riskTone: "amber",
    timeText: "Created 09:42 · Demo",
    categoryTag: "Price Recommendation",
  },
  {
    id: "appr-2",
    title: "Listing content review",
    subtext: "6 listings · Amazon · Required product information incomplete",
    riskBadge: "Low · Content risk",
    riskTone: "green",
    timeText: "Created 09:35 · Demo",
    categoryTag: "Listing Content Suggestion",
  },
  {
    id: "appr-3",
    title: "Fulfillment workflow review",
    subtext: "4 orders · Shopify · Order stage requires merchant confirmation",
    riskBadge: "Medium · Operational risk",
    riskTone: "amber",
    timeText: "Created 09:28 · Demo",
    categoryTag: "Fulfillment Review Task",
  },
];

const DEFAULT_ACTIVITY: ActivityRunItem[] = [
  {
    id: "act-1",
    category: "Inventory",
    title: "Stock synchronization completed",
    subtext: "Inventory Sync · 18 product records",
    statusText: "Completed",
    statusTone: "green",
    timeText: "09 Oct · 09:48 · Demo",
  },
  {
    id: "act-2",
    category: "Listings",
    title: "Product content prepared for review",
    subtext: "Listing Content Suggestion · 6 listings",
    statusText: "Awaiting approval",
    statusTone: "amber",
    timeText: "09 Oct · 09:35 · Demo",
  },
  {
    id: "act-3",
    category: "Orders",
    title: "Fulfillment workflow prepared",
    subtext: "Fulfillment Review Task · 4 orders",
    statusText: "Awaiting approval",
    statusTone: "amber",
    timeText: "09 Oct · 09:28 · Demo",
  },
  {
    id: "act-4",
    category: "Connections",
    title: "Marketplace sync issue detected",
    subtext: "Connection Failure Alert · 1 connection",
    statusText: "Failed",
    statusTone: "red",
    timeText: "09 Oct · 09:18 · Demo",
  },
];

interface AutomationPipelineOverviewProps {
  pipeline?: PipelineCounts;
  pendingApprovals?: PendingApprovalItem[];
  recentActivity?: ActivityRunItem[];
  onReviewApproval?: (item: PendingApprovalItem) => void;
  onDismissApproval?: (id: string) => void;
  onViewAllApprovals?: () => void;
  onViewAllRuns?: () => void;
}

export function AutomationPipelineOverview({
  pipeline = DEFAULT_PIPELINE,
  pendingApprovals = DEFAULT_APPROVALS,
  recentActivity = DEFAULT_ACTIVITY,
  onReviewApproval,
  onDismissApproval,
  onViewAllApprovals,
  onViewAllRuns,
}: AutomationPipelineOverviewProps) {
  return (
    <div className="space-y-6">
      {/* 1. 4-Step Pipeline Flow Banner */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between border-b border-border pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            FROM SIGNAL TO CONTROLLED ACTION
          </span>
          <span className="text-xs text-muted-foreground">Demo overview reporting · 09 Oct 2026</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4 items-center">
          {/* Step 1: Observe */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Observe</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-foreground">{pipeline.observedSignals}</span>
                <span className="text-xs text-muted-foreground">signals</span>
              </div>
            </div>
            <ArrowRight className="hidden md:block ml-auto h-4 w-4 text-muted-foreground opacity-40" />
          </div>

          {/* Step 2: Recommend */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Recommend</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-foreground">{pipeline.recommendedActions}</span>
                <span className="text-xs text-muted-foreground">actions</span>
              </div>
            </div>
            <ArrowRight className="hidden md:block ml-auto h-4 w-4 text-muted-foreground opacity-40" />
          </div>

          {/* Step 3: Approve */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Approve</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-amber-600">{pipeline.awaitingApproval}</span>
                <span className="text-xs text-muted-foreground">awaiting approval</span>
              </div>
            </div>
            <ArrowRight className="hidden md:block ml-auto h-4 w-4 text-muted-foreground opacity-40" />
          </div>

          {/* Step 4: Execute */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Execute</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-emerald-600">{pipeline.completedRuns}</span>
                <span className="text-xs text-muted-foreground">completed runs</span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Overview totals are illustrative aggregates. Records affected in each run are counted separately; 42 completed runs does not mean 42 records.
        </p>
      </div>

      {/* 2. Main Two Column Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left Column: Waiting for Your Approval + Recent Activity */}
        <div className="space-y-6">
          {/* Waiting for Your Approval */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Waiting for Your Approval</h3>
                <span className="text-xs text-muted-foreground">{pendingApprovals.length} pending</span>
              </div>
              <button
                type="button"
                onClick={onViewAllApprovals}
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
              >
                View queue <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Review the exact proposal before any sensitive commercial action is executed.
            </p>

            <div className="mt-4 divide-y divide-border">
              {pendingApprovals.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div className="space-y-1 min-w-[280px]">
                    <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.subtext}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.2 font-semibold",
                          item.riskTone === "amber"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        )}
                      >
                        {item.riskBadge}
                      </span>
                      <span className="text-muted-foreground">{item.timeText}</span>
                      <span className="text-muted-foreground">· {item.categoryTag}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => onReviewApproval?.(item)}
                    >
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onDismissApproval?.(item.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">Recent activity</h3>
              <button
                type="button"
                onClick={onViewAllRuns}
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
              >
                All runs <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 divide-y divide-border">
              {recentActivity.map((run) => (
                <div key={run.id} className="flex items-center justify-between py-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                      <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="font-semibold text-foreground">{run.title}</span>
                      <p className="text-muted-foreground">{run.subtext}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span
                        className={cn(
                          "font-semibold",
                          run.statusTone === "green"
                            ? "text-emerald-700"
                            : run.statusTone === "amber"
                              ? "text-amber-700"
                              : "text-red-700"
                        )}
                      >
                        ● {run.statusText}
                      </span>
                      <p className="text-[11px] text-muted-foreground">{run.timeText}</p>
                    </div>
                    <span className="text-muted-foreground">Details ↗</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Automation Health & Unresolved Exceptions */}
        <div className="space-y-6">
          {/* Automation Health */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-foreground">Automation health</h3>
            <div className="divide-y divide-border text-xs">
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Active rules</span>
                <span className="font-mono font-bold text-foreground">8</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Successful runs</span>
                <span className="font-mono font-bold text-emerald-700">42</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Rules needing attention</span>
                <span className="font-mono font-bold text-amber-700">2</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Recent failures</span>
                <span className="font-mono font-bold text-red-700">2</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Demo totals · 2 attention flags are on active rules.
            </p>
          </div>

          {/* Unresolved Exceptions */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Unresolved exceptions</h3>
              <span className="font-mono text-xs font-bold text-red-700">2</span>
            </div>

            <div className="space-y-3 pt-1 text-xs">
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-1.5">
                <span className="font-semibold text-red-800">● Needs attention</span>
                <h4 className="font-bold text-foreground">Inventory sync failed</h4>
                <p className="text-muted-foreground">3 product records · Amazon</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">09 Oct · 09:22 · Demo</span>
                  <button type="button" className="font-semibold text-foreground hover:underline">
                    Review records →
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-1.5">
                <span className="font-semibold text-red-800">● Needs attention</span>
                <h4 className="font-bold text-foreground">Connector authorization expired</h4>
                <p className="text-muted-foreground">1 connection · Amazon</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">09 Oct · 09:18 · Demo</span>
                  <button type="button" className="font-semibold text-foreground hover:underline">
                    Reconnect →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* The decision stays yours */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <Shield className="h-4 w-4" />
              The decision stays yours.
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Observe → Recommend → Approve → Automate. Sensitive actions remain merchant-controlled.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Disclaimer matching Screen 1 */}
      <div className="flex flex-wrap items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
        <span>Illustrative demo data — not actual configured capabilities or business activity. No live changes applied.</span>
        <span>09 Oct 2026 - Demo</span>
      </div>
    </div>
  );
}
