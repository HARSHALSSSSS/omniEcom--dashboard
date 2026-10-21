import { deflateSync } from 'node:zlib';
import { cellText } from './csv';
import { formatMinorIndian } from './money';
import type { Cell, Column, ReportDocument, Sheet } from './tabular';

/**
 * Compact PDF table writer (PDF 1.4, built-in Helvetica, no dependency): A4 landscape, every sheet starts on a new page, the
 * column header repeats on each page, a footer carries the page number. Text is limited to Latin-1 (other characters become "?").
 */
const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 36;
const TOP = 52;
const BOTTOM = 44;
const ROW_H = 12;
const PAD = 3;

// Helvetica advance widths (1/1000 em) for ASCII 32..126
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

const REPLACE = new Map<number, string>([[0x20b9, 'Rs'], [0x2013, '-'], [0x2014, '-'], [0x2018, "'"], [0x2019, "'"], [0x201c, '"'], [0x201d, '"'], [0x2026, '...'], [0x2022, '*'], [0xa0, ' ']]);

/** Latin-1 safe text */
export function pdfText(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const r = REPLACE.get(cp);
    if (r !== undefined) { out += r; continue; }
    out += cp >= 32 && cp <= 126 ? ch : cp >= 160 && cp <= 255 ? ch : cp === 9 || cp === 10 || cp === 13 ? ' ' : '?';
  }
  return out;
}

export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of s) { const cp = ch.codePointAt(0)!; w += cp >= 32 && cp <= 126 ? W[cp - 32]! : 556; }
  return (w * size * (bold ? 1.07 : 1)) / 1000;
}

function fit(s: string, max: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= max) return s;
  let t = s;
  while (t.length > 0 && textWidth(`${t}...`, size, bold) > max) t = t.slice(0, -1);
  return `${t}...`;
}

const hex = (s: string): string => `<${Buffer.from(pdfText(s), 'latin1').toString('hex')}>`;
const num = (n: number): string => (Math.round(n * 100) / 100).toString();

