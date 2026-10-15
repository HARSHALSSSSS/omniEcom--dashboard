import React, { useState } from "react";
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

const signUpSchema = z.object({
  fullName: z.string().min(2, "Please enter your full name"),
  businessName: z.string().min(2, "Please enter your business / brand name"),
  email: z.string().email("Please enter a valid work email"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .regex(/[A-Za-z]/, "Must include at least one letter")
    .regex(/[0-9]/, "Must include at least one number"),
});

type SignUpFormData = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const navigate = useNavigate();
  const { setUser, setOnboardingComplete, updateOnboardingData } =
    useWorkspaceStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      businessName: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: SignUpFormData) => {
    setIsLoading(true);
    // Simulate API registration delay
    await new Promise((res) => setTimeout(res, 600));

    // Initialize user in store with onboarding incomplete
    setUser({
      id: `user-${Date.now()}`,
      fullName: data.fullName,
      email: data.email,
      businessName: data.businessName,
      role: "owner",
    });

    updateOnboardingData({
      business: {
        name: data.businessName,
        type: "d2c_brand",
        teamSize: "just_me",
        city: "Mumbai, Maharashtra",
      },
    });

    setOnboardingComplete(false);
    setIsLoading(false);
    navigate(`${ROUTES.ONBOARDING}/business`);
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Full name
            </label>
            <Input
              type="text"
              placeholder="Your full name"
              {...register("fullName")}
              className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
            />
            {errors.fullName && (
              <p className="text-xs text-red-500">{errors.fullName.message}</p>
            )}
          </div>

          {/* Business / Brand Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Business / Brand name
            </label>
            <Input
              type="text"
              placeholder="e.g. Nova Living"
              {...register("businessName")}
              className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
            />
            {errors.businessName && (
              <p className="text-xs text-red-500">
                {errors.businessName.message}
              </p>
            )}
          </div>

          {/* Work Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Work email
            </label>
            <Input
              type="email"
              placeholder="you@company.com"
              {...register("email")}
              className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm focus:border-black"
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Create a secure password"
                {...register("password")}
                className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 pr-10 text-sm focus:border-black"
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
            {errors.password ? (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            ) : (
              <p className="text-[11px] text-[#666666]">
                Use at least 8 characters, including a letter and a number.
              </p>
            )}
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm mt-3 flex items-center justify-center gap-2"
          >
            {isLoading ? (
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
