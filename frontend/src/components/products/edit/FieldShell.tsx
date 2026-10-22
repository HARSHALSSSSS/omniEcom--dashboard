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
    <div className={cn("flex flex-col gap-1.5 w-full", className)} data-field={id}>
      <div className="flex flex-row items-center justify-between w-full text-[12px] leading-[145%]">
        <label htmlFor={id} className="font-normal text-[#000000]">
          {label}
        </label>
        {modified && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#666666]">Modified</span>
            {onRevert && !disabled && (
              <button type="button" onClick={onRevert} aria-label={`Revert ${label}`} className="font-semibold text-[#000000] hover:underline cursor-pointer">
                Revert
              </button>
            )}
          </div>
        )}
      </div>
      {children}
      {modified && previous !== undefined && <span className="text-[11px] font-normal text-[#666666] leading-[145%]">Previously: {previous}</span>}
      {hint && !error && <span className="text-[11px] font-normal text-[#666666] leading-[145%]">{hint}</span>}
      {error && (
        <span id={`${id}-error`} role="alert" className="text-[11px] font-medium text-[#B42318] leading-[145%]">
          {error}
        </span>
      )}
    </div>
  );
}
