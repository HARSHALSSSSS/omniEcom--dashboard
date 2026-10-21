/**
 * A minimal PDF writer for printable shipping labels: one 4x6 inch page per label, monospaced text. Used to combine the text
 * labels of several shipments into one document for the printer. Pure (no I/O); only Latin-1 text is written, anything else
 * becomes "?" (the labels are courier references, not marketing copy).
 */
const PAGE_W = 288; // 4 in
const PAGE_H = 432; // 6 in
const MARGIN = 18;
const FONT_SIZE = 9;
const LEADING = 12;
const MAX_LINES = Math.floor((PAGE_H - 2 * MARGIN) / LEADING);
const MAX_COLS = Math.floor((PAGE_W - 2 * MARGIN) / (FONT_SIZE * 0.6)); // Courier glyphs are 0.6 em wide

const escapeText = (s: string): string => s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');

/** wrap very long lines instead of letting them run off the page */
function wrap(line: string): string[] {
  if (line.length <= MAX_COLS) return [line];
  const out: string[] = [];
  for (let i = 0; i < line.length; i += MAX_COLS) out.push(line.slice(i, i + MAX_COLS));
  return out;
}

/** the lines of every label, split over as many pages as needed (a label that is too long continues on a further page) */
export function paginate(labels: string[]): string[][] {
  const pages: string[][] = [];
  for (const label of labels) {
    const lines = label.split(/\r?\n/).flatMap(wrap);
    if (lines.length === 0) lines.push('');
    for (let i = 0; i < lines.length; i += MAX_LINES) pages.push(lines.slice(i, i + MAX_LINES));
  }
  return pages;
}

export function labelsPdf(labels: string[]): Buffer {
  const pages = paginate(labels);
  if (pages.length === 0) throw new Error('labelsPdf needs at least one label');
  // object numbering: 1 catalog, 2 pages, 3 font, then (page, content) pairs
  const objects: string[] = [];
  const kids: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageNo = 4 + i * 2;
    kids.push(`${pageNo} 0 R`);
    const body = [`BT /F1 ${FONT_SIZE} Tf ${LEADING} TL ${MARGIN} ${PAGE_H - MARGIN - FONT_SIZE} Td`, ...pages[i]!.map((l, k) => `${k === 0 ? '' : 'T* '}(${escapeText(l)}) Tj`), 'ET'].join('\n');
    objects[pageNo - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNo + 1} 0 R >>`;
    objects[pageNo] = `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`;
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
