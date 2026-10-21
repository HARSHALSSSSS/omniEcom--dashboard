import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Stepper } from "@/components/common/Stepper";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { ImportNotFound, LoadError, NoAccess, PanelSkeleton, StateBox } from "@/components/import/ImportStates";
import { WIZARD_STEPS, resolveStep, useWizardUrl, type WizardStepId } from "@/components/import/importParams";
import { importErrorMessage, isFinished, isNotFound } from "@/components/import/importFormat";
import { MappingStep } from "@/components/import/wizard/MappingStep";
import { RecentImports } from "@/components/import/wizard/RecentImports";
import { ReviewStep } from "@/components/import/wizard/ReviewStep";
import { SettingsStep } from "@/components/import/wizard/SettingsStep";
import { SourceStep } from "@/components/import/wizard/SourceStep";
import { ValidateStep } from "@/components/import/wizard/ValidateStep";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useCancelImport, useImportOptions, useImportSession } from "@/hooks/useImport";
import { toast } from "@/hooks/useToast";
import type { ImportSession } from "@/types/import";

const STEP_IDS = WIZARD_STEPS.map((s) => s.id);

function CancelImportDialog({ session, open, onOpenChange }: { session: ImportSession; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const cancel = useCancelImport(session.id);
  const run = () =>
    cancel.mutate(undefined, {
      onSuccess: () => {
        onOpenChange(false);
        toast({ title: "Import cancelled", description: session.counters.committed > 0 ? "Rows that were already imported stay in your catalogue." : undefined });
        navigate(ROUTES.PRODUCTS);
      },
      onError: (e) => {
        onOpenChange(false);
        toast({ title: "Could not cancel the import", description: importErrorMessage(e), variant: "destructive" });
      },
    });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel this import?"
      description="The import is stopped and cannot be continued. Rows that were already imported stay in your catalogue."
      confirmText="Cancel import"
      cancelText="Keep it"
      variant="destructive"
      loading={cancel.isPending}
      onConfirm={run}
    />
  );
}

export default function ImportWizardPage() {
  const navigate = useNavigate();
  const canRead = useCan("imports:read");
  const canWrite = useCan("imports:write");
  const url = useWizardUrl();
  const { importId, requestedStep, historyPage, go } = url;
  const [cancelOpen, setCancelOpen] = useState(false);

  const options = useImportOptions(canRead);
  const sessionQuery = useImportSession(canRead ? importId : null);
  const session = sessionQuery.data;
  const step = resolveStep(requestedStep, session);
  const goTo = (id: WizardStepId) => go({ step: id });

  const header = (
    <PageHeader
      eyebrow="COMMERCE CATALOG"
      title="Bulk import products"
      description="Add many products at once from a spreadsheet or a marketplace export. Every step is saved, so you can leave and continue later."
      actions={
        <div className="flex items-center gap-2">
          {session && canWrite && !isFinished(session.status) && (
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel import
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.PRODUCTS)}>
            Exit
          </Button>
        </div>
      }
    />
  );

  if (!canRead) {
    return (
      <div className="mx-auto max-w-[1136px] space-y-6 pb-16">
        {header}
        <NoAccess />
      </div>
    );
  }

  let body: React.ReactNode;
  if (importId && sessionQuery.isLoading) {
    body = <PanelSkeleton rows={6} />;
  } else if (importId && !session) {
    body = isNotFound(sessionQuery.error) ? <ImportNotFound /> : <LoadError title="This import could not be loaded." message={importErrorMessage(sessionQuery.error)} onRetry={() => void sessionQuery.refetch()} />;
  } else if (session?.status === "cancelled") {
    body = (
      <StateBox title="This import was cancelled." description="It cannot be continued. Start a new import to upload the file again.">
        <Button size="sm" className="text-xs" onClick={() => go({ importId: null, step: null })}>
          Start a new import
        </Button>
      </StateBox>
    );
  } else {
    body = (
      <>
        {!canWrite && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            You can view imports but not start or change them: the imports write permission is needed.
          </div>
        )}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <Stepper steps={[...WIZARD_STEPS]} currentStepIndex={step} onStepClick={(i) => goTo(STEP_IDS[i] as WizardStepId)} />
        </div>

        {step === 0 && (
          <SourceStep session={session} options={options} canWrite={canWrite} onUploaded={(id) => go({ importId: id, step: "mapping" })} onContinue={() => goTo("mapping")} />
        )}
        {step === 1 && session && <MappingStep session={session} options={options} canWrite={canWrite} onBack={() => goTo("source")} onNext={() => goTo("settings")} />}
        {step === 2 && session && <SettingsStep key={session.id} session={session} options={options} canWrite={canWrite} onBack={() => goTo("mapping")} onContinue={() => goTo("validate")} />}
        {step === 3 && session && <ValidateStep session={session} canWrite={canWrite} onBack={() => goTo("settings")} onNext={() => goTo("review")} onCancel={() => setCancelOpen(true)} />}
        {step === 4 && session && <ReviewStep session={session} options={options} canWrite={canWrite} onBack={() => goTo("validate")} onFixSettings={() => goTo("settings")} />}

        {step === 0 && <RecentImports canWrite={canWrite} page={historyPage} currentId={importId} onPage={(p) => go({ historyPage: p })} />}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[1136px] space-y-6 pb-16">
      {header}
      {body}
      {session && <CancelImportDialog session={session} open={cancelOpen} onOpenChange={setCancelOpen} />}
    </div>
  );
}
