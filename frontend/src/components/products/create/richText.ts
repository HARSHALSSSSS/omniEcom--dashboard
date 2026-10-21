/**
 * Rich text helpers of the description editor. The server sanitises and is authoritative; these only give the live character
 * count and a plain-text form. HTML is parsed with DOMParser (an inert document: nothing is loaded or executed).
 */

const BLOCKS = new Set(["P", "DIV", "LI", "UL", "OL", "BR"]);
const NBSP = String.fromCharCode(160);

/** plain text of an HTML fragment, with line breaks where blocks end (bullets get a leading "- ") */
export function htmlToPlain(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") return;
    if (tag === "BR") {
      out.push("\n");
      return;
    }
    if (tag === "LI") out.push("- ");
    el.childNodes.forEach(walk);
    if (BLOCKS.has(tag)) out.push("\n");
  };
  doc.body.childNodes.forEach(walk);
  return out
    .join("")
    .split(NBSP)
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** character count the way the server counts it: code points of the plain text */
export function plainLength(html: string): number {
  return [...htmlToPlain(html)].length;
}

/** true when the html has no visible text (an empty editor leaves things like "<br>" or "<div><br></div>") */
export function isBlankHtml(html: string): boolean {
  return htmlToPlain(html) === "";
}

/** only http(s) and mailto links are allowed by the server; give the seller the same rule up front */
export function normalizeLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // javascript:, data:, ...
  return /^[^\s/]+\.[^\s]+$/.test(value) ? `https://${value}` : null;
}
