import React, { useState } from "react";
import {
  Truck,
  Ship,
  PackageCheck,
  CheckCircle2,
  Info,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepFulfillmentProps {
  onNext: () => void;
  onSkip: () => void;
}

export const StepFulfillment: React.FC<StepFulfillmentProps> = ({
  onNext,
  onSkip,
}) => {
  const { onboardingData, updateOnboardingData } = useWorkspaceStore();

  const [method, setMethod] = useState<
    "marketplace" | "seller" | "third_party"
  >(onboardingData.fulfillment.method || "marketplace");
  const [preference, setPreference] = useState(
    onboardingData.fulfillment.preference || "Recommended for most orders",
  );

  const handleContinue = () => {
    updateOnboardingData({
      fulfillment: {
        method,
        preference,
      },
    });
    onNext();
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0A]">
          How will you fulfill your orders?
        </h1>
        <p className="text-sm text-[#666666] max-w-3xl leading-relaxed">
          Choose how orders should be shipped. You can change these preferences
          later for individual marketplaces, warehouses or products.
        </p>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form: 7 cols */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              Default fulfillment method
            </h3>

            {/* 3 selectable cards */}
            <div className="space-y-3">
              {/* Option 1: Marketplace Shipping */}
              <label
                onClick={() => setMethod("marketplace")}
                className={cn(
                  "flex items-start gap-3.5 rounded-xl border p-4 cursor-pointer transition-all relative",
                  method === "marketplace"
                    ? "border-black bg-neutral-50/70 shadow-xs"
                    : "border-[#E5E7EB] bg-white hover:border-neutral-300",
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border mt-0.5",
                    method === "marketplace"
                      ? "border-black"
                      : "border-[#D1D5DB]",
                  )}
                >
                  {method === "marketplace" && (
                    <div className="h-2 w-2 rounded-full bg-black" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[#0A0A0A]">
                    Marketplace Shipping
                  </div>
                  <p className="text-xs text-[#666666]">
                    Use the shipping service provided by the marketplace when
                    available.
                  </p>
                  <div className="text-[11px] text-[#666666] pt-1">
                    Marketplace service · When supported
                  </div>
                </div>
              </label>

              {/* Option 2: Seller Shipping */}
              <label
                onClick={() => setMethod("seller")}
                className={cn(
                  "flex items-start gap-3.5 rounded-xl border p-4 cursor-pointer transition-all relative",
                  method === "seller"
                    ? "border-black bg-neutral-50/70 shadow-xs"
                    : "border-[#E5E7EB] bg-white hover:border-neutral-300",
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border mt-0.5",
                    method === "seller" ? "border-black" : "border-[#D1D5DB]",
                  )}
                >
                  {method === "seller" && (
                    <div className="h-2 w-2 rounded-full bg-black" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[#0A0A0A]">
                    Seller Shipping
                  </div>
                  <p className="text-xs text-[#666666]">
                    Manage shipping through your own configured logistics
                    provider.
                  </p>
                  <div className="text-[11px] text-[#666666] pt-1">
                    Your logistics · Your control
                  </div>
                </div>
              </label>

              {/* Option 3: Third-party Shipping */}
              <label
                onClick={() => setMethod("third_party")}
                className={cn(
                  "flex items-start gap-3.5 rounded-xl border p-4 cursor-pointer transition-all relative",
                  method === "third_party"
                    ? "border-black bg-neutral-50/70 shadow-xs"
                    : "border-[#E5E7EB] bg-white hover:border-neutral-300",
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border mt-0.5",
                    method === "third_party"
                      ? "border-black"
                      : "border-[#D1D5DB]",
                  )}
                >
                  {method === "third_party" && (
                    <div className="h-2 w-2 rounded-full bg-black" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[#0A0A0A]">
                    Third-party Shipping
                  </div>
                  <p className="text-xs text-[#666666]">
                    Use a connected shipping or logistics provider.
                  </p>
                  <div className="text-[11px] text-[#666666] pt-1">
                    Connected provider · Connection required
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Preference Dropdown */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Your default preference
            </label>
            <Select value={preference} onValueChange={setPreference}>
              <SelectTrigger className="h-11 rounded-lg border-[#E5E7EB] bg-white text-xs font-medium">
                <SelectValue placeholder="Select preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Recommended for most orders">
                  Recommended for most orders
                </SelectItem>
                <SelectItem value="Prioritize fastest delivery">
                  Prioritize fastest delivery
                </SelectItem>
                <SelectItem value="Prioritize lowest shipping cost">
                  Prioritize lowest shipping cost
                </SelectItem>
                <SelectItem value="Manual selection per order">
                  Manual selection per order
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[#666666]">
              You can override this preference when supported.
            </p>
          </div>

          {/* Shipping Connections Section */}
          <div className="space-y-3 pt-3">
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              Shipping connections
            </h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white p-4">
                <div>
                  <div className="text-xs font-semibold text-[#0A0A0A]">
                    Marketplace Shipping
                  </div>
                  <p className="text-[11px] text-[#666666]">
                    Available through connected marketplaces
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-[#0A0A0A] border border-neutral-200">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Available</span>
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white p-4">
                <div>
                  <div className="text-xs font-semibold text-[#0A0A0A]">
                    Third-party provider
                  </div>
                  <p className="text-[11px] text-[#666666]">
                    Connect a shipping provider (Delhivery, Blue Dart)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-black"
                >
                  Connect
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Preview Panel: 5 cols */}
        <div className="lg:col-span-5 rounded-xl border border-[#E5E7EB] bg-neutral-50/50 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">
              Your shipping preferences
            </span>
            <span className="text-xs font-semibold text-[#666666]">Preview</span>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-[#EAEAEA] bg-white p-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-[#0A0A0A]">
                  Marketplace / Amazon
                </div>
                <div className="text-[11px] text-[#666666]">
                  Marketplace Shipping
                </div>
              </div>
              <button
                type="button"
                className="text-xs text-[#666666] hover:text-black hover:underline"
              >
                Edit
              </button>
            </div>

            <div className="rounded-lg border border-[#EAEAEA] bg-white p-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-[#0A0A0A]">
                  Marketplace / Flipkart
                </div>
                <div className="text-[11px] text-[#666666]">
                  Marketplace Shipping
                </div>
              </div>
              <button
                type="button"
                className="text-xs text-[#666666] hover:text-black hover:underline"
              >
                Edit
              </button>
            </div>

            <div className="rounded-lg border border-[#EAEAEA] bg-white p-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-[#0A0A0A]">
                  Other orders
                </div>
                <div className="text-[11px] text-[#666666]">
                  Default preference
                </div>
              </div>
              <button
                type="button"
                className="text-xs text-[#666666] hover:text-black hover:underline"
              >
                Edit
              </button>
            </div>
          </div>

          <p className="text-[11px] text-[#666666]">
            Manage advanced shipping rules later
          </p>

          {/* Operational pipeline diagram */}
          <div className="rounded-xl border border-[#D1D5DB] bg-white p-4 text-center space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">
              From Order to Dispatch
            </span>

            <div className="flex flex-col items-center gap-1.5 text-xs font-medium text-[#0A0A0A] pt-2">
              <span>Order received</span>
              <ArrowDown className="h-3 w-3 text-neutral-400" />
              <span>Pick</span>
              <ArrowDown className="h-3 w-3 text-neutral-400" />
              <span>Pack</span>
              <ArrowDown className="h-3 w-3 text-neutral-400" />
              <span>Shipping</span>
              <ArrowDown className="h-3 w-3 text-neutral-400" />
              <span className="font-bold">Dispatch</span>
            </div>

            <p className="text-[10px] text-neutral-400 pt-2 leading-relaxed">
              One workspace to manage each step, with shipping based on your
              preferences.
            </p>
          </div>
        </div>
      </div>

      {/* Info Notice */}
      <div className="rounded-xl border border-[#E5E7EB] bg-neutral-50/70 p-4 flex items-center gap-3 text-xs text-[#0A0A0A]">
        <Info className="h-4 w-4 text-neutral-600 shrink-0" />
        <span>
          Shipping options may vary by marketplace, product, location and
          configured provider.
        </span>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#EAEAEA] pt-6">
        <p className="text-xs text-[#666666]">
          You can configure advanced fulfillment rules from Settings.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onSkip}
            className="h-11 px-6 rounded-lg text-xs font-semibold border-[#E5E7EB] text-[#666666] hover:text-black"
          >
            Skip for now
          </Button>
          <Button
            type="button"
            onClick={handleContinue}
            className="h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2"
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
