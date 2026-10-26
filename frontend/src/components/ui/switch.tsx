import * as React from "react";
import { cn } from "@/utils/cn";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, defaultChecked, onCheckedChange, disabled, ...props }, ref) => {
    const isControlled = checked !== undefined;
    const [internalChecked, setInternalChecked] = React.useState(Boolean(defaultChecked));
    const isChecked = isControlled ? checked : internalChecked;

    return (
      <label
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
          isChecked ? "bg-primary" : "bg-input",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <input
          type="checkbox"
          role="switch"
          ref={ref}
          checked={isChecked}
          disabled={disabled}
          onChange={(e) => {
            if (!isControlled) {
              setInternalChecked(e.target.checked);
            }
            onCheckedChange?.(e.target.checked);
          }}
          className="sr-only"
          {...props}
        />
        <span
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
            isChecked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </label>
    );
  },
);

Switch.displayName = "Switch";
