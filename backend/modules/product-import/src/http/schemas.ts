import { z } from 'zod';
import { IsoDate, PageQuerySchema } from '@oms/contracts';
import { ISSUE_ACTIONS } from '../domain/catalogue';
import { ImportSettingsSchema } from '../domain/settings';

const STATUSES = ['created', 'uploaded', 'analyzed', 'validating', 'validated', 'committing', 'committed', 'partially_committed', 'failed', 'cancelled'] as const;

export const SessionSchema = z.object({
  id: z.string(),
  source: z.string(),
  fileName: z.string().nullable(),
  fileSizeBytes: z.number().nullable(),
  status: z.enum(STATUSES),
  uiStatus: z.enum(['pending', 'uploading', 'analyzing', 'mapping', 'processing', 'completed', 'needs_attention', 'failed']).describe('The status vocabulary of the wizard screens'),
  headers: z.array(z.string()),
  settings: ImportSettingsSchema,
  counters: z.object({
    total: z.number().int(), processed: z.number().int(), valid: z.number().int(), warning: z.number().int(), error: z.number().int(), ignored: z.number().int(),
    skipped: z.number().int(), committed: z.number().int(), failed: z.number().int(), percent: z.number().int(), etaSeconds: z.number().int().nullable(),
  }),
  issues: z.object({ total: z.number().int(), open: z.number().int(), resolved: z.number().int(), ignored: z.number().int(), openErrors: z.number().int(), openWarnings: z.number().int() }),
  results: z.object({ productsCreated: z.number().int(), productsUpdated: z.number().int(), variantsCreated: z.number().int(), variantsUpdated: z.number().int() }),
  failureMessage: z.string().nullable(),
  requestedBy: z.string().nullable(),
  startedAt: IsoDate.nullable(),
  finishedAt: IsoDate.nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
  version: z.number().int(),
}).meta({ id: 'ImportSession' });

export const CreateBodySchema = z.object({
  source: z.enum(['csv_excel', 'csv', 'xlsx', 'tsv', 'shopify', 'amazon', 'flipkart', 'marketplace', 'erp']).default('csv_excel'),
  fileName: z.string().trim().min(1).max(255),
  fileSizeBytes: z.number().int().min(0),
});

export const ListQuerySchema = PageQuerySchema.extend({
  'filter[status]': z.enum(STATUSES).optional(),
  q: z.string().trim().max(120).optional().describe('Part of the file name'),
});

export const MappingColumnSchema = z.object({
  sourceColumn: z.string(),
  targetField: z.string().nullable(),
  confidence: z.number().int().describe('0-100; 100 for a column the seller mapped by hand'),
  sampleValues: z.array(z.string()),
  isRequired: z.boolean(),
  status: z.enum(['matched', 'unmatched', 'manual']),
});

export const PresetSchema = z.object({ code: z.enum(['shopify', 'amazon', 'generic']), label: z.string(), confidence: z.number().int() });

export const MappingViewSchema = z.object({
  preset: PresetSchema,
  columns: z.array(MappingColumnSchema),
  mapping: z.record(z.string(), z.string()).describe('target field -> source column'),
  missingRequired: z.array(z.object({ key: z.string(), label: z.string() })),
}).meta({ id: 'ImportMapping' });

export const MappingBodySchema = z.union([
  z.object({ sourceColumn: z.string().min(1), targetField: z.string().min(1).nullable() }).describe('Map (or, with null, unmap) one column'),
  z.object({ mapping: z.record(z.string(), z.string().nullable()) }).describe('Replace the whole mapping: target field -> source column'),
]);

export const AnalysisSchema = z.object({
  format: z.enum(['csv', 'tsv', 'xlsx']),
  delimiter: z.string().nullable(),
  sheetName: z.string().nullable(),
  totalRows: z.number().int(),
  headers: z.array(z.string()),
  preview: z.array(z.object({ rowNumber: z.number().int(), values: z.record(z.string(), z.string()) })),
  preset: PresetSchema,
  mapping: z.array(MappingColumnSchema),
  missingRequired: z.array(z.object({ key: z.string(), label: z.string() })),
}).meta({ id: 'ImportAnalysis' });

export const SettingsBodySchema = ImportSettingsSchema.partial().extend({ version: z.number().int().optional().describe('Optimistic lock: send the version you read') });

export const IssueSchema = z.object({
  id: z.string(),
  rowNumber: z.number().int(),
  code: z.string(),
  type: z.string().describe('Same as code (the name the wizard screens use)'),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['error', 'warning']),
  field: z.string().nullable(),
  affectedFields: z.array(z.string()),
  sourceValue: z.string().nullable(),
  suggestion: z.object({ kind: z.enum(['set_value', 'map_category', 'skip_row']), field: z.string().optional(), value: z.string().optional(), label: z.string().optional() }).nullable(),
  suggestedFix: z.string().nullable(),
  currentFix: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'ignored']),
  resolution: z.record(z.string(), z.unknown()).nullable(),
  resolvedAt: IsoDate.nullable(),
  productData: z.object({
    sku: z.string().optional(), title: z.string().optional(), category: z.string().optional(), price: z.number().optional(), barcode: z.string().optional(), imageUrl: z.string().optional(),
    source: z.record(z.string(), z.string()).describe('The raw cells of the row, by column header'),
  }),
  unit: z.enum(['rupees', 'paise']),
}).meta({ id: 'ImportIssue' });

