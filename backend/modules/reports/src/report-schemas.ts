import { z } from 'zod';
import { REPORT_TYPES } from './catalog';
import { REPORT_FORMATS } from './tabular';

const Iso = z.string();
export const ReportTypeSchema = z.enum(REPORT_TYPES);
export const FormatSchema = z.enum(REPORT_FORMATS);

export const RunSchema = z.object({
  id: z.string(), reportType: z.string(), reportTitle: z.string(), format: FormatSchema, params: z.record(z.string(), z.unknown()),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']), trigger: z.enum(['manual', 'schedule']), scheduleId: z.string().nullable(), scheduleName: z.string().nullable(),
  period: z.object({ fromDay: z.string(), toDay: z.string(), label: z.string() }).nullable(), fileName: z.string().nullable(), sizeBytes: z.number().nullable(), rowCount: z.number().nullable(),
  warnings: z.number().nullable(), notes: z.array(z.string()), settlementDataAvailable: z.boolean().nullable(), error: z.string().nullable(), requestedBy: z.string().nullable(),
  startedAt: Iso.nullable(), finishedAt: Iso.nullable(), expiresAt: Iso.nullable(), downloadable: z.boolean(), downloadUrl: z.string().nullable(), createdAt: Iso,
});

export const ScheduleSchema = z.object({
  id: z.string(), name: z.string(), reportType: z.string(), reportTitle: z.string(), format: FormatSchema, frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfWeek: z.number().nullable(), dayOfMonth: z.number().nullable(), timeOfDay: z.string(), timezone: z.string(), cadence: z.string(), params: z.record(z.string(), z.unknown()),
  recipients: z.array(z.string()), status: z.enum(['active', 'paused']), lastRunAt: Iso.nullable(), lastRunStatus: z.string().nullable(), nextRunAt: Iso.nullable(),
  lastRun: z.object({ id: z.string(), status: z.string(), finishedAt: Iso.nullable(), downloadUrl: z.string().nullable() }).nullable(),
  createdBy: z.string().nullable(), version: z.number().int(), createdAt: Iso, updatedAt: Iso,
});

export const ExportBodySchema = z.object({
  type: ReportTypeSchema,
  format: FormatSchema,
  params: z.record(z.string(), z.unknown()).default({}).describe('Parameters of the report type (see GET /reports/catalog)'),
  background: z.boolean().default(false).describe('true = always generate through a background job (202), even for a small report'),
}).strict();

const Email = z.string().max(254);
export const ScheduleBodySchema = z.object({
  name: z.string().min(1).max(120), reportType: ReportTypeSchema, format: FormatSchema, frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfWeek: z.number().int().min(0).max(6).optional().describe('weekly: 0 = Sunday .. 6 = Saturday'), dayOfMonth: z.number().int().min(1).max(31).optional().describe('monthly: 1-31, shorter months run on their last day'),
  timeOfDay: z.string().optional().describe('HH:MM, 24 hour, default 06:00'), timezone: z.string().max(60).optional().describe('IANA zone; default the business time zone (Asia/Kolkata)'),
  params: z.record(z.string(), z.unknown()).default({}).describe('Only relative parameters (range, granularity, filters): every run covers its own period'),
  recipients: z.array(Email).max(20).default([]), status: z.enum(['active', 'paused']).default('active'),
}).strict();

export const SchedulePatchSchema = z.object({
  version: z.number().int().min(1).describe('current version of the schedule (optimistic lock)'),
  name: z.string().min(1).max(120).optional(), reportType: ReportTypeSchema.optional(), format: FormatSchema.optional(), frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(), dayOfMonth: z.number().int().min(1).max(31).nullable().optional(), timeOfDay: z.string().optional(), timezone: z.string().max(60).optional(),
  params: z.record(z.string(), z.unknown()).optional(), recipients: z.array(Email).max(20).optional(), status: z.enum(['active', 'paused']).optional(),
}).strict();

export const ParamSchema = z.object({
  key: z.string(), type: z.string(), label: z.string(), description: z.string(), options: z.array(z.string()).nullable(), default: z.union([z.string(), z.number()]).nullable(),
  min: z.number().nullable(), max: z.number().nullable(), relative: z.boolean(),
});
export const CatalogEntrySchema = z.object({
  type: ReportTypeSchema, title: z.string(), description: z.string(), category: z.string(), formats: z.array(FormatSchema), defaultFormat: FormatSchema, schedulable: z.boolean(),
  sheets: z.array(z.string()), csvSheet: z.string(), params: z.array(ParamSchema),
});
