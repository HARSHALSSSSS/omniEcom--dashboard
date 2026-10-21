import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ROUTES } from "@/constants/routes";
import { authApi } from "@/api/auth.api";
import { errorMessage } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";

type State = { status: "working" } | { status: "done" } | { status: "failed"; message: string };

// the link works once; React strict mode runs effects twice in development, so one request per token is shared
const attempts = new Map<string, Promise<void>>();
const verifyOnce = (token: string) => {
  let p = attempts.get(token);
  if (!p) {
    p = authApi.verifyEmail(token);
    attempts.set(token, p);
  }
  return p;
};

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? { status: "working" } : { status: "failed", message: "This verification link is incomplete." });
  const signedIn = useWorkspaceStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!token) return;
    let live = true;
    verifyOnce(token)
      .then(() => {
        if (!live) return;
        setState({ status: "done" });
        const store = useWorkspaceStore.getState();
        if (store.user) store.setUser({ ...store.user, emailVerified: true });
      })
      .catch((e) => live && setState({ status: "failed", message: errorMessage(e, "This verification link is invalid or has expired.") }));
    return () => {
      live = false;
    };
  }, [token]);

  return (
    <AuthLayout>
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">Email verification</span>
          <h1 className="text-3xl font-bold tracking-tight text-[#0A0A0A]">
            {state.status === "done" ? "Email verified" : state.status === "failed" ? "Could not verify" : "Verifying your email"}
          </h1>
        </div>
        {state.status === "working" && (
          <div className="flex items-center gap-2 text-sm text-[#666666]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> One moment...
          </div>
        )}
        {state.status === "done" && (
          <p className="text-sm text-[#666666]" role="status">
            Thanks, your email address is confirmed.{" "}
            <Link to={signedIn ? ROUTES.DASHBOARD : ROUTES.SIGN_IN} className="font-semibold text-black underline">
              {signedIn ? "Go to your workspace" : "Sign in"}
            </Link>
          </p>
        )}
        {state.status === "failed" && (
          <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.message} {signedIn ? "Use the banner in your workspace to send a new link." : "Sign in to request a new link."}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
