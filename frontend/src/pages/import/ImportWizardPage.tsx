import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { ImportStepper } from "@/components/import/ImportStepper";
import { ImportNotFound, LoadError, NoAccess, PanelSkeleton, StateBox } from "@/components/import/ImportStates";
import { WIZARD_STEPS, resolveStep, useWizardUrl, type WizardStepId } from "@/components/import/importParams";
import { importErrorMessage, isFinished, isNotFound } from "@/components/import/importFormat";
import type { ExceptionBucket } from "@/components/import/wizard/exceptions";
import { MappingStep } from "@/components/import/wizard/MappingStep";
import { ReadyStep } from "@/components/import/wizard/ReadyStep";
import { RecentImports } from "@/components/import/wizard/RecentImports";
import { ReviewStep } from "@/components/import/wizard/ReviewStep";
import { SourceStep } from "@/components/import/wizard/SourceStep";
import { UploadStep } from "@/components/import/wizard/UploadStep";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { isPulling, useCancelImport, useImportOptions, useImportSession } from "@/hooks/useImport";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bucket, setBucket] = useState<ExceptionBucket | undefined>(undefined);
  const [cleanOnly, setCleanOnly] = useState(false);

  const options = useImportOptions(canRead);
  const sessionQuery = useImportSession(canRead ? importId : null);
  const session = sessionQuery.data;
  const step = resolveStep(requestedStep, session);
  const goTo = (id: WizardStepId) => go({ step: id });

  const active = session && canWrite && !isFinished(session.status);
  const onCancel = () => (active ? setCancelOpen(true) : navigate(ROUTES.PRODUCTS));
  const onSaveDraft = () => {
    if (!session) {
      toast({ title: "Nothing to save yet", description: "Choose a file first. Every step is saved as you go." });
      return;
    }
    toast({ title: "Draft saved", description: "Your import is saved. Resume it from Recent imports." });
    go({ importId: null, step: null });
  };
  const common = { options, canWrite, goTo, onCancel, onSaveDraft };

  const header = (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">CATALOG IMPORT</div>
          <h1 className="text-[26px] leading-[39px] font-semibold text-[#000000] dark:text-white mt-0.5">Import products</h1>
          <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">Bring your existing catalog into your master product workspace.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => go({ importId: null, step: null })}
          className="w-[152px] h-[36px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium"
        >
          Import history
        </Button>
      </div>

      {/* Stepper with top and bottom dividers */}
      <div className="border-t border-b border-[#E3E3E3] dark:border-border py-2.5">
        <ImportStepper
          currentStep={step + 1}
          onStepClick={(n) => {
            setSettingsOpen(false);
            goTo(STEP_IDS[n - 1] as WizardStepId);
          }}
        />
      </div>
    </div>
  );

  if (!canRead) {
    return (
      <div className="w-full min-h-full pb-28 text-foreground">
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
  } else if (session && isPulling(session)) {
    body = (
      <StateBox role="status" title="Pulling products from your marketplace…" description="The catalog is being read from your connected account. This page continues by itself when it is ready.">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </StateBox>
    );
  } else {
    body = (
      <>
        {!canWrite && (
          <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            You can view imports but not start or change them: the imports write permission is needed.
          </div>
        )}

        {step === 0 && <SourceStep {...common} onMarketplaceStarted={(s) => go({ importId: s.id, step: "mapping" })} />}
        {step === 1 && <UploadStep key={session?.id ?? "new"} {...common} session={session} settingsOpen={settingsOpen} onSettingsOpen={setSettingsOpen} onUploaded={(id) => go({ importId: id, step: "mapping" })} />}
        {step === 2 && session && (
          <MappingStep
            {...common}
            session={session}
            onSelectIssueType={(t) => {
              setBucket(t);
              goTo("review");
            }}
            onImportReady={() => {
              setCleanOnly(true);
              goTo("import");
            }}
          />
        )}
        {step === 3 && session && <ReviewStep {...common} session={session} bucket={bucket} onBucket={setBucket} onImportReady={() => {
          setCleanOnly(true);
          goTo("import");
        }} />}
        {step === 4 && session && (
          <ReadyStep
            {...common}
            session={session}
            preferCleanOnly={cleanOnly}
            onFixSettings={() => {
              setSettingsOpen(true);
              goTo("upload");
            }}
          />
        )}

        {step === 0 && <div className="mt-10"><RecentImports canWrite={canWrite} page={historyPage} currentId={importId} onPage={(p) => go({ historyPage: p })} /></div>}
      </>
    );
  }

  return (
    <div className="w-full min-h-full pb-28 text-foreground">
      {header}
      {body}
      {session && <CancelImportDialog session={session} open={cancelOpen} onOpenChange={setCancelOpen} />}
    </div>
  );
}
