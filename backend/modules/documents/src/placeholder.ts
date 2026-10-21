import { createHash } from 'node:crypto';

/** Server-generated stand-in image for products without a photo (decision D5). Pure and deterministic. */
export const PLACEHOLDER_MIME = 'image/svg+xml';
export const PLACEHOLDER_FILE_NAME = 'placeholder.svg';
export const PLACEHOLDER_SIZE_PX = 1200;
export const PLACEHOLDER_CAPTION = 'Image required';
/** Served with these headers whenever an SVG leaves the API: no script, no network, no framing. */
export const PLACEHOLDER_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const DRAFT_CODE = /^DRAFT-[A-Z0-9]{8}$/;

/** Escape for XML text and attribute values; characters that are not legal in XML 1.0 are dropped. */
export function escapeXml(input: string): string {
  let out = '';
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    const legal = cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
    if (!legal) continue;
    switch (ch) {
      case '&': out += '&amp;'; break;
      case '<': out += '&lt;'; break;
      case '>': out += '&gt;'; break;
      case '"': out += '&quot;'; break;
      case "'": out += '&#39;'; break;
      default: out += ch;
    }
  }
  return out;
}

const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Up to three characters shown in large type: the first three letters/digits of the product code, or, for a
 * generated draft code (DRAFT-XXXXXXXX), the first letters of up to three words of the name. Never empty.
 */
export function placeholderInitials(code: string, title: string): string {
  const fromCode = (code.match(WORD) ?? []).join('');
  const useName = !fromCode || DRAFT_CODE.test(code.trim().toUpperCase());
  let letters: string[];
  if (useName) {
    letters = (title.match(WORD) ?? []).slice(0, 3).map((w) => Array.from(w)[0]!);
    if (!letters.length) letters = Array.from(fromCode).slice(0, 3);
  } else {
    letters = Array.from(fromCode).slice(0, 3);
  }
  const text = letters.join('').toUpperCase();
  const cps = Array.from(text).slice(0, 3).join('');
  return cps || '?';
}

export function renderPlaceholderSvg(code: string, title: string): { svg: string; initials: string } {
  const initials = placeholderInitials(code, title);
  const s = PLACEHOLDER_SIZE_PX;
  const fontSize = Array.from(initials).length >= 3 ? 340 : 420;
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${escapeXml(PLACEHOLDER_CAPTION)}">` +
    `<rect width="${s}" height="${s}" fill="#eef0f3"/>` +
    `<rect x="40" y="40" width="${s - 80}" height="${s - 80}" rx="48" fill="none" stroke="#c9ced6" stroke-width="6" stroke-dasharray="28 20"/>` +
    `<text x="${s / 2}" y="${s / 2 + fontSize * 0.18}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="#6b7280">${escapeXml(initials)}</text>` +
    `<text x="${s / 2}" y="${s - 140}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" fill="#8a919c">${escapeXml(PLACEHOLDER_CAPTION)}</text>` +
    `</svg>\n`;
  return { svg, initials };
}

export const sha256Hex = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
