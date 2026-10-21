/**
 * Product description sanitiser. The editor offers Bold, Italic, Bullets and Link, so the stored rich text is a tiny HTML subset:
 *   p, br, strong (b), em (i), ul, ol, li, a[href]
 * Everything else is removed (its text is kept, script / style / iframe / object content is dropped entirely). Links must be
 * http(s) or mailto and get rel="noopener noreferrer nofollow". The plain-text form (`text`) is what marketplaces receive and what the
 * 2,000-character limit counts. No regular-expression HTML parsing: a single-pass tokenizer so malformed input cannot smuggle markup.
 *
 * Safety properties (all covered by tests/api/product-creation.test.ts):
 *  - output text is always escaped (&, <, >), attribute values are escaped and quoted, only whitelisted tags are ever emitted;
 *  - hrefs are decoded once, stripped of invisible characters and must start with http:, https: or mailto: (a whitelist: relative links,
 *    javascript:, data:, vbscript:, file: and anything with an unknown scheme are dropped);
 *  - every tag is bounded (MAX_TAG_CHARS) and the nesting depth is capped, so crafted input cannot make the parser quadratic or deep;
 *  - a "<" that does not start a well-formed, terminated tag stays literal text (never swallows the rest of the description);
 *  - control characters, bidi overrides and lone surrogates are removed.
 */
export const DESCRIPTION_MAX_CHARS = 2000;
/** upper bound for raw input before parsing (protects the tokenizer) */
export const DESCRIPTION_MAX_INPUT = 40_000;

const MAX_NESTING = 20;
const MAX_TAG_CHARS = 2048;
const MAX_TAG_FAILURES = 200;
const MAX_HREF = 2048;

const VOID = new Set(['br']);
const INLINE = new Set(['strong', 'em', 'a']);
const ALIAS: Record<string, string> = { b: 'strong', strong: 'strong', i: 'em', em: 'em', p: 'p', br: 'br', ul: 'ul', ol: 'ol', li: 'li', a: 'a' };
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'head', 'title', 'textarea', 'select', 'option', 'frame', 'frameset', 'applet', 'canvas', 'audio', 'video']);

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** characters that are never kept: C0/C1 controls (except tab and newline), bidi overrides/isolates, BOM, interlinear annotation, lone surrogates */
function isDroppedCodePoint(cp: number): boolean {
  if (cp === 9 || cp === 10) return false;
  return cp < 32 || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0xfeff || (cp >= 0xfff9 && cp <= 0xfffb) || cp === 0xfffe || cp === 0xffff || (cp >= 0xd800 && cp <= 0xdfff);
}

export function cleanDescriptionChars(s: string): string {
  let clean = true;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 || c >= 0x7f && c <= 0x9f || c >= 0x202a && c <= 0x2069 || c === 0xfeff || c >= 0xd800 && c <= 0xdfff || c >= 0xfff9) { clean = false; break; }
  }
  if (clean) return s;
  let out = '';
  for (const ch of s) if (!isDroppedCodePoint(ch.codePointAt(0)!)) out += ch;
  return out;
}

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code > 0x10ffff || isDroppedCodePoint(code)) return '';
      return String.fromCodePoint(code);
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

/** control characters, whitespace and zero-width / line-separator characters (used to hide a scheme such as "java script:") */
function isInvisible(cp: number): boolean {
  return cp <= 0x20 || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0x2028 || cp === 0x2029 || cp === 0x2060 || cp === 0xfeff || cp === 0xa0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0xad;
}

/** only http(s) and mailto, no control characters or whitespace tricks inside the scheme; returns the cleaned URL or null */
export function safeHref(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_HREF * 4) return null;
  let v = '';
  for (const ch of decodeEntities(raw)) if (!isInvisible(ch.codePointAt(0)!)) v += ch;
  if (v.length === 0 || v.length > MAX_HREF) return null;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(v);
  if (!m) return null; // relative links are not allowed in a product description
  const scheme = m[1]!.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') return null;
  if (scheme !== 'mailto' && v.length === m[0].length) return null; // "http:" alone
  return v;
}

interface Token { kind: 'text' | 'open' | 'close'; value: string; attrs?: Record<string, string>; selfClose?: boolean }

