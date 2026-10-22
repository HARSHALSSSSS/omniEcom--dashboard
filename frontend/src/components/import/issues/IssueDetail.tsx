import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoryOption } from "@/hooks/useProducts";
import { cn } from "@/utils/cn";
import { formatINR } from "@/utils/format";
import type { IssueAction } from "@/types/import";
import { CONFIDENCE_LABEL, MATCH_LABEL, isDuplicateCode, type IssueX } from "@/types/importProcessing";
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

export interface ResolveChoice {
  action: IssueAction;
  customValue?: string;
}

interface Props {
  issue: IssueX;
  /** the seller may change issues (write permission and a validated import) */
  editable: boolean;
  /** a change is being saved */
  busy: boolean;
  /** open issues of the same kind (for the "all of them" actions) */
  openOfCode: number | undefined;
  categories: CategoryOption[];
  onResolve: (input: ResolveChoice) => void;
  onBulk: (request: BulkRequest) => void;
  /** the file picked for an `invalid_image` issue (the page checks type and size and sends it) */
  onUpload: (file: File) => void;
  /** 0..100 while an image goes up, null otherwise */
  uploading: number | null;
}

const PRIMARY = "w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]";
const OUTLINE = "w-full text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50";
const INPUT = "text-[12px] leading-[18px] h-[36px] bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[5px]";
const CARD = "p-4 bg-white dark:bg-card rounded-[6px] border border-[#E3E3E3] dark:border-border";
const SMALL = "text-[11px] leading-[17px] text-[#666666]";

const isWebUrl = (v: string | undefined): v is string => Boolean(v && /^https?:\/\//i.test(v));

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 text-[12px] leading-[18px]">
      <span className="font-semibold text-[#000000] dark:text-white">{label}</span>
      <div className="text-[#666666]">{children}</div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-[#666666]">{label}</dt>
      <dd className="mt-0.5 truncate text-[12px] text-[#000000] dark:text-white">{children}</dd>
    </div>
  );
}

/** the frame of the right-hand column: "ISSUE DETAILS" and the row it is about */
export function IssuePanelFrame({ label, row, children }: { label: string; row: number | null; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="w-full lg:w-[380px] xl:w-[420px] shrink-0 bg-[#F6F6F6] dark:bg-card/40 rounded-[6px] border border-[#E3E3E3] dark:border-border p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-[#E3E3E3] dark:border-border pb-3">
        <span className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">ISSUE DETAILS</span>
        {row !== null && <span className="text-[11px] font-mono text-[#666666]">Row {row}</span>}
      </div>
      {children}
    </section>
  );
}

function SuggestionBlock({ issue }: { issue: IssueX }) {
  const confidence = issue.suggestion?.confidence ? CONFIDENCE_LABEL[issue.suggestion.confidence] : null;
  return (
    <div className="space-y-1 text-[12px] leading-[18px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#000000] dark:text-white">Suggested solution</span>
        {confidence && <span className="text-[11px] text-[#666666]">Confidence · {confidence}</span>}
      </div>
      {issue.suggestion?.confidenceReason && <p className="text-[11px] leading-[17px] text-[#666666]">{issue.suggestion.confidenceReason}</p>}
      <div className="font-semibold text-[#000000] dark:text-white text-[13px] font-mono break-all">{issue.suggestedFix ?? issue.suggestion?.label ?? issue.suggestion?.value}</div>
      <p className="text-[11px] leading-[17px] text-[#666666]">Preview · Not applied. Suggestions never change your catalog until you approve them.</p>
    </div>
  );
}

