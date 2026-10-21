import { useCallback, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useOnboardingState, useSaveDraft } from "@/hooks/useOnboarding";
import { STEP_KEYS, type OnboardingProgress, type StepKey } from "@/api/onboarding.api";
import { signOut } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import { InlineError, ReadOnlyNotice, StepError, StepLoading } from "@/components/onboarding/wizard";
import { WizardProvider, useDraftRegistry } from "@/components/onboarding/wizardContext";
import { StepBusiness } from "./steps/StepBusiness";
import { StepChannels } from "./steps/StepChannels";
import { StepProducts } from "./steps/StepProducts";
import { StepInventory } from "./steps/StepInventory";
import { StepFulfillment } from "./steps/StepFulfillment";
import { StepComplete } from "./steps/StepComplete";
import { cn } from "@/utils/cn";

const STEP_LABELS: Record<StepKey, { label: string; width: string }> = {
  business: { label: "01 Business", width: "75px" },
  channels: { label: "02 Sales Channels", width: "109px" },
  products: { label: "03 Products", width: "77px" },
  inventory: { label: "04 Inventory", width: "79px" },
  fulfillment: { label: "05 Fulfillment", width: "100px" },
  ready: { label: "06 Ready", width: "50px" },
};

/** older names of a step in the route: still honoured, redirected to the real slug */
const SLUG_ALIASES: Record<string, StepKey> = { connect: "channels", catalog: "products", complete: "ready" };

const isStepKey = (value: string | undefined): value is StepKey => !!value && (STEP_KEYS as readonly string[]).includes(value);

export default function OnboardingPage() {
  const { step: slug } = useParams<{ step: string }>();
  const state = useOnboardingState();

  if (slug && SLUG_ALIASES[slug]) return <Navigate to={`${ROUTES.ONBOARDING}/${SLUG_ALIASES[slug]}`} replace />;

  if (state.isPending) {
    return (
      <div className="min-h-screen bg-white">
        <StepLoading label="Loading your setup" />
      </div>
    );
  }
  if (state.isError) {
    return (
      <div className="min-h-screen bg-white">
        <StepError error={state.error} onRetry={() => void state.refetch()} />
      </div>
    );
  }
  if (!isStepKey(slug)) return <Navigate to={`${ROUTES.ONBOARDING}/${state.data.resumeStep}`} replace />;

  return <Wizard step={slug} progress={state.data} />;
}

