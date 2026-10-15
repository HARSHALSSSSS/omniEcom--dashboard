import React from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";

interface InsightCardProps {
  badgeText?: string;
  title: string;
  description: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: "sparkles" | "trend";
  className?: string;
}

export const InsightCard: React.FC<InsightCardProps> = ({
  badgeText = "RECOMMENDED ACTION",
  title,
  description,
  primaryActionLabel = "Review recommendation",
  onPrimaryAction,
  secondaryActionLabel = "Dismiss",
  onSecondaryAction,
  icon = "trend",
  className,
}) => {
  return (
    <div
      className={cn(
        "rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-white p-5 shadow-xs transition-all space-y-4",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-indigo-100/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800">
            {badgeText}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Advisory
          </span>
        </div>
        {icon === "trend" ? (
          <TrendingUp className="h-4 w-4 text-indigo-600" />
        ) : (
          <Sparkles className="h-4 w-4 text-indigo-600" />
        )}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-foreground leading-snug">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>

      <div className="space-y-2 pt-1">
        {primaryActionLabel && onPrimaryAction && (
          <Button
            size="sm"
            onClick={onPrimaryAction}
            className="w-full bg-primary text-primary-foreground hover:bg-neutral-800 font-medium text-xs"
          >
            {primaryActionLabel}
          </Button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSecondaryAction}
            className="w-full text-xs text-muted-foreground hover:text-foreground border-border/80 bg-white"
          >
            {secondaryActionLabel}
          </Button>
        )}
      </div>
    </div>
  );
};