class Page {
  readonly ops: string[] = [];
  text(x: number, y: number, s: string, size: number, bold = false) { this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${num(x)} ${num(y)} Td ${hex(s)} Tj ET`); }
  fill(x: number, y: number, w: number, h: number, gray: number) { this.ops.push(`${gray} g ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f 0 g`); }
  line(x1: number, y: number, x2: number) { this.ops.push(`0.8 G 0.5 w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`); }
}

const display = (c: Cell, col: Column): string => (col.type === 'money' && c !== null && c !== '' ? formatMinorIndian(Number(c)) : cellText(c, col));
const isNumeric = (c: Column): boolean => c.type === 'money' || c.type === 'int' || c.type === 'percent';

function columnWidths(sheet: Sheet, size: number): number[] {
  const avail = PAGE_W - 2 * MARGIN;
  const want = sheet.columns.map((c, i) => {
    let longest = textWidth(c.header, size, true);
    for (const r of sheet.rows.slice(0, 300)) longest = Math.max(longest, textWidth(display(r[i] ?? null, c), size));
    if (sheet.totals) longest = Math.max(longest, textWidth(display(sheet.totals[i] ?? null, c), size, true));
    const hint = c.width ? c.width * size * 0.5 : 0;
    return Math.min(Math.max(longest, hint * 0.6) + 2 * PAD, avail * 0.4);
  });
  const sum = want.reduce((a, b) => a + b, 0);
  return want.map((w) => (w * avail) / sum);
}

function layoutSheet(doc: ReportDocument, sheet: Sheet, pages: Page[]): void {
  const size = sheet.columns.length > 14 ? 5.5 : sheet.columns.length > 10 ? 6.5 : 7.5;
  const widths = columnWidths(sheet, size);
  const perPage = Math.floor((PAGE_H - TOP - BOTTOM - 26) / ROW_H);
  const body = sheet.totals ? [...sheet.rows, sheet.totals] : sheet.rows;
  const notes = (sheet.notes ?? []).flatMap((n) => wrap(n, PAGE_W - 2 * MARGIN, 7));
  let i = 0;
  let first = true;
  do {
    const page = new Page();
    pages.push(page);
    let y = PAGE_H - TOP;
    page.text(MARGIN, y, first ? sheet.title : `${sheet.title} (continued)`, 11, true);
    y -= 14;
    page.fill(MARGIN, y - 3, PAGE_W - 2 * MARGIN, ROW_H, 0.88);
    let x = MARGIN;
    sheet.columns.forEach((c, k) => {
      const t = fit(c.header, widths[k]! - 2 * PAD, size, true);
      page.text(isNumeric(c) ? x + widths[k]! - PAD - textWidth(t, size, true) : x + PAD, y, t, size, true);
      x += widths[k]!;
    });
    y -= ROW_H;
    const end = Math.min(body.length, i + perPage);
    for (; i < end; i++) {
      const row = body[i]!;
      const isTotal = sheet.totals !== undefined && i === body.length - 1;
      if (isTotal) page.fill(MARGIN, y - 3, PAGE_W - 2 * MARGIN, ROW_H, 0.94);
      x = MARGIN;
      sheet.columns.forEach((c, k) => {
        const t = fit(display(row[k] ?? null, c), widths[k]! - 2 * PAD, size, isTotal);
        if (t) page.text(isNumeric(c) ? x + widths[k]! - PAD - textWidth(t, size, isTotal) : x + PAD, y, t, size, isTotal);
        x += widths[k]!;
      });
      page.line(MARGIN, y - 3, PAGE_W - MARGIN);
      y -= ROW_H;
    }
    first = false;
    if (i >= body.length && notes.length) {
      y -= 6;
      for (const n of notes) { if (y < BOTTOM + 14) break; page.text(MARGIN, y, n, 7); y -= 9; }
    }
  } while (i < body.length);
}

function wrap(s: string, max: number, size: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of pdfText(s).split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (textWidth(next, size) > max && cur) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const pdfDate = (d: Date): string => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
const literal = (s: string): string => `(${pdfText(s).replace(/[\\()]/g, (m) => `\\${m}`)})`;

export function buildPdf(doc: ReportDocument): Buffer {
  const pages: Page[] = [];
  for (const sheet of doc.sheets) layoutSheet(doc, sheet, pages);
  const total = pages.length;
  const stamp = `Generated ${doc.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  pages.forEach((p, n) => {
    p.text(MARGIN, PAGE_H - 24, doc.title, 9, true);
    p.text(PAGE_W - MARGIN - textWidth(doc.subtitle, 9), PAGE_H - 24, doc.subtitle, 9);
    p.text(MARGIN, PAGE_H - 35, doc.businessName, 7);
    p.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN);
    p.text(MARGIN, 24, stamp, 7);
    const label = `Page ${n + 1} of ${total}`;
    p.text(PAGE_W - MARGIN - textWidth(label, 7), 24, label, 7);
  });

  const objs: Buffer[] = [];
  const obj = (body: string | Buffer) => objs.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
  // 1 catalog, 2 page tree, 3/4 fonts, 5 info, then (page, content) pairs
  const firstPage = 6;
  obj('<< /Type /Catalog /Pages 2 0 R >>');
  obj(`<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ')}] /Count ${total} >>`);
  obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  obj(`<< /Title ${literal(doc.title)} /Author ${literal(doc.businessName)} /Producer (OMS Reports) /CreationDate (${pdfDate(doc.generatedAt)}) >>`);
  pages.forEach((p, i) => {
    obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${firstPage + i * 2 + 1} 0 R >>`);
    const data = deflateSync(Buffer.from(p.ops.join('\n'), 'latin1'));
    obj(Buffer.concat([Buffer.from(`<< /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')]));
  });

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = parts[0]!.length;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(offset);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(chunk);
    offset += chunk.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
