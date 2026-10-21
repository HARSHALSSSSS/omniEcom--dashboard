import { Link } from "react-router-dom";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { useDownloadErrors } from "@/hooks/useImport";
import type { ImportSession } from "@/types/import";
import { errorMessage } from "@/api/errors";
import { Alert } from "./ImportStates";
import { num } from "./importFormat";
import { issuesUrl } from "./importParams";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{num(value)}</p>
    </div>
  );
}

/** What a finished import did: real counters from the commit job, with the way on to the catalogue or to the rows that failed. */
export function ImportResult({ session }: { session: ImportSession }) {
  const download = useDownloadErrors(session.id);
  const partial = session.status === "partially_committed";
  const { results, counters, issues } = session;
  const link = buttonVariants({ variant: "outline", size: "sm", className: "text-xs" });
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="result-title">
      <h2 id="result-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
        {partial ? <TriangleAlert className="h-5 w-5 text-amber-600" aria-hidden /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />}
        {partial ? "Imported, with some rows left out" : "Import complete"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {num(counters.committed)} of {num(counters.total)} rows were imported from {session.fileName}.
        {counters.failed > 0 && ` ${num(counters.failed)} could not be imported.`}
      </p>
      {session.failureMessage && (
        <div className="mt-3">
          <Alert tone="warning">{session.failureMessage}</Alert>
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Products created" value={results.productsCreated} />
        <Stat label="Products updated" value={results.productsUpdated} />
        <Stat label="Variants created" value={results.variantsCreated} />
        <Stat label="Variants updated" value={results.variantsUpdated} />
      </div>
      {download.isError && (
        <div className="mt-3">
          <Alert>{errorMessage(download.error, "The file could not be downloaded.")}</Alert>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to={ROUTES.PRODUCTS} className={buttonVariants({ size: "sm", className: "text-xs" })}>
          View products
        </Link>
        {issues.open > 0 && (
          <>
            <Link to={issuesUrl(session.id)} className={link}>
              Review {num(issues.open)} open issue{issues.open === 1 ? "" : "s"}
            </Link>
            <Button variant="outline" size="sm" className="text-xs" loading={download.isPending} onClick={() => download.mutate()}>
              Download issues (CSV)
            </Button>
          </>
        )}
        <Link to={ROUTES.PRODUCTS_IMPORT} className={link}>
          Import another file
        </Link>
      </div>
    </section>
  );
}
