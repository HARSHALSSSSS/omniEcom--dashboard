import { classify, type AskOptions, type Intent, type Period } from './brain';

/**
 * Simple follow-ups on top of the one-shot ask engine. A short message such as "and last month?" or "which of those?" is
 * resolved against the previous turn: the same question type again, for another period, or with the details of the last answer.
 * Anything that is a question in its own right is answered as such.
 */
export interface TurnContext { intent: Intent; period: Period | null; horizon: number | null }
export interface Resolved { opts: AskOptions; context: TurnContext; followUp: 'period' | 'detail' | 'topic' | null }

const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const utcMidnight = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** "last month", "this week", "yesterday", "last 14 days", "this year" ... as a UTC date window; null when the text names none */
export function parsePeriod(text: string, now = new Date()): Period | null {
  const t = text.toLowerCase();
  const today = utcMidnight(now);
  const days = /\b(?:last|past) (\d{1,3}) days\b/.exec(t);
  if (days) {
    const n = Math.min(366, Math.max(1, Number(days[1])));
    return { from: iso(today - (n - 1) * DAY), to: iso(today), label: `last ${n} days`, previous: `previous ${n} days` };
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
  if (/\byesterday\b/.test(t)) return { from: iso(today - DAY), to: iso(today - DAY), label: 'yesterday', previous: 'day before' };
  if (/\btoday\b/.test(t)) return { from: iso(today), to: iso(today), label: 'today', previous: 'day before' };
  if (/\blast month\b/.test(t)) return { from: iso(Date.UTC(y, m - 1, 1)), to: iso(Date.UTC(y, m, 0)), label: 'last month', previous: 'month before' };
  if (/\bthis month\b/.test(t)) return { from: iso(Date.UTC(y, m, 1)), to: iso(today), label: 'this month', previous: 'previous period of the same length' };
  if (/\blast week\b/.test(t)) return { from: iso(today - (dow + 7) * DAY), to: iso(today - (dow + 1) * DAY), label: 'last week', previous: 'week before' };
  if (/\bthis week\b/.test(t)) return { from: iso(today - dow * DAY), to: iso(today), label: 'this week', previous: 'previous period of the same length' };
  if (/\blast year\b/.test(t)) return { from: iso(Date.UTC(y - 1, 0, 1)), to: iso(Date.UTC(y - 1, 11, 31)), label: 'last year', previous: 'year before' };
  if (/\bthis year\b/.test(t)) return { from: iso(Date.UTC(y, 0, 1)), to: iso(today), label: 'this year', previous: 'previous period of the same length' };
  return null;
}

const CONNECTOR = /^\s*(and|also|what about|how about|same (for|but)|now|then|what if)\b/i;
const DETAIL = /\b(which (of )?(those|these|them|ones)|which ones|(show|list|give) (me )?(them|those|these|the list|the details|more)|more details?|details?)\b/i;
const SHORT_WORDS = 9;

/** decides what a message means given the previous turn (null for the first message of a conversation) */
export function resolveTurn(text: string, prev: TurnContext | null, now = new Date()): Resolved {
  const own = classify(text);
  const period = parsePeriod(text, now);
  const nextHorizon = /\bnext week\b/i.test(text) ? 7 : /\bnext month\b/i.test(text) ? 30 : null;
  const short = text.trim().split(/\s+/).length <= SHORT_WORDS;
  const fresh = (intent: Intent, p: Period | null, h: number | null, followUp: Resolved['followUp']): Resolved => ({
    opts: { ...(intent !== 'unknown' ? { intent } : {}), ...(p ? { period: p } : {}), ...(h ? { horizon: h } : {}) }, context: { intent, period: p, horizon: h }, followUp,
  });
  if (prev && prev.intent !== 'unknown' && short) {
    if (own === 'unknown' && (period || nextHorizon)) return fresh(prev.intent, period ?? prev.period, nextHorizon ?? prev.horizon, 'period');
    if (own === 'unknown' && DETAIL.test(text)) return fresh(prev.intent, prev.period, prev.horizon, 'detail');
    if (own !== 'unknown' && CONNECTOR.test(text)) return fresh(own, period ?? prev.period, nextHorizon ?? prev.horizon, 'topic');
  }
  return fresh(own, period, nextHorizon, null);
}

export const contextFromStored = (data: unknown): TurnContext | null => {
  const c = (data as { context?: TurnContext } | null)?.context;
  return c && typeof c.intent === 'string' ? { intent: c.intent, period: c.period ?? null, horizon: c.horizon ?? null } : null;
};

