import { useState } from "react";
import { MailWarning } from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace.store";
import { authApi } from "@/api/auth.api";
import { errorMessage } from "@/api/errors";

/**
 * Connecting marketplaces and inviting people need a verified email (the API answers EMAIL_NOT_VERIFIED otherwise),
 * so an unverified owner sees this until they confirm.
 */
export function EmailVerificationBanner() {
  const verified = useWorkspaceStore((s) => s.user?.emailVerified);
  const email = useWorkspaceStore((s) => s.user?.email);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  if (verified !== false) return null;

  const resend = async () => {
    setState("sending");
    try {
      await authApi.resendVerification();
      setState("sent");
    } catch (e) {
      setMessage(errorMessage(e));
      setState("error");
    }
  };

  return (
    <div role="status" className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-8 py-2 text-[12px] text-amber-900">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {state === "sent"
          ? `Verification link sent to ${email}. Check your inbox.`
          : state === "error"
            ? message
            : `Please verify ${email ?? "your email"} to connect marketplaces and invite your team.`}
      </span>
      {state !== "sent" && (
        <button type="button" onClick={resend} disabled={state === "sending"} className="font-semibold underline underline-offset-2 disabled:opacity-60">
          {state === "sending" ? "Sending..." : "Resend link"}
        </button>
      )}
    </div>
  );
}
