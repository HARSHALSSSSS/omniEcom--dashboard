import { cn } from "@/utils/cn";

/** the bordered box around a control: black while modified, red on error, grey otherwise */
export const boxClass = (opts: { modified?: boolean; error?: boolean; disabled?: boolean; open?: boolean } = {}) =>
  cn(
    "flex items-center h-10 px-3 rounded-[8px] border transition-colors",
    opts.disabled ? "bg-[#F5F5F5] cursor-not-allowed" : "bg-white",
    opts.error ? "border-[#B42318]" : opts.modified || opts.open ? "border-[#000000]" : "border-[#BDBDBD] focus-within:border-[#000000]",
  );

export const INPUT_CLASS = "w-full text-[13px] text-[#000000] leading-[145%] outline-none bg-transparent placeholder:text-[#666666] disabled:cursor-not-allowed disabled:text-[#666666]";
