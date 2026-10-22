import { Loader2 } from "lucide-react";
import { errorMessage } from "@/api/errors";

export function AuditLoading({ label, tone = "text-neutral-500" }: { label: string; tone?: string }) {
  return (
    <div role="status" className="w-full h-96 flex flex-col items-center justify-center gap-3">
      <Loader2 className={`w-7 h-7 animate-spin ${tone}`} aria-hidden="true" />
      <span className="text-xs text-neutral-500 font-medium">{label}</span>
    </div>
  );
}

export function AuditError({ title, error, onRetry, children }: { title: string; error: unknown; onRetry: () => void; children?: React.ReactNode }) {
  return (
    <div role="alert" className="w-full p-8 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm space-y-3">
      <p className="font-semibold">{title}</p>
      <p>{errorMessage(error, "Please check your connection and try again.")}</p>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onRetry} className="text-xs underline font-semibold cursor-pointer">
          Try again
        </button>
        {children}
      </div>
    </div>
  );
}

/** the audit is computed from the newest listings only; say so when the catalogue is larger */
export function TruncatedNote({ evaluated, total }: { evaluated: number; total: number }) {
  return (
    <p className="w-full text-[11px] text-[#666666]">
      Based on the {evaluated.toLocaleString()} most recently updated of {total.toLocaleString()} listings.
    </p>
  );
}
