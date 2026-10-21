import { useState } from "react";
import { useDrafts } from "@/hooks/useProductCreation";
import { savedLabel } from "@/hooks/useProductCreation";
import { hintClass, linkButton } from "./fieldStyles";

/** "Resume draft": unfinished drafts of this business (GET /products/drafts), shown while the form is still empty */
export function DraftsStrip({ visible, onResume }: { visible: boolean; onResume: (id: string) => void }) {
  const drafts = useDrafts(visible);
  const [open, setOpen] = useState(false);
  const items = drafts.data?.items ?? [];
  if (!visible || !items.length) return null;
  const total = drafts.data?.total ?? items.length;
  return (
    <section aria-label="Unfinished drafts" className="flex flex-col gap-2 p-3 border border-[#EAEAEA] rounded-[8px] bg-[#FAFAFA]">
      <div className="flex flex-row items-center justify-between gap-3">
        <span className="text-[12px] text-[#000000] leading-[145%]">
          You have {total} unfinished {total === 1 ? "draft" : "drafts"}.
        </span>
        <button type="button" className={linkButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide drafts" : "Resume draft"}
        </button>
      </div>
      {open ? (
        <ul className="flex flex-col divide-y divide-[#EAEAEA]">
          {items.map((d) => (
            <li key={d.id} className="flex flex-row items-center justify-between gap-3 py-2">
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium text-[#000000] truncate">{d.title}</span>
                <span className={hintClass}>
                  {d.codeIsPlaceholder ? "No SKU yet" : d.code} · {d.readinessPercent}% ready · {savedLabel(d.savedAt).replace("Last saved", "Saved")}
                </span>
              </div>
              <button type="button" className={linkButton} onClick={() => onResume(d.id)} aria-label={`Resume draft ${d.title}`}>
                Resume
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
