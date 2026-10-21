import { z } from 'zod';
import { AppError } from '@oms/shared';
import { day } from './rollup';

export const DAY = 86_400_000;
export const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const RangeQuery = z.object({ from: D.optional().describe('First day (UTC), default: 29 days before `to`'), to: D.optional().describe('Last day (UTC), default: today'), refresh: z.coerce.boolean().optional().describe('Recompute the last two days from the orders first (the roll-up job also does this every 15 minutes)') });

/** inclusive UTC date range, default the last 30 days; `maxDays` is the longest span allowed (366 = a full year) */
export const range = (q: { from?: string; to?: string }, maxDays = 366) => {
  const to = q.to ?? day(new Date());
  const from = q.from ?? day(new Date(Date.parse(to) - 29 * DAY));
  const span = (Date.parse(to) - Date.parse(from)) / DAY;
  if (Number.isNaN(span)) throw new AppError('BAD_REQUEST', '`from` and `to` must be real dates (YYYY-MM-DD)');
  if (span < 0) throw new AppError('BAD_REQUEST', '`from` must not be after `to`');
  if (span > maxDays) throw new AppError('BAD_REQUEST', `A range is at most ${maxDays + 1} days`);
  return { from, to };
};
