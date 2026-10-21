import { useMemo } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { useImportMapping, useImportRows, useUpdateMapping } from "@/hooks/useImport";
import type { ImportOptions, ImportSession, MappingColumn, TargetField } from "@/types/import";
import { Alert, LoadError, PanelSkeleton } from "../ImportStates";
import { importErrorMessage, num } from "../importFormat";

const IGNORE = "";
const GROUP_LABELS: Record<string, string> = {
  identity: "Identity",
  content: "Content",
  taxonomy: "Category",
  pricing: "Pricing and tax",
  inventory: "Stock and shipping",
  media: "Images",
  variants: "Variant options",
};

function Confidence({ column }: { column: MappingColumn }) {
  if (!column.targetField) return <span className="text-[11px] text-muted-foreground">Not imported</span>;
  const label = column.status === "manual" ? "Set by you" : `${column.confidence}%`;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={column.status === "manual" ? "h-full bg-blue-500" : "h-full bg-emerald-500"} style={{ width: `${column.confidence}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function groupFields(fields: TargetField[]): Array<[string, TargetField[]]> {
  const groups = new Map<string, TargetField[]>();
  for (const f of fields) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
  return [...groups.entries()];
}

interface Props {
  session: ImportSession;
  options: UseQueryResult<ImportOptions>;
  canWrite: boolean;
  onBack: () => void;
  onNext: () => void;
}

/** Step 2: the columns of the file against the product fields, auto-detected by the API and changeable one by one. */
export function MappingStep({ session, options, canWrite, onBack, onNext }: Props) {
  const mapping = useImportMapping(session.id);
  const preview = useImportRows(session.id, { page: 1, pageSize: 5 });
  const update = useUpdateMapping(session.id);
  const fields = useMemo(() => options.data?.targetFields ?? [], [options.data]);
  const groups = useMemo(() => groupFields(fields), [fields]);

  if (mapping.isLoading || options.isLoading) return <PanelSkeleton rows={6} />;
  if (mapping.isError || !mapping.data) return <LoadError title="The column mapping could not be loaded." message={errorMessage(mapping.error)} onRetry={() => void mapping.refetch()} />;
  if (options.isError || !options.data) return <LoadError title="Import options could not be loaded." message={errorMessage(options.error)} onRetry={() => void options.refetch()} />;

  const view = mapping.data;
  const mapped = view.columns.filter((c) => c.targetField).length;
  const blocked = view.missingRequired.length > 0;
  const usedBy = new Map(view.columns.filter((c) => c.targetField).map((c) => [c.targetField as string, c.sourceColumn]));
  const requiredFields = fields.filter((f) => f.required);
  const rows = preview.data?.items ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="mapping-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="mapping-title" className="text-base font-semibold text-foreground">
              Match your columns
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{session.fileName}</span> has {num(view.columns.length)} columns and {num(session.counters.total)} rows. Detected layout:{" "}
              <span className="font-medium text-foreground">{view.preset.label}</span>.
            </p>
          </div>
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${blocked ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
            {blocked ? <CircleAlert className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            {num(mapped)} of {num(view.columns.length)} columns mapped
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Required fields">
          {requiredFields.map((f) => {
            const missing = view.missingRequired.some((m) => m.key === f.key);
            return (
              <li key={f.key} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${missing ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {missing ? <CircleAlert className="h-3 w-3" aria-hidden /> : <CheckCircle2 className="h-3 w-3" aria-hidden />}
                {f.label}
                <span className="sr-only">{missing ? " is not mapped" : " is mapped"}</span>
              </li>
            );
          })}
        </ul>

        {update.isError && (
          <div className="mt-4">
            <Alert>{importErrorMessage(update.error, "The mapping could not be saved.")}</Alert>
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
              <tr>
                <th className="py-3 pl-4 pr-3">Column in your file</th>
                <th className="px-3 py-3">Sample values</th>
                <th className="px-3 py-3">Match</th>
                <th className="py-3 pl-3 pr-4">Import it as</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {view.columns.map((col) => {
                const saving = update.isPending && update.variables?.sourceColumn === col.sourceColumn;
                return (
                  <tr key={col.sourceColumn} className="hover:bg-muted/20">
                    <td className="py-3 pl-4 pr-3 font-mono font-medium text-foreground">
                      {col.sourceColumn}
                      {col.isRequired && <span className="ml-1 text-destructive">*</span>}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-muted-foreground" title={col.sampleValues.join(", ")}>
                      {col.sampleValues.length ? col.sampleValues.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Confidence column={col} />
                    </td>
                    <td className="py-3 pl-3 pr-4">
                      <select
                        aria-label={`Import column ${col.sourceColumn} as`}
                        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs disabled:opacity-60"
                        value={col.targetField ?? IGNORE}
                        disabled={!canWrite || saving}
                        onChange={(e) => update.mutate({ sourceColumn: col.sourceColumn, targetField: e.target.value === IGNORE ? null : e.target.value })}
                      >
                        <option value={IGNORE}>Do not import this column</option>
                        {groups.map(([group, list]) => (
                          <optgroup key={group} label={GROUP_LABELS[group] ?? group}>
                            {list.map((f) => {
                              const other = usedBy.get(f.key);
                              return (
                                <option key={f.key} value={f.key}>
                                  {f.label}
                                  {f.required ? " (required)" : ""}
                                  {other && other !== col.sourceColumn ? ` - replaces "${other}"` : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="preview-title">
        <h2 id="preview-title" className="text-sm font-semibold text-foreground">
          First rows of your file
        </h2>
        {preview.isLoading ? (
          <div className="mt-3 h-24 animate-pulse rounded-md bg-muted" aria-busy="true" />
        ) : preview.isError ? (
          <p className="mt-2 text-xs text-muted-foreground">The preview could not be loaded: {errorMessage(preview.error)}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-[11px]">
              <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  {session.headers.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.rowNumber}</td>
                    {session.headers.map((h) => (
                      <td key={h} className="max-w-[180px] truncate px-3 py-2 text-foreground" title={r.raw[h]}>
                        {r.raw[h] || <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {blocked && (
            <p className="text-xs text-amber-800" role="status">
              Map the required columns first: {view.missingRequired.map((m) => m.label).join(", ")}
            </p>
          )}
          <Button className="gap-2" disabled={blocked || update.isPending} onClick={onNext}>
            Continue to settings <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
