import type { UseQueryResult } from "@tanstack/react-query";
import type { ImportOptions } from "@/types/import";
import type { WizardStepId } from "../importParams";

/** what every step of the wizard gets from the page */
export interface StepProps {
  options: UseQueryResult<ImportOptions>;
  canWrite: boolean;
  goTo: (step: WizardStepId) => void;
  /** the Cancel button of the sticky bar */
  onCancel: () => void;
  /** the Save as draft button of the sticky bar */
  onSaveDraft: () => void;
}
