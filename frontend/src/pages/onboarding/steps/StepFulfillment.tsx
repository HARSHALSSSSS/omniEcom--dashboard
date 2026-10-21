import React, { useState } from "react";
import type { FulfillmentMethod, FulfillmentPreference, FulfillmentSetup, OnboardingProgress } from "@/api/onboarding.api";
import { useFulfillment, useSaveFulfillment, useSkipStep } from "@/hooks/useOnboarding";
import { InlineError, Spinner, StepError, StepLoading } from "@/components/onboarding/wizard";
import { useSavedDraft, useStepStatus, useWizard, useWizardDraft } from "@/components/onboarding/wizardContext";
import { cn } from "@/utils/cn";

const UNAVAILABLE_TEXT: Record<string, string> = {
  no_marketplace_connected: "Not available yet: connect a marketplace first",
  connection_required: "Not available yet: connect a shipping provider first",
};

type Draft = { defaultMethod: FulfillmentMethod; defaultPreference: FulfillmentPreference; overrides: Record<string, FulfillmentMethod> };

export const StepFulfillment: React.FC = () => {
  const setup = useFulfillment();
  if (setup.isPending) return <StepLoading label="Loading fulfillment options" />;
  if (setup.isError) return <StepError error={setup.error} onRetry={() => void setup.refetch()} />;
  return <FulfillmentForm setup={setup.data} />;
};

