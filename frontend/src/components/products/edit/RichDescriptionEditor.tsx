import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, List } from "lucide-react";
import { cn } from "@/utils/cn";
import { DESCRIPTION_MAX, htmlToPlain } from "./form";

interface Props {
  id: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  invalid?: boolean;
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
export function RichDescriptionEditor({ id, value, onChange, disabled, invalid, describedBy }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  /** the last html this editor emitted: a value that equals it is the user's own typing and must not reset the caret */
  const emitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== emitted.current && el.innerHTML !== value) el.innerHTML = value;
    emitted.current = value;
  }, [value]);

  const emit = () => {
    const html = ref.current?.innerHTML ?? "";
    emitted.current = html === "<br>" ? "" : html;
    onChange(emitted.current);
  };

  const chars = [...htmlToPlain(value)].length;
  const tools = [
    { label: "Bold", icon: Bold, run: () => exec("bold") },
    { label: "Italic", icon: Italic, run: () => exec("italic") },
    { label: "Bulleted list", icon: List, run: () => exec("insertUnorderedList") },
    {
      label: "Add link",
      icon: Link2,
      run: () => {
        const url = window.prompt("Link address (https://...)");
        if (url && /^https?:\/\//i.test(url.trim())) exec("createLink", url.trim());
      },
    },
  ];

  return (
    <div className={cn("rounded-md border bg-background", invalid ? "border-destructive" : "border-input", disabled && "opacity-60")}>
      <div role="toolbar" aria-label="Description formatting" className="flex items-center gap-1 border-b border-border px-2 py-1">
        {tools.map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
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
        className="min-h-[110px] px-3 py-2 text-sm leading-relaxed focus-visible:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary [&_a]:underline"
      />
      <div className={cn("border-t border-border px-3 py-1 text-right text-[11px]", chars > DESCRIPTION_MAX ? "font-medium text-destructive" : "text-muted-foreground")}>
        {chars.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()} characters
      </div>
    </div>
  );
}
