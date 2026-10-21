import React, { useState } from "react";
import { ApiError } from "@/api/errors";
import type { InventoryInput, InventorySetup, StartingMethod } from "@/api/onboarding.api";
import { useInventoryOverview, useInventorySetup, useSaveInventory, useSkipStep } from "@/hooks/useOnboarding";
import { FieldError, InlineError, Spinner, StepError, StepLoading } from "@/components/onboarding/wizard";
import { useSavedDraft, useStepStatus, useWizard, useWizardDraft } from "@/components/onboarding/wizardContext";
import { cn } from "@/utils/cn";

type Mode = "simple" | "warehouse";

/** the wording is the server's (GET /onboarding/inventory options); this is only the fallback if it is missing */
const FALLBACK_MODES: Array<{ value: Mode; label: string; description: string; traits: string[] }> = [
  { value: "simple", label: "Simple inventory", description: "Track stock at the product or SKU level without setting up a warehouse.", traits: ["Home inventory", "Small business", "Single location"] },
  { value: "warehouse", label: "Warehouse inventory", description: "Track stock across warehouses and locations.", traits: ["Multiple warehouses", "Warehouse staff", "Bins and storage locations"] },
];
const FALLBACK_METHODS: Array<{ value: StartingMethod; label: string }> = [
  { value: "manual", label: "Enter stock manually" },
  { value: "marketplace", label: "Import stock from marketplace" },
  { value: "file", label: "Import inventory file" },
];

type Draft = { mode: Mode; locationName: string; warehouseName: string; city: string; address: string; startingMethod: StartingMethod };

export const StepInventory: React.FC = () => {
  const setup = useInventorySetup();
  if (setup.isPending) return <StepLoading label="Loading inventory setup" />;
  if (setup.isError) return <StepError error={setup.error} onRetry={() => void setup.refetch()} />;
  return <InventoryForm setup={setup.data} />;
};

