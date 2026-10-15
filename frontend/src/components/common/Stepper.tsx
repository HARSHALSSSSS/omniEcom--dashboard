import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/utils/cn";

export interface StepItem {
  id: string;
  label: string;
  description?: string;
  optional?: boolean;
}

interface StepperProps {
  steps: StepItem[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStepIndex,
  onStepClick,
  className,
}) => {
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className="flex items-center justify-between gap-2">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          const isClickable = onStepClick && (isCompleted || isCurrent);

          return (
            <li
              key={step.id}
              onClick={() => isClickable && onStepClick?.(idx)}
              className={cn(
                "flex-1 flex flex-col gap-1.5 transition-colors",
                isClickable && "cursor-pointer",
              )}
            >
              {/* Progress bar line above the step */}
              <div
                className={cn(
                  "h-1 w-full rounded-full transition-colors",
                  isCompleted && "bg-primary",
                  isCurrent && "bg-primary",
                  !isCompleted && !isCurrent && "bg-muted",
                )}
              />

              <div className="flex items-center gap-1.5 pt-0.5">
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    isCurrent && "text-primary font-bold",
                    isCompleted && "text-muted-foreground",
                    !isCompleted && !isCurrent && "text-muted-foreground/60",
                  )}
                >
                  {isCompleted ? (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-primary">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  ) : (
                    String(idx + 1).padStart(2, "0")
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs truncate",
                    isCurrent && "font-bold text-foreground",
                    isCompleted && "font-medium text-foreground/80",
                    !isCompleted && !isCurrent && "text-muted-foreground/70",
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
