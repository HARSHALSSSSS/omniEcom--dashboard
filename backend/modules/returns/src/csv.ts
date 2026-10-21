/** Spreadsheet formula injection guard: cells starting with = + - @ are neutralised with a leading apostrophe. */
const safe = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return rows
    .map((r) => r.map((c) => {
      const s = c === null || c === undefined ? '' : safe(String(c));
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n') + '\r\n';
}

export const EXPORT_MAX_ROWS = 50_000;
