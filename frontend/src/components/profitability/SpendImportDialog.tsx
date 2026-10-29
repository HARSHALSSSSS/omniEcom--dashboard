import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useImportSpend } from "@/hooks/useProfitability";
import type { ImportUnit, SpendImportResult } from "@/types/profitability";

const MAX_FILE_BYTES = 1_000_000;
/** the layout of the file, with today as the example date */
const SAMPLE = `date,amount,account,campaign,notes\n${new Date().toISOString().slice(0, 10)},1250.50,,Sponsored products,week 1\n`;

function Summary({ r }: { r: SpendImportResult }) {
  return (
    <div role="status" className="space-y-2 text-xs">
      <p className="font-medium">
        {r.dryRun ? "Checked, nothing was saved. " : ""}
        {r.rows} {r.rows === 1 ? "row" : "rows"}: {r.created} new, {r.updated} updated, {r.unchanged} unchanged, {r.failed} with a problem.
      </p>
      {r.errors.length > 0 && (
        <ul className="max-h-[220px] divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label="Row problems">
          {r.errors.map((e, i) => (
            <li key={`${e.row}-${i}`} className="px-3 py-1.5">
              <span className="font-mono font-semibold">Row {e.row}</span>
              {e.field ? <span className="text-muted-foreground"> ({e.field})</span> : null}
              <span className="block text-[11px] text-muted-foreground">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
      {r.failed > r.errors.length && <p className="text-[11px] text-muted-foreground">Only the first {r.errors.length} problems are listed.</p>}
    </div>
  );
}

/** advertising spend from a CSV: check it first (a dry run), then import. Importing the same file twice changes nothing. */
export function SpendImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importer = useImportSpend();
  const [csv, setCsv] = useState("");
  const [unit, setUnit] = useState<ImportUnit>("rupees");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpendImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCsv("");
    setUnit("rupees");
    setFileName(null);
    setError(null);
    setResult(null);
  }, [open]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 1 MB. Split it into smaller files.");
      return;
    }
    setError(null);
    setResult(null);
    setFileName(file.name);
    setCsv(await file.text());
  };

  const run = (dryRun: boolean) => {
    setError(null);
    importer.mutate({ csv, unit, dryRun }, { onSuccess: setResult, onError: (e) => setError(errorMessage(e)) });
  };

  const imported = result !== null && !result.dryRun;
  const edit = (text: string, name: string | null) => {
    setCsv(text);
    setFileName(name);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !importer.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import advertising spend</DialogTitle>
          <DialogDescription className="text-xs">
            Columns: <code className="font-mono">date</code> (YYYY-MM-DD or DD/MM/YYYY), <code className="font-mono">amount</code>, and optionally <code className="font-mono">account</code> (account name, id or seller id; empty means not tied to one),{" "}
            <code className="font-mono">campaign</code>, <code className="font-mono">notes</code>. A row is identified by date, account and campaign, so a corrected amount updates its row. Up to 1 MB.
          </DialogDescription>
        </DialogHeader>

        {!imported && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={input} type="file" accept=".csv,text/csv,text/plain" aria-label="CSV file" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => input.current?.click()}>
                Choose a CSV file
              </Button>
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => edit(SAMPLE, null)}>
                Use an example
              </Button>
            </div>
            <Textarea aria-label="CSV text" rows={7} value={csv} onChange={(e) => edit(e.target.value, null)} placeholder={SAMPLE} className="font-mono text-xs" />
            <fieldset className="flex flex-wrap items-center gap-4 text-xs">
              <legend className="sr-only">Amount unit</legend>
              <span className="font-medium text-muted-foreground">Amounts are in</span>
              {(["rupees", "paise"] as const).map((u) => (
                <label key={u} className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" name="spend-unit" value={u} checked={unit === u} onChange={() => { setUnit(u); setResult(null); }} />
                  {u === "rupees" ? "Rupees (up to two decimals)" : "Paise (whole numbers)"}
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}
        {result && <Summary r={result} />}

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          {imported ? (
            <Button size="sm" className="w-full sm:w-auto h-10 sm:h-9" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto h-10 sm:h-9" disabled={importer.isPending} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto h-10 sm:h-9" disabled={csv.trim() === "" || importer.isPending} onClick={() => run(true)}>
                Check without saving
              </Button>
              <Button type="button" size="sm" className="w-full sm:w-auto h-10 sm:h-9" loading={importer.isPending} disabled={csv.trim() === ""} onClick={() => run(false)}>
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
