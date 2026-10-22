import type { ImportSession } from "@/types/import";
import type { ImportRevalidation } from "@/types/importProcessing";
import { ImportStatusChip } from "../ImportStatusChip";
import { num } from "../importFormat";
import { importedOf } from "./issuesModel";

const KPI = "p-4 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-[#F6F6F6] dark:bg-card/40";


function Kpi({ value, label }: { value: number; label: string }) {
  return (
    <div className={KPI}>
      <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white tabular-nums">{num(value)}</div>
      <div className="text-[12px] leading-[18px] text-[#666666] mt-0.5">{label}</div>
    </div>
  );
}

/** The five KPI cards of the design, fed by the counters of GET /imports/{id}. */
export function KpiCards({ session }: { session: ImportSession }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
      <Kpi value={session.counters.total} label="products" />
      <Kpi value={importedOf(session)} label="imported" />
      <Kpi value={session.issues.open} label="require attention" />
      <Kpi value={session.issues.openErrors} label="blocking" />
      <Kpi value={session.issues.openWarnings} label="warnings" />
    </div>
  );
}

/** "N of M issues reviewed" with its bar, and the state of the corrections. */
export function ReviewProgress({ session, revalidation, revalidating, pending }: { session: ImportSession; revalidation: ImportRevalidation | null; revalidating: boolean; pending: boolean }) {
  const total = session.issues.total;
  const reviewed = session.issues.resolved + session.issues.ignored;
  const percent = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const status = revalidating
    ? `${num(revalidation?.total ?? session.issues.resolved)} corrections being revalidated`
    : revalidation?.status === "complete"
      ? `${num(revalidation.changes.length)} corrections validated · ${num(session.issues.open)} not yet reviewed`
      : pending || reviewed > 0
        ? "Reviewed corrections await revalidation"
        : "No corrections yet";
  return (
    <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between text-[12px] leading-[18px] text-[#666666] gap-2">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-[#000000] dark:text-white">
          {num(reviewed)} of {num(total)} issues reviewed
        </span>
        <div className="w-48 h-[3px] bg-[#E0E0E0] dark:bg-muted relative overflow-hidden" role="progressbar" aria-label="Issues reviewed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="h-full bg-[#000000] dark:bg-white transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
        <span>{num(session.issues.open)} issues remaining to review</span>
      </div>
      <span className="text-[11px] leading-[17px] font-medium text-[#666666]">{status}</span>
    </div>
  );
}

function Counter({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-medium text-[#666666]">{label}</span>
      <span className={`font-mono text-[12px] font-bold tabular-nums ${tone}`}>{num(value)}</span>
    </div>
  );
}

/** The counters ribbon: status and every counter of the import. */
export function CountersRibbon({ session }: { session: ImportSession }) {
  const c = session.counters;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
      <ImportStatusChip status={session.status} />
      <Counter label="Rows" value={c.total} />
      <Counter label="Valid" value={c.valid} tone="text-emerald-700" />
      <Counter label="Warnings" value={c.warning} tone="text-amber-700" />
      <Counter label="Errors" value={c.error} tone="text-red-700" />
      <Counter label="Open issues" value={session.issues.open} tone="text-red-700" />
      <Counter label="Resolved" value={session.issues.resolved} tone="text-emerald-700" />
      <Counter label="Ignored" value={session.issues.ignored} />
    </div>
  );
}
