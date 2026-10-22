import type { ScreenStatus, SpectrumState } from "@/types/listingAudit";

export const GREEN = "#16A34A";
export const AMBER = "#D97706";
export const RED = "#DC2626";
export const BLUE = "#2563EB";
export const GREY = "#9CA3AF";

/** health / coverage bar colour: 90 and above is healthy, below 60 is poor */
export const scoreColor = (pct: number): string => (pct >= 90 ? GREEN : pct >= 60 ? AMBER : RED);

export const SPECTRUM_COLOR: Record<SpectrumState, string> = { ready: GREEN, needs_review: AMBER, blocked: RED, not_listed: "#E5E7EB" };
export const SPECTRUM_LABEL: Record<SpectrumState, string> = { ready: "Ready", needs_review: "Needs review", blocked: "Blocked", not_listed: "Not listed" };

export const STATUS_LABEL: Record<ScreenStatus | "not_listed", string> = {
  live: "Live",
  ready: "Ready",
  needs_review: "Needs review",
  syncing: "Syncing",
  failed: "Failed",
  blocked: "Blocked",
  not_listed: "Not listed",
};
export const STATUS_COLOR: Record<ScreenStatus | "not_listed", string> = {
  live: GREEN,
  ready: GREEN,
  needs_review: AMBER,
  syncing: BLUE,
  failed: RED,
  blocked: RED,
  not_listed: GREY,
};

/** "just now", "4 min ago", "2 hr ago", "3 days ago"; "Never" without a time */
export function agoText(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "Never";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "Never";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export const SPECTRUM_MAX_BARS = 160;

/**
 * One bar per listing, grouped by state. A large catalogue is scaled down to `max` bars (largest remainder), every non-empty
 * state keeping at least one bar, so the strip stays proportional to the real counts.
 */
export function spectrumBars(counts: Record<SpectrumState, number>, max: number = SPECTRUM_MAX_BARS): SpectrumState[] {
  const states = Object.keys(SPECTRUM_COLOR) as SpectrumState[];
  const total = states.reduce((a, s) => a + counts[s], 0);
  if (total === 0) return [];
  const bars = total <= max ? Object.fromEntries(states.map((s) => [s, counts[s]])) as Record<SpectrumState, number> : scaled(counts, states, total, max);
  return states.flatMap((s) => Array.from({ length: bars[s] }, () => s));
}

function scaled(counts: Record<SpectrumState, number>, states: SpectrumState[], total: number, max: number): Record<SpectrumState, number> {
  const out = {} as Record<SpectrumState, number>;
  const rest: Array<{ s: SpectrumState; frac: number }> = [];
  let used = 0;
  for (const s of states) {
    const exact = (counts[s] * max) / total;
    out[s] = counts[s] > 0 ? Math.max(1, Math.floor(exact)) : 0;
    used += out[s];
    rest.push({ s, frac: exact - Math.floor(exact) });
  }
  rest.sort((a, b) => b.frac - a.frac);
  for (let i = 0; used < max && i < rest.length; i = (i + 1) % rest.length) {
    const s = rest[i]?.s;
    if (!s || counts[s] === 0) continue;
    out[s] += 1;
    used += 1;
  }
  return out;
}
