import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Assignee, SnoozePreset } from "@/types/attention";
import { SNOOZE_PRESETS } from "./attention.ui";

interface MenuProps {
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  buttonClassName: string;
  /** "up" opens above the button (used at the bottom of the drawer) */
  direction?: "down" | "up";
  fullWidth?: boolean;
  children: (close: () => void) => ReactNode;
}

/** a button with a small popover; closes on choice or an outside click */
function Menu({ label, disabled, disabledReason, buttonClassName, direction = "down", fullWidth, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={fullWidth ? "relative w-full" : "relative shrink-0"}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} disabled={disabled} title={disabled ? disabledReason : undefined} onClick={() => setOpen(!open)} className={buttonClassName}>
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 text-[#666666]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{ boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.051)" }}
            className={`absolute left-0 ${direction === "up" ? "bottom-[36px]" : "top-[36px]"} w-[200px] max-w-[calc(100vw-32px)] max-h-[260px] overflow-y-auto bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-[70]`}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

const ITEM = "w-full min-h-[40px] sm:min-h-8 px-2 flex items-center text-left text-[12px] font-normal leading-[145%] text-[#000000] rounded hover:bg-neutral-100 transition-colors";

interface SnoozeProps {
  disabled?: boolean;
  disabledReason?: string;
  buttonClassName: string;
  direction?: "down" | "up";
  fullWidth?: boolean;
  onPick: (until: SnoozePreset) => void;
}

/** Later today / Tomorrow / This week: the server turns the presets into times and enforces the limits (critical: next business day) */
export function SnoozeMenu({ onPick, ...rest }: SnoozeProps) {
  return (
    <Menu label="Snooze" {...rest}>
      {(close) =>
        SNOOZE_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onPick(p.value);
            }}
            className={ITEM}
          >
            {p.label}
          </button>
        ))
      }
    </Menu>
  );
}

interface AssignProps {
  members: Assignee[] | undefined;
  currentId?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  buttonClassName: string;
  direction?: "down" | "up";
  fullWidth?: boolean;
  onPick: (userId: string) => void;
}

/** the members of the business (GET /issues/assignees); the caller hides it when the list is not available */
export function AssignMenu({ members, currentId, onPick, ...rest }: AssignProps) {
  return (
    <Menu label="Assign" {...rest}>
      {(close) =>
        (members ?? []).map((m) => (
          <button
            key={m.id}
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onPick(m.id);
            }}
            className={`${ITEM} ${m.id === currentId ? "bg-[#F5F5F5]" : ""}`}
          >
            <span className="truncate">{m.name}</span>
          </button>
        ))
      }
    </Menu>
  );
}
