import { cn } from "@/utils/cn";
import type { AdjustmentType } from "@/types/inventory";
import { ADJUST_TYPES, hasDirection, withType, type AdjustFormState } from "./adjustModel";

const INPUT = "w-full h-8 px-2.5 border border-[#E5E5E5] rounded-lg bg-white text-[12px] font-normal text-[#111111] focus:outline-none focus:border-black";
const LABEL = "text-[11px] font-semibold text-[#111111]";

interface AdjustFieldsProps {
  idPrefix: string;
  state: AdjustFormState;
  onChange: (next: AdjustFormState) => void;
  qtyError: string | null;
  noteError: string | null;
  reasonError: string | null;
  disabled?: boolean;
  /** the quantity placeholder */
  hint?: string;
  /** types that make no sense here (opening stock needs a product that has no stock yet: not for a bulk selection) */
  hideTypes?: AdjustmentType[];
}

/** type pills, direction, quantity, reason and note: shared by the Adjust stock drawer and the bulk dialog */
export function AdjustFields({ idPrefix, state, onChange, qtyError, noteError, reasonError, disabled, hint, hideTypes }: AdjustFieldsProps) {
  const set = (patch: Partial<AdjustFormState>) => onChange({ ...state, ...patch });
  const minus = state.type === "damage" ? "Mark as damaged" : "Remove units";
  const plus = state.type === "damage" ? "Restore from damaged" : "Add units";
  return (
    <>
      <div className="flex w-full flex-col items-start gap-1">
        <span className={LABEL} id={`${idPrefix}-type`}>
          Adjustment type
        </span>
        <div role="group" aria-labelledby={`${idPrefix}-type`} className="flex w-full flex-wrap items-center gap-1.5">
          {ADJUST_TYPES.filter((t) => !hideTypes?.includes(t.id)).map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              aria-pressed={state.type === t.id}
              onClick={() => onChange(withType(state, t.id))}
              className={cn(
                "h-7 cursor-pointer rounded-md border px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                state.type === t.id ? "border-black bg-black text-white" : "border-[#E5E5E5] bg-white text-[#555555] hover:border-[#CCCCCC] hover:text-black",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {hasDirection(state.type) && (
        <fieldset className="flex w-full gap-4 border-none p-0 text-[12px]" disabled={disabled}>
          <legend className={cn(LABEL, "mb-1")}>Direction</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={`${idPrefix}-dir`} checked={state.direction === "decrease"} onChange={() => set({ direction: "decrease" })} /> {minus}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={`${idPrefix}-dir`} checked={state.direction === "increase"} onChange={() => set({ direction: "increase" })} /> {plus}
          </label>
        </fieldset>
      )}

      {state.type === "return" && (
        <label className="flex items-center gap-2 text-[12px] text-[#111111]">
          <input type="checkbox" checked={state.restock} disabled={disabled} onChange={(e) => set({ restock: e.target.checked })} className="accent-black" />
          Restock immediately (otherwise held in Returned until inspected)
        </label>
      )}

      <div className="flex w-full flex-col items-start gap-1">
        <label htmlFor={`${idPrefix}-qty`} className={LABEL}>
          Quantity
        </label>
        <input id={`${idPrefix}-qty`} inputMode="numeric" autoComplete="off" disabled={disabled} value={state.qty} onChange={(e) => set({ qty: e.target.value })} aria-invalid={!!qtyError} aria-describedby={qtyError ? `${idPrefix}-qty-error` : undefined} placeholder={hint ?? "6"} className={cn(INPUT, qtyError && "border-red-400")} />
        {qtyError && (
          <p id={`${idPrefix}-qty-error`} role="alert" className="m-0 text-[11px] text-red-700">
            {qtyError}
          </p>
        )}
      </div>

      <div className="flex w-full flex-col items-start gap-1">
        <label htmlFor={`${idPrefix}-reason`} className={LABEL}>
          Reason
        </label>
        <input id={`${idPrefix}-reason`} disabled={disabled} maxLength={300} value={state.reason} onChange={(e) => set({ reason: e.target.value })} aria-invalid={!!reasonError} placeholder="Damaged units" className={cn(INPUT, reasonError && "border-red-400")} />
        {reasonError && state.reason !== "" && (
          <p role="alert" className="m-0 text-[11px] text-red-700">
            {reasonError}
          </p>
        )}
      </div>

      <div className="flex w-full flex-col items-start gap-1">
        <label htmlFor={`${idPrefix}-note`} className={LABEL}>
          {state.type === "other" ? "Note" : "Optional note"}
        </label>
        <input id={`${idPrefix}-note`} disabled={disabled} maxLength={500} value={state.note} onChange={(e) => set({ note: e.target.value })} aria-invalid={!!noteError} placeholder={state.type === "other" ? "Say what this adjustment is" : "Add a note (optional)"} className={cn(INPUT, noteError && "border-red-400")} />
        {noteError && state.note === "" && state.qty !== "" && (
          <p role="alert" className="m-0 text-[11px] text-red-700">
            {noteError}
          </p>
        )}
      </div>
    </>
  );
}
