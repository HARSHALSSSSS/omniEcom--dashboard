import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { preferredLandingRoute } from "@/lib/preferences";
import { ROUTES } from "@/constants/routes";
import { useWorkspaceStore } from "@/store/workspace.store";
import { signIn } from "@/lib/session";
import { errorMessage } from "@/api/errors";
import { useSubmitLock } from "@/hooks/useSubmitGuard";
import { isSafeInternalRedirect } from "@/utils/security";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid work email"),
  password: z.string().min(1, "Please enter your password"),
  rememberMe: z.boolean().optional(),
});

type SignInFormData = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  const rememberMe = watch("rememberMe");

  const acquire = useSubmitLock();
  const onSubmit = async (data: SignInFormData) => {
    const release = acquire();
    if (!release) return;
    setServerError(null);
    try {
      await signIn(data.email, data.password, data.rememberMe ?? false);
    } catch (e) {
      setServerError(errorMessage(e));
      release();
      return;
    }
    release();

    // back to where the visitor was heading; otherwise the workspace, or the wizard while onboarding is open
    const { onboardingComplete, onboardingResumeStep } = useWorkspaceStore.getState();
    const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
    const safeDestination = from && isSafeInternalRedirect(from.pathname)
      ? `${from.pathname}${from.search ?? ""}`
      : (preferredLandingRoute() ?? ROUTES.DASHBOARD);
    if (!onboardingComplete) navigate(`${ROUTES.ONBOARDING}/${onboardingResumeStep}`, { replace: true });
    else navigate(safeDestination, { replace: true });
  };

  return (
    <AuthLayout>
      <div className="w-full space-y-6">
        {/* Eyebrow & Headline */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">
            Welcome back
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-[#0A0A0A]">
            Sign in to your business
          </h1>
          <p className="text-sm text-[#666666] leading-relaxed">
            Manage your omnichannel operations, inventory, and orders from one place.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2" noValidate>
          {serverError && (
            <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {serverError}
            </div>
          )}

          {/* Work Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-[#0A0A0A]">
              Work email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              {...register("email")}
              className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-semibold text-[#0A0A0A]">
                Password
              </label>
              <Link
                to={ROUTES.FORGOT_PASSWORD}
                className="text-xs text-[#666666] hover:text-black underline underline-offset-2"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register("password")}
                className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 pr-10 text-sm focus:border-black"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setValue("rememberMe", !!checked)}
            />
            <label
              htmlFor="rememberMe"
              className="text-xs text-[#666666] cursor-pointer select-none"
            >
              Remember this device for 30 days
            </label>
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-[18px] bg-black text-white hover:bg-neutral-800 font-medium text-sm mt-3 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* Switch to Sign Up */}
        <div className="text-center pt-2">
          <p className="text-xs text-[#666666]">
            Don't have an account?{" "}
            <Link
              to={ROUTES.SIGN_UP}
              className="font-semibold text-black underline underline-offset-2 hover:text-neutral-800"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
