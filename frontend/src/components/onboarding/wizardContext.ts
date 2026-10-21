import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import type { OnboardingProgress, StepKey } from "@/api/onboarding.api";

/** what every step of the wizard gets from the page around it */
export interface WizardContextValue {
  progress: OnboardingProgress;
  /** onboarding:write (administrators only); without it every step is read-only */
  canWrite: boolean;
  step: StepKey;
  /** move on after a save or a skip: the step the server says to resume on wins, otherwise the next one */
  advance: (state: OnboardingProgress) => void;
  goTo: (step: StepKey) => void;
  registerDraft: (getter: (() => Record<string, unknown>) | null) => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);
export const WizardProvider = WizardContext.Provider;

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside the onboarding wizard");
  return ctx;
}

/** tells the page what "Save & exit" should store for the step on screen (the form as typed, never secrets) */
export function useWizardDraft(getData: () => Record<string, unknown>) {
  const { registerDraft } = useWizard();
  const ref = useRef(getData);
  ref.current = getData;
  useEffect(() => {
    registerDraft(() => ref.current());
    return () => registerDraft(null);
  }, [registerDraft]);
}

/** the saved status of a step */
export function useStepStatus(step: StepKey) {
  const { progress } = useWizard();
  return progress.steps.find((s) => s.key === step)?.status ?? "not_started";
}

/** a draft the seller saved with "Save & exit", for the form to start from */
export function useSavedDraft<T extends Record<string, unknown>>(step: StepKey): Partial<T> | null {
  const { progress } = useWizard();
  const draft = progress.drafts[step];
  return draft && Object.keys(draft).length ? (draft as Partial<T>) : null;
}

/** a stable callback holder for the page's draft getter */
export function useDraftRegistry() {
  const ref = useRef<(() => Record<string, unknown>) | null>(null);
  const register = useCallback((getter: (() => Record<string, unknown>) | null) => {
    ref.current = getter;
  }, []);
  return { ref, register };
}

/** short names for the marketplaces the platform knows, used where only a connector code is available */
export const CHANNEL_LOGOS: Record<string, string> = {
  amazon_in: "/logos/amazon.svg",
  flipkart: "/logos/flipkart.svg",
  meesho: "/logos/meesho.svg",
  shopify: "/logos/shopify.svg",
  snapdeal: "/logos/snapdeal.svg",
  social_commerce: "/logos/social.svg",
};

