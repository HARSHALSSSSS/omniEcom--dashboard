import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryOption } from "@/hooks/useProducts";
import { formatINR } from "@/utils/format";
import type { ImportIssue, ResolveInput } from "@/types/import";
import { codeLabel, num, when } from "../importFormat";

export interface BulkRequest {
  code: string;
  action: "accept_suggestion" | "custom_value" | "ignore";
  /** only the issues that show exactly this value */
  sourceValue?: string;
  /** what the dialog says it does */
  label: string;
  /** the dialog asks for the value */
  needsValue?: boolean;
}

interface Props {
  issue: ImportIssue;
  /** the seller may change issues (write permission and a validated import) */
  editable: boolean;
  /** a change is being saved */
  busy: boolean;
  /** open issues of the same kind (for the "all of them" actions) */
  openOfCode: number | undefined;
  categories: CategoryOption[];
  onResolve: (input: Omit<ResolveInput, "issueId">) => void;
  onBulk: (request: BulkRequest) => void;
}

const isWebUrl = (v: string | undefined): v is string => Boolean(v && /^https?:\/\//i.test(v));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-xs text-foreground">{children}</dd>
    </div>
  );
}

/** The workspace for one issue: the row it belongs to, and the three ways to settle it (suggestion, own value, ignore). */
export function IssueDetail({ issue, editable, busy, openOfCode, categories, onResolve, onBulk }: Props) {
  const [custom, setCustom] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const isCategory = issue.code === "category_unmapped" || issue.suggestion?.kind === "map_category" || issue.field === "category";
  const open = issue.status === "open";
  const p = issue.productData;
  const price = p.price === undefined ? null : issue.unit === "paise" ? formatINR(p.price) : formatINR(Math.round(p.price * 100));
  const skipRow = issue.suggestion?.kind === "skip_row";
  const many = (openOfCode ?? 0) > 1;
  const title = codeLabel(issue.code);
  const field = issue.field ?? issue.affectedFields[0] ?? "value";

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-label={`Issue in row ${issue.rowNumber}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-muted-foreground">Row {issue.rowNumber}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{title}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${issue.severity === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{issue.severity}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground">{issue.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${open ? "bg-amber-50 text-amber-700" : issue.status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}
        >
          {open ? "Open" : issue.status === "resolved" ? "Resolved" : "Ignored"}
        </span>
      </div>

      <div className="mt-4 flex gap-4 rounded-lg border border-border bg-muted/20 p-4">
        {isWebUrl(p.imageUrl) && <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-md border border-border bg-muted object-cover" />}
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Field label="Title">{p.title || "—"}</Field>
          <Field label="SKU">
            <span className="font-mono">{p.sku || "—"}</span>
          </Field>
          <Field label="Category">{p.category || "—"}</Field>
          <Field label="Price">{price ?? "—"}</Field>
          <Field label="Barcode">
            <span className="font-mono">{p.barcode || "—"}</span>
          </Field>
          <Field label="Value in the file">
            <span className="font-mono">{issue.sourceValue || "—"}</span>
          </Field>
        </dl>
      </div>
      {Object.keys(p.source).length > 0 && (
        <details className="mt-3 rounded-lg border border-border text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-foreground">All columns of this row</summary>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-border p-3 sm:grid-cols-2">
            {Object.entries(p.source).map(([k, v]) => (
              <div key={k} className="flex min-w-0 gap-2">
                <dt className="shrink-0 font-mono text-muted-foreground">{k}:</dt>
                <dd className="truncate text-foreground" title={v}>
                  {v || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {!open && (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="h-4 w-4 text-emerald-600" aria-hidden />
          {issue.currentFix ?? (issue.status === "ignored" ? "Ignored" : "Resolved")}
          {issue.resolvedAt && <span>· {when(issue.resolvedAt)}</span>}
        </p>
      )}

      {open && !editable && <p className="mt-5 text-xs text-muted-foreground">This import can only be viewed here: issues can be changed by people with the imports write permission, and only while the import is validated.</p>}

      {open && editable && (
        <div className="mt-6 space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Choose a resolution</h4>

          {issue.suggestion && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
                  <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden /> Suggested fix
                </div>
                <Button size="sm" className="h-7 bg-emerald-700 text-xs text-white hover:bg-emerald-800" disabled={busy} onClick={() => onResolve({ action: "accept_suggestion" })}>
                  {skipRow ? "Skip this row" : "Accept suggestion"}
                </Button>
              </div>
              <p className="mt-2 font-mono text-xs font-medium text-emerald-900">{issue.suggestedFix ?? issue.suggestion.label ?? issue.suggestion.value}</p>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-border p-4">
            <p className="text-xs font-semibold text-foreground">{isCategory ? "Pick the right category" : "Type the correct value"}</p>
            {isCategory ? (
              <div className="flex gap-2">
                <select aria-label="Category" className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Select one of your categories…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={!categoryId || busy} onClick={() => onResolve({ action: "custom_value", customValue: categoryId })}>
                  Apply
                </Button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (custom.trim() && !busy) onResolve({ action: "custom_value", customValue: custom.trim() });
                }}
              >
                <input
                  aria-label="Custom value"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  placeholder={`New ${field}`}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
                <Button type="submit" size="sm" variant="outline" disabled={!custom.trim() || busy}>
                  Apply
                </Button>
              </form>
            )}
          </div>

          <div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => onResolve({ action: "ignore" })}>
              {issue.severity === "error" ? "Ignore this issue (the row is left out of the import)" : "Ignore this warning (import the row as it is)"}
            </Button>
          </div>

          {many && (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="text-xs font-semibold text-foreground">
                {num(openOfCode)} open issues of this kind: {title}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {issue.suggestion && !skipRow && (
                  <Button size="sm" variant="outline" className="text-xs" disabled={busy} onClick={() => onBulk({ code: issue.code, action: "accept_suggestion", label: `Accept the suggested fix for all ${num(openOfCode)} open issues of this kind` })}>
                    Accept suggestions for all
                  </Button>
                )}
                {issue.sourceValue && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={busy}
                    onClick={() => onBulk({ code: issue.code, action: "custom_value", needsValue: true, sourceValue: issue.sourceValue ?? undefined, label: `Set one value for every row showing "${issue.sourceValue}"` })}
                  >
                    Set a value for rows showing the same
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-xs" disabled={busy} onClick={() => onBulk({ code: issue.code, action: "ignore", label: `Ignore all ${num(openOfCode)} open issues of this kind` })}>
                  Ignore all
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