const InventoryForm: React.FC<{ setup: InventorySetup }> = ({ setup }) => {
  const { canWrite, advance } = useWizard();
  const status = useStepStatus("inventory");
  const saved = useSavedDraft<Draft>("inventory");
  const save = useSaveInventory();
  const skip = useSkipStep();

  const loc = setup.location;
  const savedMode: Mode | null = setup.mode;
  const [mode, setMode] = useState<Mode>(saved?.mode ?? savedMode ?? "simple");
  const [locationName, setLocationName] = useState(saved?.locationName ?? (savedMode === "simple" && loc ? loc.name : "Home Inventory"));
  const [warehouseName, setWarehouseName] = useState(saved?.warehouseName ?? (savedMode === "warehouse" && loc ? loc.name : ""));
  const [city, setCity] = useState(saved?.city ?? (savedMode === "warehouse" && loc ? [loc.city, loc.state].filter(Boolean).join(", ") : ""));
  const [address, setAddress] = useState(saved?.address ?? (savedMode === "warehouse" && loc?.address ? loc.address : ""));
  const [startingMethod, setStartingMethod] = useState<StartingMethod>(saved?.startingMethod ?? setup.startingMethod ?? "manual");
  const [touched, setTouched] = useState(false);

  useWizardDraft(() => ({ mode, locationName, warehouseName, city, address, startingMethod }));

  const modes = setup.options.modes?.length ? setup.options.modes : FALLBACK_MODES;
  const methods = setup.options.startingMethods?.length ? setup.options.startingMethods : FALLBACK_METHODS;

  const local: Record<string, string> = {};
  if (mode === "simple") {
    const n = locationName.trim().length;
    if (n < 2 || n > 80) local.locationName = "Give the location a name of 2 to 80 characters.";
  } else {
    const n = warehouseName.trim().length;
    if (n < 2 || n > 80) local["warehouse.name"] = "Give the warehouse a name of 2 to 80 characters.";
    if (city.trim().length > 120) local["warehouse.location"] = "Keep the location under 120 characters.";
    if (address.trim().length > 300) local["warehouse.address"] = "Keep the address under 300 characters.";
  }

  const serverFields = save.error instanceof ApiError ? save.error.fields : null;
  const fieldError = (key: string) => (touched ? local[key] : undefined) ?? serverFields?.[key];
  const generalError = (save.isError && !serverFields ? save.error : null) ?? skip.error;
  const busy = save.isPending || skip.isPending;

  const handleContinue = () => {
    setTouched(true);
    if (Object.keys(local).length || busy || !canWrite) return;
    const input: InventoryInput =
      mode === "simple"
        ? { mode: "simple", startingMethod, locationName: locationName.trim() }
        : {
            mode: "warehouse",
            startingMethod,
            warehouse: {
              name: warehouseName.trim(),
              ...(city.trim() ? { location: city.trim() } : {}),
              ...(address.trim() ? { address: address.trim() } : {}),
            },
          };
    save.mutate(input, { onSuccess: (res) => advance(res.state) });
  };

  return (
    <div className="relative w-full min-h-[940px] bg-[#FFFFFF] flex flex-col justify-start overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 85% at 90% 95%, rgba(45, 45, 45, 0.42) 0%, rgba(130, 130, 130, 0.28) 32%, rgba(215, 215, 215, 0.12) 60%, rgba(255, 255, 255, 0) 80%), linear-gradient(175deg, #FFFFFF 0%, #FFFFFF 38%, #F7F7F7 58%, #E5E5E5 82%, #CCCCCC 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-6 sm:px-12 xl:px-[144px] pt-[40px] pb-[32px] flex flex-col gap-[32px]">
        <div className="flex flex-col gap-[16px] w-full">
          <h1 className="text-[32px] sm:text-[38px] lg:text-[40px] font-semibold leading-[1.15] text-[#000000] tracking-[-0.02em]">
            Let's set up your inventory.
          </h1>
          <p className="text-[14px] font-normal leading-[1.65] text-[#666666] max-w-[815px]">
            Start with the stock you have today. You can add warehouses, locations and advanced inventory controls as your business grows.
          </p>
        </div>

        <div className="border-t border-[#EAEAEA] pt-[24px] grid grid-cols-1 lg:grid-cols-12 gap-[64px] items-start w-full">
          {/* Left Column: Inventory configuration */}
          <div className="lg:col-span-7 flex flex-col gap-[24px] w-full max-w-[720px]">
            <div className="flex flex-col gap-[16px] w-full">
              <h2 id="onb-inv-mode" className="text-[18px] font-semibold leading-[1.45] text-[#000000]">
                How do you manage your inventory?
              </h2>

              <div role="radiogroup" aria-labelledby="onb-inv-mode" className="grid grid-cols-1 sm:grid-cols-2 gap-[16px] w-full">
                {modes.map((m) => {
                  const selected = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!canWrite}
                      onClick={() => setMode(m.value)}
                      className={cn(
                        "relative w-full min-h-[176px] rounded-[12px] p-[20px_16px] flex flex-row items-start gap-[10px] cursor-pointer transition-all text-left box-border disabled:cursor-not-allowed",
                        selected ? "bg-[#F5F5F5] border border-[#000000]" : "bg-[#FFFFFF] border border-[#EAEAEA] hover:border-[#CCCCCC]",
                      )}
                    >
                      <div className="w-[16px] h-[16px] shrink-0 mt-[2px]">{m.value === "simple" ? <SimpleIcon /> : <WarehouseIcon />}</div>

                      <div className="flex-1 flex flex-col justify-between h-full gap-3">
                        <div className="flex flex-col gap-[3px]">
                          <span className="text-[16px] font-semibold leading-[1.65] text-[#000000]">{m.label}</span>
                          <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">{m.description}</p>
                        </div>
                        <div className="text-[11px] font-normal leading-[1.45] text-[#666666]">
                          <p>{m.traits.slice(0, 2).join(" · ")}</p>
                          {m.traits[2] && <p>{m.traits[2]}</p>}
                        </div>
                      </div>

                      {selected && (
                        <div className="w-[14px] h-[14px] shrink-0 mt-[2px]">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                            <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="#0A0A0A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "simple" ? (
              <div className="flex flex-col gap-[20px] w-full">
                <TextField
                  id="onb-inv-location"
                  label="Inventory location name"
                  value={locationName}
                  onChange={setLocationName}
                  disabled={!canWrite}
                  maxLength={80}
                  placeholder="Home Inventory"
                  error={fieldError("locationName")}
                  strong
                />
                <StartingMethodGroup methods={methods} value={startingMethod} onChange={setStartingMethod} disabled={!canWrite} />
                <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                  Your inventory will become the central stock source for connected marketplaces.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-[20px] w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px] w-full">
                  <TextField
                    id="onb-inv-wh-name"
                    label="Warehouse name"
                    value={warehouseName}
                    onChange={setWarehouseName}
                    disabled={!canWrite}
                    maxLength={80}
                    placeholder="Main Warehouse"
                    error={fieldError("warehouse.name")}
                    strong
                  />
                  <TextField
                    id="onb-inv-wh-city"
                    label="Location: City / State"
                    value={city}
                    onChange={setCity}
                    disabled={!canWrite}
                    maxLength={120}
                    placeholder="e.g. Mumbai, Maharashtra"
                    error={fieldError("warehouse.location")}
                    strong={!!city}
                  />
                </div>
                <TextField
                  id="onb-inv-wh-address"
                  label="Warehouse address (optional)"
                  value={address}
                  onChange={setAddress}
                  disabled={!canWrite}
                  maxLength={300}
                  placeholder="Street address, building or landmark"
                  error={fieldError("warehouse.address")}
                />
                <StartingMethodGroup methods={methods} value={startingMethod} onChange={setStartingMethod} disabled={!canWrite} />
                <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                  Advanced locations such as zones, racks, shelves and bins can be configured later.
                </p>
              </div>
            )}
          </div>

          <InventoryOverviewPanel />
        </div>

        <div className="w-full max-w-[1152px] min-h-[48px] rounded-[8px] bg-[#F5F5F5] border border-[#EAEAEA] px-[14px] py-[12px] flex flex-row items-center gap-[10px] box-border">
          <div className="w-[16px] h-[16px] shrink-0 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <circle cx="8" cy="8" r="6.75" stroke="#000000" strokeWidth="1.3" />
              <line x1="8" y1="4.5" x2="8" y2="8.5" stroke="#000000" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="8" cy="11.25" r="0.75" fill="#000000" />
            </svg>
          </div>
          <span className="text-[12px] font-normal leading-[1.45] text-[#333333]">
            Your inventory will stay synchronized across connected sales channels.
          </span>
        </div>

        <InlineError error={generalError} />

        <div className="w-full border-t border-[#EDEDED] pt-[24px] pb-[16px] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">You can change inventory settings later.</p>

          <div className="flex flex-row items-center gap-[16px]">
            {status !== "completed" && (
              <button
                type="button"
                disabled={busy || !canWrite}
                onClick={() => skip.mutate("inventory", { onSuccess: (state) => advance(state) })}
                className="w-[112px] h-[40px] px-[16px] rounded-[8px] bg-white border border-[#D6D6D6] flex items-center justify-center text-[12px] font-semibold leading-[1.45] text-[#000000] hover:bg-[#F9F9F9] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {skip.isPending ? "Skipping…" : "Skip for now"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={handleContinue}
              className="w-[168px] h-[44px] px-[16px] rounded-[12px] bg-[#0A0A0A] flex items-center justify-center gap-1.5 text-[13px] font-semibold leading-[1.45] text-[#FFFFFF] hover:bg-[#262626] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {save.isPending && <Spinner />}
              {save.isPending ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** the numbers of the stock the seller really has (GET /onboarding/inventory/overview) */
const InventoryOverviewPanel: React.FC = () => {
  const overview = useInventoryOverview();
  const data = overview.data;
  const metrics: Array<[string, number | undefined]> = [
    ["Products", data?.products],
    ["Units", data?.units],
    ["Low stock", data?.lowStock],
    ["Out of stock", data?.outOfStock],
  ];
  const channels = data?.syncedChannels ?? [];

  return (
    <div className="lg:col-span-5 flex flex-col gap-[24px] w-full lg:border-l lg:border-[#EAEAEA] lg:pl-[32px] max-w-[368px]">
      <div className="flex flex-row justify-between items-center w-full h-[16px]">
        <span className="text-[11px] font-medium leading-[1.45] uppercase tracking-[0.04em] text-[#666666]">INVENTORY OVERVIEW</span>
        <span className="text-[11px] font-normal leading-[1.45] text-[#666666]">Live</span>
      </div>

      {overview.isError ? (
        <div className="flex flex-col items-start gap-2">
          <InlineError error={overview.error} className="w-full" />
          <button type="button" onClick={() => void overview.refetch()} className="h-[32px] rounded-[8px] border border-[#D6D6D6] px-3 text-[12px] font-semibold">
            Try again
          </button>
        </div>
      ) : (
        <dl className="flex flex-col w-full" aria-busy={overview.isPending}>
          {metrics.map(([label, value]) => (
            <div key={label} className="h-[64px] border-b border-[#EAEAEA] flex flex-row justify-between items-center w-full">
              <dt className="text-[13px] font-normal leading-[1.45] text-[#666666]">{label}</dt>
              <dd className="text-[24px] font-semibold leading-[32px] text-[#000000]">{value === undefined ? "–" : value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      )}

      {data && (
        <p className="text-[11px] font-normal leading-[1.45] text-[#8E8E8E]">
          {data.products === 0
            ? "No products or stock yet. These numbers fill in as you add or import stock."
            : `Counted from your stock. Low stock means at or under each product's reorder level (${data.lowStockThreshold} units when none is set).`}
        </p>
      )}

      <div className="flex flex-col items-center pt-[8px] w-full">
        <div className="w-[200px] h-[56px] rounded-[8px] bg-[#F5F5F5] border border-[#EAEAEA] flex flex-col items-center justify-center gap-[4px] box-border shadow-xs">
          <span className="text-[12px] font-semibold leading-[1.45] text-[#000000]">Master Inventory</span>
          <span className="text-[10px] font-normal leading-[1.45] text-[#666666]">One central stock source</span>
        </div>

        {channels.length > 0 ? (
          <div className="w-[301px] flex flex-col items-center">
            <svg width="301" height="36" viewBox="0 0 301 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" aria-hidden>
              <path d="M150.5 0V20M0.5 36V20H300.5V36M100.5 20V36M200.5 20V36" stroke="#BDBDBD" />
            </svg>
            <ul className="w-[301px] mt-[6px] flex justify-between text-[11px] font-normal leading-[1.45] text-[#8E8E8E]" aria-label="Channels kept in sync">
              {channels.slice(0, 4).map((c) => (
                <li key={c.marketplace} className="text-center">
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="pt-3 text-[11px] text-[#8E8E8E] text-center">Connected channels will show here, kept in sync with this stock.</p>
        )}
      </div>
    </div>
  );
};

const TextField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
  error?: string;
  strong?: boolean;
}> = ({ id, label, value, onChange, disabled, maxLength, placeholder, error, strong }) => (
  <div className="flex flex-col gap-[6px] w-full">
    <label htmlFor={id} className="text-[12px] font-medium leading-[1.45] text-[#333333]">
      {label}
    </label>
    <div className={cn("w-full h-[40px] px-[12px] bg-[#FFFFFF] border rounded-[8px] flex items-center box-border", error ? "border-[#B42318]" : strong ? "border-[#666666]" : "border-[#D1D5DB] focus-within:border-[#666666]")}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={!!error}
        className="w-full text-[13px] font-normal leading-[1.45] text-[#000000] placeholder:text-[#666666] bg-transparent outline-none border-none p-0 disabled:opacity-60"
      />
    </div>
    <FieldError message={error} />
  </div>
);

const StartingMethodGroup: React.FC<{
  methods: Array<{ value: StartingMethod; label: string }>;
  value: StartingMethod;
  onChange: (v: StartingMethod) => void;
  disabled?: boolean;
}> = ({ methods, value, onChange, disabled }) => (
  <div className="flex flex-col gap-[8px] w-full">
    <span id="onb-inv-method" className="text-[12px] font-medium leading-[1.45] text-[#333333]">
      Starting inventory method
    </span>
    <div role="radiogroup" aria-labelledby="onb-inv-method" className="flex flex-col gap-[4px] w-full">
      {methods.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          disabled={disabled}
          onClick={() => onChange(m.value)}
          className="w-full h-[40px] flex flex-row items-center gap-[8px] cursor-pointer text-left disabled:cursor-not-allowed"
        >
          <div className="w-[32px] h-[32px] rounded-[16px] flex items-center justify-center shrink-0">
            <div className="w-[18px] h-[18px] rounded-[9px] bg-white border border-[#000000] flex items-center justify-center box-border">
              {value === m.value && <div className="w-[8px] h-[8px] rounded-[4px] bg-[#000000]" />}
            </div>
          </div>
          <span className={cn("text-[13px] leading-[1.45] text-[#000000]", value === m.value ? "font-semibold" : "font-normal")}>{m.label}</span>
        </button>
      ))}
    </div>
  </div>
);

const SimpleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M8 1.5L13.5 4.5V11.5L8 14.5L2.5 11.5V4.5L8 1.5Z" stroke="#0A0A0A" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M8 1.5V14.5M2.5 4.5L8 8L13.5 4.5M2.5 11.5L8 8L13.5 11.5" stroke="#0A0A0A" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const WarehouseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M2 5.5L8 2L14 5.5V13.5H2V5.5Z" stroke="#0A0A0A" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M6 13.5V9.5H10V13.5" stroke="#0A0A0A" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M2 5.5H14" stroke="#0A0A0A" strokeWidth="1.3" />
  </svg>
);
