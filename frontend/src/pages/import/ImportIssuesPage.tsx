import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { ImportProgress } from "@/components/import/ImportProgress";
import { ImportPagination } from "@/components/import/ImportPagination";
import { ImportStatusChip } from "@/components/import/ImportStatusChip";
import { Alert, ImportNotFound, LoadError, NoAccess, PanelSkeleton, StateBox } from "@/components/import/ImportStates";
import { canReview, importErrorMessage, isBusy, isNotFound, isResumable, num } from "@/components/import/importFormat";
import { isIssueFiltered, resumeUrl, useIssuesUrl } from "@/components/import/importParams";
import { BulkResolveDialog } from "@/components/import/issues/BulkResolveDialog";
import { CommitDialog } from "@/components/import/issues/CommitDialog";
import { IssueDetail, type BulkRequest } from "@/components/import/issues/IssueDetail";
import { RowsToolbar, IssueFilters } from "@/components/import/issues/IssueFilters";
import { IssueList, IssueListSkeleton } from "@/components/import/issues/IssueList";
import { RowsSkeleton, RowsTable } from "@/components/import/issues/RowsTable";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useBulkResolve, useDownloadErrors, useImportIssues, useImportOptions, useImportRows, useImportSession, useImportSummary, useResolveIssue, useRevalidateImport } from "@/hooks/useImport";
import { useCategoryOptions } from "@/hooks/useProducts";
import { toast } from "@/hooks/useToast";
import type { ImportIssue } from "@/types/import";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Counter({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm font-bold tabular-nums ${tone}`}>{num(value)}</span>
    </div>
  );
}

export default function ImportIssuesPage() {
  const params = useParams<{ importId: string }>();
  const importId = params.importId && UUID.test(params.importId) ? params.importId : null;
  const canRead = useCan("imports:read");
  const canWrite = useCan("imports:write");
  const url = useIssuesUrl();
  const { update, clearFilters, view, page, pageSize } = url;

  const sessionQuery = useImportSession(canRead ? importId : null);
  const session = sessionQuery.data;
  const reviewable = Boolean(session && canReview(session.status));
  const validated = Boolean(session && session.headers.length > 0 && !["created", "uploaded", "analyzed"].includes(session.status));

  const summary = useImportSummary(canRead ? importId : null, validated);
  const options = useImportOptions(canRead);
  const categories = useCategoryOptions();
  const issuesQuery = useImportIssues(canRead && validated ? importId : null, { code: url.code, severity: url.severity, status: url.status === "all" ? undefined : url.status, q: url.q, page, pageSize }, view === "issues");
  const rowsQuery = useImportRows(canRead && validated ? importId : null, { status: url.rowStatus, q: url.q, page, pageSize }, view === "rows");

  const resolve = useResolveIssue(importId ?? "");
  const bulk = useBulkResolve(importId ?? "");
  const revalidate = useRevalidateImport(importId ?? "");
  const download = useDownloadErrors(importId ?? "");

  const [bulkRequest, setBulkRequest] = useState<BulkRequest | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [needsRevalidate, setNeedsRevalidate] = useState(false);

  const list = view === "issues" ? issuesQuery : rowsQuery;
  const issues = useMemo<ImportIssue[]>(() => issuesQuery.data?.items ?? [], [issuesQuery.data]);
  const selected = issues.find((i) => i.id === url.issueId) ?? issues[0];
  const editable = canWrite && reviewable;

  // a page past the end (issues were resolved, an old link) falls back to the last page
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [list.data, page, update]);

  const eligible = summary.data?.rows ? (summary.data.rows.valid ?? 0) + (summary.data.rows.warning ?? 0) : undefined;
  const openOfCode = (code: string) => summary.data?.byCode.find((c) => c.code === code)?.open;

  const header = (
    <PageHeader
      eyebrow="BATCH EXCEPTION RESOLUTION"
      title="Resolve import issues"
      description={session ? `Review and fix the problems found in ${session.fileName ?? "your file"} before it is imported.` : "Review and fix the problems found in your import file."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {session && session.issues.total > 0 && (
            <Button variant="outline" size="sm" className="gap-2" loading={download.isPending} onClick={() => download.mutate(undefined, { onError: (e) => toast({ title: "Could not download the issues", description: importErrorMessage(e), variant: "destructive" }) })}>
              <Download className="h-3.5 w-3.5" /> Download issues (CSV)
            </Button>
          )}
          {editable && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              loading={revalidate.isPending}
              onClick={() =>
                revalidate.mutate(undefined, {
                  onSuccess: (res) => {
                    setNeedsRevalidate(false);
                    toast(
                      res.queued
                        ? { title: "Revalidation started", description: "Large files are checked in the background." }
                        : { title: res.status === "clean" ? "All issues resolved" : "Revalidated", description: `${num(res.resolvedCount)} fixed, ${num(res.remainingIssuesCount)} issue(s) remain.`, variant: res.status === "clean" ? "success" : "default" },
                    );
                  },
                  onError: (e) => toast({ title: "Could not revalidate", description: importErrorMessage(e), variant: "destructive" }),
                })
              }
            >
              <RefreshCw className="h-3.5 w-3.5" /> Revalidate
            </Button>
          )}
          {editable && (
            <Button size="sm" onClick={() => setCommitOpen(true)}>
              Import rows
            </Button>
          )}
        </div>
      }
    />
  );

  if (!canRead) {
    return (
      <div className="w-full space-y-6 pb-16">
        {header}
        <NoAccess />
      </div>
    );
  }
  if (!importId) {
    return (
      <div className="w-full space-y-6 pb-16">
        {header}
        <ImportNotFound />
      </div>
    );
  }
  if (sessionQuery.isLoading) {
    return (
      <div className="w-full space-y-6 pb-16">
        {header}
        <PanelSkeleton rows={6} />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="w-full space-y-6 pb-16">
        {header}
        {isNotFound(sessionQuery.error) ? <ImportNotFound /> : <LoadError title="This import could not be loaded." message={importErrorMessage(sessionQuery.error)} onRetry={() => void sessionQuery.refetch()} />}
      </div>
    );
  }

  const busy = isBusy(session.status);
  const filtered = isIssueFiltered(url);

  const settle = (issue: ImportIssue, action: "accept_suggestion" | "custom_value" | "ignore", customValue?: string) => {
    // the next issue of the list takes the place of the one that leaves the "open" list
    const index = issues.findIndex((i) => i.id === issue.id);
    const next = issues[index + 1] ?? issues[index - 1];
    resolve.mutate(
      { issueId: issue.id, action, customValue },
      {
        onSuccess: () => {
          setNeedsRevalidate(true);
          toast({ title: action === "ignore" ? "Issue ignored" : "Issue resolved", description: `Row ${issue.rowNumber}.`, variant: "success" });
          if (url.status === "open") update({ issue: next?.id ?? null }, { replace: true });
        },
        onError: (e) => toast({ title: "Could not change the issue", description: importErrorMessage(e), variant: "destructive" }),
      },
    );
  };

  const sendBulk = async (input: Parameters<typeof bulk.mutateAsync>[0]) => {
    const res = await bulk.mutateAsync(input);
    if (res.applied > 0) setNeedsRevalidate(true);
    return res;
  };

  let body: React.ReactNode;
  if (!validated) {
    body = (
      <StateBox title="This import has not been validated yet." description="Issues appear after the file has been checked. Continue the import to map the columns and start the validation.">
        {canWrite && isResumable(session.status) && (
          <Link to={resumeUrl(session.id)} className={buttonVariants({ size: "sm", className: "text-xs" })}>
            Continue the import
          </Link>
        )}
      </StateBox>
    );
  } else if (session.status === "validating" && session.issues.total === 0) {
    body = (
      <section className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h2 className="text-lg font-bold text-foreground">Validating your file</h2>
        <div className="mt-6">
          <ImportProgress session={session} mode="validate" />
        </div>
      </section>
    );
  } else if (summary.data && summary.data.total === 0 && session.issues.total === 0) {
    body = (
      <StateBox title="No issues found." description={reviewable ? "Every row passed the checks. You can import the file now." : "Nothing needs attention in this import."}>
        {editable && <Button size="sm" className="text-xs" onClick={() => setCommitOpen(true)}>Import rows</Button>}
        <Link to={ROUTES.PRODUCTS} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
          Go to products
        </Link>
      </StateBox>
    );
  } else {
    body = (
      <>
        <div role="tablist" aria-label="View" className="flex gap-1.5">
          {(["issues", "rows"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => update({ view: v, code: null, severity: null, status: null, q: null, rows: null })} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {v === "issues" ? "Issues" : "All rows"}
            </button>
          ))}
        </div>

        {view === "issues" ? (
          <>
            <IssueFilters summary={summary.data} url={url} filtered={filtered} onChange={(patch) => update(patch)} onClear={clearFilters} />
            {issuesQuery.isLoading ? (
              <IssueListSkeleton />
            ) : issuesQuery.isError && !issuesQuery.data ? (
              <LoadError title="The issues could not be loaded." message={importErrorMessage(issuesQuery.error)} onRetry={() => void issuesQuery.refetch()} />
            ) : issues.length === 0 ? (
              <StateBox title={filtered ? "No issues match these filters." : "No open issues."} description={filtered ? "Try another kind, severity or search." : "Everything that needed attention has been settled. Revalidate, then import."}>
                {filtered && (
                  <Button variant="outline" size="sm" className="text-xs" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </StateBox>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="space-y-3 lg:col-span-5">
                    <IssueList issues={issues} selectedId={selected?.id} refreshing={issuesQuery.isFetching && issuesQuery.isPlaceholderData} onSelect={(i) => update({ issue: i.id }, { replace: true })} />
                    <ImportPagination
                      page={issuesQuery.data?.page ?? page}
                      pages={issuesQuery.data?.pages ?? 1}
                      total={issuesQuery.data?.total ?? 0}
                      pageSize={pageSize}
                      shown={issues.length}
                      noun="issues"
                      onPage={(p) => update({ page: p > 1 ? String(p) : null })}
                      onPageSize={(size) => update({ size: size === 25 ? null : String(size) })}
                    />
                  </div>
                  <div className="lg:col-span-7">
                    {selected && (
                      <IssueDetail
                        key={selected.id}
                        issue={selected}
                        editable={editable && !busy}
                        busy={resolve.isPending}
                        openOfCode={openOfCode(selected.code)}
                        categories={categories.data ?? []}
                        onResolve={({ action, customValue }) => settle(selected, action, customValue)}
                        onBulk={setBulkRequest}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <RowsToolbar q={url.q ?? ""} status={url.rowStatus} onChange={(patch) => update(patch)} />
            {rowsQuery.isLoading ? (
              <RowsSkeleton />
            ) : rowsQuery.isError && !rowsQuery.data ? (
              <LoadError title="The rows could not be loaded." message={importErrorMessage(rowsQuery.error)} onRetry={() => void rowsQuery.refetch()} />
            ) : (rowsQuery.data?.items.length ?? 0) === 0 ? (
              <StateBox title="No rows match." description="Try another status or search." />
            ) : (
              <>
                <RowsTable rows={rowsQuery.data?.items ?? []} refreshing={rowsQuery.isFetching && rowsQuery.isPlaceholderData} />
                <ImportPagination
                  page={rowsQuery.data?.page ?? page}
                  pages={rowsQuery.data?.pages ?? 1}
                  total={rowsQuery.data?.total ?? 0}
                  pageSize={pageSize}
                  shown={rowsQuery.data?.items.length ?? 0}
                  noun="rows"
                  onPage={(p) => update({ page: p > 1 ? String(p) : null })}
                  onPageSize={(size) => update({ size: size === 25 ? null : String(size) })}
                />
              </>
            )}
          </>
        )}
      </>
    );
  }

  const c = session.counters;
  return (
    <div className="w-full space-y-6 pb-16">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <ImportStatusChip status={session.status} />
          <Counter label="Rows" value={c.total} />
          <Counter label="Valid" value={c.valid} tone="text-emerald-700" />
          <Counter label="Warnings" value={c.warning} tone="text-amber-700" />
          <Counter label="Errors" value={c.error} tone="text-red-700" />
          <Counter label="Open issues" value={session.issues.open} tone="text-red-700" />
          <Counter label="Resolved" value={session.issues.resolved} tone="text-emerald-700" />
          <Counter label="Ignored" value={session.issues.ignored} />
        </div>
        {session.status === "committed" && (
          <Link to={ROUTES.PRODUCTS} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
            View products
          </Link>
        )}
      </div>

      {!canWrite && <Alert tone="info">You are viewing this import read-only. Changing issues needs the imports write permission.</Alert>}
      {session.status === "failed" && <Alert>{session.failureMessage ?? "This import failed."}</Alert>}
      {session.status === "cancelled" && <Alert tone="warning">This import was cancelled. Its issues can be viewed but not changed.</Alert>}
      {session.status === "committing" && (
        <section className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h2 className="text-base font-bold text-foreground">Importing your products</h2>
          <div className="mt-4">
            <ImportProgress session={session} mode="commit" />
          </div>
        </section>
      )}
      {session.status === "validating" && session.issues.total > 0 && (
        <section className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h2 className="text-base font-bold text-foreground">Revalidating</h2>
          <div className="mt-4">
            <ImportProgress session={session} mode="validate" />
          </div>
        </section>
      )}
      {editable && needsRevalidate && !busy && <Alert tone="warning">You changed rows since the last validation. Revalidate to refresh the counts before importing.</Alert>}

      {body}

      <BulkResolveDialog request={bulkRequest} categories={categories.data ?? []} onSubmit={sendBulk} onClose={() => setBulkRequest(null)} />
      {canWrite && ["validated", "partially_committed", "committing", "committed"].includes(session.status) && (
        <CommitDialog open={commitOpen} onOpenChange={setCommitOpen} session={session} options={options.data} eligible={eligible} needsRevalidate={needsRevalidate} onRevalidated={() => setNeedsRevalidate(false)} />
      )}
    </div>
  );
}
