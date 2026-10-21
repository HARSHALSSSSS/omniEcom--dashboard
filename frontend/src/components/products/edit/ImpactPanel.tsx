import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { ChangeImpact, EditSaveResult, ImpactEffect, SaveChannelState } from "@/types/productEdit";

const EFFECT_LABEL: Record<ImpactEffect, string> = {
  name_inherited: "Name inherited",
  description_inherited: "Description inherited",
  brand_inherited: "Brand inherited",
  attribute_inherited: "Attributes inherited",
  type_inherited: "Product type inherited",
  may_need_remapping: "May need remapping",
  independent: "Independently managed",
  not_live: "Not live",
  unaffected: "Unaffected",
};

const SAVE_STATE_LABEL: Record<SaveChannelState, string> = {
  sync_pending: "Sync pending",
  needs_review: "Needs review",
  needs_republish: "Needs republish",
  independent: "Independently managed",
  unchanged: "Unchanged",
  not_live: "Not live",
};

const stateClass = (s: string) => (s === "needs_review" || s === "may_need_remapping" || s === "needs_republish" ? "text-amber-700" : "text-muted-foreground");

interface Props {
  productId: string;
  dirty: boolean;
  impact: ChangeImpact | null;
  pending: boolean;
  failed: boolean;
  lastSave: EditSaveResult | null;
  notice: string | null;
}

/** right rail: what the pending edit would affect (live, debounced), or the result of the last save */
export function ImpactPanel({ productId, dirty, impact, pending, failed, lastSave, notice }: Props) {
  const listingsLink = `${ROUTES.LISTINGS}?productId=${productId}`;
  const saved = !dirty && lastSave?.saved ? lastSave.impact : undefined;

  return (
    <section aria-labelledby="change-impact" className="space-y-3 rounded-xl border border-border bg-card p-5 text-xs shadow-xs" aria-busy={pending}>
      <h2 id="change-impact" className="text-sm font-bold text-foreground">
        Change impact
      </h2>

      {!dirty && !saved && (
        <div>
          <p className="font-semibold text-foreground">{notice ? "No pending changes" : "No changes yet"}</p>
          <p className="mt-0.5 text-muted-foreground">{notice ?? "Edit a field to see what may be affected."}</p>
        </div>
      )}

      {!dirty && saved && (
        <div className="space-y-3">
          <p className="font-semibold text-foreground">No pending changes</p>
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900" role="status">
            <p className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Changes saved
            </p>
            <p>{saved.text}</p>
          </div>
          {saved.channels.filter((c) => c.state !== "unchanged").length > 0 && (
            <ul className="space-y-1.5" aria-label="Channel sync state">
              {saved.channels
                .filter((c) => c.state !== "unchanged")
                .map((c) => (
                  <li key={c.accountId} className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className={stateClass(c.state)}>{SAVE_STATE_LABEL[c.state]}</span>
                  </li>
                ))}
            </ul>
          )}
          {saved.independentNote && <p className="text-muted-foreground">{saved.independentNote}</p>}
          {saved.notSyncedYet && <p className="text-muted-foreground">{saved.notSyncedYet}</p>}
          <Link to={listingsLink} className="inline-block font-medium text-primary hover:underline">
            View listings &rarr;
          </Link>
        </div>
      )}

      {dirty && !impact && !failed && (
        <p role="status" className="text-muted-foreground">
          Checking what this change affects...
        </p>
      )}
      {dirty && failed && !impact && <p className="text-muted-foreground">The impact preview is not available right now. You can still save; nothing is sent to listings until you do.</p>}

      {dirty && impact && (
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-foreground">{impact.summary}</p>
            <p className="mt-0.5 text-muted-foreground">
              Potential impact &middot; {impact.listings.potential} connected {impact.listings.potential === 1 ? "listing" : "listings"}
              {impact.listings.live !== impact.listings.potential ? ` (${impact.listings.live} live)` : ""}
            </p>
            {impact.detail && <p className="mt-0.5 text-muted-foreground">{impact.detail}</p>}
          </div>
          {impact.items.length > 1 && (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground" aria-label="Changed fields">
              {impact.items.map((i) => (
                <li key={i.field}>{i.message}</li>
              ))}
            </ul>
          )}
          {impact.channels.filter((c) => c.effect !== "unaffected").length > 0 && (
            <ul className="space-y-1.5" aria-label="Channel impact">
              {impact.channels
                .filter((c) => c.effect !== "unaffected")
                .map((c) => (
                  <li key={c.accountId} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className={stateClass(c.effect)}>{EFFECT_LABEL[c.effect]}</span>
                  </li>
                ))}
            </ul>
          )}
          {impact.independentNote && <p className="text-muted-foreground">{impact.independentNote}</p>}
          {impact.notSentNote && <p className="text-muted-foreground">{impact.notSentNote}</p>}
          {impact.requiresConfirmation && <p className="font-medium text-amber-700">You will be asked to confirm this change when you save.</p>}
          <Link to={listingsLink} className="inline-block font-medium text-primary hover:underline">
            Review affected listings
          </Link>
        </div>
      )}
      {dirty && pending && impact && (
        <p role="status" className="text-[11px] text-muted-foreground">
          Updating...
        </p>
      )}
    </section>
  );
}
