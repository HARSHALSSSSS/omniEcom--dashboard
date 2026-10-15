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
import { ROUTES } from "@/constants/routes";
import { useWorkspaceStore } from "@/store/workspace.store";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid work email"),
  password: z.string().min(1, "Please enter your password"),
  rememberMe: z.boolean().optional(),
});

type SignInFormData = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setAuthenticated, onboardingComplete } = useWorkspaceStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "aayush@gmail.com",
      password: "password123",
      rememberMe: true,
    },
  });

  const rememberMe = watch("rememberMe");

  const onSubmit = async (data: SignInFormData) => {
    setIsLoading(true);
    await new Promise((res) => setTimeout(res, 500));

    setUser({
      id: "user-001",
      fullName: "Abhishek Kumar",
      email: data.email,
      businessName: "Nova Living",
      role: "owner",
    });
    setAuthenticated(true);
    setIsLoading(false);

    // If there was a redirect origin, go there; otherwise check onboarding status
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    if (from) {
      navigate(from);
    } else if (onboardingComplete) {
      navigate(ROUTES.DASHBOARD);
    } else {
      navigate(`${ROUTES.ONBOARDING}/business`);
    }
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Work Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Work email
            </label>
            <Input
              type="email"
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
              <label className="text-xs font-semibold text-[#0A0A0A]">
                Password
              </label>
              <button
                type="button"
                className="text-xs text-[#666666] hover:text-black underline underline-offset-2"
                onClick={() => alert("Password reset link sent to registered email")}
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                {...register("password")}
                className="h-11 rounded-[18px] border-[#E5E7EB] bg-white px-3.5 pr-10 text-sm focus:border-black"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                tabIndex={-1}
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
            disabled={isLoading}
            className="w-full h-11 rounded-[18px] bg-black text-white hover:bg-neutral-800 font-medium text-sm mt-3 flex items-center justify-center gap-2"
          >
            {isLoading ? (
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