export const IssueListQuerySchema = PageQuerySchema.extend({
  'filter[code]': z.string().trim().max(40).optional(),
  'filter[severity]': z.enum(['error', 'warning']).optional(),
  'filter[status]': z.enum(['open', 'resolved', 'ignored']).optional(),
  q: z.string().trim().max(120).optional().describe('Searches the message, the value, the SKU and the title'),
});

export const ResolveBodySchema = z.object({
  action: z.enum(ISSUE_ACTIONS),
  customValue: z.string().max(5000).optional().describe('Required for custom_value; an empty string clears the field'),
});

export const BulkResolveBodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  action: z.enum(ISSUE_ACTIONS),
  customValue: z.string().max(5000).optional(),
  sourceValue: z.string().max(5000).optional().describe('Only the issues that show exactly this value'),
});

export const ResolveResultSchema = z.object({ issue: IssueSchema, issues: SessionSchema.shape.issues, counters: SessionSchema.shape.counters }).meta({ id: 'ImportIssueResolution' });

export const BulkResultSchema = z.object({
  matched: z.number().int(), applied: z.number().int(), skippedCount: z.number().int(),
  skipped: z.array(z.object({ issueId: z.string(), rowNumber: z.number().int(), reason: z.string() })),
  issues: SessionSchema.shape.issues,
  counters: SessionSchema.shape.counters,
}).meta({ id: 'ImportBulkResolution' });

export const SummarySchema = z.object({
  total: z.number().int(), open: z.number().int(), resolved: z.number().int(), ignored: z.number().int(), errors: z.number().int(), warnings: z.number().int(),
  byCode: z.array(z.object({ code: z.string(), title: z.string(), total: z.number().int(), open: z.number().int(), resolved: z.number().int(), ignored: z.number().int(), errors: z.number().int(), warnings: z.number().int() })),
  knownCodes: z.array(z.object({ code: z.string(), title: z.string() })),
  rows: z.record(z.string(), z.number().int()).describe('Rows per status'),
}).meta({ id: 'ImportSummary' });

export const RowSchema = z.object({
  rowNumber: z.number().int(), status: z.string(), sku: z.string().nullable(), productCode: z.string().nullable(), title: z.string().nullable(), issueCount: z.number().int(),
  plan: z.enum(['create', 'add_variant', 'update']).nullable(), skipReason: z.string().nullable(), fixed: z.boolean(),
  result: z.object({ action: z.enum(['created', 'updated', 'variant_added', 'skipped']), productId: z.string().optional(), variantId: z.string().optional(), stock: z.enum(['received', 'counted', 'unchanged', 'none']).optional(), listingDrafts: z.number().int().optional(), notes: z.array(z.string()).optional() }).nullable(),
  productId: z.string().nullable(), variantId: z.string().nullable(),
  values: z.record(z.string(), z.unknown()).describe('The normalised values the commit will use'),
  raw: z.record(z.string(), z.string()),
}).meta({ id: 'ImportRow' });

export const RowListQuerySchema = PageQuerySchema.extend({
  'filter[status]': z.enum(['pending', 'valid', 'warning', 'error', 'ignored', 'committed', 'skipped']).optional(),
  q: z.string().trim().max(120).optional(),
});

export const RevalidateResultSchema = z.object({
  queued: z.boolean(),
  status: z.enum(['clean', 'issues_remain', 'queued']),
  revalidatedCount: z.number().int(), resolvedCount: z.number().int(), remainingIssuesCount: z.number().int(),
  session: SessionSchema,
}).meta({ id: 'ImportRevalidation' });

export const CommitBodySchema = z.object({ mode: z.enum(['clean_only', 'include_resolved']).default('clean_only') });
export const CommitResultSchema = z.object({ session: SessionSchema, eligibleRows: z.number().int() }).meta({ id: 'ImportCommitStart' });

export const UploadResultSchema = z.object({ session: SessionSchema, analysis: AnalysisSchema }).meta({ id: 'ImportUpload' });

export const OptionsSchema = z.object({
  limits: z.object({ maxFileBytes: z.number().int(), maxRows: z.number().int(), maxColumns: z.number().int(), formats: z.array(z.string()) }),
  targetFields: z.array(z.object({ key: z.string(), label: z.string(), group: z.string(), required: z.boolean(), recommended: z.boolean(), example: z.string(), description: z.string() })),
  duplicateStrategies: z.array(z.object({ value: z.string(), label: z.string(), description: z.string() })),
  currencyUnits: z.array(z.object({ value: z.string(), label: z.string() })),
  presets: z.array(z.object({ code: z.string(), label: z.string(), description: z.string() })),
  sources: z.array(z.string()),
  defaults: ImportSettingsSchema,
  commitModes: z.array(z.object({ value: z.string(), label: z.string(), description: z.string() })),
}).meta({ id: 'ImportOptions' });

export const TemplateQuerySchema = z.object({ format: z.enum(['csv', 'xlsx']).default('csv') });