function Wizard({ step, progress }: { step: StepKey; progress: OnboardingProgress }) {
  const navigate = useNavigate();
  const canWrite = useCan("onboarding:write");
  const businessName = useWorkspaceStore((s) => s.user?.businessName);
  const saveDraft = useSaveDraft();
  const draft = useDraftRegistry();
  const [exited, setExited] = useState(false);

  const activeIndex = STEP_KEYS.indexOf(step);
  const resumeIndex = STEP_KEYS.indexOf(progress.resumeStep);

  const goTo = useCallback((target: StepKey) => navigate(`${ROUTES.ONBOARDING}/${target}`), [navigate]);

  const advance = useCallback(
    (state: OnboardingProgress) => {
      const resume = STEP_KEYS.indexOf(state.resumeStep);
      const next = resume > activeIndex ? resume : Math.min(activeIndex + 1, STEP_KEYS.length - 1);
      goTo(STEP_KEYS[next] ?? "business");
    },
    [activeIndex, goTo],
  );

  const handleSaveAndExit = () => {
    const data = draft.ref.current?.() ?? {};
    saveDraft.mutate({ step, data }, { onSuccess: () => setExited(true) });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate(ROUTES.SIGN_IN, { replace: true });
  };

  const reachable = (key: StepKey): boolean => {
    const idx = STEP_KEYS.indexOf(key);
    const status = progress.steps.find((s) => s.key === key)?.status;
    return idx <= resumeIndex || status === "completed" || status === "skipped";
  };

  return (
    <div className="relative w-full min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <header className="h-[104px] w-full border-b border-[#EFEFEF] bg-white flex items-center justify-between px-6 sm:px-12 xl:px-[144px] shrink-0 z-20">
        <span className="text-[18px] font-semibold leading-[22px] text-[#0A0A0A] shrink-0 tracking-normal max-w-[220px] truncate">
          {businessName || "Your workspace"}
        </span>

        <nav aria-label="Setup progress" className="hidden md:flex items-start gap-[12px] h-[28px]">
          {STEP_KEYS.map((key, idx) => {
            const meta = STEP_LABELS[key];
            const status = progress.steps.find((s) => s.key === key)?.status ?? "not_started";
            const isCurrent = idx === activeIndex;
            const isDone = status === "completed";
            const isSkipped = status === "skipped";
            const enabled = reachable(key);
            const text = isDone ? `${meta.label} ✓` : isSkipped ? `${meta.label} (skipped)` : meta.label;

            return (
              <button
                key={key}
                type="button"
                disabled={!enabled}
                aria-current={isCurrent ? "step" : undefined}
                title={text}
                onClick={() => goTo(key)}
                style={{ width: meta.width }}
                className={cn("flex flex-col items-start gap-[10px] h-[28px] text-left shrink-0", enabled ? "cursor-pointer" : "cursor-not-allowed opacity-70")}
              >
                <div style={{ width: meta.width }} className={cn("h-[2px] transition-colors", isCurrent || isDone || isSkipped ? "bg-[#000000]" : "bg-[#EAEAEA]")} />
                <span
                  style={{ width: meta.width }}
                  className={cn("text-[11px] leading-[145%] truncate block transition-colors", isCurrent ? "font-semibold text-[#000000]" : "font-normal text-[#666666]")}
                >
                  {text}
                </span>
              </button>
            );
          })}
        </nav>

        {canWrite ? (
          <button
            type="button"
            onClick={handleSaveAndExit}
            disabled={saveDraft.isPending || exited}
            className="w-[128px] h-[40px] px-4 rounded-[8px] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-[#F7F7F7] transition-colors cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveDraft.isPending ? "Saving…" : "Save & exit"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-[128px] h-[40px] px-4 rounded-[8px] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-[#F7F7F7] transition-colors cursor-pointer shrink-0"
          >
            Sign out
          </button>
        )}
      </header>

      {(saveDraft.isError || !canWrite) && (
        <div className="w-full px-6 sm:px-12 xl:px-[144px] pt-4 flex flex-col gap-2">
          {saveDraft.isError && <InlineError error={saveDraft.error} />}
          {!canWrite && <ReadOnlyNotice onSignOut={() => void handleSignOut()} />}
        </div>
      )}

      <main className="flex-1 flex flex-col justify-start relative z-10">
        {exited ? (
          <SavedAndExited onContinue={() => setExited(false)} onSignOut={() => void handleSignOut()} />
        ) : (
          <WizardProvider value={{ progress, canWrite, step, advance, goTo, registerDraft: draft.register }}>
            {step === "business" && <StepBusiness />}
            {step === "channels" && <StepChannels />}
            {step === "products" && <StepProducts />}
            {step === "inventory" && <StepInventory />}
            {step === "fulfillment" && <StepFulfillment />}
            {step === "ready" && <StepComplete />}
          </WizardProvider>
        )}
      </main>
    </div>
  );
}

/** "Save & exit" worked: the workspace stays closed until setup is done, so say so and offer the two honest exits */
function SavedAndExited({ onContinue, onSignOut }: { onContinue: () => void; onSignOut: () => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-104px)] w-full max-w-[520px] flex-col items-center justify-center gap-5 px-6 text-center">
      <CheckCircle2 className="h-10 w-10 text-[#0A0A0A]" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold tracking-tight text-[#0A0A0A]">Your progress is saved.</h1>
        <p className="text-[13px] leading-[1.6] text-[#666666]">
          Sign back in any time and you will pick up exactly where you stopped. Your workspace opens as soon as setup is finished.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onSignOut} className="h-[42px] rounded-[10px] border border-[#D6D6D6] bg-white px-5 text-[12px] font-semibold text-[#000000] hover:bg-[#F9F9F9]">
          Sign out
        </button>
        <button type="button" onClick={onContinue} className="h-[42px] rounded-[10px] bg-[#0A0A0A] px-5 text-[12px] font-semibold text-white hover:bg-[#1F1F1F]">
          Continue setup
        </button>
      </div>
    </div>
  );
}
