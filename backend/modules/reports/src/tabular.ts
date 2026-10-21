/**
 * The neutral document every report builder produces and every renderer (csv, xlsx, pdf) consumes.
 * Cell values by column type: text = string, int = integer, money = integer MINOR units, date = "YYYY-MM-DD",
 * datetime = "YYYY-MM-DD HH:mm" (business time zone, shown as text), percent = integer basis points. null = empty cell.
 */
export type ColumnType = 'text' | 'int' | 'money' | 'date' | 'datetime' | 'percent';
export type Cell = string | number | null;

export interface Column {
  header: string;
  type: ColumnType;
  /** preferred width in characters (a hint for xlsx and pdf) */
  width?: number;
}

export interface Sheet {
  name: string;
  title: string;
  columns: Column[];
  rows: Cell[][];
  /** an optional last row shown bold (same shape as a row) */
  totals?: Cell[];
  /** free lines under the table (method, caveats) */
  notes?: string[];
}

export interface ReportDocument {
  type: string;
  title: string;
  businessName: string;
  /** e.g. the period: "October 2026" */
  subtitle: string;
  generatedAt: Date;
  timezone: string;
  sheets: Sheet[];
  /** the sheet the single-table csv format contains */
  primarySheet: number;
}

export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** total number of data rows of the sheets: what the size limits count */
export const documentRows = (d: ReportDocument): number => d.sheets.reduce((n, s) => n + s.rows.length, 0);
