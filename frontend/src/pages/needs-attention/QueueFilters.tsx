import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { ISSUE_AREAS, ISSUE_PRIORITIES, type IssueArea, type IssueDue, type IssuePriority } from "@/types/attention";
import type { StatusFilter } from "./queueParams";
import { AREA_LABEL, DUE_LABEL, PRIORITY_LABEL, STATUS_FILTER_LABEL } from "./attention.ui";

type Key = "area" | "priority" | "status" | "due";

interface Props {
  area?: IssueArea;
  priority?: IssuePriority;
  status?: StatusFilter;
  due?: IssueDue;
  matching?: number;
  onChange: (patch: Partial<Record<Key, string | undefined>>) => void;
}

interface Dropdown {
  key: Key;
  label: string;
  width: number;
  /** what the dropdown shows when nothing is chosen */
  none: string;
  value: string | undefined;
  options: Array<{ value: string | undefined; label: string }>;
}

/** Area, Priority, Status and Due dropdowns: every choice is a server filter (filter[area] ...), kept in the URL */
export function QueueFilters({ area, priority, status, due, matching, onChange }: Props) {
  const [open, setOpen] = useState<Key | null>(null);

  const dropdowns: Dropdown[] = [
    { key: "area", label: "Area", width: 142, none: "All", value: area, options: [{ value: undefined, label: "All" }, ...ISSUE_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))] },
    {
      key: "priority",
      label: "Priority",
      width: 146,
      none: "All",
      value: priority,
      options: [{ value: undefined, label: "All" }, ...ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))],
    },
    {
      key: "status",
      label: "Status",
      width: status === "in_progress" ? 194 : 160,
      none: "Active",
      value: status,
      options: [
        { value: undefined, label: "Active" },
        ...(Object.keys(STATUS_FILTER_LABEL) as Array<keyof typeof STATUS_FILTER_LABEL>).map((s) => ({ value: s, label: STATUS_FILTER_LABEL[s] })),
      ],
    },
    {
      key: "due",
      label: "Due",
      width: 158,
      none: "Any time",
      value: due,
      options: [{ value: undefined, label: "Any time" }, ...(Object.keys(DUE_LABEL) as Array<keyof typeof DUE_LABEL>).map((d) => ({ value: d, label: DUE_LABEL[d] }))],
    },
  ];

  const isFiltered = Boolean(area || priority || status || due);
  const current = (d: Dropdown) => d.options.find((o) => o.value === d.value)?.label ?? d.none;

  return (
    <div className="relative flex flex-col gap-1.5 w-full">
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />}

      <div className="flex flex-row items-center gap-2 flex-wrap">
        {dropdowns.map((d) => (
          <div key={d.key} className="relative max-w-full">
            <button
              type="button"
              aria-label={`${d.label} filter`}
              aria-haspopup="listbox"
              aria-expanded={open === d.key}
              onClick={() => setOpen(open === d.key ? null : d.key)}
              style={{ width: `${d.width}px` }}
              className={`flex items-center justify-between px-2.5 h-[34px] min-h-[44px] sm:min-h-0 max-w-full bg-white border rounded-[8px] text-[12px] transition-colors ${
                open === d.key || (d.key === "status" && status === "in_progress") ? "border-[#000000]" : "border-[#BDBDBD] hover:border-[#666666]"
              }`}
            >
              <span className="font-normal text-[#666666]">{d.label}</span>
              <span className="font-medium text-[#000000] truncate flex-1 text-left ml-1.5">{current(d)}</span>
              <ChevronDown className="h-3 w-3 text-[#666666] shrink-0" />
            </button>

            {open === d.key && (
              <div
                role="listbox"
                style={{ width: `${d.width}px`, boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.051)" }}
                className="absolute left-0 top-[38px] max-w-[calc(100vw-32px)] bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 animate-in fade-in duration-100"
              >
                {d.options.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="option"
                    aria-selected={d.value === o.value}
                    onClick={() => {
                      onChange({ [d.key]: o.value });
                      setOpen(null);
                    }}
                    className={`flex items-center justify-between w-full min-h-[40px] sm:min-h-0 h-8 px-2 rounded-[4px] text-[12px] leading-[145%] transition-colors ${
                      d.value === o.value ? "bg-[#F5F5F5] text-[#000000] font-normal" : "bg-white text-[#000000] font-normal hover:bg-neutral-50"
                    }`}
                  >
                    <span>{o.label}</span>
                    {d.value === o.value && <Check className="w-3 h-3 text-[#666666] shrink-0 stroke-[2]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              onChange({ area: undefined, priority: undefined, status: undefined, due: undefined });
            }}
            className="ml-2 min-h-[44px] sm:min-h-0 flex items-center text-[12px] font-medium text-[#000000] hover:underline cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {due && matching !== undefined && (
        <span className="text-[12px] font-normal leading-[145%] text-[#666666] pt-1">
          Due {DUE_LABEL[due].toLowerCase()} · {matching} matching {matching === 1 ? "issue" : "issues"}
        </span>
      )}
    </div>
  );
}
