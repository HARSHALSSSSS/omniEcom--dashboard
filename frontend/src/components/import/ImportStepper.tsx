import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/utils/cn";

export interface ImportStep {
  number: number;
  label: string;
}

export const IMPORT_STEPS: ImportStep[] = [
  { number: 1, label: "Source" },
  { number: 2, label: "Upload" },
  { number: 3, label: "Mapping" },
  { number: 4, label: "Review" },
  { number: 5, label: "Import" },
];

interface ImportStepperProps {
  currentStep: number; // 1 to 5
  onStepClick?: (step: number) => void;
  className?: string;
}

export function ImportStepper({
  currentStep,
  onStepClick,
  className,
}: ImportStepperProps) {
  return (
    <div className={cn("flex items-center gap-3 w-full py-4", className)}>
      {IMPORT_STEPS.map((step, idx) => {
        const isCompleted = step.number < currentStep;
        const isCurrent = step.number === currentStep;
        const isClickable = onStepClick && isCompleted;

        return (
          <Fragment key={step.number}>
            {/* Step Indicator & Label */}
            <div
              onClick={() => isClickable && onStepClick(step.number)}
              className={cn(
                "flex items-center gap-2.5 select-none",
                isClickable && "cursor-pointer hover:opacity-80 transition-opacity",
              )}
            >
              {isCompleted ? (
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-black text-white dark:bg-white dark:text-black shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
              ) : isCurrent ? (
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-black text-white dark:bg-white dark:text-black text-[11px] font-medium shrink-0">
                  {step.number}
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#F6F6F6] dark:bg-muted text-[#666666] text-[11px] font-medium shrink-0">
                  {step.number}
                </div>
              )}
              <span
                className={cn(
                  "text-[12px] leading-[18px] transition-colors",
                  isCurrent && "text-[#000000] dark:text-white font-semibold",
                  isCompleted && "text-[#666666] dark:text-[#999999] font-normal",
                  !isCompleted && !isCurrent && "text-[#666666] font-normal",
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting Line between steps */}
            {idx < IMPORT_STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-[1px] min-w-[24px] transition-colors",
                  idx + 1 < currentStep ? "bg-black dark:bg-white" : "bg-[#E3E3E3] dark:bg-border",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
