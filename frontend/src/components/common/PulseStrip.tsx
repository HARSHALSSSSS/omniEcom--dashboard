import React from "react";
import { cn } from "@/utils/cn";
import { deltaClass, formatDelta } from "@/utils/format";

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaText?: string;
  subtext?: string;
  status?: "healthy" | "warning" | "critical" | "info" | "neutral";
  className?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  delta,
  deltaText,
  subtext,
  status,
  className,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-all",
        onClick && "cursor-pointer hover:border-neutral-400 hover:shadow-xs",
        className,
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="my-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        {delta !== undefined && (
          <span className={cn("font-medium tabular-nums", deltaClass(delta))}>
            {formatDelta(delta)}
          </span>
        )}
        {deltaText && (
          <span className="text-muted-foreground">{deltaText}</span>
        )}
        {subtext && !deltaText && (
          <span
            className={cn(
              "font-medium",
              status === "warning" && "text-amber-600",
              status === "critical" && "text-red-600",
              status === "healthy" && "text-green-600",
              (!status || status === "neutral") && "text-muted-foreground",
            )}
          >
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
};

interface PulseStripProps {
  title?: string;
  subtitle?: string;
  cards: KpiCardProps[];
  className?: string;
}

export const PulseStrip: React.FC<PulseStripProps> = ({
  title,
  subtitle,
  cards,
  className,
}) => {
  return (
    <div className={cn("space-y-2", className)}>
      {(title || subtitle) && (
        <div className="flex items-center justify-between">
          {title && (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          )}
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {cards.map((card, idx) => (
          <KpiCard key={idx} {...card} />
        ))}
      </div>
    </div>
  );
};
