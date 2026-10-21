import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";
import { useCommitImport, useCommitPreview, useRevalidateImport } from "@/hooks/useImport";
import type { CommitMode, ImportOptions, ImportSession } from "@/types/import";
import { Alert } from "./ImportStates";
import { ImportProgress } from "./ImportProgress";
import { canReview, importErrorMessage, num, ruleOf } from "./importFormat";

interface Props {
  session: ImportSession;
  options: ImportOptions | undefined;
  /** rows that could be imported (valid + warning rows of the summary); undefined while unknown */
  eligible: number | undefined;
  canWrite: boolean;
  /** the seller changed rows after the last validation */
  needsRevalidate?: boolean;
  onRevalidated?: () => void;
  /** the commit needs a warehouse: take the seller to the settings */
  onFixSettings?: () => void;
}

/** Choose what to import and start the commit job; while it runs, shows its real progress. Shared by the wizard and the issues screen. */
export function CommitPanel({ session, options, eligible, canWrite, needsRevalidate = false, onRevalidated, onFixSettings }: Props) {
  const [mode, setMode] = useState<CommitMode>(session.issues.resolved > 0 ? "include_resolved" : "clean_only");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<{ message: string; rule: string | null } | null>(null);
  const commit = useCommitImport(session.id);
  const preview = useCommitPreview(session.id, canReview(session.status));
  const revalidate = useRevalidateImport(session.id);

  if (session.status === "committing") {
    return (
      <section className="rounded-xl border border-border bg-card p-8 text-center shadow-sm" aria-labelledby="commit-title">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden />
        <h2 id="commit-title" className="mt-4 text-lg font-bold text-foreground">
          Importing your products
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Creating products and variants, receiving stock and drafting listings. You can leave this page; the import keeps running.</p>
        <div className="mt-6">
          <ImportProgress session={session} mode="commit" />
        </div>
      </section>
    );
  }
  if (!canReview(session.status)) return null;

  const modes = options?.commitModes ?? [];
  const stale = needsRevalidate || error?.rule === "revalidate_first";
  // the exact count of the chosen mode when the server has it; otherwise the summary's valid + warning rows
  const exact = preview.data ? (mode === "include_resolved" ? preview.data.includeResolved : preview.data.cleanOnly) : undefined;
  const count = exact ?? eligible;
  const nothing = count === 0;

  const start = () => {
    setConfirm(false);
    setError(null);
    commit.mutate(mode, {
      onSuccess: (res) => toast({ title: "Import started", description: `${num(res.eligibleRows)} rows are being imported.`, variant: "success" }),
      onError: (e) => setError({ message: importErrorMessage(e, "The import could not be started."), rule: ruleOf(e) }),
    });
  };

  const runRevalidate = () => {
    setError(null);
    revalidate.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: res.queued ? "Revalidation started" : res.status === "clean" ? "All issues resolved" : "Revalidated", description: res.queued ? undefined : `${num(res.remainingIssuesCount)} issue(s) remain.` });
        onRevalidated?.();
      },
      onError: (e) => setError({ message: importErrorMessage(e, "The import could not be revalidated."), rule: ruleOf(e) }),
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="commit-title">
      <h2 id="commit-title" className="text-base font-semibold text-foreground">
        Import into your catalogue
      </h2>
      <fieldset className="mt-4 space-y-3" disabled={!canWrite}>
        <legend className="sr-only">What to import</legend>
        {modes.map((m) => (
          <label key={m.value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${mode === m.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/30"}`}>
            <input type="radio" name="commit-mode" className="mt-0.5 h-4 w-4" checked={mode === m.value} onChange={() => setMode(m.value as CommitMode)} />
            <span>
              <span className="block text-xs font-semibold text-foreground">{m.label}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {count !== undefined && !nothing && (
        <p className="mt-3 text-xs text-muted-foreground">
          {exact === undefined ? "Up to " : ""}
          <span className="font-semibold text-foreground">{num(count)}</span> rows can be imported. Rows with an open error are never imported.
        </p>
      )}
      {nothing && (
        <div className="mt-3">
          <Alert tone="warning">No row can be imported yet. Fix the errors first, then revalidate.</Alert>
        </div>
      )}
      {stale && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Alert tone="warning">You changed rows after the last validation. Revalidate before importing.</Alert>
          {canWrite && (
            <Button variant="outline" size="sm" className="text-xs" loading={revalidate.isPending} onClick={runRevalidate}>
              Revalidate now
            </Button>
          )}
        </div>
      )}
      {error && error.rule !== "revalidate_first" && (
        <div className="mt-3 space-y-2">
          <Alert>{error.message}</Alert>
          {error.rule === "no_warehouse" && onFixSettings && (
            <Button variant="outline" size="sm" className="text-xs" onClick={onFixSettings}>
              Open settings
            </Button>
          )}
        </div>
      )}
      {!canWrite && <p className="mt-3 text-[11px] text-muted-foreground">You can view this import but not start it: the imports write permission is needed.</p>}

      <div className="mt-5 flex justify-end">
        <Button disabled={!canWrite || nothing || stale || modes.length === 0} loading={commit.isPending} onClick={() => setConfirm(true)}>
          Import rows
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Import these rows now?"
        description={`Products and variants are created or updated in your catalogue (${modes.find((m) => m.value === mode)?.label ?? mode}). This cannot be undone in one step.`}
        confirmText="Import now"
        onConfirm={start}
      />
    </section>
  );
}
