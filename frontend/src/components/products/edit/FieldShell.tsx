import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface FieldShellProps {
  id: string;
  label: string;
  modified?: boolean;
  /** "Previously: ..." text shown while modified */
  previous?: string;
  onRevert?: () => void;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/** label row with the Modified marker, the per-field Revert and the inline error shared by every input of the editor */
export function FieldShell({ id, label, modified, previous, onRevert, error, hint, disabled, children, className }: FieldShellProps) {
  return (
    <div className={cn("space-y-1", className)} data-field={id}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-foreground">
          {label}
        </label>
        {modified && (
          <span className="flex items-center gap-2 text-[11px]">
            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 border border-amber-200">Modified</span>
            {onRevert && !disabled && (
              <button type="button" onClick={onRevert} aria-label={`Revert ${label}`} className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                Revert
              </button>
            )}
          </span>
        )}
      </div>
      {children}
      {modified && previous !== undefined && <p className="text-[11px] text-muted-foreground">Previously: {previous}</p>}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
