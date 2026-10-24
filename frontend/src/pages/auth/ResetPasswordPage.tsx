import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import { authApi } from "@/api/auth.api";
import { errorMessage } from "@/api/errors";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const schema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords do not match" });
type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });

  const acquire = useSubmitLock();
  const onSubmit = async ({ password }: FormData) => {
    setServerError(null);
    const release = acquire();
    if (!release) return;
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setServerError(errorMessage(e, "This reset link is invalid or has expired. Request a new one."));
    } finally {
      release();
    }
  };

  return (
    <AuthLayout>
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">Account recovery</span>
          <h1 className="text-3xl font-bold tracking-tight text-[#0A0A0A]">Choose a new password</h1>
        </div>

        {!token ? (
          <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This reset link is incomplete. <Link to={ROUTES.FORGOT_PASSWORD} className="underline">Request a new one</Link>.
          </div>
        ) : done ? (
          <div role="status" className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Your password was changed. You can now <Link to={ROUTES.SIGN_IN} className="font-semibold underline">sign in</Link> with it.
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2" noValidate>
            {serverError && (
              <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {serverError} <Link to={ROUTES.FORGOT_PASSWORD} className="underline">Request a new link</Link>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-[#0A0A0A]">New password</label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  {...register("password")}
                  className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 pr-10 text-sm focus:border-black"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  tabIndex={-1}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm" className="text-xs font-semibold text-[#0A0A0A]">Confirm new password</label>
              <Input
                id="confirm"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                {...register("confirm")}
                className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
              />
              {errors.confirm && <p className="text-xs text-red-500">{errors.confirm.message}</p>}
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-[18px] bg-black text-white hover:bg-neutral-800 font-medium text-sm mt-3 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Change password</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
