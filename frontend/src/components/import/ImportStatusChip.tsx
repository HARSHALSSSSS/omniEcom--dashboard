import type { ImportStatus } from "@/types/import";
import { cn } from "@/utils/cn";
import { STATUS_META, TONE_CLASS } from "./importFormat";

export function ImportStatusChip({ status, className }: { status: ImportStatus; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE_CLASS[meta.tone], className)}>{meta.label}</span>;
}
