import { and, asc, desc, escapeLike, eq, ilike, inArray, isNull, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import {
  CURRENCY_UNITS, DUPLICATE_STRATEGIES, DUPLICATE_STRATEGY_INFO, LIMITS, PRESETS, REQUIRED_TARGETS, TARGET_BY_KEY, TARGET_FIELDS,
} from '../domain/catalogue';
import { autoMap, detectPreset, toMapping, type PresetMatch } from '../domain/mapping';
import { DEFAULT_SETTINGS, readSettings, type ImportSettings } from '../domain/settings';
import { buildXlsx } from '../domain/xlsx';
import { toCsv } from '../domain/tabular';
import { EDITABLE_STATUSES, R, S, isBusy, issueTotals, toSessionDto, type SessionRow } from './store';

export type SettingsPatch = Partial<ImportSettings> & { version?: number };

const SOURCES = ['csv', 'xlsx', 'tsv', 'shopify', 'amazon', 'flipkart', 'marketplace', 'erp'] as const;
export type CreateSource = (typeof SOURCES)[number] | 'csv_excel';

const FILE_EXTENSION = /\.(csv|tsv|txt|xlsx)$/i;

export async function createSession(tx: Tx, vendorId: string, actorId: string | null, input: { source: CreateSource; fileName: string; fileSizeBytes: number }) {
  if (input.fileSizeBytes > LIMITS.maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', `Files can be at most ${LIMITS.maxBytes / 1024 / 1024} MB`, { details: { rule: 'file_too_large', maxBytes: LIMITS.maxBytes } });
  if (!FILE_EXTENSION.test(input.fileName)) throw Errors.validation({ issues: [{ path: 'fileName', message: 'Upload a .csv, .tsv or .xlsx file' }] });
  const source = input.source === 'csv_excel' ? (/\.xlsx$/i.test(input.fileName) ? 'xlsx' : /\.tsv$/i.test(input.fileName) ? 'tsv' : 'csv') : input.source;
  const [row] = await tx.insert(S).values({ vendorId, source, fileName: input.fileName.slice(0, 255), fileSizeBytes: input.fileSizeBytes, requestedBy: actorId, settings: DEFAULT_SETTINGS }).returning();
  return row!;
}

export async function sessionDto(tx: Tx, vendorId: string, row: SessionRow) {
  return toSessionDto(row, await issueTotals(tx, vendorId, row.id));
}

export async function listSessions(tx: Tx, vendorId: string, q: { page: number; pageSize: number; status?: string; q?: string }) {
  const where = and(eq(S.vendorId, vendorId), q.status ? eq(S.status, q.status) : undefined, q.q ? ilike(S.fileName, `%${escapeLike(q.q)}%`) : undefined);
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(S).where(where) as [{ n: number }];
  const rows = await tx.select().from(S).where(where).orderBy(desc(S.createdAt), desc(S.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const items = [];
  for (const r of rows) items.push(await sessionDto(tx, vendorId, r));
  return { items, total: n };
}

/** applies a column change (or an edit of settings) to the row and sends a validated import back to "analyzed": the old results are stale */
export async function touchSession(tx: Tx, s: SessionRow, patch: Partial<typeof S.$inferInsert>, opts: { invalidates: boolean }) {
  const back = opts.invalidates && (s.status === 'validated' || s.status === 'partially_committed') ? { status: 'analyzed' } : {};
  const [row] = await tx.update(S).set({ ...patch, ...back, version: sql`${S.version} + 1` as never }).where(eq(S.id, s.id)).returning();
  return row!;
}

// ---------------------------------------------------------------- mapping
export interface MappingColumn { sourceColumn: string; targetField: string | null; confidence: number; sampleValues: string[]; isRequired: boolean; status: 'matched' | 'unmatched' | 'manual' }

export function presetOf(headers: string[], source: string): PresetMatch {
  const detected = detectPreset(headers);
  if (detected.code !== 'generic') return detected;
  if (source === 'shopify' || source === 'amazon') return { code: source, label: PRESETS.find((p) => p.code === source)!.label, confidence: 50 };
  return detected;
}

export async function mappingView(tx: Tx, vendorId: string, s: SessionRow) {
  const sample = s.headers.length ? await tx.select({ raw: R.raw }).from(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, s.id))).orderBy(asc(R.rowNumber)).limit(25) : [];
  const preset = presetOf(s.headers, s.source);
  const auto = new Map(autoMap(s.headers, preset.code).map((e) => [e.source, e]));
  const targetOf = new Map<string, string>();
  for (const [target, source] of Object.entries(s.mapping)) if (source) targetOf.set(source, target);
  const columns: MappingColumn[] = s.headers.map((header) => {
    const target = targetOf.get(header) ?? null;
    const guess = auto.get(header);
    const samples = [...new Set(sample.map((r) => r.raw[header] ?? '').filter(Boolean))].slice(0, 3);
    return {
      sourceColumn: header, targetField: target, sampleValues: samples, isRequired: target ? TARGET_BY_KEY.get(target)?.required ?? false : false,
      confidence: !target ? 0 : guess?.target === target ? guess.confidence : 100,
      status: !target ? 'unmatched' : guess?.target === target ? 'matched' : 'manual',
    };
  });
  const missingRequired = REQUIRED_TARGETS.filter((t) => !s.mapping[t]);
  return {
    preset, columns, missingRequired: missingRequired.map((key) => ({ key, label: TARGET_BY_KEY.get(key)!.label })),
    mapping: Object.fromEntries(Object.entries(s.mapping).filter(([, v]) => v)) as Record<string, string>,
  };
}

/** the automatic mapping a fresh upload starts with */
export const initialMapping = (headers: string[], source: string) => toMapping(autoMap(headers, presetOf(headers, source).code));

export type MappingChange = { sourceColumn: string; targetField: string | null } | { mapping: Record<string, string | null> };

export function applyMappingChange(s: SessionRow, change: MappingChange): Record<string, string | null> {
  if (s.headers.length === 0) throw new AppError('CONFLICT', 'Upload the file before mapping its columns', { details: { rule: 'no_file' } });
  if (!(EDITABLE_STATUSES as readonly string[]).includes(s.status)) throw new AppError('CONFLICT', `The mapping cannot be changed while the import is ${s.status}`, { details: { rule: 'not_editable', status: s.status } });
  const known = new Set(s.headers);
  const check = (target: string, source: string | null) => {
    if (!TARGET_BY_KEY.has(target)) throw Errors.validation({ issues: [{ path: 'targetField', message: `Unknown target field "${target}"` }] });
    if (source !== null && !known.has(source)) throw Errors.validation({ issues: [{ path: 'sourceColumn', message: `The file has no column "${source}"` }] });
  };
  if ('mapping' in change) {
    const used = new Set<string>();
    const next: Record<string, string | null> = {};
    for (const [target, source] of Object.entries(change.mapping)) {
      check(target, source);
      if (source) {
        if (used.has(source)) throw new AppError('VALIDATION_FAILED', `Column "${source}" is mapped to more than one field`, { details: { rule: 'source_used_twice', column: source } });
        used.add(source);
      }
      next[target] = source;
    }
    return next;
  }
  const next = { ...s.mapping };
  if (!known.has(change.sourceColumn)) throw Errors.validation({ issues: [{ path: 'sourceColumn', message: `The file has no column "${change.sourceColumn}"` }] });
  for (const [target, source] of Object.entries(next)) if (source === change.sourceColumn) next[target] = null; // a column feeds one field only
  if (change.targetField) {
    check(change.targetField, change.sourceColumn);
    next[change.targetField] = change.sourceColumn;
  }
  return next;
}

// ---------------------------------------------------------------- settings
export async function applySettings(tx: Tx, vendorId: string, s: SessionRow, patch: SettingsPatch): Promise<SessionRow> {
  if (isBusy(s.status) || s.status === 'committed' || s.status === 'cancelled') throw new AppError('CONFLICT', `The settings cannot be changed while the import is ${s.status}`, { details: { rule: 'not_editable', status: s.status } });
  if (patch.version !== undefined && patch.version !== s.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: s.version } });
  const changes: Partial<ImportSettings> = { ...patch };
  delete (changes as { version?: number }).version;
  const current = readSettings(s.settings);
  const next: ImportSettings = { ...current, ...changes };
  if (next.warehouseId && next.warehouseId !== current.warehouseId) {
    const [w] = await tx.select({ status: schema.warehouses.status }).from(schema.warehouses).where(and(eq(schema.warehouses.id, next.warehouseId), eq(schema.warehouses.vendorId, vendorId), isNull(schema.warehouses.deletedAt)));
    if (!w) throw Errors.notFound('Warehouse', next.warehouseId);
    if (w.status !== 'active') throw new AppError('CONFLICT', 'That warehouse is not active', { details: { rule: 'warehouse_inactive' } });
  }
  if (next.defaultCategoryId && next.defaultCategoryId !== current.defaultCategoryId) {
    const [c] = await tx.select({ id: schema.categories.id }).from(schema.categories).where(and(eq(schema.categories.id, next.defaultCategoryId), eq(schema.categories.vendorId, vendorId), isNull(schema.categories.deletedAt)));
    if (!c) throw Errors.notFound('Category', next.defaultCategoryId);
  }
  if (next.accountIds.length) {
    const found = await tx.select({ id: schema.marketplaceAccounts.id }).from(schema.marketplaceAccounts).where(and(eq(schema.marketplaceAccounts.vendorId, vendorId), inArray(schema.marketplaceAccounts.id, next.accountIds)));
    const missing = next.accountIds.find((id) => !found.some((f) => f.id === id));
    if (missing) throw Errors.notFound('Marketplace account', missing);
  }
  const invalidates = next.duplicateStrategy !== current.duplicateStrategy || next.defaultCategoryId !== current.defaultCategoryId || next.currencyUnit !== current.currencyUnit;
  return touchSession(tx, s, { settings: next }, { invalidates });
}

