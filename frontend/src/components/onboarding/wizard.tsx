import React from "react";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { CHANNEL_LOGOS } from "@/components/onboarding/wizardContext";
import { cn } from "@/utils/cn";

// ------------------------------------------------------------------------------------------------ small pieces
export const InlineError: React.FC<{ error?: unknown; message?: string; className?: string }> = ({ error, message, className }) => {
  const text = message ?? (error ? errorMessage(error) : null);
  if (!text) return null;
  return (
    <div role="alert" className={cn("flex items-start gap-2 rounded-[8px] border border-[#F3C7C7] bg-[#FDF3F3] px-3 py-2 text-[12px] leading-[1.45] text-[#8A1C1C]", className)}>
      <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
};

export const FieldError: React.FC<{ id?: string; message?: string | null }> = ({ id, message }) =>
  message ? (
    <p id={id} role="alert" className="text-[11px] font-normal leading-[1.4] text-[#B42318]">
      {message}
    </p>
  ) : null;

export const Spinner: React.FC<{ className?: string }> = ({ className }) => <Loader2 className={cn("h-3.5 w-3.5 animate-spin", className)} aria-hidden />;

/** shown while a step's data loads */
export const StepLoading: React.FC<{ label?: string }> = ({ label = "Loading" }) => (
  <div role="status" aria-label={label} className="flex min-h-[320px] w-full items-center justify-center">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#E5E5E5] border-t-[#0A0A0A]" />
  </div>
);

/** shown when a step's data could not load */
export const StepError: React.FC<{ error: unknown; onRetry: () => void }> = ({ error, onRetry }) => (
  <div className="mx-auto flex min-h-[320px] w-full max-w-[520px] flex-col items-center justify-center gap-3 px-6 text-center">
    <InlineError error={error} className="w-full text-left" />
    <button type="button" onClick={onRetry} className="h-[40px] rounded-[8px] border border-[#D6D6D6] bg-white px-4 text-[12px] font-semibold text-[#000000] hover:bg-[#F9F9F9]">
      Try again
    </button>
  </div>
);

/** read-only notice for people who may look at the setup but not change it */
export const ReadOnlyNotice: React.FC<{ onSignOut?: () => void }> = ({ onSignOut }) => (
  <div role="note" className="flex items-start gap-2.5 rounded-[8px] border border-[#EAEAEA] bg-[#F5F5F5] px-3.5 py-2.5 text-[12px] leading-[1.45] text-[#333333]">
    <Lock className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden />
    <span className="flex-1">
      Only an administrator can set up the business. You can look around, but nothing here can be changed. Ask your administrator to finish the setup.
    </span>
    {onSignOut && (
      <button type="button" onClick={onSignOut} className="shrink-0 font-semibold underline hover:text-black">
        Sign out
      </button>
    )}
  </div>
);

/** a channel's logo, or its first letter when no logo ships for it */
export const ChannelLogo: React.FC<{ code: string; name: string }> = ({ code, name }) => {
  const src = CHANNEL_LOGOS[code];
  return src ? (
    <img src={src} alt="" className="h-full w-full object-contain" />
  ) : (
    <span aria-hidden className="text-[14px] font-bold text-[#0A0A0A]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
};
