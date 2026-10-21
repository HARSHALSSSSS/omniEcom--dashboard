import { and, eq, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import type { Container } from '@oms/module-kit';
import { LIMITS } from '../domain/catalogue';
import { parseFile, type ParsedFile } from '../domain/tabular';
import { initialMapping, mappingView, presetOf } from './sessions';
import { EDITABLE_STATUSES, I, R, S, getSession, storageKey, type SessionRow } from './store';

const BATCH = 500;

export function assertUploadable(s: SessionRow): void {
  if (!(EDITABLE_STATUSES as readonly string[]).includes(s.status)) {
    throw new AppError('CONFLICT', `A file cannot be uploaded while the import is ${s.status}`, { details: { rule: 'not_editable', status: s.status } });
  }
}

/** Parse in memory once; the caller persists the result with `saveUpload`. Throws 400/413/415 for unusable files. */
export function analyse(body: Buffer, s: SessionRow): ParsedFile {
  if (body.length === 0) throw new AppError('BAD_REQUEST', 'The file is empty', { details: { rule: 'empty_file' } });
  if (body.length > LIMITS.maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', `Files can be at most ${LIMITS.maxBytes / 1024 / 1024} MB`, { details: { rule: 'file_too_large', maxBytes: LIMITS.maxBytes } });
  return parseFile(body, s.fileName);
}

/**
 * Keeps the original bytes in object storage and the rows (header -> value) in the database in batches, then moves the session to "analyzed".
 * Replacing an earlier upload drops its rows, issues and fixes: they belonged to that file.
 */
export async function saveUpload(tx: Tx, c: Container, vendorId: string, sessionId: string, body: Buffer, parsed: ParsedFile): Promise<SessionRow> {
  const s = await getSession(tx, vendorId, sessionId, { forUpdate: true });
  assertUploadable(s);
  const key = storageKey(vendorId, s.id, parsed.format);
  await c.storage.put(key, body, parsed.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
  await tx.delete(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, s.id)));
  await tx.delete(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, s.id)));
  for (let i = 0; i < parsed.rows.length; i += BATCH) {
    await tx.insert(R).values(parsed.rows.slice(i, i + BATCH).map((r) => ({
      vendorId, sessionId: s.id, rowNumber: r.rowNumber, raw: Object.fromEntries(parsed.headers.map((h, ci) => [h, r.cells[ci] ?? ''])),
    })));
  }
  const source = s.source === 'csv' || s.source === 'tsv' || s.source === 'xlsx' ? parsed.format : s.source;
  const [row] = await tx.update(S).set({
    source, status: 'analyzed', inputKey: key, fileSizeBytes: body.length, headers: parsed.headers, mapping: initialMapping(parsed.headers, source), rowCount: parsed.rows.length,
    validRows: 0, warningRows: 0, errorRows: 0, ignoredRows: 0, committedRows: 0, processedRows: 0, stats: {}, failureMessage: null, startedAt: null, finishedAt: null,
    version: s.version + 1,
  }).where(eq(S.id, s.id)).returning();
  return row!;
}

export async function analysisView(tx: Tx, vendorId: string, s: SessionRow, parsed: ParsedFile) {
  const mapping = await mappingView(tx, vendorId, s);
  return {
    format: parsed.format, delimiter: parsed.delimiter, sheetName: parsed.sheetName, totalRows: parsed.rows.length, headers: parsed.headers,
    preview: parsed.rows.slice(0, LIMITS.previewRows).map((r) => ({ rowNumber: r.rowNumber, values: Object.fromEntries(parsed.headers.map((h, ci) => [h, r.cells[ci] ?? ''])) })),
    preset: presetOf(parsed.headers, s.source),
    mapping: mapping.columns,
    missingRequired: mapping.missingRequired,
  };
}
