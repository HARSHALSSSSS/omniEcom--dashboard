import { describe, expect, it } from "vitest";
import { agoText, scoreColor, spectrumBars, SPECTRUM_MAX_BARS } from "./format";

const counts = (ready: number, needs_review: number, blocked: number, not_listed: number) => ({ ready, needs_review, blocked, not_listed });

describe("audit format helpers", () => {
  it("draws one bar per listing grouped by state", () => {
    expect(spectrumBars(counts(2, 1, 0, 1))).toEqual(["ready", "ready", "needs_review", "not_listed"]);
    expect(spectrumBars(counts(0, 0, 0, 0))).toEqual([]);
  });

  it("scales a large catalogue to the bar cap, keeping every non-empty state visible and the proportions", () => {
    const bars = spectrumBars(counts(9000, 900, 5, 0));
    expect(bars).toHaveLength(SPECTRUM_MAX_BARS);
    const n = (s: string) => bars.filter((b) => b === s).length;
    expect(n("blocked")).toBeGreaterThanOrEqual(1);
    expect(n("not_listed")).toBe(0);
    expect(n("ready")).toBeGreaterThan(n("needs_review") * 5);
  });

  it("words relative times and colours scores", () => {
    const now = new Date("2026-10-20T12:00:00Z").getTime();
    expect(agoText(null)).toBe("Never");
    expect(agoText("2026-10-20T11:59:50Z", now)).toBe("just now");
    expect(agoText("2026-10-20T11:56:00Z", now)).toBe("4 min ago");
    expect(agoText("2026-10-20T10:00:00Z", now)).toBe("2 hr ago");
    expect(agoText("2026-10-17T12:00:00Z", now)).toBe("3 days ago");
    expect([95, 75, 30].map(scoreColor)).toEqual(["#16A34A", "#D97706", "#DC2626"]);
  });
});
