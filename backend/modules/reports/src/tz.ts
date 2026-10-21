/** Time zone helpers on top of Intl (no dependency): local calendar parts, local time -> instant, month ends. */

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (tz: string): Intl.DateTimeFormat => {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
    formatters.set(tz, f);
  }
  return f;
};

export function isValidTimeZone(tz: string): boolean {
  try { formatter(tz); return true; } catch { return false; }
}

export interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; second: number; /** 0 = Sunday */ weekday: number }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localParts(date: Date, tz: string): LocalParts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) out[p.type] = p.value;
  return { year: Number(out.year), month: Number(out.month), day: Number(out.day), hour: Number(out.hour) % 24, minute: Number(out.minute), second: Number(out.second), weekday: WEEKDAYS.indexOf(out.weekday ?? 'Sun') };
}

/** offset of the zone from UTC at an instant, in ms (IST = +19_800_000) */
export function tzOffsetMs(ts: number, tz: string): number {
  const p = localParts(new Date(ts), tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}

/** The instant at which the wall clock of `tz` reads the given local time. A time that does not exist (spring forward) moves forward; an ambiguous one takes the first. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMs(guess, tz);
  const t1 = guess - off1;
  const off2 = tzOffsetMs(t1, tz);
  if (off2 === off1) return new Date(t1);
  const t2 = guess - off2;
  if (tzOffsetMs(t2, tz) === off2) return new Date(t2);
  return new Date(t1); // the local time falls in a gap: use the earlier offset, which lands just after the gap
}

export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const dayString = (y: number, m: number, d: number): string => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** the local calendar day of an instant: "2026-10-16" */
export function localDay(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return dayString(p.year, p.month, p.day);
}

/** "2026-10-16 06:00" in the zone */
export function localDateTime(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${dayString(p.year, p.month, p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function parseDay(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function addDays(day: string, n: number): string {
  const p = parseDay(day)!;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return dayString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** start of a local day as an instant */
export function startOfDay(day: string, tz: string): Date {
  const p = parseDay(day)!;
  return zonedToUtc(p.year, p.month, p.day, 0, 0, tz);
}
