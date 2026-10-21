import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Loader2, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useValidateImport } from "@/hooks/useImport";
import type { ImportSession } from "@/types/import";
import { Alert } from "../ImportStates";
import { ImportProgress } from "../ImportProgress";
import { canReview, importErrorMessage, num } from "../importFormat";
import { issuesUrl } from "../importParams";

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{num(value)}</p>
    </div>
  );
}

interface Props {
  session: ImportSession;
  canWrite: boolean;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
}

/** Step 4: the validation job. Progress is polled from GET /imports/{id}; nothing here is simulated. */
export function ValidateStep({ session, canWrite, onBack, onNext, onCancel }: Props) {
  const validate = useValidateImport(session.id);
  const { status, counters, issues } = session;

  if (status === "validating") {
    return (
      <section className="rounded-xl border border-border bg-card p-8 text-center shadow-sm" aria-labelledby="validate-title">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
        </div>
        <h2 id="validate-title" className="mt-5 text-lg font-bold text-foreground">
          Validating your file
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Checking SKUs, titles, categories, prices, barcodes, stock and image links against your catalogue.</p>
        <div className="mt-6">
          <ImportProgress session={session} mode="validate" />
        </div>
        {canWrite && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel import
            </Button>
          </div>
        )}
      </section>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-red-200 bg-red-50/40 p-6" aria-labelledby="validate-title">
          <h2 id="validate-title" className="flex items-center gap-2 text-base font-semibold text-red-800">
            <CircleAlert className="h-5 w-5" aria-hidden /> The import failed
          </h2>
          <p className="mt-2 text-sm text-red-800">{session.failureMessage ?? "The import stopped before it finished."}</p>
          {validate.isError && (
            <div className="mt-4">
              <Alert>{importErrorMessage(validate.error, "The validation could not be started.")}</Alert>
            </div>
          )}
        </section>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to settings
          </Button>
          {canWrite && (
            <Button loading={validate.isPending} onClick={() => validate.mutate()}>
              Validate again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!canReview(status) && status !== "committing" && status !== "committed") {
    // uploaded / analyzed: the validation has not been started (or was reset by a change of mapping or settings)
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-6 text-center shadow-sm" aria-labelledby="validate-title">
          <h2 id="validate-title" className="text-base font-semibold text-foreground">
            Ready to validate
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {num(counters.total)} rows from {session.fileName} will be checked. Nothing is imported yet.
          </p>
          {validate.isError && (
            <div className="mx-auto mt-4 max-w-md">
              <Alert>{importErrorMessage(validate.error, "The validation could not be started.")}</Alert>
            </div>
          )}
          {canWrite && (
            <div className="mt-5">
              <Button loading={validate.isPending} onClick={() => validate.mutate()}>
                Start validation
              </Button>
            </div>
          )}
        </section>
        <div className="flex justify-start">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to settings
          </Button>
        </div>
      </div>
    );
  }

  // validated (or already importing / imported): the result of the validation
  const clean = issues.open === 0;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="validate-title">
        <h2 id="validate-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
          {clean ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> : <TriangleAlert className="h-5 w-5 text-amber-600" aria-hidden />}
          Validation finished
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {clean
            ? "Every row passed the checks. You can import now."
            : `${num(issues.open)} issue${issues.open === 1 ? "" : "s"} found (${num(issues.openErrors)} errors, ${num(issues.openWarnings)} warnings). Rows with an open error are not imported; fix them first or import the clean rows.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Rows" value={counters.total} tone="text-foreground" />
          <Stat label="Valid" value={counters.valid} tone="text-emerald-600" />
          <Stat label="With warnings" value={counters.warning} tone="text-amber-600" />
          <Stat label="With errors" value={counters.error} tone="text-red-600" />
        </div>
        {!clean && (
          <div className="mt-5">
            <Link to={issuesUrl(session.id)} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
              Resolve issues
            </Link>
          </div>
        )}
      </section>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button className="gap-2" onClick={onNext}>
          Review and import <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
