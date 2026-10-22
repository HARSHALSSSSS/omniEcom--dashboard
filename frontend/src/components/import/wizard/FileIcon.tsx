import { cn } from "@/utils/cn";

/** the design's file icon: 34 x 42 with three lines */
export function FileIcon({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "w-[34px] h-[42px] rounded-[3px] border border-[#E3E3E3] dark:border-neutral-700 bg-[#FFFFFF] dark:bg-card flex flex-col justify-center items-start px-2 py-2 gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] shrink-0",
        className,
      )}
    >
      <div className="w-[18px] h-[1px] bg-[#8C8C8C]" />
      <div className="w-[18px] h-[1px] bg-[#8C8C8C]" />
      <div className="w-[12px] h-[1px] bg-[#8C8C8C]" />
    </div>
  );
}
