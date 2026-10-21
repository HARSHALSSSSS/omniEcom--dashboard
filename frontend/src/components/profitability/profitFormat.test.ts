import { describe, expect, it } from "vitest";
import { spendParams, waterfallParams } from "@/api/profitability.api";
import type { ChannelRow, Component, Waterfall } from "@/types/profitability";
import { channelsCsv, csvField, inputToMinor, minorToInput, money, presetRange, rangeProblem, spanDays, waterfallCsv } from "./profitFormat";
import { readUrlState, spendQueryOf, waterfallQueryOf } from "./profitParams";
import { spendFormSchema, toSpendWrite } from "./spendForm";

const comp = (amountMinor: number | null, basis: Component["basis"] = "actual", coverage = 1): Component => ({ amountMinor, basis, coverage });

const wf = (over: Partial<Waterfall> = {}): Waterfall => ({
  range: { from: "2026-10-01", to: "2026-10-20" },
  ordersAnalysed: 10,
  ordersInRange: 10,
  windows: 1,
  truncated: false,
  grossRevenueMinor: 1_000_000,
  netContributionMinor: null,
  knownPartMinor: 400_000,
  netMarginPercent: null,
  missing: ["advertising"],
  completeness: "incomplete",
  unallocatedAdvertisingMinor: 0,
  comparison: null,
  channels: [],
  steps: [
    { key: "gross_revenue", label: "Gross revenue", type: "positive", amountMinor: 1_000_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 100, tooltip: "t" },
    { key: "advertising", label: "Advertising", type: "negative", amountMinor: null, basis: "missing", coverage: 0, shareOfRevenuePercent: null, tooltip: "t" },
    { key: "net_contribution", label: "=Net contribution", type: "subtotal", amountMinor: null, basis: "missing", coverage: 0, shareOfRevenuePercent: null, tooltip: "t" },
  ],
  ...over,
});

describe("ranges", () => {
  it("computes the real from/to of each preset", () => {
    expect(presetRange("30d", "2026-10-21")).toEqual({ from: "2026-09-22", to: "2026-10-21" });
    expect(presetRange("90d", "2026-10-21")).toEqual({ from: "2026-07-24", to: "2026-10-21" });
    expect(presetRange("mtd", "2026-10-21")).toEqual({ from: "2026-10-01", to: "2026-10-21" });
    expect(presetRange("ytd", "2026-10-21")).toEqual({ from: "2026-01-01", to: "2026-10-21" });
    expect(presetRange("last_month", "2026-10-21")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last_month", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("last_month", "2026-03-31")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("keeps year to date inside the 366-day limit", () => {
    expect(spanDays(presetRange("ytd", "2026-12-31"))).toBeLessThanOrEqual(366);
    expect(spanDays(presetRange("ytd", "2028-12-31"))).toBe(366);
  });

  it("rejects an incomplete, reversed or too long custom range", () => {
    expect(rangeProblem(undefined, "2026-10-01")).toMatch(/start and an end/);
    expect(rangeProblem("2026-02-30", "2026-03-01")).toMatch(/start and an end/);
    expect(rangeProblem("2026-10-05", "2026-10-01")).toMatch(/must not be after/);
    expect(rangeProblem("2025-01-01", "2026-10-01")).toMatch(/at most 366/);
    expect(rangeProblem("2026-10-01", "2026-10-01")).toBeNull();
    expect(rangeProblem("2025-10-01", "2026-10-01")).toBeNull();
  });
});

describe("URL state", () => {
  const read = (qs: string) => readUrlState(new URLSearchParams(qs), "2026-10-21");

  it("defaults to the last 30 days with the comparison on", () => {
    const s = read("");
    expect(s).toMatchObject({ view: "waterfall", preset: "30d", compare: true, page: 1, pageSize: 25 });
    expect(waterfallQueryOf(s)).toEqual({ from: "2026-09-22", to: "2026-10-21", compare: true });
  });

  it("reads a custom range, the comparison switch and the spend filters", () => {
    const acc = "22222222-2222-4222-8222-222222222222";
    const s = read(`range=custom&from=2026-09-01&to=2026-09-30&compare=off&view=spend&account=${acc}&q=diwali&page=3&size=50`);
    expect(waterfallQueryOf(s)).toEqual({ from: "2026-09-01", to: "2026-09-30", compare: false });
    expect(spendQueryOf(s)).toEqual({ from: "2026-09-01", to: "2026-09-30", account: acc, q: "diwali", page: 3, pageSize: 50 });
  });

  it("has no range while a custom range is invalid, and ignores junk values", () => {
    const s = read("range=custom&from=2026-10-05&to=2026-10-01&account=nope&page=-2&size=7");
    expect(s.range).toBeNull();
    expect(s.rangeError).toMatch(/must not be after/);
    expect(waterfallQueryOf(s)).toBeNull();
    expect(s).toMatchObject({ account: undefined, page: 1, pageSize: 25 });
    expect(read("range=bogus").preset).toBe("30d");
  });

  it("builds the API parameters", () => {
    expect(waterfallParams({ from: "a", to: "b", compare: true })).toEqual({ from: "a", to: "b", compare: "previous" });
    expect(waterfallParams({ from: "a", to: "b", compare: false })).toEqual({ from: "a", to: "b" });
    expect(spendParams({ from: "a", to: "b", account: "none", q: "x", page: 2, pageSize: 25 })).toEqual({ from: "a", to: "b", unallocated: true, q: "x", page: 2, pageSize: 25 });
    expect(spendParams({ account: "acc", page: 1, pageSize: 50 })).toEqual({ accountId: "acc", pageSize: 50 });
  });
});

describe("amounts", () => {
  it("shows an unknown amount as a dash and never as zero", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
    expect(money(0)).not.toBe("—");
  });

  it("converts rupee text to integer paise without float drift", () => {
    expect(inputToMinor("1250.50")).toBe(125050);
    expect(inputToMinor("1,250")).toBe(125000);
    expect(inputToMinor("0.29")).toBe(29);
    expect(inputToMinor("19.99")).toBe(1999);
    expect(inputToMinor("0")).toBe(0);
    expect(inputToMinor("1.234")).toBeNull();
    expect(inputToMinor("-5")).toBeNull();
    expect(inputToMinor("abc")).toBeNull();
    expect(minorToInput(125050)).toBe("1250.50");
    expect(minorToInput(125000)).toBe("1250");
  });

  it("validates and maps the spend form", () => {
    const ok = { spendDate: "2026-10-01", accountId: "", amount: "0", campaign: " ", notes: "" };
    expect(spendFormSchema.safeParse(ok).success).toBe(true);
    expect(toSpendWrite(ok)).toEqual({ spendDate: "2026-10-01", accountId: null, amountMinor: 0, campaign: null, notes: null });
    expect(spendFormSchema.safeParse({ ...ok, amount: "" }).success).toBe(false);
    expect(spendFormSchema.safeParse({ ...ok, amount: "1.999" }).success).toBe(false);
    expect(spendFormSchema.safeParse({ ...ok, spendDate: "2026-02-30" }).success).toBe(false);
    expect(spendFormSchema.safeParse({ ...ok, amount: "2000000000" }).success).toBe(false);
  });
});

