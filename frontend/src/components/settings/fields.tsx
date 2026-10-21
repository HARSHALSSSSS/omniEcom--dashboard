import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { fieldId, type FormKey } from "./form";

export const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

/** a titled card with a description, the building block of every tab */
export function SectionCard({ title, description, children, aside }: { title: string; description?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** label, control, hint and error message of one field */
export function Field({ id, label, hint, error, children, className }: { id: string; label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps {
  name: FormKey;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  readOnly?: boolean;
  type?: "text" | "email" | "tel" | "number";
  mono?: boolean;
  maxLength?: number;
  inputMode?: "numeric" | "text" | "tel" | "email";
  className?: string;
  upper?: boolean;
  min?: number;
  max?: number;
}

export function TextField({ name, label, value, onChange, error, hint, readOnly, type = "text", mono, maxLength, inputMode, className, upper, min, max }: TextFieldProps) {
  const id = fieldId(name);
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <Input
        id={id}
        type={type}
        value={value}
        readOnly={readOnly}
        maxLength={maxLength}
        inputMode={inputMode}
        min={min}
        max={max}
        error={!!error}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(mono && "font-mono", upper && "uppercase", readOnly && "bg-muted/40")}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** a labelled on/off switch with a description; `reason` explains why it cannot be changed */
export function ToggleRow({
  name,
  label,
  description,
  checked,
  onChange,
  disabled,
  reason,
  children,
}: {
  name: FormKey;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  reason?: string | null;
  children?: ReactNode;
}) {
  const id = fieldId(name);
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-foreground">
            {label}
          </label>
          {description && (
            <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
          {reason && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" /> {reason}
            </p>
          )}
        </div>
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-black disabled:cursor-not-allowed"
        />
      </div>
      {children}
    </div>
  );
}

/** the "you can look but not change" notice */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
      {children}
    </p>
  );
}
