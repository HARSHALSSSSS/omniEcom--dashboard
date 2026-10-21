import { formatBps, formatMinor } from './money';
import type { Cell, Column, Sheet } from './tabular';

/** text that a spreadsheet could take for a formula is prefixed with an apostrophe (same rule as the catalog export) */
const safeText = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const quote = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** the text of one cell as plain values (csv and pdf): money in rupees with two decimals, percent as 18.00 */
export function cellText(c: Cell, col: Column): string {
  if (c === null || c === undefined || c === '') return '';
  switch (col.type) {
    case 'money': return formatMinor(Number(c));
    case 'percent': return formatBps(Number(c));
    case 'int': return String(Math.trunc(Number(c)));
    default: return String(c);
  }
}

/** One sheet as CSV (UTF-8 with a byte order mark so spreadsheets read non-ASCII names, CRLF line ends). */
export function renderCsv(sheet: Sheet): Buffer {
  const lines: string[] = [sheet.columns.map((c) => quote(safeText(c.header))).join(',')];
  const line = (row: Cell[]) => sheet.columns.map((col, i) => {
    const v = cellText(row[i] ?? null, col);
    return quote(col.type === 'text' || col.type === 'datetime' || col.type === 'date' ? safeText(v) : v);
  }).join(',');
  for (const r of sheet.rows) lines.push(line(r));
  if (sheet.totals) lines.push(line(sheet.totals));
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
}
