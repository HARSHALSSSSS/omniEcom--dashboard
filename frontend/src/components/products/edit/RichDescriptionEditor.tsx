import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import { sanitizeHtml } from "@/utils/security";
import { DESCRIPTION_MAX, htmlToPlain } from "./form";

interface Props {
  id: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  modified?: boolean;
  describedBy?: string;
}

const exec = (command: string, arg?: string) => {
  // execCommand is deprecated but is the only dependency-free way to get bold / italic / list / link in a contenteditable
  if (typeof document.execCommand === "function") document.execCommand(command, false, arg);
};

/**
 * Compact rich text editor (bold, italic, bullets, link) with the character counter of the design. The HTML it emits is sanitised again by
 * the server; the counter counts plain text characters like the server limit does.
 */
export function RichDescriptionEditor({ id, value, onChange, disabled, invalid, modified, describedBy }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  /** the last html this editor emitted: a value that equals it is the user's own typing and must not reset the caret */
  const emitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== emitted.current && el.innerHTML !== value) {
      // DOMPurify sanitization prevents stored XSS from untrusted product data
      el.innerHTML = sanitizeHtml(value);
    }
    emitted.current = value;
  }, [value]);

  const emit = () => {
    const html = ref.current?.innerHTML ?? "";
    emitted.current = html === "<br>" ? "" : html;
    onChange(emitted.current);
  };

  const chars = [...htmlToPlain(value)].length;
  const tools = [
    { label: "Bold", text: "Bold", run: () => exec("bold") },
    { label: "Italic", text: "Italic", run: () => exec("italic") },
    { label: "Bulleted list", text: "Bullets", run: () => exec("insertUnorderedList") },
    {
      label: "Add link",
      text: "Link",
      run: () => {
        const url = window.prompt("Link address (https://...)");
        if (url && /^https?:\/\//i.test(url.trim())) exec("createLink", url.trim());
      },
    },
  ];

  return (
    <>
      <div
        className={cn(
          "flex flex-col w-full border rounded-[8px] bg-white overflow-hidden transition-colors",
          invalid ? "border-[#B42318]" : modified ? "border-[#000000]" : "border-[#BDBDBD] focus-within:border-[#000000]",
          disabled && "opacity-60",
        )}
      >
        <div role="toolbar" aria-label="Description formatting" className="flex flex-row items-center px-3.5 gap-6 h-9 border-b border-[#EAEAEA] bg-white shrink-0">
          {tools.map(({ label, text, run }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer disabled:pointer-events-none"
            >
              {text}
            </button>
          ))}
        </div>
        <div className="p-4">
          <div
            ref={ref}
            id={id}
            role="textbox"
            aria-multiline="true"
            aria-label="Description"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={emit}
            className="min-h-[66px] w-full text-[13px] text-[#000000] leading-[145%] outline-none bg-transparent [&_ul]:list-disc [&_ul]:pl-5 [&_a]:underline"
          />
        </div>
      </div>
      <div className={cn("text-[11px] font-normal leading-[145%]", chars > DESCRIPTION_MAX ? "font-medium text-[#B42318]" : "text-[#666666]")}>
        {chars.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()} characters
      </div>
    </>
  );
}
