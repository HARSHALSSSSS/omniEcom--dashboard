import { sql, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import type { ResolvedWindow } from '../params';
import type { ReportDocument } from '../tabular';

export interface BuildCtx {
  tx: Tx;
  vendorId: string;
  timezone: string;
  businessName: string;
  params: Record<string, unknown>;
  /** the resolved period for period based reports; for `inventory_valuation` the single as-of day */
  window: ResolvedWindow;
  now: Date;
}

export interface BuildResult {
  document: ReportDocument;
  /** what the run record keeps next to the file */
  meta: { warnings: number; notes: string[]; settlementDataAvailable?: boolean };
}

/** source rows read for one report: above this the period must be narrowed */
export const MAX_SOURCE_ROWS = 50_000;
export const tooLarge = (what: string): AppError =>
  new AppError('PAYLOAD_TOO_LARGE', `This report would contain more than ${MAX_SOURCE_ROWS} ${what}. Choose a shorter period.`, { details: { rule: 'report_too_large' } });

export const rows = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Array<Record<string, unknown>>> => (await tx.execute<Record<string, unknown>>(q)).rows;
export const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const nul = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
export const uuidList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** a timestamp column read through raw SQL (a Date from the driver, or an ISO string) */
export const ts = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));
