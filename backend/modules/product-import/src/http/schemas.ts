import { z } from 'zod';
import { IsoDate, PageQuerySchema } from '@oms/contracts';
import { ISSUE_ACTIONS } from '../domain/catalogue';
import { ImportSettingsSchema } from '../domain/settings';

export const RevalidationSchema = z.object({
  status: z.enum(['idle', 'running', 'complete', 'failed']),
  total: z.number().int(), checked: z.number().int(), current: z.string().nullable(),
  changes: z.array(z.object({ rowNumber: z.number().int(), field: z.string(), from: z.string().nullable(), to: z.string().nullable(), outcome: z.enum(['passed', 'still_failing']) })),
}).meta({ id: 'ImportRevalidationProgress' });

export const ScopeSchema = z.object({ products: z.number().int(), newProducts: z.number().int(), updates: z.number().int() });
export const PlanSchema = z.object({ create: z.number().int(), update: z.number().int(), addVariant: z.number().int(), skip: z.number().int() }).describe('Rows by what the commit will do with them');

export const ExistingProductSchema = z.object({
  id: z.string().describe('Master product id'), productId: z.string(), variantId: z.string(), productCode: z.string(), sku: z.string(), title: z.string().nullable(), price: z.number().nullable().describe('Selling price in rupees'), barcode: z.string().nullable(),
}).meta({ id: 'ImportExistingProduct' });

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
  scope: ScopeSchema.describe('Planned effect of committing the ready rows: products touched, new products, existing products updated (zeros before the first validation)'),
  products: z.number().int().describe('Distinct products in the file'),
  plan: PlanSchema,
  failureMessage: z.string().nullable(),
  revalidation: RevalidationSchema.nullable().describe('Progress and report of the last (re)validation; null before the first one'),
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
  autoTargetField: z.string().nullable().describe('The automatic suggestion for this column, whatever the seller changed (for "Reset to auto matches")'),
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
  suggestion: z.object({ kind: z.enum(['set_value', 'map_category', 'skip_row']), field: z.string().optional(), value: z.string().optional(), label: z.string().optional(), existing: ExistingProductSchema.optional(), confidence: z.enum(['high', 'medium', 'low']).optional(), confidenceReason: z.string().optional() }).nullable(),
  whyItMatters: z.string().describe('Why this issue matters (server-owned copy per issue code)'),
  impact: z.string().describe('What happens to the row if the issue stays open'),
  duplicateMatch: z.object({ existingSku: z.string(), existingTitle: z.string().nullable(), confidence: z.enum(['exact', 'high', 'medium']), reason: z.string() }).nullable().describe('Set on duplicate SKU issues against the catalogue'),
  suggestedFix: z.string().nullable(),
  currentFix: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'ignored']),
  resolution: z.record(z.string(), z.unknown()).nullable(),
  resolvedAt: IsoDate.nullable(),
  productData: z.object({
    sku: z.string().optional(), title: z.string().optional(), category: z.string().optional(), price: z.number().optional(), barcode: z.string().optional(), imageUrl: z.string().optional(),
    source: z.record(z.string(), z.string()).describe('The raw cells of the row, by column header'),
    existing: ExistingProductSchema.nullable().describe('duplicate_sku against the catalogue: the existing master product ("CSV SKU vs existing master product")'),
  }),
  unit: z.enum(['rupees', 'paise']),
}).meta({ id: 'ImportIssue' });

export const IssueListQuerySchema = PageQuerySchema.extend({
  'filter[code]': z.string().trim().max(40).optional(),
  'filter[severity]': z.enum(['error', 'warning']).optional(),
  'filter[status]': z.enum(['open', 'resolved', 'ignored']).optional(),
  'filter[field]': z.string().trim().max(40).optional().describe('Target field the issue is about (sku, title, category, imageUrl, sellingPrice, ...)'),
  sort: z.enum(['severity', '-severity', 'row', '-row', 'code', '-code']).default('severity').describe('Prefix - for descending. severity (default) lists errors first, then by row'),
  q: z.string().trim().max(120).optional().describe('Searches the message, the value, the SKU and the title'),
});

export const IssuePageSchema = z.object({ items: z.array(IssueSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), sort: z.string().describe('The sort that was applied') });

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
  products: z.number().int().describe('Distinct products in the file'),
  plan: PlanSchema,
  scope: ScopeSchema,
}).meta({ id: 'ImportSummary' });

export const RowSchema = z.object({
  rowNumber: z.number().int(), status: z.string(), sku: z.string().nullable(), productCode: z.string().nullable(), title: z.string().nullable(), issueCount: z.number().int(),
  plan: z.enum(['create', 'add_variant', 'update']).nullable(), skipReason: z.string().nullable(), fixed: z.boolean(),
  result: z.object({ action: z.enum(['created', 'updated', 'variant_added', 'skipped']), productId: z.string().optional(), variantId: z.string().optional(), sku: z.string().optional().describe('Set when the SKU had to be changed (create_new decision): the SKU the product got'), stock: z.enum(['received', 'counted', 'unchanged', 'none']).optional(), listingDrafts: z.number().int().optional(), notes: z.array(z.string()).optional() }).nullable(),
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
  revalidation: RevalidationSchema.nullable(),
}).meta({ id: 'ImportRevalidation' });

export const ActivityQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), before: z.string().trim().max(20).optional().describe('`nextBefore` of the previous page') });
export const ActivitySchema = z.object({
  items: z.array(z.object({
    id: z.string(), at: IsoDate,
    kind: z.enum(['row_validated', 'row_warning', 'row_error', 'row_created', 'row_updated', 'row_skipped', 'row_failed', 'issue_resolved', 'stage']),
    rowNumber: z.number().int().nullable(), sku: z.string().nullable(), title: z.string().nullable(), message: z.string(),
  })),
  nextBefore: z.string().nullable(),
}).meta({ id: 'ImportActivity' });

export const MarketplaceSourceSchema = z.object({
  items: z.array(z.object({
    accountId: z.string(), marketplace: z.string(), displayName: z.string(), mode: z.string(),
    connection: z.enum(['connected', 'attention', 'disconnected']),
    productsAvailable: z.number().int().nullable().describe('null until counted (POST /onboarding/products/refresh-counts)'),
    importedProducts: z.number().int(), lastImportAt: IsoDate.nullable(), canImport: z.boolean(),
  })),
}).meta({ id: 'ImportMarketplaceSources' });
export const FromMarketplaceBodySchema = z.object({ accountId: z.uuid() });

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
