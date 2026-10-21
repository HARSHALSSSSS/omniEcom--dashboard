import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FIELD_SELECT, InlineError } from "@/components/procurement/procurementUi";
import { isApiError } from "@/api/errors";
import type { CatalogEntry, PeriodShortcut, ReportFormat, ReportRun } from "@/types/reports";
import { ParamFields } from "./ParamFields";
import { buildParams, valuesOf, type ParamValues } from "./reportParamsForm";
import { FORMAT_LABEL, reportErrorMessage } from "./reportsFormat";

export interface GenerateTarget {
  entry: CatalogEntry;
  format?: ReportFormat;
  params?: Record<string, unknown>;
}

interface Props {
  target: GenerateTarget | null;
  periods: PeriodShortcut[];
  onClose: () => void;
  /** POST /reports/exports; resolves with the run, throws the API error */
  onGenerate: (entry: CatalogEntry, format: ReportFormat, params: Record<string, unknown>, background: boolean) => Promise<ReportRun>;
}

/** choose a format and the parameters of a report (from the catalog), then generate it */
export function GenerateDialog({ target, periods, onClose, onGenerate }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        {target && <GenerateForm key={target.entry.type} target={target} periods={periods} onClose={onClose} onGenerate={onGenerate} />}
      </DialogContent>
    </Dialog>
  );
}

function GenerateForm({ target, periods, onClose, onGenerate }: Omit<Props, "target"> & { target: GenerateTarget }) {
  const { entry } = target;
  const [format, setFormat] = useState<ReportFormat>(target.format ?? entry.defaultFormat);
  const [values, setValues] = useState<ParamValues>(valuesOf(target.params));
  const [background, setBackground] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setServerError(null);
    const built = buildParams(entry, values, { forSchedule: false });
    setErrors(built.errors);
    if (Object.keys(built.errors).length) return;
    setBusy(true);
    try {
      await onGenerate(entry, format, built.params, background);
      onClose();
    } catch (e) {
      // the server names the field of a bad parameter as `params.<key>`
      const fields = isApiError(e) ? e.fields : null;
      const named: Record<string, string> = {};
      for (const spec of entry.params) {
        const m = fields?.[`params.${spec.key}`];
        if (m) named[spec.key] = m;
      }
      setErrors(named);
      setServerError(Object.keys(named).length ? null : reportErrorMessage(e, "The report could not be generated."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{entry.title}</DialogTitle>
        <DialogDescription>{entry.description}</DialogDescription>
      </DialogHeader>
      {serverError && <InlineError message={serverError} />}

      <Field id="gen-format" label="File format" hint={format === "csv" ? `The CSV holds one table: ${entry.csvSheet}.` : `Sheets: ${entry.sheets.join(", ")}.`}>
        <select id="gen-format" className={FIELD_SELECT} disabled={busy} value={format} onChange={(ev) => setFormat(ev.target.value as ReportFormat)}>
          {entry.formats.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
      </Field>

      <ParamFields idPrefix="gen" entry={entry} periods={periods} values={values} onChange={setValues} errors={errors} disabled={busy} />

      <label className="flex items-start gap-2 text-xs text-foreground">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={background} disabled={busy} onChange={(ev) => setBackground(ev.target.checked)} />
        <span>
          Prepare in the background
          <span className="block text-[11px] text-muted-foreground">Use this for a long period. The file downloads when it is ready, and it stays in History for 30 days.</span>
        </span>
      </label>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          Generate report
        </Button>
      </DialogFooter>
    </form>
  );
}
