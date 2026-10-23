import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/utils/cn";

export interface SetupStepperProps {
  currentStep: number; // 0 = Review, 1 = Authorize, 2 = Verify, 3 = Sync, 4 = Ready
  hasError?: boolean;
  onStepClick?: (step: number) => void;
}

const STEPS = [
  { id: 0, label: "Review", num: "01" },
  { id: 1, label: "Authorize", num: "02" },
  { id: 2, label: "Verify", num: "03" },
  { id: 3, label: "Sync", num: "04" },
  { id: 4, label: "Ready", num: "05" },
];

export function SetupStepper({ currentStep, hasError = false, onStepClick }: SetupStepperProps) {
  return (
    <nav aria-label="Setup progress" className="w-full">
      <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
        {STEPS.map((step, idx) => {
          const isDone = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isFailed = isCurrent && hasError;
          const isUpcoming = currentStep < step.id;
          const isClickable = Boolean(onStepClick && isDone);

          return (
            <li key={step.id} className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(step.id)}
                className={cn(
                  "flex items-center gap-2 text-xs transition-colors text-left",
                  isClickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
                )}
              >
                {/* Badge */}
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-all",
                    isDone && "bg-black text-white",
                    isCurrent && !isFailed && "border border-black bg-transparent text-black font-bold",
                    isFailed && "border border-destructive bg-destructive/10 text-destructive font-bold",
                    isUpcoming && "border border-neutral-300 bg-transparent text-neutral-400"
                  )}
                >
                  {isDone ? (
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  ) : isFailed ? (
                    <AlertCircle className="h-3 w-3 stroke-[2.5]" />
                  ) : (
                    <span>{step.num}</span>
                  )}
                </span>

                {/* Label */}
                <span
                  className={cn(
                    "font-medium",
                    isCurrent ? "font-bold text-foreground" : isDone ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* Connecting line between steps */}
              {idx < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "h-[1px] w-5 sm:w-8 transition-colors",
                    idx < currentStep ? "bg-neutral-800" : "bg-neutral-200"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
