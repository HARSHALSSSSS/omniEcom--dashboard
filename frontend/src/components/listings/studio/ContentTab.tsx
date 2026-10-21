import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StudioController } from "@/hooks/useListingStudio";
import type { ListingStudio } from "@/types/listingStudio";
import { ChannelField } from "./ChannelField";
import { fieldId, splitTerms, type FormKey } from "./form";

interface Props {
  s: ListingStudio;
  ctl: StudioController;
}

const listOf = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
const sameList = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

/** Content & SEO: master value vs the value of this channel. Saving writes overrides; the master product is never touched. */
export function ContentTab({ s, ctl }: Props) {
  const v = ctl.values;
  if (!v) return null;
  const c = s.content;
  const ro = !ctl.canWrite;
  const err = ctl.fieldErrors;
  const live = s.listing.status === "active" || s.listing.status === "pending";
  const isMod = (k: FormKey) => ctl.modified.includes(k);
  const edit = <K extends keyof typeof v>(key: K, k: FormKey, value: (typeof v)[K]) => {
    ctl.setField(key, value);
    ctl.clearError(k);
  };

  const titleCustom = v.title.trim() !== c.title.master.trim() || (c.title.overridden && !isMod("title"));
  const descCustom = v.description !== (c.description.master ?? "") || (c.description.overridden && !isMod("description"));
  const bulletCustom = listOf(v.bullets).length > 0;
  const termsCustom = !sameList(splitTerms(v.searchTerms), c.searchTerms.master) || (c.searchTerms.overridden && !isMod("searchTerms"));
  const brandCustom = v.brand.trim() !== (c.brand.master ?? "").trim() || (c.brand.overridden && !isMod("brand"));

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
      <p className="text-xs text-muted-foreground">
        Changes here apply to this marketplace only. The master product is not changed
        {live ? ", and the live listing is updated on the marketplace after you save." : "."}
      </p>

      <ChannelField id={fieldId("title")} label="Marketplace Product Title" customised={titleCustom} modified={isMod("title")} onReset={() => ctl.resetField("title")} readOnly={ro} error={err.title} hint={titleCustom ? `Master: ${c.title.master}` : undefined}>
        <Input id={fieldId("title")} value={v.title} readOnly={ro} aria-invalid={!!err.title} aria-describedby={err.title ? `${fieldId("title")}-error` : undefined} onChange={(e) => edit("title", "title", e.target.value)} className="text-xs" />
      </ChannelField>

      <ChannelField id={fieldId("description")} label="Description" customised={descCustom} modified={isMod("description")} onReset={() => ctl.resetField("description")} readOnly={ro} error={err.description}>
        <Textarea id={fieldId("description")} rows={5} value={v.description} readOnly={ro} aria-invalid={!!err.description} onChange={(e) => edit("description", "description", e.target.value)} className="text-xs" />
      </ChannelField>

      <ChannelField id={fieldId("bulletPoints")} label="Key Features / Bullet Points" customised={bulletCustom} modified={isMod("bulletPoints")} onReset={() => ctl.resetField("bulletPoints")} readOnly={ro} error={err.bulletPoints} hint="Up to 10 bullets, shown on the marketplace page of this channel.">
        <div className="space-y-2">
          {v.bullets.map((bp, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                id={i === 0 ? fieldId("bulletPoints") : undefined}
                aria-label={`Bullet point ${i + 1}`}
                value={bp}
                readOnly={ro}
                onChange={(e) => edit("bullets", "bulletPoints", v.bullets.map((x, j) => (j === i ? e.target.value : x)))}
                className="text-xs"
              />
              {!ro && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove bullet point ${i + 1}`} onClick={() => edit("bullets", "bulletPoints", v.bullets.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
          {v.bullets.length === 0 && <p className="text-xs text-muted-foreground">No bullet points yet.</p>}
          {!ro && v.bullets.length < 10 && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => edit("bullets", "bulletPoints", [...v.bullets, ""])}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add bullet point
            </Button>
          )}
        </div>
      </ChannelField>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ChannelField id={fieldId("searchTerms")} label="Search terms" customised={termsCustom} modified={isMod("searchTerms")} onReset={() => ctl.resetField("searchTerms")} readOnly={ro} error={err.searchTerms} hint="Separate with commas">
          <Input id={fieldId("searchTerms")} value={v.searchTerms} readOnly={ro} aria-invalid={!!err.searchTerms} onChange={(e) => edit("searchTerms", "searchTerms", e.target.value)} className="text-xs" />
        </ChannelField>
        <ChannelField id={fieldId("brand")} label="Brand" customised={brandCustom} modified={isMod("brand")} onReset={() => ctl.resetField("brand")} readOnly={ro} error={err.brand}>
          <Input id={fieldId("brand")} value={v.brand} readOnly={ro} aria-invalid={!!err.brand} onChange={(e) => edit("brand", "brand", e.target.value)} className="text-xs" />
        </ChannelField>
      </div>
    </div>
  );
}
