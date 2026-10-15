import { describe, it, expect } from "vitest";
import {
  formatINR,
  formatLakh,
  formatNumber,
  formatPercent,
  formatDelta,
  formatDate,
} from "@/utils/format";
import { cn } from "@/utils/cn";

describe("Formatting utils", () => {
  it("formats INR correctly in standard notation", () => {
    expect(formatINR(28400)).toBe("₹284");
    expect(formatINR(100000)).toBe("₹1,000");
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

describe("cn utility", () => {
  it("merges tailwind classes cleanly without conflicts", () => {
    const isHidden = false;
    expect(cn("p-2 text-sm", "p-4")).toBe("text-sm p-4");
    expect(cn("bg-red-500", isHidden && "bg-blue-500")).toBe("bg-red-500");
  });
});
