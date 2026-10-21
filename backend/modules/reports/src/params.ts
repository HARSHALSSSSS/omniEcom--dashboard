import { z } from 'zod';
import { AppError } from '@oms/shared';
import { addDays, dayString, daysInMonth, localParts, parseDay, startOfDay } from './tz';

/** Thrown for a bad parameter or business rule: 400 with the rule and the field. */
export function invalid(message: string, rule: string, path: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError('VALIDATION_FAILED', message, { details: { rule, issues: [{ path, message }], ...extra } });
}

export type ParamType = 'range' | 'month' | 'date' | 'enum' | 'uuid' | 'integer' | 'string';
export interface ParamSpec {
  key: string;
  type: ParamType;
  label: string;
  description: string;
  options?: readonly string[];
  default?: string | number;
  min?: number;
  max?: number;
  /** false = a fixed calendar value (a month, a date): refused in schedules, which must resolve relative to the run time */
  relative: boolean;
}

export const RANGES = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_week', 'previous_week', 'this_month', 'previous_month', 'this_financial_year', 'previous_financial_year'] as const;
export type RangeKey = (typeof RANGES)[number];

export const WINDOW_PARAMS: ParamSpec[] = [
  { key: 'range', type: 'range', label: 'Period', description: 'A period relative to the moment the report runs (schedules use this).', options: RANGES, default: 'this_month', relative: true },
  { key: 'month', type: 'month', label: 'Month', description: 'A calendar month, YYYY-MM. Overrides `range`.', relative: false },
  { key: 'from', type: 'date', label: 'From', description: 'First day, YYYY-MM-DD (business time zone). Needs `to`. Overrides `range`.', relative: false },
  { key: 'to', type: 'date', label: 'To', description: 'Last day, inclusive, YYYY-MM-DD. Needs `from`.', relative: false },
];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function paramsSchema(specs: ParamSpec[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  for (const s of specs) {
    let t: z.ZodType;
    switch (s.type) {
      case 'range':
      case 'enum': t = z.enum(s.options as unknown as [string, ...string[]]); break;
      case 'month': t = z.string().regex(MONTH_RE, 'use YYYY-MM'); break;
      case 'date': t = z.string().regex(DAY_RE, 'use YYYY-MM-DD').refine((v) => parseDay(v) !== null, 'not a calendar date'); break;
      case 'uuid': t = z.uuid(); break;
      case 'integer': t = z.number().int().min(s.min ?? 0).max(s.max ?? 1_000_000); break;
      default: t = z.string().trim().min(1).max(80);
    }
    shape[s.key] = t.optional();
  }
  return z.object(shape).strict() as unknown as z.ZodType<Record<string, unknown>>;
}

/** Validates the parameters of a report type (unknown keys, bad values, conflicting period options) and returns them as sent. */
export function parseParams(specs: ParamSpec[], raw: unknown): Record<string, unknown> {
  const r = paramsSchema(specs).safeParse(raw ?? {});
  if (!r.success) {
    throw new AppError('VALIDATION_FAILED', 'Invalid report parameters', { details: { rule: 'invalid_params', issues: r.error.issues.map((i) => ({ path: `params.${i.path.join('.')}`.replace(/\.$/, ''), message: i.message })) } });
  }
  const p = Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined));
  if (specs.some((s) => s.key === 'month')) {
    if (p.month !== undefined && (p.from !== undefined || p.to !== undefined)) throw invalid('Use either `month` or `from` and `to`, not both', 'conflicting_period', 'params.month');
    if ((p.from === undefined) !== (p.to === undefined)) throw invalid('`from` and `to` go together', 'incomplete_period', p.from === undefined ? 'params.from' : 'params.to');
  }
  return p;
}

export interface ResolvedWindow {
  /** first and last local day, inclusive */
  fromDay: string;
  toDay: string;
  /** the instants: [from, to) */
  from: Date;
  to: Date;
  label: string;
}

export const MAX_WINDOW_DAYS = 366;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (y: number, m: number) => `${MONTH_NAMES[m - 1]} ${y}`;

export function makeWindow(fromDay: string, toDay: string, tz: string, label?: string): ResolvedWindow {
  const f = parseDay(fromDay)!;
  const t = parseDay(toDay)!;
  if (fromDay > toDay) throw invalid('`from` must not be after `to`', 'bad_period', 'params.from');
  const days = Math.round((Date.UTC(t.year, t.month - 1, t.day) - Date.UTC(f.year, f.month - 1, f.day)) / 86_400_000) + 1;
  if (days > MAX_WINDOW_DAYS) throw invalid(`A report period is at most ${MAX_WINDOW_DAYS} days`, 'period_too_long', 'params.to');
  return { fromDay, toDay, from: startOfDay(fromDay, tz), to: startOfDay(addDays(toDay, 1), tz), label: label ?? (fromDay === toDay ? fromDay : `${fromDay} to ${toDay}`) };
}

const monthWindow = (y: number, m: number, tz: string): ResolvedWindow => makeWindow(dayString(y, m, 1), dayString(y, m, daysInMonth(y, m)), tz, monthLabel(y, m));

/** Turns the period parameters into a concrete window in the business time zone. `now` makes it testable. */
export function resolveWindow(params: Record<string, unknown>, tz: string, now: Date, fallback: RangeKey = 'this_month'): ResolvedWindow {
  if (typeof params.month === 'string') {
    const [y, m] = params.month.split('-').map(Number) as [number, number];
    return monthWindow(y, m, tz);
  }
  if (typeof params.from === 'string' && typeof params.to === 'string') return makeWindow(params.from, params.to, tz);
  return relativeWindow((params.range as RangeKey | undefined) ?? fallback, tz, now);
}

export function relativeWindow(range: RangeKey, tz: string, now: Date): ResolvedWindow {
  const p = localParts(now, tz);
  const today = dayString(p.year, p.month, p.day);
  switch (range) {
    case 'today': return makeWindow(today, today, tz);
    case 'yesterday': return makeWindow(addDays(today, -1), addDays(today, -1), tz);
    case 'last_7_days': return makeWindow(addDays(today, -6), today, tz);
    case 'last_30_days': return makeWindow(addDays(today, -29), today, tz);
    case 'this_week': { const start = addDays(today, -((p.weekday + 6) % 7)); return makeWindow(start, addDays(start, 6), tz); }
    case 'previous_week': { const start = addDays(today, -((p.weekday + 6) % 7) - 7); return makeWindow(start, addDays(start, 6), tz); }
    case 'this_month': return monthWindow(p.year, p.month, tz);
    case 'previous_month': return p.month === 1 ? monthWindow(p.year - 1, 12, tz) : monthWindow(p.year, p.month - 1, tz);
    case 'this_financial_year': { const y = p.month >= 4 ? p.year : p.year - 1; return makeWindow(dayString(y, 4, 1), today, tz, `FY ${y}-${String((y + 1) % 100).padStart(2, '0')} (to date)`); }
    case 'previous_financial_year': { const y = (p.month >= 4 ? p.year : p.year - 1) - 1; return makeWindow(dayString(y, 4, 1), dayString(y + 1, 3, 31), tz, `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`); }
  }
}

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today', yesterday: 'Yesterday', last_7_days: 'Last 7 days', last_30_days: 'Last 30 days', this_week: 'This week (Mon-Sun)', previous_week: 'Previous week',
  this_month: 'This month', previous_month: 'Previous month', this_financial_year: 'This financial year (Apr-Mar, to date)', previous_financial_year: 'Previous financial year',
};
