import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { Catalog, CatalogEntry } from "@/types/reports";

interface ReportsCatalogSectionProps {
  catalog: Catalog | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  canWrite: boolean;
  noWrite?: string;
  activeSchedules: number | undefined;
  onGenerate: (entry: CatalogEntry) => void;
  onCreateSchedule: () => void;
}

const ALL = "All reports";

/** the reports the server offers (GET /reports/catalog), filterable by category and name; Export opens the real generate dialog */
export function ReportsCatalogSection({ catalog, loading, error, onRetry, canWrite, noWrite, activeSchedules, onGenerate, onCreateSchedule }: ReportsCatalogSectionProps) {
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  const entries = useMemo(() => catalog?.types ?? [], [catalog]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [{ label: ALL, count: entries.length }, ...[...counts.entries()].map(([label, count]) => ({ label, count }))];
  }, [entries]);

  const q = query.trim().toLowerCase();
  const filtered = entries.filter((e) => (category === ALL || e.category === category) && (!q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)));

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Available reports</h3>
            <span className="text-xs text-muted-foreground">{loading ? "Loading..." : `${entries.length} reports you can generate for any dates`}</span>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="text" placeholder="Find a report..." aria-label="Find a report" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 sm:h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs" />
          </div>
        </div>

        {error && !catalog ? (
          <div role="alert" className="flex items-center justify-between rounded-lg border border-border p-4 text-xs">
            <span className="text-rose-700">{error}</span>
            <Button size="sm" variant="outline" className="text-xs" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setCategory(c.label)}
                  className={cn("rounded-md px-3 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0 text-xs font-medium transition-colors", category === c.label ? "bg-foreground font-semibold text-background" : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground")}
                >
                  {c.label} <span className="font-mono opacity-70">{c.count}</span>
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
                    <th className="px-4 py-2.5">Report</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Sheets</th>
                    <th className="px-4 py-2.5">Formats</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        {loading ? "Loading..." : "No report matches."}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((e) => (
                      <tr key={e.type}>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                            </div>
                            <div>
                              <span className="font-semibold text-foreground">{e.title}</span>
                              <p className="text-[11px] text-muted-foreground">{e.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{e.category}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.sheets.length > 0 ? e.sheets.join(", ") : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.formats.map((f) => f.toUpperCase()).join(" · ")}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" disabled={!canWrite} title={noWrite} onClick={() => onGenerate(e)} aria-label={`Export ${e.title}`}>
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Export
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Keep your team informed</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeSchedules === undefined ? "Choose a report, recipients and cadence." : activeSchedules > 0 ? `${activeSchedules} active ${activeSchedules === 1 ? "schedule sends" : "schedules send"} reports on a cadence.` : "No schedules are active; nothing is sent automatically."}
          </p>
        </div>
        <Button size="sm" className="w-full sm:w-auto h-10 sm:h-9 shrink-0 gap-1.5 text-xs" disabled={!canWrite || !catalog} title={noWrite} onClick={onCreateSchedule}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Create schedule
        </Button>
      </div>
    </div>
  );
}
