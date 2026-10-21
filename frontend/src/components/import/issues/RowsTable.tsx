import { Fragment, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ImportRow } from "@/types/import";
import { num } from "../importFormat";

const STATUS_CLASS: Record<string, string> = {
  valid: "bg-emerald-50 text-emerald-700",
  committed: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
  ignored: "bg-muted text-muted-foreground",
  skipped: "bg-muted text-muted-foreground",
  pending: "bg-blue-50 text-blue-700",
};

const PLAN: Record<string, string> = { create: "Create product", add_variant: "Add variant", update: "Update" };
const RESULT: Record<string, string> = { created: "Created", updated: "Updated", variant_added: "Variant added", skipped: "Skipped" };

export function RowsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading rows">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function Detail({ row }: { row: ImportRow }) {
  const values = Object.entries(row.values).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Imported as</p>
        <dl className="mt-2 space-y-1 text-[11px]">
          {values.length === 0 && <p className="text-muted-foreground">Nothing to import for this row.</p>}
          {values.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 font-mono text-muted-foreground">{k}:</dt>
              <dd className="min-w-0 truncate text-foreground" title={String(v)}>
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In your file</p>
        <dl className="mt-2 space-y-1 text-[11px]">
          {Object.entries(row.raw).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 font-mono text-muted-foreground">{k}:</dt>
              <dd className="min-w-0 truncate text-foreground" title={v}>
                {v || "—"}
              </dd>
            </div>
          ))}
        </dl>
        {row.result?.notes && row.result.notes.length > 0 && <p className="mt-3 text-[11px] text-muted-foreground">{row.result.notes.join(" · ")}</p>}
      </div>
    </div>
  );
}

/** the rows of the file with the status the validation gave them (and, after the commit, what happened to them) */
export function RowsTable({ rows, refreshing }: { rows: ImportRow[]; refreshing: boolean }) {
  const [openRow, setOpenRow] = useState<number | null>(null);
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card ${refreshing ? "opacity-70" : ""}`}>
      <table className="w-full min-w-[720px] text-left text-xs">
        <caption className="sr-only">Rows of the import file</caption>
        <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="w-16 py-2.5 pl-4 pr-2">
              Row
            </th>
            <th scope="col" className="px-2 py-2.5">
              Status
            </th>
            <th scope="col" className="px-2 py-2.5">
              SKU
            </th>
            <th scope="col" className="px-2 py-2.5">
              Title
            </th>
            <th scope="col" className="px-2 py-2.5">
              Issues
            </th>
            <th scope="col" className="px-2 py-2.5">
              Plan / result
            </th>
            <th scope="col" className="py-2.5 pl-2 pr-4 text-right">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const expanded = openRow === r.rowNumber;
            return (
              <Fragment key={r.rowNumber}>
                <tr className="hover:bg-muted/30">
                  <td className="py-2.5 pl-4 pr-2 font-mono font-semibold text-muted-foreground">{r.rowNumber}</td>
                  <td className="px-2 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_CLASS[r.status] ?? "bg-muted text-muted-foreground"}`}>{r.status}</span>
                  </td>
                  <td className="px-2 py-2.5 font-mono">{r.sku ?? "—"}</td>
                  <td className="max-w-[260px] truncate px-2 py-2.5" title={r.title ?? undefined}>
                    {r.title ?? "—"}
                  </td>
                  <td className="px-2 py-2.5 tabular-nums">{num(r.issueCount)}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">
                    {r.result ? RESULT[r.result.action] : r.plan ? PLAN[r.plan] : r.skipReason ?? "—"}
                    {r.fixed && <span className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700">fixed</span>}
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-right">
                    <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} details of row ${r.rowNumber}`} className="text-[11px] font-semibold text-primary hover:underline" onClick={() => setOpenRow(expanded ? null : r.rowNumber)}>
                      {expanded ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-muted/20">
                    <td colSpan={7}>
                      <Detail row={r} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
