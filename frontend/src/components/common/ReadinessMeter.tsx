import React from "react";
import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";

export interface BlockerItem {
  id: string;
  label: string;
  severity: "blocking" | "review" | "warning";
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ReadinessRequirement {
  id: string;
  label: string;
  completed: boolean;
  actionText?: string;
  onAction?: () => void;
}

interface ReadinessMeterProps {
  percent: number;
  requiredItems?: ReadinessRequirement[];
  recommendedItems?: ReadinessRequirement[];
  blockers?: BlockerItem[];
  className?: string;
}

export const ReadinessMeter: React.FC<ReadinessMeterProps> = ({
  percent,
  requiredItems = [],
  recommendedItems = [],
  blockers = [],
  className,
}) => {
  return (
    <div
      className={cn(
        "space-y-6 rounded-lg border border-border bg-card p-5",
        className,
      )}
    >
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Product Readiness
        </span>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {percent}% complete
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-500 rounded-full",
              percent >= 90
                ? "bg-green-600"
                : percent >= 50
                  ? "bg-blue-600"
                  : "bg-amber-500",
            )}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </div>

      {/* Required section */}
      {requiredItems.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Required
          </h4>
          <ul className="space-y-2 text-xs">
            {requiredItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-foreground">
                  {item.completed ? (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <span className="h-3 w-3 rounded-full border border-muted-foreground/60 shrink-0" />
                  )}
                  {item.label}
                </span>
                {item.actionText && !item.completed && (
                  <button
                    type="button"
                    onClick={item.onAction}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {item.actionText}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended section */}
      {recommendedItems.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recommended
          </h4>
          <ul className="space-y-2 text-xs">
            {recommendedItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  {item.completed ? (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <span className="h-3 w-3 rounded-full border border-muted-foreground/60 shrink-0" />
                  )}
                  {item.label}
                </span>
                {item.actionText && !item.completed && (
                  <button
                    type="button"
                    onClick={item.onAction}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {item.actionText}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Blockers alert panel */}
      {blockers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3.5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-900">
                {blockers.length} {blockers.length === 1 ? "issue" : "issues"}{" "}
                blocking publication
              </p>
              {blockers[0].description && (
                <p className="text-xs text-red-700">
                  {blockers[0].description}
                </p>
              )}
            </div>
          </div>
          {blockers[0].onAction && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={blockers[0].onAction}
              className="w-full bg-white text-xs text-red-900 border-red-200 hover:bg-red-50"
            >
              {blockers[0].actionLabel ?? "Fix issue"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
