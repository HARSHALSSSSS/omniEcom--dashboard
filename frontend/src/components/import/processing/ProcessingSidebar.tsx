import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { useUiStore } from "@/store/ui.store";
import type { ImportSession } from "@/types/import";
import { scopeOf } from "@/types/importProcessing";
import { cn } from "@/utils/cn";
import { num, sourceInfo, when } from "../importFormat";
import { issuesUrl } from "../importParams";
import { clock, isDone, progressOf } from "./processingModel";

const LABEL = "text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666] mb-2";
const RULE = "h-[1px] bg-[#E3E3E3] dark:bg-border my-2";

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#666666]">{label}</span>
      <span className={`font-medium text-[#000000] dark:text-white ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

/** Right column: import summary, confirmed scope, product processing, issue status and the "safely leave" note. */
export function ProcessingSidebar({ session }: { session: ImportSession }) {
  const openNotifications = useUiStore((s) => s.setNotificationsPanelOpen);
  const c = session.counters;
  const { done, total } = progressOf(session);
  const finished = isDone(session.status);
  const scope = scopeOf(session);
  const blocking = session.issues.openErrors;
  const warnings = session.issues.openWarnings;

  return (
    <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0 bg-[#F6F6F6] dark:bg-card/40 rounded-[6px] border border-[#E3E3E3] dark:border-border p-6 space-y-4">
      <div>
        <div className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">Import summary</div>
        <div className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white mt-2 break-all">{session.fileName ?? "Your file"}</div>
        <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
          {session.startedAt ? `Started at ${clock(session.startedAt)}` : `Created ${when(session.createdAt)}`} · {sourceInfo(session.source).title}
        </p>
      </div>

      <div className={RULE} />

      <div>
        <div className={LABEL}>CONFIRMED IMPORT SCOPE</div>
        <div className="space-y-1.5 text-[12px] leading-[18px]">
          <Line label="Products" value={num(scope.products)} />
          <Line label="Rows" value={num(c.total)} />
          <Line label="New products" value={num(scope.newProducts)} />
          <Line label="Product updates" value={num(scope.updates)} />
        </div>
        <p className="text-[11px] leading-[17px] text-[#666666] pt-1">
          {finished ? "Products created and updated by this import." : "Planned product changes, not completed creations or updates."}
        </p>
      </div>

      <div className={RULE} />

      <div>
        <div className={LABEL}>PRODUCT PROCESSING</div>
        <div className="space-y-1.5 text-[12px] leading-[18px]">
          <Line label="Processed" value={num(done)} mono />
          <Line label="Remaining" value={num(Math.max(0, total - done))} mono />
        </div>
      </div>

      <div className={RULE} />

      <div>
        <div className={LABEL}>CURRENT ISSUE STATUS</div>
        <div className="space-y-1.5 text-[12px] leading-[18px]">
          <Line label="Warnings so far" value={num(warnings)} />
          <Line label="Blocking issues" value={num(blocking)} />
        </div>
        <p className="text-[11px] leading-[17px] text-[#666666] pt-1">
          {session.status === "failed" ? (
            "The import stopped. Open the import to see what went wrong."
          ) : blocking + warnings > 0 ? (
            <>
              {num(blocking + warnings)} {blocking + warnings === 1 ? "finding needs" : "findings need"} review.{" "}
              <Link to={issuesUrl(session.id)} className="font-medium text-[#000000] underline dark:text-white">
                Review issues
              </Link>
            </>
          ) : session.status === "validating" ? (
            "No action needed. Validation is still running."
          ) : (
            "No action needed."
          )}
        </p>
      </div>

      <div className={RULE} />

      <div className="space-y-1.5">
        <div className="text-[13px] leading-[20px] font-semibold text-[#000000] dark:text-white flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          You can safely leave
        </div>
        <p className="text-[12px] leading-[18px] text-[#666666]">
          Your import continues in the background. We'll send a completion{" "}
          <button type="button" className="underline text-[#000000] dark:text-white" onClick={() => openNotifications(true)}>
            notification
          </button>
          .
        </p>
        <p className="text-[12px] leading-[18px] text-[#666666]">
          Return through{" "}
          <Link to={ROUTES.PRODUCTS_IMPORT} className="underline text-[#000000] dark:text-white">
            Import history
          </Link>{" "}
          to check progress and review the final result.
        </p>
      </div>

      <div className="pt-2">
        <Link
          to={ROUTES.PRODUCTS}
          className={cn(buttonVariants({ variant: "outline" }), "w-full h-[36px] border border-[#E3E3E3] bg-white text-[#000000] hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium")}
        >
          Go to products catalog
        </Link>
      </div>
    </div>
  );
}