const FulfillmentForm: React.FC<{ setup: FulfillmentSetup }> = ({ setup }) => {
  const { canWrite, advance } = useWizard();
  const status = useStepStatus("fulfillment");
  const saved = useSavedDraft<Draft>("fulfillment");
  const save = useSaveFulfillment();
  const skip = useSkipStep();

  const [method, setMethod] = useState<FulfillmentMethod>(saved?.defaultMethod ?? setup.defaultMethod);
  const [preference, setPreference] = useState<FulfillmentPreference>(saved?.defaultPreference ?? setup.defaultPreference);
  const [overrides, setOverrides] = useState<Record<string, FulfillmentMethod>>(saved?.overrides ?? setup.overrides);
  const [editing, setEditing] = useState<string | null>(null);
  /** the server saved it but warned: show the warnings before moving on */
  const [saved_, setSaved] = useState<{ state: OnboardingProgress; warnings: FulfillmentSetup["warnings"] } | null>(null);

  useWizardDraft(() => ({ defaultMethod: method, defaultPreference: preference, overrides }));

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setSaved(null);
    setter(v);
  };

  const methodLabel = (m: FulfillmentMethod) => setup.methods.find((o) => o.value === m)?.label ?? m;
  const selectedOption = setup.methods.find((m) => m.value === method);
  const unavailableNote = selectedOption && !selectedOption.available ? (UNAVAILABLE_TEXT[selectedOption.unavailableReason ?? ""] ?? "Not available yet") : null;

  const marketplaceRows = setup.preview.filter((p) => p.kind === "marketplace");
  const providers = setup.connections.thirdParty.providers;
  const busy = save.isPending || skip.isPending;

  const handleContinue = () => {
    if (saved_) return advance(saved_.state);
    if (busy || !canWrite) return;
    save.mutate(
      { defaultMethod: method, defaultPreference: preference, overrides },
      {
        onSuccess: (res) => {
          if (res.fulfillment.warnings.length) setSaved({ state: res.state, warnings: res.fulfillment.warnings });
          else advance(res.state);
        },
      },
    );
  };

  return (
    <div className="relative w-full min-h-[1012px] bg-[#FFFFFF] flex flex-col justify-start overflow-hidden">
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
            How will you fulfill your orders?
          </h1>
          <p className="text-[14px] font-normal leading-[1.65] text-[#666666] max-w-[815px]">
            Choose how orders should be shipped. You can change these preferences later for individual marketplaces, warehouses or products.
          </p>
        </div>

        <div className="border-t border-[#EAEAEA] pt-[24px] grid grid-cols-1 lg:grid-cols-12 gap-[64px] items-start w-full">
          {/* Left Column: Fulfillment configuration */}
          <div className="lg:col-span-7 flex flex-col gap-[24px] w-full max-w-[720px]">
            <div className="flex flex-col gap-[16px] w-full">
              <h2 id="onb-ful-method" className="text-[18px] font-semibold leading-[1.45] text-[#000000]">
                Default fulfillment method
              </h2>

              <div role="radiogroup" aria-labelledby="onb-ful-method" className="flex flex-col gap-[8px] w-full">
                {setup.methods.map((opt) => {
                  const isSelected = method === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!canWrite}
                      onClick={() => edit(setMethod)(opt.value)}
                      className={cn(
                        "w-full min-h-[96px] rounded-[12px] p-[12px] flex flex-row items-center gap-[8px] cursor-pointer transition-all text-left box-border disabled:cursor-not-allowed",
                        isSelected ? "bg-[#F5F5F5] border border-[#000000]" : "bg-[#FFFFFF] border border-[#EAEAEA] hover:border-[#CCCCCC]",
                      )}
                    >
                      <div className="w-[32px] h-[32px] rounded-[16px] flex items-center justify-center shrink-0">
                        <div className="w-[18px] h-[18px] rounded-[9px] bg-white border border-[#000000] flex items-center justify-center box-border">
                          {isSelected && <div className="w-[8px] h-[8px] rounded-[4px] bg-[#000000]" />}
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-center min-w-0">
                        <span className="text-[13px] font-semibold leading-[1.5] text-[#000000]">{opt.label}</span>
                        <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">{opt.description}</p>
                        <p className="text-[11px] font-normal leading-[1.45] text-[#8E8E8E] mt-[2px]">{opt.hint}</p>
                        {!opt.available && (
                          <p className="text-[11px] font-medium leading-[1.45] text-[#8A5A00] mt-[2px]">{UNAVAILABLE_TEXT[opt.unavailableReason ?? ""] ?? "Not available yet"}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {unavailableNote && (
                <p role="status" className="text-[12px] leading-[1.45] text-[#8A5A00]">
                  {unavailableNote}. You can still save this choice and it will start working once the connection exists.
                </p>
              )}
            </div>

            {/* Default preference */}
            <div className="flex flex-col gap-[8px] w-full">
              <div className="flex flex-col gap-[6px] w-full">
                <label htmlFor="onb-ful-pref" className="text-[12px] font-medium leading-[1.45] text-[#333333]">
                  Your default preference
                </label>
                <select
                  id="onb-ful-pref"
                  value={preference}
                  disabled={!canWrite}
                  onChange={(e) => edit(setPreference)(e.target.value as FulfillmentPreference)}
                  className="w-full h-[40px] px-[12px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[13px] font-normal leading-[1.45] text-[#333333] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {setup.preferenceOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">You can override this preference when supported.</p>
            </div>

            {/* Shipping connections */}
            <div className="flex flex-col gap-[8px] w-full pt-[8px]">
              <h2 className="text-[18px] font-semibold leading-[1.45] text-[#000000]">Shipping connections</h2>

              <div className="w-full min-h-[76px] border-b border-[#EAEAEA] flex flex-row items-center justify-between gap-[16px] py-3 box-border">
                <div className="flex flex-col gap-[4px] min-w-0">
                  <span className="text-[13px] font-semibold leading-[1.45] text-[#000000]">Marketplace Shipping</span>
                  <span className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                    {setup.connections.marketplaceShipping.available
                      ? `Available through ${marketplaceRows.map((r) => r.label.replace("Marketplace / ", "")).join(", ")}`
                      : "Available once a marketplace is connected"}
                  </span>
                </div>
                <Badge ok={setup.connections.marketplaceShipping.available} yes="Available" no="Not connected" />
              </div>

              <div className="w-full min-h-[76px] border-b border-[#EAEAEA] flex flex-row items-center justify-between gap-[16px] py-3 box-border">
                <div className="flex flex-col gap-[4px] min-w-0">
                  <span className="text-[13px] font-semibold leading-[1.45] text-[#000000]">Third-party provider</span>
                  <span className="text-[12px] font-normal leading-[1.45] text-[#666666]">
                    {providers.length > 0 ? `${providers.map((p) => p.label).join(", ")} connected` : "No shipping provider connected. You can connect one from Shipping once setup is finished."}
                  </span>
                </div>
                <Badge ok={providers.length > 0} yes="Connected" no="Not connected" />
              </div>
            </div>
          </div>

          {/* Right Column: Shipping overview */}
          <div className="lg:col-span-5 flex flex-col gap-[24px] w-full lg:border-l lg:border-[#EAEAEA] lg:pl-[32px] max-w-[368px]">
            <div className="flex flex-col gap-[16px] w-full">
              <div className="flex flex-row justify-between items-center w-full h-[19px]">
                <span className="text-[13px] font-semibold leading-[1.45] text-[#000000]">Your shipping preferences</span>
                <span className="text-[11px] font-normal leading-[1.45] text-[#666666]">Preview</span>
              </div>

              <ul className="flex flex-col w-full bg-[#FFFFFF] rounded-[8px]">
                {marketplaceRows.map((row) => {
                  const code = row.marketplace ?? "";
                  const effective = overrides[code] ?? method;
                  const isEditing = editing === code;
                  return (
                    <li key={code} className="min-h-[68px] border-b border-[#EAEAEA] flex flex-row items-center justify-between px-[12px] py-2 box-border gap-2">
                      <span className="text-[12px] font-semibold leading-[1.45] text-[#333333]">{row.label}</span>
                      <div className="flex flex-col items-end">
                        {isEditing ? (
                          <select
                            aria-label={`Shipping for ${row.label}`}
                            value={overrides[code] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value as FulfillmentMethod | "";
                              edit(setOverrides)(
                                v
                                  ? { ...overrides, [code]: v }
                                  : Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== code)),
                              );
                              setEditing(null);
                            }}
                            className="h-[30px] rounded-[6px] border border-[#666666] bg-white px-2 text-[11px]"
                          >
                            <option value="">Same as default ({methodLabel(method)})</option>
                            {setup.methods.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <span className="text-[11px] font-normal leading-[1.45] text-[#333333]">
                              {methodLabel(effective)}
                              {code in overrides ? " (override)" : ""}
                            </span>
                            <button
                              type="button"
                              disabled={!canWrite}
                              onClick={() => setEditing(code)}
                              aria-label={`Edit shipping for ${row.label}`}
                              className="text-[11px] font-normal leading-[1.45] text-[#000000] underline hover:text-[#4A4A4A] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}

                <li className="min-h-[68px] border-b border-[#EAEAEA] flex flex-row items-center justify-between px-[12px] py-2 box-border gap-2">
                  <span className="text-[12px] font-semibold leading-[1.45] text-[#333333]">Other orders</span>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-normal leading-[1.45] text-[#333333]">{methodLabel(method)}</span>
                    <span className="text-[11px] font-normal leading-[1.45] text-[#666666]">
                      {setup.preferenceOptions.find((o) => o.value === preference)?.label}
                    </span>
                  </div>
                </li>
              </ul>

              {marketplaceRows.length === 0 && (
                <p className="text-[12px] leading-[1.45] text-[#666666]">Connect a marketplace to set shipping for it separately.</p>
              )}
              <p className="text-[12px] font-normal leading-[1.45] text-[#666666]">Manage advanced shipping rules later</p>
            </div>

            {/* Order process flow */}
            <div className="flex flex-col items-center pt-[8px] gap-[12px] w-full">
              <span className="w-full text-left text-[11px] font-medium leading-[1.45] uppercase tracking-[0.04em] text-[#000000]">FROM ORDER TO DISPATCH</span>

              <ol className="w-full flex flex-col items-center gap-[4px] py-1">
                {setup.flow.map((label, i) => (
                  <li key={label} className="flex flex-col items-center gap-[4px]">
                    <span className="text-[13px] font-normal leading-[1.45] text-[#000000]">{label}</span>
                    {i < setup.flow.length - 1 && (
                      <span aria-hidden className="text-[16px] leading-[18px] text-[#000000]">
                        ↓
                      </span>
                    )}
                  </li>
                ))}
              </ol>

              <p className="w-full text-left text-[11px] font-normal leading-[1.45] text-[#8E8E8E] mt-1">
                One workspace to manage each step, with shipping based on your preferences.
              </p>
            </div>
          </div>
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
            Shipping options may vary by marketplace, product, location and configured provider.
          </span>
        </div>

        {saved_ && (
          <div role="status" className="w-full max-w-[1152px] rounded-[8px] border border-[#F0D9A8] bg-[#FFF8E6] px-[14px] py-[12px] text-[12px] leading-[1.5] text-[#6B4500]">
            <p className="font-semibold">Saved. Heads up:</p>
            <ul className="list-disc pl-5">
              {saved_.warnings.map((w) => (
                <li key={`${w.code}-${w.marketplace ?? ""}`}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        <InlineError error={save.error ?? skip.error} />

        <div className="w-full border-t border-[#EDEDED] pt-[24px] pb-[16px] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">You can configure advanced fulfillment rules from Settings.</p>

          <div className="flex flex-row items-center gap-[16px]">
            {status !== "completed" && !saved_ && (
              <button
                type="button"
                disabled={busy || !canWrite}
                onClick={() => skip.mutate("fulfillment", { onSuccess: (state) => advance(state) })}
                className="w-[112px] h-[40px] px-[16px] rounded-[8px] bg-white border border-[#D6D6D6] flex items-center justify-center text-[12px] font-semibold leading-[1.45] text-[#000000] hover:bg-[#F9F9F9] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {skip.isPending ? "Skipping…" : "Skip for now"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || (!canWrite && !saved_)}
              onClick={handleContinue}
              className="w-[168px] h-[44px] px-[16px] rounded-[12px] bg-[#0A0A0A] flex items-center justify-center gap-1.5 text-[13px] font-semibold leading-[1.45] text-[#FFFFFF] hover:bg-[#262626] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {save.isPending && <Spinner />}
              {save.isPending ? "Saving…" : saved_ ? "Continue anyway" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Badge: React.FC<{ ok: boolean; yes: string; no: string }> = ({ ok, yes, no }) => (
  <div className="min-w-[80px] h-[26px] bg-[#F5F5F5] border border-[#EAEAEA] rounded-[4px] px-[8px] flex flex-row items-center justify-center gap-[5px] shrink-0 box-border">
    {ok && (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M2.5 6.5L4.5 8.5L9.5 3.5" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
    <span className="text-[11px] font-normal leading-[1.45] text-[#333333]">{ok ? yes : no}</span>
  </div>
);