// ---------------------------------------------------------------- options + template
export function importOptions() {
  return {
    limits: { maxFileBytes: LIMITS.maxBytes, maxRows: LIMITS.maxRows, maxColumns: LIMITS.maxColumns, formats: ['csv', 'tsv', 'xlsx'] as string[] },
    targetFields: TARGET_FIELDS.map((t) => ({ key: t.key, label: t.label, group: t.group, required: t.required, recommended: t.recommended, example: t.example, description: t.description })),
    duplicateStrategies: DUPLICATE_STRATEGIES.map((value) => ({ value, ...DUPLICATE_STRATEGY_INFO[value] })),
    currencyUnits: CURRENCY_UNITS.map((value) => ({ value, label: value === 'rupees' ? 'Rupees (499.50)' : 'Paise (49950)' })),
    presets: PRESETS.map((p) => ({ code: p.code, label: p.label, description: p.description })),
    sources: SOURCES as unknown as string[],
    defaults: DEFAULT_SETTINGS,
    commitModes: [
      { value: 'clean_only', label: 'Clean rows only', description: 'Import rows that had no issue; rows with fixes you applied are left for later.' },
      { value: 'include_resolved', label: 'Include resolved rows', description: 'Import clean rows and rows whose issues you fixed. Rows with open errors are never imported.' },
    ],
  };
}

export function templateFile(format: 'csv' | 'xlsx'): { body: Buffer; contentType: string; fileName: string } {
  const rows = [TARGET_FIELDS.map((t) => t.label), TARGET_FIELDS.map((t) => t.example)];
  if (format === 'xlsx') return { body: buildXlsx('Products', rows, TARGET_FIELDS.map((t) => Math.max(14, t.label.length + 2))), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: 'product-import-template.xlsx' };
  return { body: Buffer.from(toCsv(rows), 'utf8'), contentType: 'text/csv; charset=utf-8', fileName: 'product-import-template.csv' };
}
