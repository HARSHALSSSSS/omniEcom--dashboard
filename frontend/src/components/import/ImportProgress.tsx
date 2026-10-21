import type { ImportSession } from "@/types/import";
import { formatEta, num } from "./importFormat";

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{num(value)}</p>
    </div>
  );
}

/** Live progress of a validation or a commit: every number is the server's (counters of GET /imports/{id}). */
export function ImportProgress({ session, mode }: { session: ImportSession; mode: "validate" | "commit" }) {
  const c = session.counters;
  const percent = Math.max(0, Math.min(100, c.percent));
  const done = mode === "validate" ? c.processed : c.committed + c.failed;
  const caption = mode === "validate" ? `${num(c.processed)} of ${num(c.total)} rows checked` : `${num(done)} rows processed`;
  return (
    <div className="mx-auto w-full max-w-lg" aria-live="polite">
      <div className="flex justify-between text-xs font-medium text-foreground">
        <span>{caption}</span>
        <span className="font-mono text-primary">{percent}%</span>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={mode === "validate" ? "Validation progress" : "Import progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{formatEta(c.etaSeconds)}</p>
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4 text-left">
        {mode === "validate" ? (
          <>
            <Tile label="Valid rows" value={c.valid} tone="text-emerald-600" />
            <Tile label="With warnings" value={c.warning} tone="text-amber-600" />
            <Tile label="With errors" value={c.error} tone="text-red-600" />
          </>
        ) : (
          <>
            <Tile label="Imported" value={c.committed} tone="text-emerald-600" />
            <Tile label="Failed" value={c.failed} tone="text-red-600" />
            <Tile label="Total rows" value={c.total} tone="text-foreground" />
          </>
        )}
      </div>
    </div>
  );
}
