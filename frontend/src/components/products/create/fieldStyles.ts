/** shared look of the creation form (the Figma "Product creation flow" inputs) */
export const labelClass = "text-[12px] font-medium text-[#333333] leading-[145%]";
export const hintClass = "text-[11px] text-[#666666] leading-[145%]";
export const errorClass = "text-[11px] text-[#B42318] leading-[145%]";
export const outlineButton =
  "flex items-center justify-center h-9 px-4 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const ghostButton =
  "flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const solidButton =
  "flex items-center justify-center gap-2 h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const linkButton = "text-[11px] font-semibold text-[#000000] underline underline-offset-2 hover:no-underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const boxClass = (error?: string | null, extra = "") =>
  `flex items-center h-[46px] px-3 bg-white border rounded-[8px] transition-colors focus-within:border-[#000000] ${error ? "border-[#B42318]" : "border-[#BDBDBD]"} ${extra}`;

export const describedBy = (id: string, hasHint: boolean, error?: string | null, ...extra: Array<string | undefined>) =>
  [error ? `${id}-error` : undefined, hasHint ? `${id}-hint` : undefined, ...extra].filter(Boolean).join(" ") || undefined;

