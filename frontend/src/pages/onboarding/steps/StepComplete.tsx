import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import type { Readiness } from "@/api/onboarding.api";
import { useCompleteOnboarding, useReadiness } from "@/hooks/useOnboarding";
import { InlineError, Spinner, StepError, StepLoading } from "@/components/onboarding/wizard";
import { useWizard } from "@/components/onboarding/wizardContext";

const STATUS_TEXT: Record<Readiness["items"][number]["status"], string> = {
  complete: "Complete",
  connected: "Connected",
  ready: "Ready",
  configured: "Configured",
  needs_attention: "Needs attention",
  skipped: "Skipped",
  pending: "Not set up yet",
};
const DONE: Array<Readiness["items"][number]["status"]> = ["complete", "connected", "ready", "configured"];

export const StepComplete: React.FC = () => {
  const readiness = useReadiness();
  if (readiness.isPending) return <StepLoading label="Checking your setup" />;
  if (readiness.isError) return <StepError error={readiness.error} onRetry={() => void readiness.refetch()} />;
  return <ReadyView readiness={readiness.data} />;
};

const ReadyView: React.FC<{ readiness: Readiness }> = ({ readiness }) => {
  const { progress, canWrite, goTo } = useWizard();
  const navigate = useNavigate();
  const complete = useCompleteOnboarding();

  const businessName = progress.business.businessName;
  const doneCount = readiness.items.filter((i) => DONE.includes(i.status)).length;
  const allDone = readiness.percentComplete >= 100;
  const firstOpen = readiness.items.find((i) => !DONE.includes(i.status));

  const finish = () => {
    if (!canWrite || !readiness.canGoToDashboard || complete.isPending) return;
    complete.mutate(undefined, { onSuccess: () => navigate(ROUTES.DASHBOARD, { replace: true }) });
  };
  const review = () => goTo(firstOpen?.key ?? "business");

  const goButton = (className: string) => (
    <Button type="button" onClick={finish} disabled={!canWrite || !readiness.canGoToDashboard || complete.isPending} className={className}>
      {complete.isPending ? <Spinner /> : null}
      <span>{complete.isPending ? "Opening…" : "Go to dashboard"}</span>
      {!complete.isPending && <ArrowRight className="h-4 w-4" />}
    </Button>
  );

  return (
    <div className="relative w-full min-h-[calc(100vh-104px)] bg-[#FFFFFF] flex flex-col justify-start overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 85% at 90% 95%, rgba(45, 45, 45, 0.42) 0%, rgba(130, 130, 130, 0.28) 32%, rgba(215, 215, 215, 0.12) 60%, rgba(255, 255, 255, 0) 80%), linear-gradient(175deg, #FFFFFF 0%, #FFFFFF 38%, #F7F7F7 58%, #E5E5E5 82%, #CCCCCC 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-12">
        {/* Top Banner & Readiness Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">{allDone ? "Setup Complete" : "Setup Review"}</span>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0A] leading-tight">
                {allDone ? "Your business is ready to run." : "Your workspace is ready to open."}
              </h1>
              <p className="text-sm text-[#666666] leading-relaxed pt-1">
                {allDone ? (
                  <>
                    Your essential commerce setup for <strong className="text-black">{businessName}</strong> is complete. You can now manage products, inventory, orders, fulfillment and sales channels from one workspace.
                  </>
                ) : (
                  <>
                    <strong className="text-black">{businessName}</strong> has {doneCount} of {readiness.items.length} setup areas done. You can open your workspace now and finish the rest from there whenever you like.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-4 pt-4">
              <div>
                <h3 className="text-sm font-bold text-[#0A0A0A]">Start from your workspace.</h3>
                <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">
                  Your dashboard will surface what needs attention first, so you can focus on running and growing your business.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {goButton("h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2")}
                <Button type="button" variant="outline" onClick={review} className="h-11 px-6 rounded-lg text-xs font-semibold border-[#E5E7EB] text-[#0A0A0A] hover:bg-neutral-50">
                  Review setup
                </Button>
              </div>
              <InlineError error={complete.error} />
              {!readiness.canGoToDashboard && (
                <p role="status" className="text-xs text-[#8A5A00]">
                  Finish your business profile first. The rest can wait.
                </p>
              )}
            </div>
          </div>

          {/* Right Readiness Card */}
          <div className="lg:col-span-5 rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-6 shadow-2xs">
            <div>
              <h2 className="text-base font-bold text-[#0A0A0A]">Setup readiness</h2>
              <p className="text-xs text-[#666666] mt-0.5">{allDone ? "Everything essential is configured." : "Open items can be finished any time."}</p>
            </div>

            <ul className="space-y-3">
              {readiness.items.map((item) => {
                const done = DONE.includes(item.status);
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => goTo(item.key)}
                      aria-label={`${item.title}: ${STATUS_TEXT[item.status]}. Open this step`}
                      className="w-full flex items-center justify-between rounded-xl border border-[#EAEAEA] p-3 text-left hover:bg-neutral-50/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className={done ? "flex h-5 w-5 items-center justify-center rounded bg-black text-white" : "flex h-5 w-5 items-center justify-center rounded border border-[#CCCCCC] bg-white"}>
                          {done && <Check className="h-3 w-3 stroke-[2.5]" />}
                        </div>
                        <div>
                          <div className="text-[10px] text-[#666666] uppercase tracking-wider font-semibold">{item.group}</div>
                          <div className="text-xs font-semibold text-[#0A0A0A]">{item.title}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-medium text-[#666666]">
                        <span>{STATUS_TEXT[item.status]}</span>
                        <ArrowRight className="h-3 w-3 text-neutral-400" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-1.5 pt-2 border-t border-[#EAEAEA]">
              <div
                role="progressbar"
                aria-label="Essential setup"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={readiness.percentComplete}
                className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden"
              >
                <div className="h-full bg-black rounded-full" style={{ width: `${readiness.percentComplete}%` }} />
              </div>
              <p className="text-[11px] font-semibold text-[#0A0A0A] text-right">{readiness.percentComplete}% essential setup complete</p>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="border-t border-[#EAEAEA] pt-8 space-y-6">
          <h2 className="text-base font-bold text-[#0A0A0A]">What happens next</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {readiness.whatHappensNext.map((step, i) => (
              <div key={step.title} className="space-y-1.5">
                <span className="text-xs font-bold text-neutral-400">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-sm font-semibold text-[#0A0A0A]">{step.title}</h3>
                <p className="text-xs text-[#666666] leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Ready to get started bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#EAEAEA] pt-6">
          <h3 className="text-sm font-bold text-[#0A0A0A]">Ready to get started?</h3>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={review} className="h-11 px-6 rounded-lg text-xs font-semibold border-[#E5E7EB] text-[#0A0A0A] hover:bg-neutral-50">
              Review setup
            </Button>
            {goButton("h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2")}
          </div>
        </div>
      </div>
    </div>
  );
};
