import React, { useState } from "react";
import {
  Boxes,
  Warehouse,
  Check,
  Info,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepInventoryProps {
  onNext: () => void;
  onSkip: () => void;
}

export const StepInventory: React.FC<StepInventoryProps> = ({
  onNext,
  onSkip,
}) => {
  const { onboardingData, updateOnboardingData } = useWorkspaceStore();

  const [mode, setMode] = useState<"simple" | "warehouse">(
    onboardingData.inventory.mode || "simple",
  );
  const [locationName, setLocationName] = useState(
    onboardingData.inventory.locationName || "Home Inventory",
  );
  const [warehouseName, setWarehouseName] = useState(
    onboardingData.inventory.warehouseName || "Main Warehouse",
  );
  const [city, setCity] = useState(
    onboardingData.inventory.city || "Mumbai, Maharashtra",
  );
  const [address, setAddress] = useState(
    onboardingData.inventory.address || "",
  );
  const [startingMethod, setStartingMethod] = useState<
    "manual" | "marketplace" | "file"
  >(onboardingData.inventory.startingMethod || "manual");

  const handleContinue = () => {
    updateOnboardingData({
      inventory: {
        mode,
        locationName,
        warehouseName,
        city,
        address,
        startingMethod,
      },
    });
    onNext();
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0A]">
          Let's set up your inventory.
        </h1>
        <p className="text-sm text-[#666666] max-w-3xl leading-relaxed">
          Start with the stock you have today. You can add warehouses, locations
          and advanced inventory controls as your business grows.
        </p>
      </div>

      {/* Main Grid: Form Left, Overview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form: 7 cols */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              How do you manage your inventory?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Simple inventory card */}
              <button
                type="button"
                onClick={() => setMode("simple")}
                className={cn(
                  "flex flex-col text-left rounded-xl border p-4 transition-all relative",
                  mode === "simple"
                    ? "border-black bg-neutral-50/70 shadow-xs"
                    : "border-[#E5E7EB] bg-white hover:border-neutral-300",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Boxes className="h-4 w-4 text-[#0A0A0A]" />
                  <span className="text-sm font-semibold text-[#0A0A0A]">
                    Simple inventory
                  </span>
                </div>
                <p className="text-xs text-[#666666] leading-relaxed">
                  Track stock at the product or SKU level without setting up a
                  warehouse.
                </p>
                <div className="mt-4 pt-3 border-t border-[#EAEAEA] text-[11px] text-[#666666] space-y-0.5">
                  <div>Home inventory · Small business</div>
                  <div>Single location</div>
                </div>
                {mode === "simple" && (
                  <Check className="h-4 w-4 text-black absolute right-3.5 top-3.5" />
                )}
              </button>

              {/* Warehouse inventory card */}
              <button
                type="button"
                onClick={() => setMode("warehouse")}
                className={cn(
                  "flex flex-col text-left rounded-xl border p-4 transition-all relative",
                  mode === "warehouse"
                    ? "border-black bg-neutral-50/70 shadow-xs"
                    : "border-[#E5E7EB] bg-white hover:border-neutral-300",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Warehouse className="h-4 w-4 text-[#0A0A0A]" />
                  <span className="text-sm font-semibold text-[#0A0A0A]">
                    Warehouse inventory
                  </span>
                </div>
                <p className="text-xs text-[#666666] leading-relaxed">
                  Track stock across warehouses and locations.
                </p>
                <div className="mt-4 pt-3 border-t border-[#EAEAEA] text-[11px] text-[#666666] space-y-0.5">
                  <div>Multiple warehouses · Warehouse staff</div>
                  <div>Bins and storage locations</div>
                </div>
                {mode === "warehouse" && (
                  <Check className="h-4 w-4 text-black absolute right-3.5 top-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Dynamic Inputs based on mode */}
          {mode === "simple" ? (
            <div className="space-y-5 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0A0A0A]">
                  Inventory location name
                </label>
                <Input
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="Home Inventory"
                  className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm"
                />
              </div>

              {/* Starting inventory method radio list */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#0A0A0A]">
                  Starting inventory method
                </label>
                <div className="space-y-2">
                  {[
                    { id: "manual", label: "Enter stock manually" },
                    {
                      id: "marketplace",
                      label: "Import stock from marketplace",
                    },
                    { id: "file", label: "Import inventory file" },
                  ].map((option) => (
                    <label
                      key={option.id}
                      onClick={() =>
                        setStartingMethod(option.id as "manual" | "marketplace" | "file")
                      }
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 text-xs font-medium cursor-pointer transition-colors",
                        startingMethod === option.id
                          ? "border-black bg-neutral-50/50 text-[#0A0A0A]"
                          : "border-[#E5E7EB] bg-white text-[#666666] hover:border-neutral-300",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border",
                          startingMethod === option.id
                            ? "border-black"
                            : "border-[#D1D5DB]",
                        )}
                      >
                        {startingMethod === option.id && (
                          <div className="h-2 w-2 rounded-full bg-black" />
                        )}
                      </div>
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-[#666666] pt-1">
                  Your inventory will become the central stock source for
                  connected marketplaces.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0A0A0A]">
                    Warehouse name
                  </label>
                  <Input
                    value={warehouseName}
                    onChange={(e) => setWarehouseName(e.target.value)}
                    placeholder="Main Warehouse"
                    className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0A0A0A]">
                    Location: City / State
                  </label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Mumbai, Maharashtra"
                    className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0A0A0A]">
                  Warehouse address (optional)
                </label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address, building or landmark"
                  className="h-11 rounded-lg border-[#E5E7EB] bg-white px-3.5 text-sm"
                />
                <p className="text-[11px] text-[#666666]">
                  Advanced locations such as zones, racks, shelves and bins can
                  be configured later.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Overview Panel: 5 cols */}
        <div className="lg:col-span-5 rounded-xl border border-[#E5E7EB] bg-neutral-50/50 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">
              Inventory Overview
            </span>
            <span className="text-xs font-semibold text-[#666666]">Preview</span>
          </div>

          <div className="space-y-4 divide-y divide-[#EAEAEA]">
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-[#666666]">Products</span>
              <span className="text-lg font-bold text-[#0A0A0A] tabular-nums">
                427
              </span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-xs text-[#666666]">Units</span>
              <span className="text-lg font-bold text-[#0A0A0A] tabular-nums">
                2,846
              </span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-xs text-[#666666]">Low stock</span>
              <span className="text-lg font-bold text-amber-600 tabular-nums">
                18
              </span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-xs text-[#666666]">Out of stock</span>
              <span className="text-lg font-bold text-red-600 tabular-nums">
                6
              </span>
            </div>
          </div>

          <p className="text-[11px] text-[#666666] leading-relaxed">
            Example stock figures. Your inventory will reflect the quantities
            you enter or import.
          </p>

          {/* Master Inventory tree box */}
          <div className="rounded-xl border border-[#D1D5DB] bg-white p-4 text-center">
            <div className="text-xs font-bold text-[#0A0A0A]">
              Master Inventory
            </div>
            <div className="text-[10px] text-[#666666]">
              One central stock source
            </div>

            <div className="mt-3 pt-3 border-t border-[#EAEAEA] flex items-center justify-center gap-3 text-[10px] font-medium text-neutral-600">
              <span>Amazon</span>
              <span>•</span>
              <span>Flipkart</span>
              <span>•</span>
              <span>Meesho</span>
              <span>•</span>
              <span>Shopify</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sync notice banner */}
      <div className="rounded-xl border border-[#E5E7EB] bg-neutral-50/70 p-4 flex items-center gap-3 text-xs text-[#0A0A0A]">
        <Info className="h-4 w-4 text-neutral-600 shrink-0" />
        <span>
          Your inventory will stay synchronized across connected sales channels.
        </span>
      </div>

      {/* Bottom bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#EAEAEA] pt-6">
        <p className="text-xs text-[#666666]">
          You can change inventory settings later.
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
