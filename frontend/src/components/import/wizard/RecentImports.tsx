import { Link } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { useImportHistory } from "@/hooks/useImport";
import type { ImportSession } from "@/types/import";
import { ImportStatusChip } from "../ImportStatusChip";
import { LoadError, PanelSkeleton } from "../ImportStates";
import { canReview, isResumable, num, when } from "../importFormat";
import { issuesUrl, resumeUrl } from "../importParams";

const PAGE_SIZE = 5;
const LINK = buttonVariants({ variant: "outline", size: "sm", className: "h-7 text-xs" });

function Row({ s, canWrite, current }: { s: ImportSession; canWrite: boolean; current: boolean }) {
  const hasIssues = s.issues.total > 0 || canReview(s.status);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xs font-semibold text-foreground" title={s.fileName ?? undefined}>
            {s.fileName ?? "Untitled import"}
          </span>
          <ImportStatusChip status={s.status} />
          {current && <span className="text-[11px] font-medium text-primary">Open now</span>}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {when(s.createdAt)}
          {s.counters.total > 0 && <> · {num(s.counters.total)} rows</>}
          {s.issues.open > 0 && <> · {num(s.issues.open)} open issues</>}
          {(s.status === "committed" || s.status === "partially_committed") && <> · {num(s.counters.committed)} imported</>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {canWrite && isResumable(s.status) && !current && (
          <Link to={resumeUrl(s.id)} className={LINK}>
            Resume
          </Link>
        )}
        {hasIssues && (
          <Link to={issuesUrl(s.id)} className={LINK}>
            View issues
          </Link>
        )}
        {(s.status === "committed" || s.status === "partially_committed") && (
          <Link to={ROUTES.PRODUCTS} className={LINK}>
            View products
          </Link>
        )}
      </div>
    </li>
  );
}

/** import history: what was started before, with the way back into it */
export function RecentImports({ canWrite, page, currentId, onPage }: { canWrite: boolean; page: number; currentId: string | null; onPage: (page: number) => void }) {
  const history = useImportHistory({ page, pageSize: PAGE_SIZE });
  const data = history.data;

  if (history.isLoading) return <PanelSkeleton rows={3} />;
  if (history.isError && !data) return <LoadError title="Recent imports could not be loaded." message={errorMessage(history.error)} onRetry={() => void history.refetch()} />;
  if (!data || (data.total === 0 && page === 1)) {
    return (
      <section aria-labelledby="recent-imports" className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 id="recent-imports" className="text-base font-semibold text-foreground">
          Recent imports
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Your imports will be listed here, so you can come back to one that is not finished.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="recent-imports" className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 id="recent-imports" className="text-base font-semibold text-foreground">
          Recent imports
        </h2>
        <span className="text-[11px] text-muted-foreground">{num(data.total)} in total</span>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {data.items.map((s) => (
          <Row key={s.id} s={s} canWrite={canWrite} current={s.id === currentId} />
        ))}
      </ul>
      {data.pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <div className="flex gap-2">
            <button type="button" className="h-7 rounded-md border border-border px-2.5 font-semibold hover:bg-muted disabled:opacity-50" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
              Newer
            </button>
            <button type="button" className="h-7 rounded-md border border-border px-2.5 font-semibold hover:bg-muted disabled:opacity-50" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>
              Older
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
