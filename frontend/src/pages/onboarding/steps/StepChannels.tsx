import React, { useState } from "react";
import { Check } from "lucide-react";
import type { OnboardingChannel } from "@/api/onboarding.api";
import { useChannels, useSaveChannels, useSkipStep } from "@/hooks/useOnboarding";
import { ConnectChannelDialog } from "@/components/onboarding/ConnectChannelDialog";
import { ChannelLogo, InlineError, Spinner, StepError, StepLoading } from "@/components/onboarding/wizard";
import { useSavedDraft, useStepStatus, useWizard, useWizardDraft } from "@/components/onboarding/wizardContext";
import { cn } from "@/utils/cn";

const KIND_LABEL: Record<OnboardingChannel["kind"], string> = {
  marketplace: "Marketplace",
  online_store: "Online store",
  social: "Social selling",
};

export const StepChannels: React.FC = () => {
  const channels = useChannels();
  if (channels.isPending) return <StepLoading label="Loading sales channels" />;
  if (channels.isError) return <StepError error={channels.error} onRetry={() => void channels.refetch()} />;
  return <ChannelsForm items={channels.data.items} />;
};

const ChannelsForm: React.FC<{ items: OnboardingChannel[] }> = ({ items }) => {
  const { canWrite, advance } = useWizard();
  const saved = useSavedDraft<{ selected: string[] }>("channels");
  const status = useStepStatus("channels");
  const save = useSaveChannels();
  const skip = useSkipStep();
  const [dialogFor, setDialogFor] = useState<string | null>(null);

  // the ticks start from what the server remembers (or the draft from "Save & exit"); connected channels are always ticked
  const [picked, setPicked] = useState<string[]>(() => saved?.selected ?? items.filter((i) => i.selected).map((i) => i.code));
  const live = items.map((i) => ({ ...i, ticked: i.connection === "connected" || picked.includes(i.code) }));
  const tickedCodes = live.filter((i) => i.ticked).map((i) => i.code);

  useWizardDraft(() => ({ selected: tickedCodes }));

  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const connectedCount = live.filter((i) => i.connection === "connected").length;
  const toConnect = live.filter((i) => i.ticked && i.availability === "available" && i.connection !== "connected").length;
  const interested = live.filter((i) => i.ticked && i.availability === "coming_soon").length;

  const busy = save.isPending || skip.isPending;
  const error = save.error ?? skip.error;
  const dialogChannel = items.find((i) => i.code === dialogFor) ?? null;

  const handleContinue = () => {
    if (busy || !canWrite) return;
    save.mutate(tickedCodes, { onSuccess: (res) => advance(res.state) });
  };
  const handleSkip = () => {
    if (busy || !canWrite) return;
    skip.mutate("channels", { onSuccess: (state) => advance(state) });
  };

  return (
    <div className="relative w-full min-h-[calc(100vh-104px)] bg-[#FFFFFF] flex flex-col justify-center overflow-hidden">
      {/* Editorial background (dark left column backdrop - completely clean black) */}
      <div className="pointer-events-none hidden lg:block absolute left-0 top-0 bottom-0 w-[519px] bg-[#0A0A0A] z-0" />

      {/* Atmospheric gradient restricted ONLY to the right side */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 left-0 lg:left-[519px] z-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 85% at 90% 95%, rgba(45, 45, 45, 0.42) 0%, rgba(130, 130, 130, 0.28) 32%, rgba(215, 215, 215, 0.12) 60%, rgba(255, 255, 255, 0) 80%), linear-gradient(175deg, #FFFFFF 0%, #FFFFFF 38%, #F7F7F7 58%, #E5E5E5 82%, #CCCCCC 100%)",
        }}
      />

      <div className="relative z-10 w-full flex flex-col lg:flex-row items-start justify-start pt-[56px] pb-[40px] pl-6 sm:pl-16 lg:pl-[110px] pr-6 sm:pr-12 lg:pr-[72px] xl:pr-[96px] gap-[32px] lg:gap-[80px] xl:gap-[100px]">
        {/* Left Column: Protruding pure black rounded card */}
        <div className="relative shrink-0 flex items-center w-full lg:w-auto px-4 sm:px-8 lg:px-0">
          <div className="w-full lg:w-[500px] xl:w-[555px] min-h-[680px] lg:h-[750px] bg-[#000000] rounded-[32px] lg:rounded-none lg:rounded-r-[42px] px-8 lg:px-[60px] xl:px-[72px] pt-8 lg:pt-10 pb-8 lg:pb-10 text-white flex flex-col justify-between shrink-0 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium leading-none uppercase text-[#737373] tracking-[0.08em]">
                SALES CHANNELS
              </span>
              <h1 className="mt-5 text-[38px] sm:text-[44px] xl:text-[48px] font-bold leading-[1.08] text-white tracking-[-0.025em]">
                Your channels.
                <br />
                One workspace.
              </h1>
              <p className="mt-4 text-[13.5px] font-normal leading-[1.6] text-[#8E8E8E] max-w-[310px]">
                Bring the places you sell into one connected view. Start with what matters to your business.
              </p>

              <div className="mt-12 flex flex-col">
                <div className="flex items-center justify-between py-1 cursor-default">
                  <span className="text-[15px] font-normal leading-none text-[#737373] tracking-[0.02em]">
                    YOUR BUSINESS
                  </span>
                  <Check className="h-4 w-4 text-[#737373]" />
                </div>
                <div className="h-[1px] w-full bg-[#1F1F1F] my-4" />
                <div className="flex items-center justify-between py-1 cursor-default">
                  <span className="text-[15px] font-semibold leading-none text-white tracking-[0.02em]">
                    YOUR CHANNELS
                  </span>
                  <span className="text-[16px] font-light leading-none text-white">→</span>
                </div>
                <div className="h-[1px] w-full bg-[#1F1F1F] my-4" />
                <div className="flex flex-col pt-1">
                  <span className="text-[15px] font-normal leading-none text-[#737373] tracking-[0.02em]">
                    YOUR OPERATIONS
                  </span>
                  <div className="flex items-center gap-5 mt-4 text-[11px] font-normal leading-none text-[#737373]">
                    <span>Products</span>
                    <span>Orders</span>
                    <span>Inventory</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 text-[11.5px] font-normal leading-none text-[#737373]">
              Connect at your own pace.
              <br />
              <span className="text-[#555555]">One channel or many. Your choice.</span>
            </div>
          </div>
        </div>

        {/* Right channel selection container */}
        <div className="flex-1 min-w-0 w-full flex items-start justify-start mt-8 lg:mt-0">
          <div className="w-full flex flex-col space-y-5">
            <div>
              <h2 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-[#0A0A0A]">
                Where do you sell today?
              </h2>
              <p className="mt-1.5 text-[13px] text-[#737373]">
                Connect your existing sales channels and manage them from one workspace.
              </p>
            </div>

            {/* Section header */}
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <span className="text-[13px] font-bold text-[#0A0A0A]">
                  Choose any channels you sell on
                </span>
                <p className="text-[11px] text-[#737373]">
                  Select one or more. Connect each separately, or skip this step.
                </p>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373]">
                OPTIONAL
              </span>
            </div>

            {/* Channel cards */}
            {items.length === 0 ? (
              <p className="rounded-[12px] border border-dashed border-[#D6D6D6] bg-white px-4 py-6 text-center text-[13px] text-[#737373]">
                No sales channels are available right now. You can skip this step and add channels later from your workspace.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 pt-1" aria-label="Sales channels">
                {live.map((ch) => {
                  const isConnected = ch.connection === "connected";
                  const comingSoon = ch.availability === "coming_soon";
                  const needsAttention = ch.connection === "needs_attention";
                  const checkboxId = `onb-channel-${ch.code}`;

                  return (
                    <li
                      key={ch.code}
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between rounded-[18px] px-5 py-4 transition-all gap-4 bg-white",
                        isConnected ? "border border-[#0A0A0A]" : "border border-[#EFEFEF] hover:border-[#D6D6D6]",
                      )}
                    >
                      {/* Left: Checkbox + Logo + Info */}
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          id={checkboxId}
                          role="checkbox"
                          aria-checked={ch.ticked}
                          aria-label={comingSoon ? `Tell me when ${ch.name} is available` : `Select ${ch.name}`}
                          disabled={!canWrite || isConnected}
                          onClick={() => toggle(ch.code)}
                          className="cursor-pointer shrink-0 disabled:cursor-not-allowed"
                        >
                          {ch.ticked ? (
                            <div className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-black text-white">
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                            </div>
                          ) : (
                            <div className="h-5 w-5 rounded-[6px] border border-[#CCCCCC] bg-white hover:border-black" />
                          )}
                        </button>

                        {/* Brand Logo / Icon */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-[#EFEFEF] p-2">
                          <ChannelLogo code={ch.code} name={ch.name} />
                        </div>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13.5px] font-bold text-[#0A0A0A]">{ch.name}</span>
                            <span className="text-[12px] text-[#8E8E8E]">/ {KIND_LABEL[ch.kind]}</span>
                          </div>
                          <p className="text-[11.5px] text-[#737373]">{ch.description}</p>
                        </div>
                      </div>

                      {/* Right: Status pill + Action button */}
                      <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                        {isConnected ? (
                          <div className="text-right">
                            <div className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#0A0A0A]">
                              <Check className="h-3.5 w-3.5 stroke-[2]" />
                              <span>Connected</span>
                            </div>
                            <p className="text-[10px] text-[#8E8E8E] mt-0.5">
                              {ch.account?.lastSyncedAt ? `Last sync ${new Date(ch.account.lastSyncedAt).toLocaleString()}` : "Not synced yet"}
                            </p>
                          </div>
                        ) : comingSoon ? (
                          <div className="text-right text-[11.5px] text-[#8E8E8E]">
                            <span>Coming soon</span>
                            <p className="text-[10px] mt-0.5">{ch.ticked ? "We'll let you know" : "Tick to be told"}</p>
                          </div>
                        ) : (
                          <div className={cn("inline-flex items-center gap-1.5 text-[11.5px]", needsAttention ? "text-[#B42318]" : "text-[#8E8E8E]")}>
                            <div className={cn("h-2 w-2 rounded-full border", needsAttention ? "border-[#B42318] bg-[#B42318]" : "border-[#B0B0B0]")} />
                            <span>{needsAttention ? "Needs attention" : "Not connected"}</span>
                          </div>
                        )}

                        {!comingSoon && (
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => setDialogFor(ch.code)}
                            aria-label={`${isConnected ? "Manage" : needsAttention ? "Reconnect" : "Connect"} ${ch.name}`}
                            className="h-9 px-4 text-xs font-semibold rounded-[10px] border border-[#D6D6D6] bg-white text-[#0A0A0A] transition-colors cursor-pointer min-w-[76px] hover:border-black disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isConnected ? "Manage" : needsAttention ? "Reconnect" : "Connect"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Bottom count & helper */}
            <div className="border-t border-[#E5E5E5] pt-4 flex items-center justify-between text-[11px] text-[#737373]">
              <span>
                {connectedCount} connected · {toConnect} selected to connect
                {interested > 0 ? ` · ${interested} coming soon` : ""}
              </span>
            </div>
            <p className="text-[11px] text-[#8E8E8E]">
              You can add more channels anytime from your workspace.
            </p>

            <InlineError error={error} />

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3">
              {status === "completed" ? (
                <span />
              ) : (
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={busy || !canWrite}
                  className="h-[42px] px-6 rounded-[12px] bg-white border border-[#E5E5E5] text-[12px] font-semibold text-[#0A0A0A] hover:bg-neutral-50 cursor-pointer shadow-2xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {skip.isPending ? "Skipping…" : "Skip for now"}
                </button>
              )}
              <button
                type="button"
                onClick={handleContinue}
                disabled={busy || !canWrite}
                className="w-[150px] h-[42px] rounded-[12px] bg-[#0A0A0A] text-white flex items-center justify-center gap-1.5 hover:bg-[#1F1F1F] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {save.isPending ? (
                  <>
                    <Spinner />
                    <span className="text-[12px] font-semibold leading-none text-white">Saving…</span>
                  </>
                ) : (
                  <>
                    <span className="text-[12px] font-semibold leading-none text-white">Continue</span>
                    <span className="text-white text-[13px] leading-none">→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConnectChannelDialog
        channel={dialogChannel}
        onClose={() => setDialogFor(null)}
        onConnected={(code) => setPicked((p) => (p.includes(code) ? p : [...p, code]))}
      />
    </div>
  );
};
