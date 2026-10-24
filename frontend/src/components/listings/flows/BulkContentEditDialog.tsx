import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBulkContentEdit } from "@/hooks/useListingFlows";
import { MAX_SELECTION, type BulkContentEdits, type BulkContentResult } from "@/types/listingFlows";
import { buildBulkContentEdits, emptyBulkForm, type BulkContentForm } from "./flowFormat";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const SELECT = "h-8 rounded border border-neutral-300 bg-white px-2 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black";
const FIELD = "w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black";

interface Props {
  open: boolean;
  /** the selected listings, any number: they are sent in groups of 100 */
  listingIds: string[];
  onClose: () => void;
  /** a real run finished (some listings may still have failed): refresh what is on screen */
  onDone: () => void;
}

/** one section of the editor: a box that switches the change on, and its fields */
function Section({ id, title, on, onToggle, children }: { id: string; title: string; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-[#EAEAEA] p-3">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-black">
        <input id={id} type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-3.5 w-3.5 cursor-pointer accent-black" />
        {title}
      </label>
      {on && <div className="space-y-2 pl-5">{children}</div>}
    </fieldset>
  );
}

const show = (v: unknown): string => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined || v === "" ? "(empty)" : String(v));
const clip = (s: string, n = 70): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function ResultList({ result }: { result: BulkContentResult }) {
  return (
    <ul className="max-h-[300px] divide-y divide-[#EAEAEA] overflow-y-auto rounded-lg border border-[#EAEAEA]" aria-label={result.dryRun ? "Preview of the changes" : "Results"}>
      {result.results.map((r) => (
        <li key={r.id + r.index} className="flex items-start gap-2 px-3 py-2">
          {r.status === "done" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Succeeded" />
          ) : r.status === "skipped" ? (
            <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-label="Skipped" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Did not succeed" />
          )}
          <div className="min-w-0 text-xs">
            <p className="font-mono font-semibold text-black">{r.sku ?? r.id}</p>
            <p className="text-neutral-600">{r.message}</p>
            {r.changes &&
              Object.entries(r.changes).map(([field, c]) => (
                <p key={field} className="text-[11px] text-neutral-500">
                  <span className="font-medium text-neutral-700">{field}:</span> {clip(show(c.before))} → {clip(show(c.after))}
                </p>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Editor({ listingIds, onClose, onDone }: Omit<Props, "open">) {
  const bulk = useBulkContentEdit();
  const [form, setForm] = useState<BulkContentForm>(emptyBulkForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [result, setResult] = useState<BulkContentResult | null>(null);
  const ids = useMemo(() => [...new Set(listingIds)], [listingIds]);
  const set = <K extends keyof BulkContentForm>(k: K, patch: Partial<BulkContentForm[K]>) => setForm((f) => ({ ...f, [k]: { ...f[k], ...patch } }));

  const acquire = useSubmitLock();
  const run = async (dryRun: boolean) => {
    const built = buildBulkContentEdits(form);
    if (built.error) {
      setError(built.error);
      return;
    }
    const release = acquire();
    if (!release) return;
    setError(null);
    setBusy(dryRun ? "preview" : "apply");
    try {
      const merged: BulkContentResult = { action: "edit_content", dryRun, summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 }, results: [] };
      for (let i = 0; i < ids.length; i += MAX_SELECTION) {
        const part = await bulk.mutateAsync({ ids: ids.slice(i, i + MAX_SELECTION), edits: built.edits as BulkContentEdits, dryRun });
        merged.summary.total += part.summary.total;
        merged.summary.succeeded += part.summary.succeeded;
        merged.summary.failed += part.summary.failed;
        merged.summary.skipped += part.summary.skipped;
        merged.results.push(...part.results.map((r) => ({ ...r, index: merged.results.length + r.index })));
      }
      setResult(merged);
      if (!dryRun) onDone();
    } catch (e) {
      setError(errorMessage(e, "The content could not be changed. Please try again."));
    } finally {
      setBusy(null);
      release();
    }
  };

  const count = ids.length;
  const noun = count === 1 ? "listing" : "listings";
  const applied = result !== null && !result.dryRun;

  return (
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{applied ? "Content changed" : "Edit content"}</DialogTitle>
        <DialogDescription>
          {applied
            ? `${result.summary.succeeded} of ${result.summary.total} ${result.summary.total === 1 ? "listing" : "listings"} changed${result.summary.failed ? `, ${result.summary.failed} did not succeed` : ""}${result.summary.skipped ? `, ${result.summary.skipped} needed no change` : ""}.`
            : `Change the title, description, bullet points, search terms or brand of ${count} selected ${noun} at once. It is saved on each listing's marketplace only: your master product is not touched.`}
        </DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="space-y-2">
          {result.dryRun && (
            <p role="status" className="text-xs text-neutral-600">
              Preview: {result.summary.succeeded} of {result.summary.total} would change{result.summary.skipped ? `, ${result.summary.skipped} already look like this` : ""}
              {result.summary.failed ? `, ${result.summary.failed} cannot be changed` : ""}. Nothing is saved yet.
            </p>
          )}
          <ResultList result={result} />
        </div>
      ) : (
        <div className="space-y-3">
          <Section id="bulk-title" title="Title" on={form.title.on} onToggle={(on) => set("title", { on })}>
            <select aria-label="Title change" value={form.title.op} onChange={(e) => set("title", { op: e.target.value as BulkContentForm["title"]["op"] })} className={SELECT}>
              <option value="prefix">Add text to the start</option>
              <option value="suffix">Add text to the end</option>
              <option value="replace">Find and replace</option>
              <option value="set">Replace the whole title</option>
            </select>
            {form.title.op === "replace" && <input aria-label="Title text to find" placeholder="Text to find" value={form.title.find} onChange={(e) => set("title", { find: e.target.value })} className={FIELD} />}
            <input
              aria-label={form.title.op === "replace" ? "Title replacement" : "Title text"}
              placeholder={form.title.op === "replace" ? "Replace with (empty removes it)" : form.title.op === "set" ? "New title" : "Text to add"}
              value={form.title.text}
              onChange={(e) => set("title", { text: e.target.value })}
              className={FIELD}
            />
          </Section>

          <Section id="bulk-description" title="Description" on={form.description.on} onToggle={(on) => set("description", { on })}>
            <select aria-label="Description change" value={form.description.op} onChange={(e) => set("description", { op: e.target.value as BulkContentForm["description"]["op"] })} className={SELECT}>
              <option value="append">Add text at the end</option>
              <option value="prepend">Add text at the start</option>
              <option value="replace">Find and replace</option>
              <option value="set">Replace the whole description</option>
            </select>
            {form.description.op === "replace" && <input aria-label="Description text to find" placeholder="Text to find" value={form.description.find} onChange={(e) => set("description", { find: e.target.value })} className={FIELD} />}
            <textarea
              aria-label={form.description.op === "replace" ? "Description replacement" : "Description text"}
              rows={3}
              placeholder={form.description.op === "replace" ? "Replace with (empty removes it)" : "Text"}
              value={form.description.text}
              onChange={(e) => set("description", { text: e.target.value })}
              className={FIELD}
            />
          </Section>

          <Section id="bulk-bullets" title="Bullet points" on={form.bulletPoints.on} onToggle={(on) => set("bulletPoints", { on })}>
            <select aria-label="Bullet points change" value={form.bulletPoints.op} onChange={(e) => set("bulletPoints", { op: e.target.value as BulkContentForm["bulletPoints"]["op"] })} className={SELECT}>
              <option value="add">Add bullet points</option>
              <option value="remove">Remove bullet points</option>
              <option value="set">Replace all bullet points</option>
              <option value="clear">Remove all bullet points</option>
            </select>
            {form.bulletPoints.op !== "clear" && <textarea aria-label="Bullet points" rows={3} placeholder="One bullet point per line" value={form.bulletPoints.text} onChange={(e) => set("bulletPoints", { text: e.target.value })} className={FIELD} />}
          </Section>

          <Section id="bulk-terms" title="Search terms" on={form.searchTerms.on} onToggle={(on) => set("searchTerms", { on })}>
            <select aria-label="Search terms change" value={form.searchTerms.op} onChange={(e) => set("searchTerms", { op: e.target.value as BulkContentForm["searchTerms"]["op"] })} className={SELECT}>
              <option value="add">Add search terms</option>
              <option value="remove">Remove search terms</option>
              <option value="set">Replace all search terms</option>
              <option value="clear">Remove all search terms</option>
            </select>
            {form.searchTerms.op !== "clear" && <textarea aria-label="Search terms" rows={2} placeholder="Separated by commas or new lines" value={form.searchTerms.text} onChange={(e) => set("searchTerms", { text: e.target.value })} className={FIELD} />}
          </Section>

          <Section id="bulk-brand" title="Brand" on={form.brand.on} onToggle={(on) => set("brand", { on })}>
            <select aria-label="Brand change" value={form.brand.op} onChange={(e) => set("brand", { op: e.target.value as "set" | "clear" })} className={SELECT}>
              <option value="set">Set the brand</option>
              <option value="clear">Go back to the master brand</option>
            </select>
            {form.brand.op === "set" && <input aria-label="Brand" placeholder="Brand" value={form.brand.text} onChange={(e) => set("brand", { text: e.target.value })} className={FIELD} />}
          </Section>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <DialogFooter className="mt-2 gap-2 sm:gap-0">
        {applied ? (
          <Button type="button" size="sm" className="text-xs" onClick={onClose}>
            Done
          </Button>
        ) : result ? (
          <>
            <Button type="button" variant="outline" size="sm" className="text-xs" disabled={busy !== null} onClick={() => setResult(null)}>
              Back
            </Button>
            <Button type="button" size="sm" className="text-xs" disabled={busy !== null || result.summary.succeeded === 0} onClick={() => void run(false)}>
              {busy === "apply" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />}
              Apply to {result.summary.succeeded} {result.summary.succeeded === 1 ? "listing" : "listings"}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" className="text-xs" disabled={busy !== null} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="text-xs" disabled={busy !== null || count === 0} onClick={() => void run(true)}>
              {busy === "preview" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />}
              Preview changes
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

/** Bulk content editor for any number of selected listings: pick what to change, preview the result per listing, then apply it */
export function BulkContentEditDialog({ open, listingIds, onClose, onDone }: { open: boolean; listingIds: string[]; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <Editor listingIds={listingIds} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}