/** The workspace for one issue: the row it belongs to and the ways to settle it, laid out as the design's "Issue details" panel. */
export function IssueDetail({ issue, editable, busy, openOfCode, categories, onResolve, onBulk, onUpload, uploading }: Props) {
  const [custom, setCustom] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState("");
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [changing, setChanging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const open = issue.status === "open";
  const resolved = issue.status === "resolved";
  const p = issue.productData;
  const isCategory = issue.code === "category_unmapped" || issue.suggestion?.kind === "map_category" || issue.field === "category";
  const duplicate = isDuplicateCode(issue.code);
  const kind = duplicate ? "duplicate" : issue.code === "missing_sku" ? "sku" : issue.code === "invalid_image" ? "image" : isCategory ? "category" : "generic";
  const skipRow = issue.suggestion?.kind === "skip_row";
  const many = (openOfCode ?? 0) > 1;
  const title = codeLabel(issue.code);
  const field = issue.field ?? issue.affectedFields[0] ?? "value";
  const price = p.price === undefined ? null : issue.unit === "paise" ? formatINR(p.price) : formatINR(Math.round(p.price * 100));
  const match = issue.duplicateMatch ?? null;
  const existing = p.existing ?? null;
  const canAct = (open || changing) && editable;

  const statusLine = resolved
    ? "Resolved · Awaiting revalidation"
    : issue.status === "ignored"
      ? "Ignored"
      : issue.severity === "error"
        ? "Open · Blocking this record only"
        : kind === "category" || kind === "duplicate"
          ? "Open · Needs review"
          : "Open · Warning";

  const categoryChoices = categories.filter((c) => c.label.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 100);
  const accept = issue.suggestion ? (
    <Button className={PRIMARY} disabled={busy} onClick={() => onResolve({ action: "accept_suggestion" })}>
      {skipRow ? "Skip this row" : kind === "sku" ? "Use suggested SKU" : "Accept suggestion"}
    </Button>
  ) : null;

  const valueForm = (label: string, placeholder: string, button: string) => (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (custom.trim() && !busy) onResolve({ action: "custom_value", customValue: custom.trim() });
      }}
    >
      <p className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">{label}</p>
      <Input aria-label="Custom value" className={INPUT} placeholder={placeholder} value={custom} onChange={(e) => setCustom(e.target.value)} />
      <Button type="submit" variant="outline" className={OUTLINE} disabled={!custom.trim() || busy}>
        {button}
      </Button>
    </form>
  );

  const ignoreButton = (
    <Button variant="ghost" size="sm" className="text-[12px] text-[#666666] hover:text-destructive" disabled={busy} onClick={() => onResolve({ action: "ignore" })}>
      {issue.severity === "error" ? "Ignore this issue (the row is left out of the import)" : "Ignore this warning (import the row as it is)"}
    </Button>
  );

  return (
    <IssuePanelFrame label={`Issue in row ${issue.rowNumber}`} row={issue.rowNumber}>
      <div className="space-y-4">
        <div>
          <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">{pickerOpen && kind === "category" ? "Map category" : issue.title}</h3>
          <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">{p.title || "Untitled row"}</p>
          <p className={SMALL}>
            {statusLine}
            {!open && issue.resolvedAt && <span> · {when(issue.resolvedAt)}</span>}
          </p>
          {open && issue.impact && <p className={SMALL}>{issue.impact}</p>}
          {changing && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 px-0 text-[11px] text-[#666666]"
              onClick={() => {
                setChanging(false);
                setPickerOpen(false);
              }}
            >
              Keep the current answer
            </Button>
          )}
        </div>

        {!open && !changing && (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-[5px] text-[12px] leading-[18px] font-medium flex items-center gap-2">
              <Check className="w-4 h-4 stroke-[2.5]" aria-hidden />
              {issue.status === "ignored" ? "Issue ignored" : kind === "category" ? "Category mapped successfully" : "Correction recorded"}
            </div>
            <div className="space-y-2.5 text-[12px] leading-[18px]">
              <div>
                <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">Source value</span>
                <span className="text-[#000000] dark:text-white font-medium">{issue.sourceValue || "—"}</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">{kind === "category" ? "Applied destination" : "Applied value"}</span>
                <span className="text-[#000000] dark:text-white font-semibold font-mono">{issue.currentFix ?? (issue.status === "ignored" ? "Ignored" : "Resolved")}</span>
              </div>
              <div className="pt-1">
                <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">What changed</span>
                <p className="text-[#666666]">Your approved change is saved in the working import data for Row {issue.rowNumber}. The imported record is not declared complete yet.</p>
              </div>
              <div className="pt-1">
                <span className="text-[#666666] block text-[10px] font-medium uppercase tracking-wider">Next step</span>
                <p className="text-[#666666]">Revalidate to check the correction. Your other products and confirmed fixes stay intact.</p>
              </div>
            </div>
            {editable && (
              <Button
                variant="outline"
                className={OUTLINE}
                onClick={() => {
                  setChanging(true);
                  if (kind === "category") setPickerOpen(true);
                }}
              >
                {kind === "category" ? "Change category" : "Change answer"}
              </Button>
            )}
          </div>
        )}

        {open && !editable && (
          <>
            <Block label="What happened">{issue.description}</Block>
            <p className={SMALL}>This import can only be viewed here: issues can be changed by people with the imports write permission, and only while the import is validated.</p>
          </>
        )}

        {canAct && !pickerOpen && (
          <>
            {kind === "duplicate" && (
              <>
                <Block label="What happened">{issue.description}</Block>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className={cn(CARD, "p-3 space-y-1 text-[12px] leading-[18px]")}>
                    <span className="text-[10px] uppercase font-medium tracking-wider text-[#666666]">Imported product</span>
                    <div className="font-semibold text-[#000000] dark:text-white">{p.title ?? "—"}</div>
                    <div className="font-mono text-[#666666] text-[11px]">SKU {p.sku ?? "—"}</div>
                  </div>
                  <div className={cn(CARD, "p-3 space-y-1 text-[12px] leading-[18px]")}>
                    <span className="text-[10px] uppercase font-medium tracking-wider text-[#666666]">Existing product</span>
                    <div className="font-semibold text-[#000000] dark:text-white">{existing?.title ?? match?.existingTitle ?? "—"}</div>
                    <div className="font-mono text-[#666666] text-[11px]">SKU {existing?.sku ?? match?.existingSku ?? "—"}</div>
                  </div>
                </div>
                {match && (
                  <div className="text-[12px] leading-[18px]">
                    <div className="font-semibold text-[#000000] dark:text-white">{MATCH_LABEL[match.confidence]}</div>
                    <p className="text-[#666666]">{match.reason}</p>
                  </div>
                )}
                {issue.suggestion && <SuggestionBlock issue={issue} />}
                <div className="space-y-2 pt-1">
                  {accept}
                  <Button className={issue.suggestion ? OUTLINE : PRIMARY} disabled={busy} onClick={() => onResolve({ action: "use_existing" })}>
                    Update existing product
                  </Button>
                  <Button variant="outline" className={OUTLINE} disabled={busy} onClick={() => onResolve({ action: "create_new" })}>
                    Create new product
                  </Button>
                  <Button variant="outline" className={OUTLINE} disabled={busy} onClick={() => onResolve({ action: "ignore" })}>
                    Ignore match
                  </Button>
                </div>
                {valueForm("Or type a different value", `New ${field}`, "Apply")}
                <p className={SMALL}>You decide how to handle this match. No records are silently merged.</p>
              </>
            )}

            {kind === "category" && (
              <>
                <Block label="What happened">{issue.description}</Block>
                {issue.whyItMatters && <Block label="Why it matters">{issue.whyItMatters}</Block>}
                {issue.suggestion && <SuggestionBlock issue={issue} />}
                <div className="space-y-2 pt-2">
                  {accept}
                  <Button variant="outline" className={OUTLINE} onClick={() => setPickerOpen(true)}>
                    {issue.suggestion ? "Choose another category" : "Choose a category"}
                  </Button>
                </div>
                <p className={SMALL}>You're in control. Suggestions never change your catalog until you approve them.</p>
              </>
            )}

            {kind === "sku" && (
              <>
                <Block label="What happened">{issue.description}</Block>
                {issue.whyItMatters && <Block label="Why it matters">{issue.whyItMatters}</Block>}
                {issue.suggestion && (
                  <div className={cn(CARD, "space-y-1 text-[12px] leading-[18px]")}>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[#666666]">Suggested solution · Generate SKU</span>
                    <div className="text-[11px] text-[#666666]">Preview · Not applied</div>
                    <div className="text-[18px] font-mono font-bold text-[#000000] dark:text-white break-all">{issue.suggestedFix ?? issue.suggestion.label ?? issue.suggestion.value}</div>
                  </div>
                )}
                {manual || !issue.suggestion ? (
                  valueForm("Enter a unique SKU", "Enter unique SKU code...", "Apply custom SKU")
                ) : (
                  <div className="space-y-2 pt-1">
                    {accept}
                    <Button variant="outline" className={OUTLINE} onClick={() => setManual(true)}>
                      Enter manually
                    </Button>
                  </div>
                )}
                <p className={SMALL}>Nothing is generated or committed until you approve. Other valid products remain imported.</p>
              </>
            )}

            {kind === "image" && (
              <>
                <Block label="Source">
                  <span className="font-mono text-[11px] break-all">{issue.sourceValue || "—"}</span>
                </Block>
                <Block label="Problem">{issue.description}</Block>
                {issue.suggestion && <SuggestionBlock issue={issue} />}
                <div className="space-y-2">
                  <label htmlFor={`image-${issue.id}`} className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
                    Replace image URL
                  </label>
                  <Input id={`image-${issue.id}`} aria-label="Replace image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste a valid image URL..." className={INPUT} />
                  <div className="text-center text-[11px] text-[#666666]">or</div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Image file"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) onUpload(file);
                    }}
                  />
                  <Button variant="outline" disabled={busy || uploading !== null} className={OUTLINE} onClick={() => fileInput.current?.click()}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    {uploading !== null ? `Uploading… ${uploading}%` : "Upload image"}
                  </Button>
                  {uploading !== null && (
                    <div className="h-[3px] w-full bg-[#E0E0E0] overflow-hidden" role="progressbar" aria-label="Image upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploading}>
                      <div className="h-full bg-[#000000] dark:bg-white transition-all" style={{ width: `${uploading}%` }} />
                    </div>
                  )}
                </div>
                <div className="space-y-2 pt-1">
                  {accept}
                  <Button className={issue.suggestion ? OUTLINE : PRIMARY} disabled={!imageUrl.trim() || busy} onClick={() => onResolve({ action: "custom_value", customValue: imageUrl.trim() })}>
                    Fix image
                  </Button>
                  <Button variant="outline" className={OUTLINE} disabled={busy} onClick={() => onResolve({ action: "ignore" })}>
                    Skip image
                  </Button>
                </div>
                <p className={SMALL}>This product stays usable without an image. A channel image requirement may block only the affected listing, not your catalog.</p>
              </>
            )}

            {kind === "generic" && (
              <>
                <div className={cn(CARD, "text-[12px] leading-[18px] space-y-1")}>
                  <div className="font-semibold text-[#000000] dark:text-white">Summary</div>
                  <p className="text-[#666666]">{issue.description}</p>
                </div>
                {issue.whyItMatters && <Block label="Why it matters">{issue.whyItMatters}</Block>}
                {issue.suggestion && <SuggestionBlock issue={issue} />}
                {issue.suggestion && <div className="space-y-2">{accept}</div>}
                {valueForm("Type the correct value", `New ${field}`, "Apply")}
              </>
            )}

            {kind !== "duplicate" && kind !== "image" && <div>{ignoreButton}</div>}
          </>
        )}

        {canAct && pickerOpen && (
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">Current source value</span>
              <p className="text-[12px] leading-[18px] text-[#666666]">{issue.sourceValue}</p>
            </div>
            <PickerBody categories={categoryChoices} search={search} onSearch={setSearch} picked={picked} onPick={setPicked} />
            <Button className={PRIMARY} disabled={!picked || busy} onClick={() => onResolve({ action: "custom_value", customValue: picked })}>
              Apply mapping
            </Button>
            <Button variant="ghost" size="sm" className="text-[12px] text-[#666666]" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <p className={SMALL}>Applies to Row {issue.rowNumber} in your working import data. Revalidate before completing this record.</p>
          </div>
        )}

        <div className={cn(CARD, "space-y-3")}>
          <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2">
            {isWebUrl(p.imageUrl) && <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="col-span-2 h-16 w-16 rounded-md border border-border bg-muted object-cover" />}
            <Meta label="Title">{p.title || "—"}</Meta>
            <Meta label="SKU">
              <span className="font-mono">{p.sku || "—"}</span>
            </Meta>
            <Meta label="Category">{p.category || "—"}</Meta>
            <Meta label="Price">{price ?? "—"}</Meta>
            <Meta label="Barcode">
              <span className="font-mono">{p.barcode || "—"}</span>
            </Meta>
            <Meta label="Value in the file">
              <span className="font-mono">{issue.sourceValue || "—"}</span>
            </Meta>
          </dl>
          {Object.keys(p.source).length > 0 && (
            <details className="rounded-[5px] border border-[#E3E3E3] dark:border-border text-[12px]">
              <summary className="cursor-pointer px-3 py-2 font-medium text-[#000000] dark:text-white">All columns of this row</summary>
              <dl className="grid grid-cols-1 gap-y-1.5 border-t border-[#E3E3E3] dark:border-border p-3">
                {Object.entries(p.source).map(([k, v]) => (
                  <div key={k} className="flex min-w-0 gap-2">
                    <dt className="shrink-0 font-mono text-[#666666]">{k}:</dt>
                    <dd className="truncate text-[#000000] dark:text-white" title={v}>
                      {v || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>

        {canAct && many && (
          <div className="rounded-[6px] border border-dashed border-[#E3E3E3] dark:border-border p-4">
            <p className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">
              {num(openOfCode)} open issues of this kind: {title}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {issue.suggestion && !skipRow && (
                <Button size="sm" variant="outline" className="text-[12px]" disabled={busy} onClick={() => onBulk({ code: issue.code, action: "accept_suggestion", label: `Accept the suggested fix for all ${num(openOfCode)} open issues of this kind` })}>
                  Accept suggestions for all
                </Button>
              )}
              {issue.sourceValue && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[12px]"
                  disabled={busy}
                  onClick={() => onBulk({ code: issue.code, action: "custom_value", needsValue: true, sourceValue: issue.sourceValue ?? undefined, label: `Set one value for every row showing "${issue.sourceValue}"` })}
                >
                  Set a value for rows showing the same
                </Button>
              )}
              <Button size="sm" variant="outline" className="text-[12px]" disabled={busy} onClick={() => onBulk({ code: issue.code, action: "ignore", label: `Ignore all ${num(openOfCode)} open issues of this kind` })}>
                Ignore all
              </Button>
            </div>
          </div>
        )}
      </div>
    </IssuePanelFrame>
  );
}

function PickerBody({ categories, search, onSearch, picked, onPick }: { categories: CategoryOption[]; search: string; onSearch: (v: string) => void; picked: string; onPick: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <span className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">Destination category</span>
      <div className="border border-[#E3E3E3] dark:border-border rounded-[6px] bg-white dark:bg-card p-2 space-y-2">
        <Input aria-label="Search categories" placeholder="Search categories..." value={search} onChange={(e) => onSearch(e.target.value)} className="h-[32px] text-[12px] bg-[#F6F6F6] dark:bg-muted/40 border border-[#E3E3E3] rounded-[4px]" />
        <div className="space-y-1 pt-1 max-h-48 overflow-y-auto">
          {categories.length === 0 && <p className="p-2 text-[12px] text-[#666666]">No category matches.</p>}
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={picked === c.id}
              onClick={() => onPick(c.id)}
              className={`w-full flex items-center justify-between p-2 rounded-[4px] text-[12px] leading-[18px] transition-colors text-left ${
                picked === c.id ? "bg-[#F0F0F0] dark:bg-muted font-semibold text-[#000000] dark:text-white" : "hover:bg-[#F9F9F9] dark:hover:bg-muted/50 text-[#000000] dark:text-white"
              }`}
            >
              <span>{c.label}</span>
              {picked === c.id && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
