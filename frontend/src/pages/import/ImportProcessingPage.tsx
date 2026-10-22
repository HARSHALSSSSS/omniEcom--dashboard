import { Link, useParams } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { Alert, ImportNotFound, LoadError, NoAccess, PanelSkeleton, StateBox } from "@/components/import/ImportStates";
import { importErrorMessage, isNotFound } from "@/components/import/importFormat";
import { resumeUrl } from "@/components/import/importParams";
import { ActivityFeed } from "@/components/import/processing/ActivityFeed";
import { ProcessingBar } from "@/components/import/processing/ProcessingBar";
import { ProcessingHero, ProcessingPipeline } from "@/components/import/processing/ProcessingHero";
import { ProcessingSidebar } from "@/components/import/processing/ProcessingSidebar";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useImportSession } from "@/hooks/useImport";
import { useImportActivity } from "@/hooks/useImportProcessing";
import { cn } from "@/utils/cn";
import type { ImportStatus } from "@/types/import";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** the statuses that have a run to show; anything earlier has not been started */
const STARTED: readonly ImportStatus[] = ["validating", "committing", "committed", "partially_committed", "failed"];

const OUTLINE = "border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium";

function Header({ importId }: { importId: string | null }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">CATALOG IMPORT</div>
        <h1 className="text-[26px] leading-[39px] font-semibold text-[#000000] dark:text-white mt-0.5">Importing products</h1>
        <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">Your catalog is being added to the master product workspace.</p>
      </div>

      <div className="flex items-center gap-4">
        {importId && <span className="text-[11px] leading-[17px] font-medium text-[#666666] font-mono">Import ID · {importId}</span>}
        <Link to={ROUTES.PRODUCTS_IMPORT} className={cn(buttonVariants({ variant: "outline" }), OUTLINE, "w-[152px] h-[36px]")}>
          Import history
        </Link>
      </div>
    </div>
  );
}

export default function ImportProcessingPage() {
  const params = useParams<{ importId: string }>();
  const importId = params.importId && UUID.test(params.importId) ? params.importId : null;
  const canRead = useCan("imports:read");
  const canWrite = useCan("imports:write");

  const sessionQuery = useImportSession(canRead ? importId : null);
  const session = sessionQuery.data;
  const started = Boolean(session && STARTED.includes(session.status));
  const running = session?.status === "validating" || session?.status === "committing";
  const activity = useImportActivity(importId, running, canRead && started);

  const shell = (children: React.ReactNode) => (
    <div className="w-full min-h-full pb-28 text-foreground">
      <Header importId={importId} />
      {children}
    </div>
  );

  if (!canRead) return shell(<NoAccess />);
  if (!importId) return shell(<ImportNotFound />);
  if (sessionQuery.isLoading) return shell(<PanelSkeleton rows={6} />);
  if (!session) {
    return shell(isNotFound(sessionQuery.error) ? <ImportNotFound /> : <LoadError title="This import could not be loaded." message={importErrorMessage(sessionQuery.error)} onRetry={() => void sessionQuery.refetch()} />);
  }

  if (!started) {
    const cancelled = session.status === "cancelled";
    return shell(
      <StateBox
        title={cancelled ? "This import was cancelled." : "This import has not been started yet."}
        description={cancelled ? "Nothing was added to your catalog. Start a new import from Import history." : "Progress appears here once the rows are being imported. Continue in the import to review the file and start it."}
      >
        {!cancelled && canWrite && (
          <Link to={resumeUrl(session.id)} className={buttonVariants({ size: "sm", className: "text-xs" })}>
            Back to the import
          </Link>
        )}
        <Link to={ROUTES.PRODUCTS_IMPORT} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
          Import history
        </Link>
      </StateBox>,
    );
  }

  return (
    <div className="w-full min-h-full pb-28 text-foreground">
      <Header importId={importId} />
      {session.status === "failed" && (
        <div className="mb-4">
          <Alert>{session.failureMessage ?? "This import failed."}</Alert>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-12 items-start w-full">
        <div className="flex-1 min-w-0 w-full space-y-6">
          <ProcessingHero session={session} />
          <ProcessingPipeline session={session} />
          <ActivityFeed
            items={activity.items}
            loading={activity.isLoading}
            error={activity.isError ? activity.error : null}
            onRetry={() => void activity.refetch()}
            hasOlder={activity.hasOlder}
            loadingOlder={activity.loadingOlder}
            olderError={activity.olderError}
            onLoadOlder={() => void activity.loadOlder()}
          />
        </div>

        <ProcessingSidebar session={session} />
      </div>

      <ProcessingBar session={session} />
    </div>
  );
}
