import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/utils/cn";

interface SecretFieldProps extends Omit<InputProps, "type"> {
  label?: string;
  helpText?: string;
  errorText?: string;
}

export const SecretField = React.forwardRef<HTMLInputElement, SecretFieldProps>(
  ({ label, helpText, errorText, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label className="text-xs font-medium text-foreground block">
            {label}
          </label>
        )}
        <div className="relative">
          <Input
            ref={ref}
            type={showPassword ? "text" : "password"}
            error={!!errorText}
            className={cn("pr-10", className)}
            autoComplete="off"
            spellCheck={false}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label={showPassword ? "Hide value" : "Show value"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errorText && <p className="text-xs text-destructive">{errorText}</p>}
        {helpText && !errorText && (
          <p className="text-xs text-muted-foreground">{helpText}</p>
        )}
      </div>
    );
  },
);
SecretField.displayName = "SecretField";
