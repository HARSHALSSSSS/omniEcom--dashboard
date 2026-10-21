import { CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BulkProductAction, BulkResponse, BulkResult } from "@/types/product";

const TITLE: Record<BulkProductAction, string> = {
  archive: "Archive results",
  unarchive: "Unarchive results",
  duplicate: "Duplicate results",
  check_publish_readiness: "Publish readiness",
};

const plural = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;

function summaryLine(res: BulkResponse): string {
  const { total, succeeded, failed, canPublish } = res.summary;
  if (res.action === "check_publish_readiness") {
    return `${canPublish ?? 0} of ${plural(total)} can be published${failed ? `, ${failed} could not be checked` : ""}.`;
  }
  return `${succeeded} of ${plural(total)} succeeded${failed ? `, ${failed} failed` : ""}.`;
}

/** what happened to one product, in words */
function detailOf(action: BulkProductAction, r: BulkResult): { ok: boolean; text: string; missing: string[] } {
  if (!r.ok) return { ok: false, text: r.error?.message ?? "Failed", missing: [] };
  if (action === "check_publish_readiness") {
    return r.canPublish
      ? { ok: true, text: "Ready to publish", missing: [] }
      : { ok: false, text: "Not ready to publish", missing: (r.missing ?? []).map((m) => m.message) };
  }
  if (action === "duplicate") return { ok: true, text: r.newProductCode ? `Copy created as draft ${r.newProductCode}` : "Copy created as draft", missing: [] };
  return { ok: true, text: action === "archive" ? "Archived" : "Unarchived", missing: [] };
}

interface BulkResultsDialogProps {
  response: BulkResponse | null;
  /** product id -> title, for the rows (the ids on the page) */
  titles: ReadonlyMap<string, string>;
  onClose: () => void;
}

/** A bulk action answers 200 with a result per product: partial success is shown product by product. */
export function BulkResultsDialog({ response, titles, onClose }: BulkResultsDialogProps) {
  return (
    <Dialog open={response !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {response && (
          <>
            <DialogHeader>
              <DialogTitle>{TITLE[response.action]}</DialogTitle>
              <DialogDescription>{summaryLine(response)}</DialogDescription>
            </DialogHeader>
            <ul className="mt-2 max-h-[320px] overflow-y-auto flex flex-col divide-y divide-[#EAEAEA] border border-[#EAEAEA] rounded-[8px]">
              {response.results.map((r) => {
                const d = detailOf(response.action, r);
                const id = r.id ?? r.productId;
                return (
                  <li key={`${r.index}-${id}`} className="flex items-start gap-2 px-3 py-2">
                    {d.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#166534]" aria-label="Succeeded" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B42318]" aria-label="Did not succeed" />
                    )}
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium text-[#000000] truncate">{titles.get(id) ?? "Product"}</span>
                      <span className="text-[12px] text-[#666666]">{d.text}</span>
                      {d.missing.length > 0 && (
                        <ul className="list-disc pl-4 text-[12px] text-[#666666]">
                          {d.missing.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <DialogFooter className="mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-[32px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-[#1A1A1A] rounded-[8px]"
              >
                Done
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