const isAlpha = (c: string | undefined) => c !== undefined && (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z');
const isAlnum = (c: string | undefined) => isAlpha(c) || (c !== undefined && c >= '0' && c <= '9');
const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

interface RawTag { name: string; attrs: Record<string, string>; selfClose: boolean; closing: boolean; end: number }

/** reads one tag starting at the "<" at `i`; null when it is not a well-formed, terminated tag within MAX_TAG_CHARS */
function readTag(src: string, i: number): RawTag | null {
  const closing = src[i + 1] === '/';
  const nameStart = i + (closing ? 2 : 1);
  if (!isAlpha(src[nameStart])) return null;
  const limit = Math.min(src.length, i + MAX_TAG_CHARS);
  let j = nameStart;
  while (j < limit && isAlnum(src[j])) j++;
  const name = src.slice(nameStart, j).toLowerCase();
  const attrs: Record<string, string> = {};
  let k = j;
  while (k < limit) {
    const c = src[k]!;
    if (c === '>') return { name, attrs, selfClose: false, closing, end: k + 1 };
    if (c === '/') {
      if (src[k + 1] === '>') return { name, attrs, selfClose: true, closing, end: k + 2 };
      k++;
      continue;
    }
    if (isSpace(c)) { k++; continue; }
    let a = k;
    while (k < limit && !isSpace(src[k]) && src[k] !== '=' && src[k] !== '>' && src[k] !== '/') k++;
    const attrName = src.slice(a, k).toLowerCase();
    while (k < limit && isSpace(src[k])) k++;
    let value = '';
    if (src[k] === '=') {
      k++;
      while (k < limit && isSpace(src[k])) k++;
      const q = src[k];
      if (q === '"' || q === "'") {
        let e = k + 1;
        while (e < limit && src[e] !== q) e++;
        if (e >= limit) return null; // unterminated quote
        value = src.slice(k + 1, e);
        k = e + 1;
      } else {
        a = k;
        while (k < limit && !isSpace(src[k]) && src[k] !== '>') k++;
        value = src.slice(a, k);
      }
    }
    if (attrName && !(attrName in attrs)) attrs[attrName] = value;
    if (k === a && attrName === '') k++; // never stall
  }
  return null;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let text = '';
  let failures = 0;
  const lastGt = src.lastIndexOf('>');
  const flush = () => { if (text) { out.push({ kind: 'text', value: decodeEntities(text) }); text = ''; } };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { text += src.slice(i); break; }
    if (lt > i) { text += src.slice(i, lt); i = lt; }
    if (src.startsWith('<!--', i)) { // comment: skip to the end, or drop the rest if never closed (as browsers do)
      const end = src.indexOf('-->', i + 4);
      flush();
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    const next = src[i + 1];
    if (next === '!' || next === '?') { // doctype, CDATA, processing instruction
      if (lastGt > i) { flush(); i = src.indexOf('>', i + 2) + 1 || src.length; continue; }
      text += '<'; i++; continue;
    }
    if (failures >= MAX_TAG_FAILURES || lastGt < i) { text += '<'; i++; continue; }
    const tag = readTag(src, i);
    if (!tag) { failures++; text += '<'; i++; continue; } // a literal "<" in text
    flush();
    out.push({ kind: tag.closing ? 'close' : 'open', value: tag.name, attrs: tag.attrs, selfClose: tag.selfClose });
    i = tag.end;
  }
  flush();
  return out;
}

export interface SanitizedDescription { html: string; text: string; length: number }

export function sanitizeDescription(input: string): SanitizedDescription {
  const raw = cleanDescriptionChars(typeof input === 'string' ? input : '').slice(0, DESCRIPTION_MAX_INPUT).replace(/\r\n?/g, '\n');
  const plainOnly = !raw.includes('<');
  const tokens: Token[] = plainOnly ? [{ kind: 'text', value: decodeEntities(raw) }] : tokenize(raw);

  const html: string[] = [];
  const stack: string[] = []; // open allowed elements
  let skipDepth = 0; // inside a dropped-content element
  let skipName = '';

  const top = () => stack[stack.length - 1];
  const pop = () => { html.push(`</${stack.pop()}>`); };
  const closeTo = (name: string) => {
    const idx = stack.lastIndexOf(name);
    if (idx === -1) return;
    while (stack.length > idx) pop();
  };
  const closeInline = () => { while (stack.length && INLINE.has(top()!)) pop(); };
  const push = (name: string, markup = `<${name}>`) => { stack.push(name); html.push(markup); };
  const inList = () => stack.includes('ul') || stack.includes('ol');
  /** content directly inside a list gets an implicit list item, so the output is always well formed */
  const ensureListItem = (): boolean => {
    if (top() === 'ul' || top() === 'ol') {
      if (stack.length >= MAX_NESTING) return false;
      push('li');
    }
    return true;
  };

  for (const t of tokens) {
    if (skipDepth > 0) {
      if (t.kind === 'open' && t.value === skipName && !t.selfClose) skipDepth++;
      else if (t.kind === 'close' && t.value === skipName) skipDepth--;
      continue;
    }
    if (t.kind === 'text') {
      if (plainOnly) {
        const paragraphs = t.value.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        for (const p of paragraphs) html.push(`<p>${p.split('\n').map((l) => escapeText(l.trim())).filter((l, idx, arr) => l || (idx > 0 && idx < arr.length - 1)).join('<br>')}</p>`);
      } else {
        const v = t.value.replace(/[ \t\n\f\r]+/g, ' ');
        if (v.trim() === '' && (top() === 'ul' || top() === 'ol')) continue;
        if (v === '') continue;
        if (v.trim() !== '' && !ensureListItem()) continue;
        html.push(escapeText(v));
      }
      continue;
    }
    if (t.kind === 'open' && DROP_CONTENT.has(t.value) && !t.selfClose) { skipDepth = 1; skipName = t.value; continue; }
    const tag = ALIAS[t.value];
    if (!tag) continue; // unknown element: drop the tag, keep its text
    if (t.kind === 'open') {
      if (VOID.has(tag)) { if (ensureListItem()) html.push('<br>'); continue; }
      if (t.selfClose) continue;
      if (stack.length >= MAX_NESTING) continue;
      if (tag === 'a') {
        if (stack.includes('a')) continue;
        const href = t.attrs?.href ? safeHref(t.attrs.href) : null;
        if (!href) continue; // a link without a safe target is plain text
        if (!ensureListItem()) continue;
        push('a', `<a href="${escapeAttr(href)}" rel="noopener noreferrer nofollow">`);
        continue;
      }
      if (tag === 'strong' || tag === 'em') {
        if (stack.includes(tag)) continue;
        if (!ensureListItem()) continue;
        push(tag);
        continue;
      }
      // block elements: p, ul, ol, li. An open inline element or paragraph ends first.
      closeInline();
      if (top() === 'p') pop();
      if (tag === 'li') {
        if (!inList()) continue; // li only inside ul/ol
        if (top() === 'li') pop(); // a new item ends the previous one
        push('li');
        continue;
      }
      if (!ensureListItem()) continue;
      push(tag);
    } else {
      if (VOID.has(tag)) { if (ensureListItem()) html.push('<br>'); continue; }
      closeTo(tag);
    }
  }
  while (stack.length) pop();

  let out = html.join('');
  out = wrapLoose(out);
  for (let n = 0; n < 6; n++) { // remove empty elements (a few passes: removing one can empty its parent)
    const next = out
      .replace(/<(p|li|strong|em)>(?:\s|<br>)*<\/\1>/g, '')
      .replace(/<a [^>]*>\s*<\/a>/g, '')
      .replace(/<(ul|ol)>\s*<\/\1>/g, '');
    if (next === out) break;
    out = next;
  }
  const text = toPlainText(out);
  if (text === '') return { html: '', text: '', length: 0 };
  return { html: out.trim(), text, length: [...text].length };
}

/** wrap loose inline runs between blocks into paragraphs */
function wrapLoose(s: string): string {
  if (!s) return s;
  const parts = s.split(/(<\/?(?:ul|ol|li|p)>)/);
  let depth = 0;
  let acc = '';
  let res = '';
  for (const part of parts) {
    if (/^<\/?(?:ul|ol|li|p)>$/.test(part)) {
      if (depth === 0 && acc.trim()) { res += `<p>${acc.trim()}</p>`; acc = ''; }
      depth += part.startsWith('</') ? -1 : 1;
      res += part;
    } else if (depth === 0) acc += part;
    else res += part;
  }
  if (acc.trim()) res += `<p>${acc.trim()}</p>`;
  return res;
}

/** plain-text form: paragraphs separated by a blank line, bullets as "- item", numbered lists as "1. item", links as "text (url)" */
export function toPlainText(html: string): string {
  const lines: string[] = [];
  let buf = '';
  const stack: Array<{ list: 'ul' | 'ol'; n: number }> = [];
  let href: string | null = null;
  let linkText = '';
  const push = () => { const l = buf.replace(/\s+/g, ' ').trim(); if (l) lines.push(l); buf = ''; };
  const tokens = tokenize(html);
  for (const t of tokens) {
    if (t.kind === 'text') { if (href !== null) linkText += t.value; buf += t.value; continue; }
    if (t.kind === 'open') {
      if (t.value === 'br') { push(); continue; }
      if (t.value === 'p') { push(); continue; }
      if (t.value === 'ul' || t.value === 'ol') { push(); stack.push({ list: t.value, n: 0 }); continue; }
      if (t.value === 'li') { push(); const top = stack[stack.length - 1]; if (top) { top.n++; buf += top.list === 'ul' ? '- ' : `${top.n}. `; } continue; }
      if (t.value === 'a') { href = decodeEntities(t.attrs?.href ?? ''); linkText = ''; continue; }
    } else {
      if (t.value === 'p' || t.value === 'li') { push(); if (t.value === 'p') lines.push(''); continue; }
      if (t.value === 'ul' || t.value === 'ol') { push(); stack.pop(); if (!stack.length) lines.push(''); continue; }
      if (t.value === 'a') { if (href && linkText.trim() && linkText.trim() !== href) buf += ` (${href})`; href = null; linkText = ''; continue; }
    }
  }
  push();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Cuts plain text to at most `max` characters (code points), preferably at a sentence end, otherwise at a word boundary. Returns the text unchanged
 * when it already fits.
 */
export function truncatePlainText(text: string, max = DESCRIPTION_MAX_CHARS): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max).join('');
  const floor = Math.floor(max * 0.6);
  let cut = -1;
  for (const mark of ['. ', '! ', '? ', '.\n', '!\n', '?\n']) cut = Math.max(cut, head.lastIndexOf(mark) + 1);
  if (cut >= floor) return head.slice(0, cut).trim();
  const space = Math.max(head.lastIndexOf(' '), head.lastIndexOf('\n'));
  if (space >= floor) return head.slice(0, space).trim();
  return head.trim();
}
