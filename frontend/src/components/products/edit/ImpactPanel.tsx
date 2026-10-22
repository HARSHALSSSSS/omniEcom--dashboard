import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import type { ChangeImpact, EditSaveResult, SaveChannelState } from "@/types/productEdit";
import { EFFECT_LABEL } from "./effectLabels";


const SAVE_STATE_LABEL: Record<SaveChannelState, string> = {
  sync_pending: "Sync pending",
  needs_review: "Needs review",
  needs_republish: "Needs republish",
  independent: "Independently managed",
  unchanged: "Unchanged",
  not_live: "Not live",
};

const stateClass = (s: string) => (s === "needs_review" || s === "may_need_remapping" || s === "needs_republish" ? "text-[#B45309]" : "text-[#666666]");

interface Props {
  productId: string;
  dirty: boolean;
  impact: ChangeImpact | null;
  pending: boolean;
  failed: boolean;
  lastSave: EditSaveResult | null;
  notice: string | null;
}

const ROWS = "flex flex-col w-full divide-y divide-[#EAEAEA] border-y border-[#EAEAEA] my-1";
const ROW = "flex flex-row justify-between items-center py-2 text-[12px] leading-[145%] gap-2";
const LINK = "text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer text-left pt-0.5";

/** right rail: what the pending edit would affect (live, debounced), or the result of the last save */
export function ImpactPanel({ productId, dirty, impact, pending, failed, lastSave, notice }: Props) {
  const listingsLink = `${ROUTES.LISTINGS}?productId=${productId}`;
  const saved = !dirty && lastSave?.saved ? lastSave.impact : undefined;

  return (
    <section aria-labelledby="change-impact" className="flex flex-col gap-2.5 w-full" aria-busy={pending}>
      <h2 id="change-impact" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
        Change impact
      </h2>

      {!dirty && !saved && (
        <>
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">{notice ? "No pending changes" : "No changes made"}</span>
          <p className="text-[12px] font-normal text-[#666666] leading-[145%]">{notice ?? "Edit product fields to see the potential impact on connected sales channels."}</p>
        </>
      )}

      {!dirty && saved && (
        <>
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">No pending changes</span>
          <div className="box-border flex flex-col p-3 gap-1 bg-[#F5F5F5] rounded-[8px] my-1" role="status">
            <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Changes saved</span>
            <span className="text-[11px] font-normal text-[#666666] leading-[145%]">{saved.text}</span>
          </div>
          {saved.channels.filter((c) => c.state !== "unchanged").length > 0 && (
            <ul className={ROWS} aria-label="Channel sync state">
              {saved.channels
                .filter((c) => c.state !== "unchanged")
                .map((c) => (
                  <li key={c.accountId} className={ROW}>
                    <span className="text-[#000000]">{c.name}</span>
                    <span className={`text-[11px] ${stateClass(c.state)}`}>{SAVE_STATE_LABEL[c.state]}</span>
                  </li>
                ))}
            </ul>
          )}
          {saved.independentNote && <p className="text-[12px] font-normal text-[#666666] leading-[145%]">{saved.independentNote}</p>}
          {saved.notSyncedYet && <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{saved.notSyncedYet}</p>}
          <Link to={listingsLink} className={LINK}>
            View listings &rarr;
          </Link>
        </>
      )}

      {dirty && !impact && !failed && (
        <p role="status" className="text-[12px] font-normal text-[#666666] leading-[145%]">
          Checking what this change affects...
        </p>
      )}
      {dirty && failed && !impact && (
        <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
          The impact preview is not available right now. You can still save; nothing is sent to listings until you do.
        </p>
      )}

      {dirty && impact && (
        <>
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">{impact.summary}</span>
          <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
            Potential impact &middot; {impact.listings.potential} connected {impact.listings.potential === 1 ? "listing" : "listings"}
            {impact.listings.live !== impact.listings.potential ? ` (${impact.listings.live} live)` : ""}
          </span>
          {impact.detail && <span className="text-[12px] font-normal text-[#666666] leading-[145%]">{impact.detail}</span>}
          {impact.items.length > 1 && (
            <ul className="list-disc pl-4 text-[12px] text-[#666666] leading-[145%]" aria-label="Changed fields">
              {impact.items.map((i) => (
                <li key={i.field}>{i.message}</li>
              ))}
            </ul>
          )}
          {impact.channels.filter((c) => c.effect !== "unaffected").length > 0 && (
            <ul className={ROWS} aria-label="Channel impact">
              {impact.channels
                .filter((c) => c.effect !== "unaffected")
                .map((c) => (
                  <li key={c.accountId} className={ROW}>
                    <span className="text-[#000000]">{c.name}</span>
                    <span className={`text-[11px] ${stateClass(c.effect)}`}>{EFFECT_LABEL[c.effect]}</span>
                  </li>
                ))}
            </ul>
          )}
          {impact.independentNote && <p className="text-[12px] font-normal text-[#666666] leading-[145%]">{impact.independentNote}</p>}
          {impact.notSentNote && <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{impact.notSentNote}</p>}
          {impact.requiresConfirmation && <p className="text-[12px] font-medium text-[#B45309] leading-[145%]">You will be asked to confirm this change when you save.</p>}
          <Link to={listingsLink} className={LINK}>
            Review affected listings &rarr;
          </Link>
        </>
      )}
      {dirty && pending && impact && (
        <p role="status" className="text-[11px] text-[#666666]">
          Updating...
        </p>
      )}
    </section>
  );
}