describe("CSV", () => {
  it("quotes fields and neutralises formulas", () => {
    expect(csvField('a,"b"')).toBe('"a,""b"""');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField(-5)).toBe("-5");
    expect(csvField(null)).toBe("");
  });

  it("exports the waterfall with blanks for unknown amounts and the missing list", () => {
    const lines = waterfallCsv(wf()).trim().split("\r\n");
    expect(lines[0]).toBe("Profitability,2026-10-01 to 2026-10-20");
    expect(lines[1]).toMatch(/^Step,Amount \(/);
    expect(lines[2]).toBe("Gross revenue,10000.00,actual,100,100");
    expect(lines[3]).toBe("Advertising,,missing,0,");
    expect(lines[4]).toBe("'=Net contribution,,missing,0,");
    expect(lines[5]).toBe("Revenue minus known costs (not a profit figure),4000.00,,,");
    expect(lines[6]).toBe("Missing,advertising spend");
  });

  it("adds the previous period columns when comparing", () => {
    const w = wf({
      comparison: { range: { from: "2026-09-11", to: "2026-09-30" }, ordersAnalysed: 1, truncated: false, grossRevenue: { changeMinor: 1, changePercent: 1 }, netContribution: { changeMinor: null, changePercent: null }, netMarginPoints: null, previousNetContributionMinor: null, previousGrossRevenueMinor: 900_000 },
    });
    w.steps = w.steps.map((s, i) => (i === 0 ? { ...s, previousAmountMinor: 900_000, change: { changeMinor: 100_000, changePercent: 11.1 } } : s));
    const lines = waterfallCsv(w).trim().split("\r\n");
    expect(lines[1]).toBe("Compared with,2026-09-11 to 2026-09-30");
    expect(lines[3]).toBe("Gross revenue,10000.00,actual,100,100,9000.00,11.1");
  });

  it("exports the channel table", () => {
    const c: ChannelRow = { channel: "amazon_in", label: "Amazon", orders: 4, grossRevenue: comp(100_000), cogs: comp(40_000, "estimated", 0.5), marketplaceFees: comp(10_000), shippingCosts: comp(null, "missing", 0), returnsImpact: comp(0), advertisingSpend: comp(5_000), netProfitMinor: null, knownPartMinor: 45_000, netMarginPercent: null, missing: ["shipping"] };
    const lines = channelsCsv(wf({ channels: [c] })).trim().split("\r\n");
    expect(lines[2]).toBe("Amazon,4,1000.00,400.00,100.00,,0.00,50.00,,,shipping cost");
  });
});
