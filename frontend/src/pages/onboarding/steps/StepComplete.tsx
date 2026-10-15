import React from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/workspace.store";

interface StepCompleteProps {
  onFinish: () => void;
  onReview: () => void;
}

export const StepComplete: React.FC<StepCompleteProps> = ({
  onFinish,
  onReview,
}) => {
  const { onboardingData } = useWorkspaceStore();

  const businessName = onboardingData.business.name || "Nova Living";

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-12">
      {/* Top Banner & Readiness Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Side: 7 cols */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">
              Setup Complete
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0A] leading-tight">
              Your business is ready to run.
            </h1>
            <p className="text-sm text-[#666666] leading-relaxed pt-1">
              Your essential commerce setup for{" "}
              <strong className="text-black">{businessName}</strong> is complete.
              You can now manage products, inventory, orders, fulfillment and
              sales channels from one workspace.
            </p>
          </div>

          <div className="space-y-4 pt-4">
            <div>
              <h3 className="text-sm font-bold text-[#0A0A0A]">
                Start from your workspace.
              </h3>
              <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">
                Your dashboard will surface what needs attention first, so you can
                focus on running and growing your business.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                type="button"
                onClick={onFinish}
                className="h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2"
              >
                <span>Go to dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onReview}
                className="h-11 px-6 rounded-lg text-xs font-semibold border-[#E5E7EB] text-[#0A0A0A] hover:bg-neutral-50"
              >
                Review setup
              </Button>
            </div>
          </div>
        </div>

        {/* Right Readiness Card: 5 cols */}
        <div className="lg:col-span-5 rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-6 shadow-2xs">
          <div>
            <h2 className="text-base font-bold text-[#0A0A0A]">
              Setup readiness
            </h2>
            <p className="text-xs text-[#666666] mt-0.5">
              Everything essential is configured.
            </p>
          </div>

          {/* 5 checklist rows */}
          <div className="space-y-3">
            {[
              {
                category: "Business",
                label: "Business profile",
                status: "Complete",
              },
              {
                category: "Sales Channels",
                label: "Sales channels",
                status: "Connected",
              },
              {
                category: "Products",
                label: "Product catalog",
                status: "Ready",
              },
              {
                category: "Inventory",
                label: "Inventory",
                status: "Configured",
              },
              {
                category: "Fulfillment",
                label: "Fulfillment & shipping",
                status: "Configured",
              },
            ].map((item) => (
              <div
                key={item.category}
                className="flex items-center justify-between rounded-xl border border-[#EAEAEA] p-3 hover:bg-neutral-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-black text-white">
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  </div>
                  <div>
                    <div className="text-[10px] text-[#666666] uppercase tracking-wider font-semibold">
                      {item.category}
                    </div>
                    <div className="text-xs font-semibold text-[#0A0A0A]">
                      {item.label}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-medium text-[#666666]">
                  <span>{item.status}</span>
                  <ArrowRight className="h-3 w-3 text-neutral-400" />
                </div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5 pt-2 border-t border-[#EAEAEA]">
            <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div className="h-full bg-black rounded-full w-full" />
            </div>
            <p className="text-[11px] font-semibold text-[#0A0A0A] text-right">
              100% essential setup complete
            </p>
          </div>
        </div>
      </div>

      {/* What happens next */}
      <div className="border-t border-[#EAEAEA] pt-8 space-y-6">
        <h2 className="text-base font-bold text-[#0A0A0A]">What happens next</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-neutral-400">01</span>
            <h3 className="text-sm font-semibold text-[#0A0A0A]">
              Your channels sync
            </h3>
            <p className="text-xs text-[#666666] leading-relaxed">
              Connected marketplace activity begins flowing into the workspace.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-bold text-neutral-400">02</span>
            <h3 className="text-sm font-semibold text-[#0A0A0A]">
              Your operations stay centralized
            </h3>
            <p className="text-xs text-[#666666] leading-relaxed">
              Products, inventory and orders are managed from one place.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-bold text-neutral-400">03</span>
            <h3 className="text-sm font-semibold text-[#0A0A0A]">
              Your dashboard surfaces priorities
            </h3>
            <p className="text-xs text-[#666666] leading-relaxed">
              Needs-attention items appear first so you know what to act on.
            </p>
          </div>
        </div>
      </div>

      {/* Ready to get started bottom bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#EAEAEA] pt-6">
        <h3 className="text-sm font-bold text-[#0A0A0A]">Ready to get started?</h3>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onReview}
            className="h-11 px-6 rounded-lg text-xs font-semibold border-[#E5E7EB] text-[#0A0A0A] hover:bg-neutral-50"
          >
            Review setup
          </Button>
          <Button
            type="button"
            onClick={onFinish}
            className="h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2"
          >
            <span>Go to dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
