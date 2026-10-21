import { renderCsv } from './csv';
import { buildPdf } from './pdf';
import type { ReportDocument, ReportFormat } from './tabular';
import { buildXlsx } from './xlsx';

export const FORMAT_META: Record<ReportFormat, { contentType: string; extension: string }> = {
  csv: { contentType: 'text/csv; charset=utf-8', extension: 'csv' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  pdf: { contentType: 'application/pdf', extension: 'pdf' },
};

/** csv carries the document's primary sheet only; xlsx and pdf carry every sheet */
export function renderDocument(doc: ReportDocument, format: ReportFormat): Buffer {
  if (format === 'csv') return renderCsv(doc.sheets[doc.primarySheet] ?? doc.sheets[0]!);
  return format === 'xlsx' ? buildXlsx(doc) : buildPdf(doc);
}
