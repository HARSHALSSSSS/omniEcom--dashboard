import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface ChannelFieldProps {
  id: string;
  label: string;
  /** the value differs from the master / product value: marker + reset */
  customised?: boolean;
  /** edited but not saved yet */
  modified?: boolean;
  resetLabel?: string;
  onReset?: () => void;
  readOnly?: boolean;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** label row of an input of the studio: "Customised for this channel", "Modified", "Reset to master", and the inline error */
export function ChannelField({ id, label, customised, modified, resetLabel = "Reset to master", onReset, readOnly, error, hint, required, children, className }: ChannelFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)} data-field={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-foreground">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
        <span className="flex items-center gap-2 text-[11px]">
          {customised && <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">Customised for this channel</span>}
          {modified && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">Modified</span>}
          {customised && onReset && !readOnly && (
            <button type="button" onClick={onReset} aria-label={`${resetLabel}: ${label}`} className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {resetLabel}
            </button>
          )}
        </span>
      </div>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
