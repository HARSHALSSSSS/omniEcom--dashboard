import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import { useWorkspaceStore } from "@/store/workspace.store";
import { signUp } from "@/lib/session";
import { errorMessage, isApiError } from "@/api/errors";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

/** matches the API: business name 2-120 chars, password 10-128 chars (length is the policy, no composition rules) */
const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(120),
  businessName: z.string().trim().min(2, "Please enter your business / brand name").max(120),
  email: z.string().trim().email("Please enter a valid work email"),
  password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
});

type SignUpFormData = z.infer<typeof signUpSchema>;

/** server field paths -> form fields */
const SERVER_FIELDS: Record<string, keyof SignUpFormData> = {
  fullName: "fullName",
  businessName: "businessName",
  email: "email",
  password: "password",
};

export default function SignUpPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", businessName: "", email: "", password: "" },
  });

  const acquire = useSubmitLock();
  const onSubmit = async (data: SignUpFormData) => {
    const release = acquire();
    if (!release) return;
    setServerError(null);
    try {
      await signUp({ businessName: data.businessName, fullName: data.fullName, email: data.email, password: data.password });
    } catch (e) {
      // show what the server objected to next to the field; anything else as a banner
      let placed = false;
      if (isApiError(e) && e.fields) {
        for (const [path, message] of Object.entries(e.fields)) {
          const field = SERVER_FIELDS[path];
          if (field) {
            setError(field, { message: field === "email" && e.status === 409 ? "An account with this email already exists" : message });
            placed = true;
          }
        }
      }
      if (!placed) setServerError(errorMessage(e));
      release();
      return;
    }
    release();
    const { onboardingResumeStep } = useWorkspaceStore.getState();
    navigate(`${ROUTES.ONBOARDING}/${onboardingResumeStep}`, { replace: true });
  };

  return (
    <AuthLayout>
      <div className="w-full space-y-6">
        {/* Eyebrow & Headline */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">
            Get Started
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-[#0A0A0A]">
            Create your business account
          </h1>
          <p className="text-sm text-[#666666] leading-relaxed">
            Start with the essentials. You can connect marketplaces and configure
            operations later.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2" noValidate>
          {serverError && (
            <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {serverError}
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="text-xs font-semibold text-[#0A0A0A]">
              Full name
            </label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              placeholder="Your full name"
              {...register("fullName")}
              className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
            />
            {errors.fullName && (
              <p className="text-xs text-red-500">{errors.fullName.message}</p>
            )}
          </div>

          {/* Business / Brand Name */}
          <div className="space-y-1.5">
            <label htmlFor="businessName" className="text-xs font-semibold text-[#0A0A0A]">
              Business / Brand name
            </label>
            <Input
              id="businessName"
              type="text"
              autoComplete="organization"
              placeholder="e.g. Nova Living"
              {...register("businessName")}
              className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
            />
            {errors.businessName && (
              <p className="text-xs text-red-500">
                {errors.businessName.message}
              </p>
            )}
          </div>

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
            <label htmlFor="password" className="text-xs font-semibold text-[#0A0A0A]">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a secure password"
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
            {errors.password ? (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            ) : (
              <p className="text-[11px] text-[#666666]">
                Use at least 10 characters. A few random words make a strong password.
              </p>
            )}
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
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* Switch to Sign In */}
        <div className="text-center pt-2">
          <p className="text-xs text-[#666666]">
            Already have an account?{" "}
            <Link
              to={ROUTES.SIGN_IN}
              className="font-semibold text-black underline underline-offset-2 hover:text-neutral-800"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer Disclaimer */}
        <p className="text-center text-[11px] text-neutral-400 pt-4">
          By continuing, you agree to the{" "}
          <span className="underline hover:text-neutral-600 cursor-pointer">
            Terms
          </span>{" "}
          and{" "}
          <span className="underline hover:text-neutral-600 cursor-pointer">
            Privacy Policy
          </span>
          .
        </p>
      </div>
    </AuthLayout>
  );
}
