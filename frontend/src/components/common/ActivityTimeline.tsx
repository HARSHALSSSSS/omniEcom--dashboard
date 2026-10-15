import React from "react";
import { cn } from "@/utils/cn";

export interface ActivityEvent {
  id: string;
  timestamp: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
}

interface ActivityTimelineProps {
  events: ActivityEvent[];
  className?: string;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  events,
  className,
}) => {
  return (
    <div
      className={cn(
        "relative space-y-4 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-border",
        className,
      )}
    >
      {events.map((event) => (
        <div
          key={event.id}
          className="relative flex items-start justify-between gap-4"
        >
          {/* Timeline node */}
          <div className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border">
            {event.icon ?? (
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </div>

          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground">
              {event.title}
            </p>
            {event.description && (
              <p className="text-xs text-muted-foreground">
                {event.description}
              </p>
            )}
            {event.meta && <div className="mt-1 text-xs">{event.meta}</div>}
          </div>

          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {event.timestamp}
          </span>
        </div>
      ))}
    </div>
  );
};
