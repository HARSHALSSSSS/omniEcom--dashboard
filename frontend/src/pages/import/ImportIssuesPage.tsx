import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ImportProgress } from "@/components/import/ImportProgress";
import { ImportPagination } from "@/components/import/ImportPagination";
import { Alert, ImportNotFound, LoadError, NoAccess, PanelSkeleton, StateBox } from "@/components/import/ImportStates";
import { canReview, importErrorMessage, isBusy, isNotFound, isResumable, num } from "@/components/import/importFormat";
import { isIssueFiltered, resumeUrl, useIssuesUrl } from "@/components/import/importParams";
import { BulkResolveDialog } from "@/components/import/issues/BulkResolveDialog";
import { CommitDialog } from "@/components/import/issues/CommitDialog";
import { IssueDetail, type BulkRequest, type ResolveChoice } from "@/components/import/issues/IssueDetail";
import { RowsToolbar, IssueFilters } from "@/components/import/issues/IssueFilters";
import { IssueList, IssueListSkeleton } from "@/components/import/issues/IssueList";
import { CountersRibbon, KpiCards, ReviewProgress } from "@/components/import/issues/IssuesSummary";
import { importedOf } from "@/components/import/issues/issuesModel";
import { RevalidatingPanel, RevalidationResultPanel } from "@/components/import/issues/RevalidationPanels";
import { RowsSkeleton, RowsTable } from "@/components/import/issues/RowsTable";
import { processingUrl } from "@/components/import/processing/processingModel";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { IMPORT_POLL_MS, useBulkResolve, useDownloadErrors, useImportOptions, useImportRows, useImportSession, useImportSummary, useResolveIssue, useRevalidateImport } from "@/hooks/useImport";
import { useIssuesList, useUploadIssueImage } from "@/hooks/useImportProcessing";
import { useCategoryOptions } from "@/hooks/useProducts";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import { ApiError } from "@/api/errors";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/api/importProcessing.api";
import { revalidationOf, type IssueX } from "@/types/importProcessing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTLINE = "h-[36px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium px-4";
const PRIMARY = "h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-[5px] text-[12px] leading-[18px] font-medium px-5";

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
  const issuesQuery = useIssuesList(canRead && validated ? importId : null, { code: url.code, severity: url.severity, status: url.status === "all" ? undefined : url.status, q: url.q, field: url.field, sort: url.sort, page, pageSize }, view === "issues");
  const rowsQuery = useImportRows(canRead && validated ? importId : null, { status: url.rowStatus, q: url.q, page, pageSize }, view === "rows");

  const resolve = useResolveIssue(importId ?? "");
  const bulk = useBulkResolve(importId ?? "");
  const revalidate = useRevalidateImport(importId ?? "");
  const uploadImage = useUploadIssueImage(importId ?? "");
  const download = useDownloadErrors(importId ?? "");

  const [bulkRequest, setBulkRequest] = useState<BulkRequest | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [needsRevalidate, setNeedsRevalidate] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const revalidation = revalidationOf(session);
  // a revalidation that was seen running and is now complete shows its result in the panel
  const [previousRevalidation, setPreviousRevalidation] = useState(revalidation?.status);
  if (previousRevalidation !== revalidation?.status) {
    setPreviousRevalidation(revalidation?.status);
    if (previousRevalidation === "running" && revalidation?.status === "complete") setResultOpen(true);
  }

  // the session only polls by itself while its status is busy: a revalidation that runs under a settled status is followed here
  const refetchSession = sessionQuery.refetch;
  const followRevalidation = revalidation?.status === "running" && Boolean(session) && !isBusy(session?.status ?? "created");
  useEffect(() => {
    if (!followRevalidation) return;
    const t = setInterval(() => void refetchSession(), IMPORT_POLL_MS);
    return () => clearInterval(t);
  }, [followRevalidation, refetchSession]);

  const list = view === "issues" ? issuesQuery : rowsQuery;
  const issues = useMemo<IssueX[]>(() => issuesQuery.data?.items ?? [], [issuesQuery.data]);
  const selected = issues.find((i) => i.id === url.issueId) ?? issues[0];
  const editable = canWrite && reviewable;

  // a page past the end (issues were resolved, an old link) falls back to the last page
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [list.data, page, update]);

  const eligible = summary.data?.rows ? (summary.data.rows.valid ?? 0) + (summary.data.rows.warning ?? 0) : undefined;
  const openOfCode = (code: string) => summary.data?.byCode.find((c) => c.code === code)?.open;

  const revalidateNow = () =>
    revalidate.mutate(undefined, {
      onSuccess: (res) => {
        setNeedsRevalidate(false);
        if (revalidationOf(res.session)?.status === "complete") setResultOpen(true);
        toast(
          res.queued
            ? { title: "Revalidation started", description: "Large files are checked in the background." }
            : { title: res.status === "clean" ? "All issues resolved" : "Revalidated", description: `${num(res.resolvedCount)} fixed, ${num(res.remainingIssuesCount)} issue(s) remain.`, variant: res.status === "clean" ? "success" : "default" },
        );
      },
      onError: (e) => toast({ title: "Could not revalidate", description: importErrorMessage(e), variant: "destructive" }),
    });

  const header = (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">CATALOG IMPORT</div>
          <h1 className="text-[26px] leading-[39px] font-semibold text-[#000000] dark:text-white mt-0.5">Review import issues</h1>
          <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
            {session ? `Fix the items that need attention in ${session.fileName ?? "your file"} before completing your catalog setup.` : "Fix the items that need attention before completing your catalog setup."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {importId && <span className="text-[11px] leading-[17px] font-medium text-[#666666] font-mono">Import ID · {importId}</span>}
          {session && session.issues.total > 0 && (
            <Button variant="outline" className={cn(OUTLINE, "gap-2")} loading={download.isPending} onClick={() => download.mutate(undefined, { onError: (e) => toast({ title: "Could not download the issues", description: importErrorMessage(e), variant: "destructive" }) })}>
              <Download className="h-3.5 w-3.5" /> Download issues (CSV)
            </Button>
          )}
          <Link to={importId ? resumeUrl(importId) : ROUTES.PRODUCTS_IMPORT} className={cn(buttonVariants({ variant: "outline" }), OUTLINE)}>
            View import summary
          </Link>
        </div>
      </div>
    </div>
  );

  const wrap = (children: React.ReactNode) => (
    <div className="w-full min-h-full pb-28 text-foreground">
      {header}
      {children}
    </div>
  );

  if (!canRead) return wrap(<NoAccess />);
  if (!importId) return wrap(<ImportNotFound />);
  if (sessionQuery.isLoading) return wrap(<PanelSkeleton rows={6} />);
  if (!session) {
    return wrap(isNotFound(sessionQuery.error) ? <ImportNotFound /> : <LoadError title="This import could not be loaded." message={importErrorMessage(sessionQuery.error)} onRetry={() => void sessionQuery.refetch()} />);
  }

  const busy = isBusy(session.status);
  const filtered = isIssueFiltered(url);
  const revalRunning = revalidation?.status === "running" || (session.status === "validating" && session.issues.total > 0);
  const productTitle = selected?.productData.title ?? null;
  const imported = importedOf(session);

  const settle = (issue: IssueX, choice: ResolveChoice) => {
    // the next issue of the list takes the place of the one that leaves the "open" list
    const index = issues.findIndex((i) => i.id === issue.id);
    const next = issues[index + 1] ?? issues[index - 1];
    resolve.mutate(
      { issueId: issue.id, action: choice.action, customValue: choice.customValue },
      {
        onSuccess: () => {
          setNeedsRevalidate(true);
          toast({ title: choice.action === "ignore" ? "Issue ignored" : "Correction recorded", description: `Row ${issue.rowNumber}.`, variant: "success" });
          if (url.status === "open") update({ issue: next?.id ?? null }, { replace: true });
        },
        onError: (e) =>
          // 409: the same answer again, or the row has been imported since
          toast(
            e instanceof ApiError && e.status === 409
              ? { title: "Nothing to change", description: "This issue already has that answer, or its row has already been imported.", variant: "destructive" }
              : { title: "Could not change the issue", description: importErrorMessage(e), variant: "destructive" },
          ),
      },
    );
  };

  const sendImage = (issue: IssueX, file: File) => {
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      toast({ title: "That file type is not supported", description: "Upload a PNG, JPEG or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "That image is too large", description: "Images can be at most 5 MB.", variant: "destructive" });
      return;
    }
    setUploadPercent(0);
    uploadImage.mutate(
      { issueId: issue.id, file, onProgress: setUploadPercent },
      {
        onSuccess: () => {
          setNeedsRevalidate(true);
          toast({ title: "Image uploaded", description: `Row ${issue.rowNumber}. Revalidate before importing.`, variant: "success" });
          if (url.status === "open") update({ issue: null }, { replace: true });
        },
        onError: (e) =>
          toast({
            title: "Could not upload the image",
            description: e instanceof ApiError && e.status === 413 ? "Images can be at most 5 MB." : e instanceof ApiError && e.status === 415 ? "Upload a PNG, JPEG or WebP image." : importErrorMessage(e),
            variant: "destructive",
          }),
        onSettled: () => setUploadPercent(null),
      },
    );
  };

  const sendBulk = async (input: Parameters<typeof bulk.mutateAsync>[0]) => {
    const res = await bulk.mutateAsync(input);
    if (res.applied > 0) setNeedsRevalidate(true);
    return res;
  };

  const reviewRemaining = () => {
    setResultOpen(false);
    const first = issues.find((i) => i.status === "open");
    update({ status: "open", issue: first?.id ?? null }, { replace: true });
  };

  let panel: React.ReactNode = null;
  if (revalRunning) {
    panel = <RevalidatingPanel session={session} revalidation={revalidation} productTitle={productTitle} validCount={imported} remaining={session.issues.open} />;
  } else if (resultOpen && revalidation?.status === "complete") {
    panel = <RevalidationResultPanel revalidation={revalidation} productTitle={productTitle} committed={session.status === "committed"} openIssues={issues.filter((i) => i.status === "open")} openTotal={session.issues.open} onReview={reviewRemaining} />;
  } else if (selected) {
    panel = (
      <IssueDetail
        key={`${selected.id}:${selected.status}:${selected.resolvedAt ?? ""}`}
        issue={selected}
        editable={editable && !busy}
        busy={resolve.isPending}
        openOfCode={openOfCode(selected.code)}
        categories={categories.data ?? []}
        onResolve={(choice) => settle(selected, choice)}
        onBulk={setBulkRequest}
        onUpload={(file) => sendImage(selected, file)}
        uploading={uploadPercent}
      />
    );
  }

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
        {editable && (
          <Button size="sm" className="text-xs" onClick={() => setCommitOpen(true)}>
            Import rows
          </Button>
        )}
        <Link to={ROUTES.PRODUCTS} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
          Go to products
        </Link>
      </StateBox>
    );
  } else {
    body = (
      <>
        <div role="tablist" aria-label="View" className="flex gap-1.5 pt-3">
          {(["issues", "rows"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => update({ view: v, code: null, severity: null, status: null, q: null, rows: null })} className={`rounded-[5px] px-3 py-1.5 text-[12px] font-medium ${view === v ? "bg-[#000000] text-white dark:bg-white dark:text-black" : "text-[#666666] hover:bg-[#F6F6F6]"}`}>
              {v === "issues" ? "Issues" : "All rows"}
            </button>
          ))}
        </div>

        {view === "issues" ? (
          <>
            <IssueFilters summary={summary.data} url={url} filtered={filtered} fields={(options.data?.targetFields ?? []).map((f) => ({ key: f.key, label: f.label }))} onChange={(patch) => update(patch)} onClear={clearFilters} />
            <div className="pt-4">
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
                <div className="flex flex-col lg:flex-row gap-12 items-start w-full">
                  <div className="flex-1 min-w-0 w-full space-y-3">
                    <IssueList
                      issues={issues}
                      selectedId={selected?.id}
                      refreshing={issuesQuery.isFetching && issuesQuery.isPlaceholderData}
                      checking={revalRunning}
                      total={issuesQuery.data?.total ?? issues.length}
                      onSelect={(i) => {
                        setResultOpen(false);
                        update({ issue: i.id }, { replace: true });
                      }}
                    />
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
                  {panel}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4 pt-4">
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
          </div>
        )}
      </>
    );
  }

  return (
    <div className="w-full min-h-full pb-28 text-foreground">
      {header}

      <KpiCards session={session} />
      <ReviewProgress session={session} revalidation={revalidation} revalidating={revalRunning} pending={needsRevalidate} />
      <CountersRibbon session={session} />

      <div className="space-y-3 pt-3">
        {!canWrite && <Alert tone="info">You are viewing this import read-only. Changing issues needs the imports write permission.</Alert>}
        {session.status === "failed" && <Alert>{session.failureMessage ?? "This import failed."}</Alert>}
        {session.status === "cancelled" && <Alert tone="warning">This import was cancelled. Its issues can be viewed but not changed.</Alert>}
        {session.status === "committing" && (
          <section className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <h2 className="text-base font-bold text-foreground">Importing your products</h2>
            <div className="mt-4">
              <ImportProgress session={session} mode="commit" />
            </div>
            <Link to={processingUrl(session.id)} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4 text-xs" })}>
              View live progress
            </Link>
          </section>
        )}
        {(session.status === "committed" || session.status === "partially_committed") && (
          <div className="flex flex-wrap gap-2">
            <Link to={processingUrl(session.id)} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
              View import activity
            </Link>
            {session.status === "committed" && (
              <Link to={ROUTES.PRODUCTS} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
                View products
              </Link>
            )}
          </div>
        )}
        {editable && needsRevalidate && !busy && <Alert tone="warning">You changed rows since the last validation. Revalidate to refresh the counts before importing.</Alert>}
      </div>

      {body}

      <div className="fixed bottom-0 left-0 lg:left-[224px] right-0 h-[72px] border-t border-[#E3E3E3] dark:border-border bg-white dark:bg-background px-10 z-40 flex items-center justify-between">
        <div className="text-[12px] leading-[18px] text-[#666666]">
          <span className="font-medium text-[#000000] dark:text-white">{num(imported)} valid products remain imported.</span> Only affected records need attention. Fix → Revalidate → Continue
        </div>

        <div className="flex items-center gap-3">
          {editable && (
            <Button variant="outline" disabled={revalRunning || busy} loading={revalidate.isPending} onClick={revalidateNow} className={OUTLINE}>
              {revalRunning ? "Revalidating..." : "Revalidate"}
            </Button>
          )}
          {editable ? (
            <Button onClick={() => setCommitOpen(true)} className={PRIMARY}>
              Continue →
            </Button>
          ) : (
            <Link to={ROUTES.PRODUCTS_IMPORT} className={cn(buttonVariants(), PRIMARY)}>
              Continue →
            </Link>
          )}
        </div>
      </div>

      <BulkResolveDialog request={bulkRequest} categories={categories.data ?? []} onSubmit={sendBulk} onClose={() => setBulkRequest(null)} />
      {canWrite && ["validated", "partially_committed", "committing", "committed"].includes(session.status) && (
        <CommitDialog open={commitOpen} onOpenChange={setCommitOpen} session={session} options={options.data} eligible={eligible} needsRevalidate={needsRevalidate} onRevalidated={() => setNeedsRevalidate(false)} />
      )}
    </div>
  );
}
