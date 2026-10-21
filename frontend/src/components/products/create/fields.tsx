import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { boxClass, describedBy, errorClass, hintClass, labelClass } from "./fieldStyles";

interface ShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
  /** extra content right of the label (a status tag) */
  aside?: ReactNode;
}

/** label + control + hint + error with the aria wiring (the control uses `describedBy(id, ...)`) */
export function FieldShell({ id, label, hint, error, className = "", children, aside }: ShellProps) {
  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" className={errorClass}>
          {error}
        </span>
      ) : null}
      {hint ? (
        <span id={`${id}-hint`} className={hintClass}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  mono?: boolean;
  aside?: ReactNode;
  className?: string;
  /** shown after the input inside the box (a unit) */
  suffix?: ReactNode;
  boxClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id, label, hint, error, mono, aside, className, suffix, boxClassName = "", ...input },
  ref,
) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} aside={aside} className={className}>
      <div className={boxClass(error, boxClassName)}>
        <input
          ref={ref}
          id={id}
          type="text"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, !!hint, error)}
          {...input}
          className={`w-full text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent disabled:cursor-not-allowed ${mono ? "font-mono" : ""}`}
        />
        {suffix}
      </div>
    </FieldShell>
  );
});

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  aside?: ReactNode;
  /** the value counts as "not chosen" (placeholder colour) */
  empty?: boolean;
  children: ReactNode;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { id, label, hint, error, className, aside, empty, children, ...select },
  ref,
) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} aside={aside} className={className}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, !!hint, error)}
          {...select}
          className={`w-full h-[45px] px-3 pr-8 bg-white border rounded-[8px] text-[13px] leading-[145%] outline-none appearance-none cursor-pointer focus:border-[#000000] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            error ? "border-[#B42318]" : "border-[#BDBDBD]"
          } ${empty ? "text-[#666666]" : "text-[#000000]"}`}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666] pointer-events-none" aria-hidden />
      </div>
    </FieldShell>
  );
});
