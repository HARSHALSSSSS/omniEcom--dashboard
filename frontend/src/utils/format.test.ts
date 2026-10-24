import { afterEach, describe, it, expect } from "vitest";
import {
  getFormatPreferences,
  setFormatPreferences,
  formatINR,
  formatLakh,
  formatNumber,
  formatPercent,
  formatDelta,
  formatDate,
  formatRelativeTime,
} from "@/utils/format";
import { cn } from "@/utils/cn";

describe("Formatting utils", () => {
  it("formats INR correctly in standard notation", () => {
    expect(formatINR(28400)).toBe("₹284");
    expect(formatINR(100000)).toBe("₹1,000");
    expect(formatINR(249950)).toBe("₹2,499.50");
    expect(formatINR(-1050)).toBe("-₹10.50");
  });

  it("formats lakh and crore correctly in compact notation", () => {
    expect(formatLakh(284000)).toBe("₹2.84L");
    expect(formatLakh(10000000)).toBe("₹1.00Cr");
    expect(formatLakh(50000)).toBe("₹50.0K");
    expect(formatLakh(500)).toBe("₹500");
  });

  it("formats numbers with Indian grouping", () => {
    expect(formatNumber(1234567)).toBe("12,34,567");
  });

  it("formats percent and deltas correctly", () => {
    expect(formatPercent(4.8)).toBe("4.8%");
    expect(formatDelta(12)).toBe("+12.0%");
    expect(formatDelta(-3.5)).toBe("-3.5%");
  });

  it("formats ISO date to DD/MM/YYYY in IST", () => {
    // 2026-10-15T06:00:00Z is 11:30 AM IST on 15/10/2026
    expect(formatDate("2026-10-15T06:00:00Z")).toBe("15/10/2026");
  });
});

describe("business format preferences", () => {
  afterEach(() => setFormatPreferences(null));

  it("defaults to INR, Indian grouping and IST", () => {
    expect(getFormatPreferences()).toEqual({ currency: "INR", numberFormat: "indian", timezone: "Asia/Kolkata" });
  });

  it("groups and abbreviates in the international style", () => {
    setFormatPreferences({ currency: "INR", numberFormat: "international", timezone: "Asia/Kolkata" });
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatLakh(284000)).toBe("₹284.0K");
    expect(formatLakh(2840000)).toBe("₹2.84M");
    expect(formatINR(100000000)).toBe("₹1,000,000");
  });

  it("follows the business currency", () => {
    setFormatPreferences({ currency: "USD", numberFormat: "international", timezone: "UTC" });
    expect(formatINR(249950)).toBe("$2,499.50");
    expect(formatLakh(2840000)).toBe("$2.84M");
  });

  it("shows dates in the business time zone", () => {
    // 2026-10-15T20:00:00Z is already 16/10 in Asia/Kolkata and still 15/10 in UTC
    expect(formatDate("2026-10-15T20:00:00Z")).toBe("16/10/2026");
    setFormatPreferences({ timezone: "UTC" });
    expect(formatDate("2026-10-15T20:00:00Z")).toBe("15/10/2026");
  });

  it("ignores values it cannot use", () => {
    setFormatPreferences({ currency: "XX", numberFormat: "bogus" as never, timezone: "Not/AZone" });
    expect(getFormatPreferences()).toEqual({ currency: "INR", numberFormat: "indian", timezone: "Asia/Kolkata" });
  });
});

describe("cn utility", () => {
  it("merges tailwind classes cleanly without conflicts", () => {
    const isHidden = false;
    expect(cn("p-2 text-sm", "p-4")).toBe("text-sm p-4");
    expect(cn("bg-red-500", isHidden && "bg-blue-500")).toBe("bg-red-500");
  });
});

describe("formatRelativeTime", () => {
  const at = (ms: number) => new Date(Date.now() + ms).toISOString();
  it("describes the past", () => {
    expect(formatRelativeTime(at(-30_000))).toBe("just now");
    expect(formatRelativeTime(at(-5 * 60_000))).toBe("5 min ago");
    expect(formatRelativeTime(at(-3 * 3_600_000))).toBe("3h ago");
    expect(formatRelativeTime(at(-2 * 86_400_000))).toBe("2d ago");
  });
  it("describes the future instead of saying just now", () => {
    expect(formatRelativeTime(at(5 * 60_000 + 500))).toBe("in 5 min");
    expect(formatRelativeTime(at(3 * 3_600_000 + 500))).toBe("in 3h");
    expect(formatRelativeTime(at(6 * 86_400_000 + 500))).toBe("in 6d");
  });
});
