import React, { useState } from "react";
import {
  Building2,
  Store,
  ShoppingBag,
  Boxes,
  MessageSquare,
  MoreHorizontal,
  Check,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepBusinessProps {
  onNext: () => void;
}

const BUSINESS_TYPES = [
  {
    id: "d2c_brand",
    title: "D2C Brand",
    description: "Sell your own brand directly.",
    icon: ShoppingBag,
  },
  {
    id: "marketplace_seller",
    title: "Marketplace Seller",
    description: "Sell on online marketplaces.",
    icon: Store,
  },
  {
    id: "retail_business",
    title: "Retail Business",
    description: "Sell through physical stores.",
    icon: Building2,
  },
  {
    id: "wholesaler",
    title: "Wholesaler",
    description: "Supply products to businesses.",
    icon: Boxes,
  },
  {
    id: "social_commerce",
    title: "Social Commerce",
    description: "Sell through social channels.",
    icon: MessageSquare,
  },
  {
    id: "other",
    title: "Other",
    description: "Build a business your way.",
    icon: MoreHorizontal,
  },
];

const TEAM_SIZES = [
  { id: "just_me", label: "Just me" },
  { id: "2-5", label: "2–5" },
  { id: "6-20", label: "6–20" },
  { id: "21-50", label: "21–50" },
  { id: "50+", label: "50+" },
];

export const StepBusiness: React.FC<StepBusinessProps> = ({ onNext }) => {
  const { onboardingData, updateOnboardingData, user, setUser } =
    useWorkspaceStore();

  const [businessName, setBusinessName] = useState(
    onboardingData.business.name || user?.businessName || "Nova Living",
  );
  const [selectedType, setSelectedType] = useState(
    onboardingData.business.type || "d2c_brand",
  );
  const [teamSize, setTeamSize] = useState(
    onboardingData.business.teamSize || "just_me",
  );
  const [city, setCity] = useState(
    onboardingData.business.city || "Mumbai, Maharashtra",
  );

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    updateOnboardingData({
      business: {
        name: businessName,
        type: selectedType,
        teamSize,
        city,
      },
    });

    if (user) {
      setUser({
        ...user,
        businessName,
        businessType: selectedType,
        teamSize,
        city,
      });
    }

    onNext();
  };

  return (
    <div className="flex w-full min-h-[calc(100vh-64px)] flex-col lg:flex-row">
      {/* Left dark summary panel from Screen 02 */}
      <div className="hidden lg:flex w-[400px] shrink-0 bg-black p-10 text-white flex-col justify-between rounded-r-3xl my-4 ml-4">
        <div className="space-y-6">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Business Profile
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
            Tell us about your business.
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            This helps us tailor your workspace. You can change these details later.
          </p>

          <div className="space-y-4 pt-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 text-white font-medium text-xs tracking-wider">
              <span>YOUR BUSINESS</span>
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 text-neutral-500 font-medium text-xs tracking-wider">
              <span>YOUR CHANNELS</span>
              <ArrowRight className="h-4 w-4 text-neutral-600" />
            </div>
            <div className="text-neutral-600 font-medium text-xs tracking-wider pt-2">
              <span className="block mb-2 text-neutral-500">YOUR OPERATIONS</span>
              <div className="flex gap-4 text-[11px] text-neutral-600">
                <span>Products</span>
                <span>Orders</span>
                <span>Inventory</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-neutral-500">Setup takes about 3 minutes.</p>
      </div>

      {/* Right step form container */}
      <div className="flex-1 flex justify-center p-6 sm:p-10 lg:p-14 overflow-y-auto">
        <form onSubmit={handleContinue} className="w-full max-w-2xl space-y-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0A0A0A]">
              Let's set up your business
            </h2>
            <p className="mt-1 text-sm text-[#666666]">
              Start with the basics. We'll help you configure the rest as you grow.
            </p>
          </div>

          {/* Business Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Business / Brand name
            </label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Nova Living"
              className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm"
              required
            />
            <p className="text-[11px] text-[#666666]">
              The name customers know your business by.
            </p>
          </div>

          {/* Business Type selection cards (2x3) */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              What best describes your business?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BUSINESS_TYPES.map((bt) => {
                const Icon = bt.icon;
                const isSelected = selectedType === bt.id;
                return (
                  <button
                    key={bt.id}
                    type="button"
                    onClick={() => setSelectedType(bt.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition-all relative",
                      isSelected
                        ? "border-black bg-neutral-50/70 shadow-xs"
                        : "border-[#E5E7EB] bg-white hover:border-neutral-300",
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[#0A0A0A]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 pr-4">
                      <div className="text-sm font-semibold text-[#0A0A0A]">
                        {bt.title}
                      </div>
                      <div className="text-xs text-[#666666] mt-0.5">
                        {bt.description}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-black absolute right-3.5 top-4" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Team Size Segmented Control */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              How many people manage the business?
            </label>
            <div className="flex rounded-xl bg-neutral-100 p-1">
              {TEAM_SIZES.map((ts) => {
                const isSelected = teamSize === ts.id;
                return (
                  <button
                    key={ts.id}
                    type="button"
                    onClick={() => setTeamSize(ts.id)}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-center text-xs font-medium transition-all",
                      isSelected
                        ? "bg-white text-black shadow-xs font-semibold"
                        : "text-[#666666] hover:text-black",
                    )}
                  >
                    {ts.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Where do you operate from?
            </label>
            <div className="relative">
              <MapPin className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Search city or enter location"
                className="h-11 rounded-lg border-[#E5E7EB] bg-white pl-10 pr-3.5 text-sm"
              />
            </div>
            <p className="text-[11px] text-[#666666]">
              e.g. Mumbai, Maharashtra
            </p>
          </div>

          {/* Workspace preview line */}
          <div className="border-t border-[#EAEAEA] pt-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">
              Workspace Preview
            </span>
            <div className="flex items-center justify-between text-xs text-[#666666]">
              <span>Your workspace will adapt to your business as it grows.</span>
              <span className="font-medium text-neutral-800">
                Starter → Growing → Scale
              </span>
            </div>
          </div>

          {/* Bottom Action */}
          <div className="flex flex-col items-end gap-2 pt-2">
            <Button
              type="submit"
              className="h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2"
            >
              <span>Continue</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="text-[11px] text-[#666666]">
              You can update these details anytime in Settings.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
