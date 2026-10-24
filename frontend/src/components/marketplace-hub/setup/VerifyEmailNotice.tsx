import { useState } from "react";
import { MailWarning } from "lucide-react";
import { authApi } from "@/api/auth.api";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

/** shown when the API refuses a connection because the owner's email is not verified yet (403 EMAIL_NOT_VERIFIED) */
export function VerifyEmailNotice({ message }: { message?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [problem, setProblem] = useState("");

  const acquire = useSubmitLock();
  const resend = async () => {
    const release = acquire();
    if (!release) return;
    setState("sending");
    try {
      await authApi.resendVerification();
      setState("sent");
    } catch (e) {
      setProblem(errorMessage(e));
      setState("error");
    } finally {
      release();
    }
  };

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900"
    >
      <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1 space-y-2">
        <p>
          {message ||
            "Verify your email address before connecting a marketplace."}
        </p>
        {state === "sent" && (
          <p role="status">
            Verification link sent. Check your inbox, then try again.
          </p>
        )}
        {state === "error" && <p>{problem}</p>}
        {state !== "sent" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={state === "sending"}
            onClick={() => void resend()}
          >
            {state === "sending" ? "Sending..." : "Resend verification email"}
          </Button>
        )}
      </div>
    </div>
  );
}
