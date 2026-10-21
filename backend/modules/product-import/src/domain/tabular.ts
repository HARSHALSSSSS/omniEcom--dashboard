import { AppError } from '@oms/shared';
import { LIMITS } from './catalogue';
import { readXlsx } from './xlsx';

export type FileFormat = 'csv' | 'tsv' | 'xlsx';

export interface ParsedFile {
  format: FileFormat;
  delimiter: string | null;
  sheetName: string | null;
  headers: string[];
  /** data rows; `rowNumber` is the spreadsheet row (the header is row 1 when the file starts with it) */
  rows: Array<{ rowNumber: number; cells: string[] }>;
}

const tooMany = (rows: number) => new AppError('PAYLOAD_TOO_LARGE', `The file has more than ${LIMITS.maxRows.toLocaleString('en-US')} data rows (found at least ${rows.toLocaleString('en-US')}). Split it into smaller files.`, { details: { rule: 'too_many_rows', maxRows: LIMITS.maxRows } });
const empty = () => new AppError('BAD_REQUEST', 'The file has no header row or no data rows', { details: { rule: 'empty_file' } });

/** Decode the bytes of a delimited text file: UTF-8 (BOM stripped) or UTF-16 with BOM. Binary content is refused. */
export function decodeText(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  const head = buf.subarray(0, 4096);
  if (head.includes(0)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'This looks like a binary file. Upload a CSV, TSV or XLSX file.', { details: { rule: 'unsupported_file' } });
  const text = buf.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** the delimiter used by the first record: the most frequent of , tab ; | outside quotes (comma when none appears) */
export function detectDelimiter(text: string, hint: FileFormat | null): string {
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0, '|': 0 };
  let quoted = false;
  for (let i = 0; i < text.length && i < 64_000; i++) {
    const ch = text[i]!;
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch]!++;
  }
  if (hint === 'tsv' && counts['\t']! > 0) return '\t';
  let best = ',';
  for (const d of ['\t', ';', '|']) if (counts[d]! > counts[best]!) best = d;
  return best;
}

/** RFC 4180 reader with a configurable delimiter. Blank records are kept (empty arrays) so record index + 1 is the spreadsheet row number. */
export function parseDelimited(text: string, delimiter: string, maxRecords: number): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  const endRecord = () => {
    row.push(field);
    out.push(row.length === 1 && row[0] === '' && !started ? [] : row);
    row = [];
    field = '';
    started = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"') { quoted = true; started = true; }
    else if (ch === delimiter) { row.push(field); field = ''; started = true; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      if (out.length > maxRecords) return out;
    } else { field += ch; started = true; }
  }
  if (field !== '' || row.length || started) endRecord();
  return out;
}

const clip = (v: string): string => {
  const t = v.trim();
  return t.length > LIMITS.maxCellChars ? t.slice(0, LIMITS.maxCellChars) : t;
};

/** header cells made unique and non-empty: blanks become "Column N", repeats get " (2)" */
export function cleanHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>();
  let last = cells.length;
  while (last > 0 && clip(cells[last - 1] ?? '') === '') last--; // trailing empty header cells are not columns
  return cells.slice(0, last).map((c, i) => {
    const base = clip(c) || `Column ${i + 1}`;
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function tabulate(records: string[][], meta: Pick<ParsedFile, 'format' | 'delimiter' | 'sheetName'>): ParsedFile {
  const headerIdx = records.findIndex((r) => r.some((c) => clip(c) !== ''));
  if (headerIdx < 0) throw empty();
  const headers = cleanHeaders(records[headerIdx]!);
  if (headers.length === 0) throw empty();
  if (headers.length > LIMITS.maxColumns) throw new AppError('BAD_REQUEST', `The file has more than ${LIMITS.maxColumns} columns`, { details: { rule: 'too_many_columns', maxColumns: LIMITS.maxColumns } });
  const rows: ParsedFile['rows'] = [];
  for (let i = headerIdx + 1; i < records.length; i++) {
    const rec = records[i]!;
    if (!rec.some((c) => clip(c) !== '')) continue; // blank line
    if (rows.length >= LIMITS.maxRows) throw tooMany(rows.length + 1);
    rows.push({ rowNumber: i + 1, cells: headers.map((_, c) => clip(rec[c] ?? '')) });
  }
  if (rows.length === 0) throw empty();
  return { ...meta, headers, rows };
}

/** blank lines and the header that may precede the data rows */
const RECORD_SLACK = 1_000;
const isZip = (buf: Buffer) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

/** Sniff the content (not the file name): a zip container is read as XLSX, anything else as delimited text. */
export function parseFile(buf: Buffer, fileName: string | null): ParsedFile {
  if (buf.length === 0) throw new AppError('BAD_REQUEST', 'The file is empty', { details: { rule: 'empty_file' } });
  if (isZip(buf)) {
    const sheet = readXlsx(buf, LIMITS.maxRows + RECORD_SLACK);
    if (sheet.records.length > LIMITS.maxRows + RECORD_SLACK) throw tooMany(LIMITS.maxRows + 1);
    return tabulate(sheet.records, { format: 'xlsx', delimiter: null, sheetName: sheet.sheetName });
  }
  const text = decodeText(buf);
  const hint: FileFormat | null = fileName && /\.tsv$/i.test(fileName) ? 'tsv' : null;
  const delimiter = detectDelimiter(text, hint);
  const records = parseDelimited(text, delimiter, LIMITS.maxRows + RECORD_SLACK);
  if (records.length > LIMITS.maxRows + RECORD_SLACK) throw tooMany(LIMITS.maxRows + 1);
  return tabulate(records, { format: delimiter === '\t' ? 'tsv' : 'csv', delimiter, sheetName: null });
}

/** CSV writer for downloads: RFC 4180 quoting and spreadsheet-formula neutralisation (a leading = + - @ becomes '=...). */
export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  return rows
    .map((r) => r.map((c) => {
      const s = c === null || c === undefined ? '' : safe(String(c));
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n') + '\r\n';
}
