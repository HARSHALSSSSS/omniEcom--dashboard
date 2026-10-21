import { Input } from "@/components/ui/input";
import type { StudioController } from "@/hooks/useListingStudio";
import type { ListingStudio, StudioAttribute } from "@/types/listingStudio";
import { ChannelField } from "./ChannelField";
import { fieldId } from "./form";

interface Props {
  s: ListingStudio;
  ctl: StudioController;
}

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_DOT: Record<StudioAttribute["status"], string> = { pass: "bg-emerald-500", warn: "bg-amber-500", fail: "bg-rose-500" };
const STATUS_TEXT: Record<StudioAttribute["status"], string> = { pass: "Filled", warn: "Missing (optional)", fail: "Needs a value" };

/** the required attributes of the marketplace category and the values they resolve to; channel values are saved as overrides */
export function AttributesTab({ s, ctl }: Props) {
  const v = ctl.values;
  if (!v) return null;
  const live = s.listing.status === "active" || s.listing.status === "pending";
  const locked = !ctl.canWrite || live;
  const attrs = s.category.attributes;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Marketplace Category Attributes</h3>
        <span className="text-xs text-muted-foreground">{s.category.marketplaceCategoryName ?? s.category.marketplaceCategoryId ?? "No marketplace category chosen"}</span>
      </div>
      {live && <p role="note" className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">Attributes of a live listing cannot be changed. Unpublish the listing to edit them.</p>}
      {attrs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{s.category.marketplaceCategoryId ? "This category has no required attributes." : "Choose a marketplace category in the Overview tab to see its attributes."}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {attrs.map((a) => {
            const key = `attr:${a.key}` as const;
            const id = fieldId(key);
            const value = v.attrs[a.key] ?? "";
            const error = ctl.fieldErrors[key];
            const set = (next: string) => {
              ctl.setAttr(a.key, next);
              ctl.clearError(key);
            };
            return (
              <ChannelField
                key={a.key}
                id={id}
                label={a.label}
                required={a.required}
                customised={a.source === "listing" && value !== ""}
                modified={ctl.modified.includes(key)}
                resetLabel="Clear"
                onReset={() => ctl.resetField(key)}
                readOnly={locked}
                error={error}
                hint={
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[a.status]}`} aria-hidden="true" />
                    {STATUS_TEXT[a.status]}
                    {a.source && a.source !== "listing" ? ` · from ${a.source}` : ""}
                  </span>
                }
              >
                {a.type === "enum" && a.allowedValues ? (
                  <select id={id} value={value} disabled={locked} aria-invalid={!!error} onChange={(e) => set(e.target.value)} className={SELECT_CLASS}>
                    <option value="">Not set</option>
                    {a.allowedValues.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : a.type === "boolean" ? (
                  <select id={id} value={value} disabled={locked} aria-invalid={!!error} onChange={(e) => set(e.target.value)} className={SELECT_CLASS}>
                    <option value="">Not set</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <Input id={id} value={value} readOnly={locked} aria-invalid={!!error} inputMode={a.type === "number" ? "decimal" : undefined} maxLength={a.maxLength ?? undefined} onChange={(e) => set(e.target.value)} className="text-xs" />
                )}
              </ChannelField>
            );
          })}
        </div>
      )}
    </div>
  );
}
