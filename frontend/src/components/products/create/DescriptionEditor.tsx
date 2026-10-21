import { useCallback, useEffect, useRef, useState } from "react";
import { errorClass, hintClass } from "./fieldStyles";
import { isBlankHtml, normalizeLinkUrl, plainLength } from "./richText";

interface Props {
  /** the editor HTML */
  value: string;
  onChange: (html: string) => void;
  disabled: boolean;
  maxChars: number;
  error?: string | null;
}

type Format = "bold" | "italic" | "insertUnorderedList";

const exec = (command: string, arg?: string): boolean => (typeof document.execCommand === "function" ? document.execCommand(command, false, arg) : false);
const queryState = (command: string): boolean => {
  try {
    return typeof document.queryCommandState === "function" ? document.queryCommandState(command) : false;
  } catch {
    return false;
  }
};

const toolbarButton = "text-[12px] font-medium text-[#666666] hover:text-[#000000] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed aria-pressed:text-[#000000] aria-pressed:font-semibold";

/**
 * Real rich text (bold, italic, bullets, link) on a contentEditable. It produces `descriptionHtml`; the server sanitises it and is
 * authoritative, the counter is the plain text length (limit 2,000 characters).
 */
export function DescriptionEditor({ value, onChange, disabled, maxChars, error }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<Record<Format, boolean>>({ bold: false, italic: false, insertUnorderedList: false });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  // external changes (resume, AI apply) flow into the editor; the editor's own typing never gets reset
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  useEffect(() => {
    if (typeof document.execCommand === "function") {
      try {
        document.execCommand("defaultParagraphSeparator", false, "p");
      } catch {
        /* not supported: the browser default applies */
      }
    }
  }, []);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    onChange(isBlankHtml(el.innerHTML) ? "" : el.innerHTML);
  }, [onChange]);

  const refreshActive = useCallback(() => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    setActive({ bold: queryState("bold"), italic: queryState("italic"), insertUnorderedList: queryState("insertUnorderedList") });
  }, []);
  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  const format = (command: Format) => {
    ref.current?.focus();
    exec(command);
    emit();
    refreshActive();
  };

  const rememberSelection = () => {
    const sel = window.getSelection();
    const el = ref.current;
    savedRange.current = sel && sel.rangeCount && el?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  };

  const openLink = () => {
    rememberSelection();
    setLinkUrl("https://");
    setLinkError(null);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = normalizeLinkUrl(linkUrl);
    if (!url) {
      setLinkError("Enter a web address (https://...) or a mailto: link.");
      return;
    }
    const el = ref.current;
    el?.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (sel && sel.isCollapsed) {
      const text = url.replace(/^mailto:/i, "").split("&").join("&amp;").split("<").join("&lt;");
      exec("insertHTML", `<a href="${url.split('"').join("%22")}">${text}</a>`);
    } else exec("createLink", url);
    setLinkOpen(false);
    emit();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!exec("insertText", text) && ref.current) {
      ref.current.append(document.createTextNode(text));
    }
    emit();
  };

  const length = plainLength(value);
  const over = length > maxChars;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const keep = (e: React.MouseEvent) => e.preventDefault(); // buttons must not steal the selection

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div
        className={`flex flex-col w-full min-h-[184px] border rounded-[8px] bg-white overflow-hidden transition-colors focus-within:border-[#000000] ${error || over ? "border-[#B42318]" : "border-[#BDBDBD]"}`}
      >
        <div role="toolbar" aria-label="Description formatting" className="flex flex-row items-center px-3.5 gap-5 h-10 border-b border-[#EAEAEA] bg-white shrink-0">
          <button type="button" className={toolbarButton} disabled={disabled} aria-pressed={active.bold} onMouseDown={keep} onClick={() => format("bold")}>
            Bold
          </button>
          <button type="button" className={toolbarButton} disabled={disabled} aria-pressed={active.italic} onMouseDown={keep} onClick={() => format("italic")}>
            Italic
          </button>
          <button type="button" className={toolbarButton} disabled={disabled} aria-pressed={active.insertUnorderedList} onMouseDown={keep} onClick={() => format("insertUnorderedList")}>
            Bullets
          </button>
          <button type="button" className={toolbarButton} disabled={disabled} aria-expanded={linkOpen} onMouseDown={keep} onClick={openLink}>
            Link
          </button>
        </div>

        {linkOpen ? (
          <div className="flex flex-row items-center gap-2 px-3.5 py-2 border-b border-[#EAEAEA] bg-[#FAFAFA]">
            <label htmlFor="cp-link-url" className="text-[12px] text-[#333333]">
              Link address
            </label>
            <input
              id="cp-link-url"
              type="url"
              value={linkUrl}
              autoFocus
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") setLinkOpen(false);
              }}
              aria-invalid={linkError ? true : undefined}
              className="flex-1 h-8 px-2 border border-[#BDBDBD] rounded-[6px] text-[12px] outline-none focus:border-[#000000]"
            />
            <button type="button" className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer" onClick={applyLink}>
              Add link
            </button>
            <button type="button" className="text-[12px] text-[#666666] hover:underline cursor-pointer" onClick={() => setLinkOpen(false)}>
              Cancel
            </button>
          </div>
        ) : null}
        {linkError && linkOpen ? (
          <span role="alert" className={`${errorClass} px-3.5 pt-1`}>
            {linkError}
          </span>
        ) : null}

        <div
          id="cp-description"
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label="Description"
          aria-invalid={error || over ? true : undefined}
          aria-describedby="cp-description-count"
          contentEditable={!disabled}
          suppressContentEditableWarning
          tabIndex={0}
          data-placeholder="Describe what makes this product useful, who it is for and what customers should know."
          onInput={emit}
          onBlur={emit}
          onPaste={onPaste}
          onDrop={(e) => e.preventDefault()}
          className="flex-1 min-h-[96px] max-h-[320px] overflow-auto p-4 text-[13px] text-[#000000] leading-[145%] outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[#666666] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_p]:mb-1"
        />
        <div id="cp-description-count" className={`px-4 pb-3 text-[11px] leading-[145%] select-none ${over ? "text-[#B42318]" : "text-[#666666]"}`} aria-live={over ? "polite" : "off"}>
          {fmt(length)} / {fmt(maxChars)} characters{over ? ` (${fmt(length - maxChars)} over the limit)` : ""}
        </div>
      </div>
      {error ? (
        <span role="alert" className={errorClass}>
          {error}
        </span>
      ) : over ? (
        <span role="alert" className={errorClass}>
          The description can be at most {fmt(maxChars)} characters. It is not saved until it fits.
        </span>
      ) : (
        <span className={hintClass}>Bold, italic, bullets and links are kept. Other formatting is removed when you save.</span>
      )}
    </div>
  );
}
