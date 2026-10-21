import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MinusCircle } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useImportCompetitors } from "@/hooks/usePricing";
import type { CompetitorImportResult } from "@/types/pricing";

const MAX_FILE_BYTES = 1_000_000;
const SAMPLE = "sku,price,seller\nKURTA-M,1299,Rival Store\n";

/** competitor prices from a CSV (header `sku,price,seller`, price in rupees, up to 2000 rows); every row is reported */
export function CompetitorImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importer = useImportCompetitors();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompetitorImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCsv("");
    setFileName(null);
    setError(null);
    setResult(null);
  }, [open]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 1 MB. Split it into smaller files of up to 2000 rows.");
      return;
    }
    setError(null);
    setFileName(file.name);
    setCsv(await file.text());
  };

  const run = () => {
    setError(null);
    importer.mutate(csv, { onSuccess: setResult, onError: (e) => setError(errorMessage(e)) });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !importer.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import competitor prices</DialogTitle>
          <DialogDescription className="text-xs">
            Upload or paste a CSV with the header <code className="font-mono">sku,price,seller</code>. Prices are in rupees. A row with a problem never blocks the others.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={input} type="file" accept=".csv,text/csv,text/plain" aria-label="CSV file" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => input.current?.click()}>
                Choose a CSV file
              </Button>
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => { setCsv(SAMPLE); setFileName(null); }}>
                Use an example
              </Button>
            </div>
            <Textarea aria-label="CSV text" rows={7} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(null); }} placeholder={SAMPLE} className="font-mono text-xs" />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2" role="status">
            <p className="text-xs">
              {result.imported} of {result.total} rows imported{result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.
            </p>
            <ul className="max-h-[260px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {result.rows.map((r) => (
                <li key={r.line} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                  {r.status === "imported" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Imported" /> : <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Skipped" />}
                  <span className="min-w-0">
                    <span className="font-mono font-semibold">
                      Line {r.line} · {r.sku || "(no SKU)"}
                    </span>
                    {r.reason && <span className="block text-[11px] text-muted-foreground">{r.reason}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {result ? (
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" disabled={importer.isPending} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" size="sm" loading={importer.isPending} disabled={csv.trim() === ""} onClick={run}>
                Import prices
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
