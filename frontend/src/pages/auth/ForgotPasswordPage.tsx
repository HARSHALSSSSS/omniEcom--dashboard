import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import { authApi } from "@/api/auth.api";
import { errorMessage } from "@/api/errors";

const schema = z.object({ email: z.string().trim().email("Please enter a valid work email") });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = async ({ email }: FormData) => {
    setServerError(null);
    try {
      // the API answers the same way whether or not the address has an account
      await authApi.forgotPassword(email);
      setSentTo(email);
    } catch (e) {
      setServerError(errorMessage(e));
    }
  };

  return (
    <AuthLayout>
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">Account recovery</span>
          <h1 className="text-3xl font-bold tracking-tight text-[#0A0A0A]">Reset your password</h1>
          <p className="text-sm text-[#666666] leading-relaxed">
            Enter the email you signed up with and we will send you a link to choose a new password.
          </p>
        </div>

        {sentTo ? (
          <div role="status" className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            If an account exists for <strong>{sentTo}</strong>, a reset link is on its way. The link works once and expires soon.
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2" noValidate>
            {serverError && (
              <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {serverError}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-[#0A0A0A]">Work email</label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                {...register("email")}
                className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-[18px] bg-black text-white hover:bg-neutral-800 font-medium text-sm mt-3 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <span>Send reset link</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        )}

        <div className="text-center pt-2">
          <Link to={ROUTES.SIGN_IN} className="text-xs font-semibold text-black underline underline-offset-2 hover:text-neutral-800">
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
