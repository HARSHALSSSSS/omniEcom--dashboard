import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import type { PriceProposal } from "@/types/pricing";
import { bpsText, decisionError, historyCsv, isDecidable, isVersionConflict, parsePercentToBps, percentText, proposalsCsv, signedBps } from "./pricingFormat";

const proposal = (over: Partial<PriceProposal> = {}): PriceProposal => ({
  id: "p1",
  status: "pending_review",
  strategy: "automated_match",
  variantId: "v1",
  sku: "KURTA-M",
  productTitle: 'Cotton "Kurta", medium',
  accountId: "a1",
  channelName: "Amazon",
  marketplace: "amazon_in",
  policyId: null,
  policyName: null,
  currentPriceMinor: 129900,
  proposedPriceMinor: 134950,
  currency: "INR",
  priceChangeBps: 389,
  competitorPriceMinor: null,
  estMarginDeltaBps: 380,
  projectedSalesDeltaBps: null,
  reasoning: "Competitor raised",
  expiresAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  decidedBy: null,
  decidedByName: null,
  decidedAt: null,
  decisionNote: null,
  appliedAt: null,
  failureMessage: null,
  pushSkipped: false,
  version: 1,
  ...over,
});

describe("basis points", () => {
  it("shows rates with at most two decimals and no trailing zeros", () => {
    expect(bpsText(380)).toBe("3.8%");
    expect(bpsText(500)).toBe("5%");
    expect(bpsText(5)).toBe("0.05%");
    expect(bpsText(-250)).toBe("-2.5%");
    expect(signedBps(1200)).toBe("+12%");
    expect(signedBps(-1200)).toBe("-12%");
    expect(signedBps(0)).toBe("0%");
  });

  it("parses typed percentages by string, never by float", () => {
    expect(parsePercentToBps("3.8")).toBe(380);
    expect(parsePercentToBps("0.29")).toBe(29);
    expect(parsePercentToBps("100")).toBe(10_000);
    expect(parsePercentToBps("100.01")).toBeNull();
    expect(parsePercentToBps("1.005")).toBeNull();
    expect(parsePercentToBps("-1")).toBeNull();
    expect(parsePercentToBps("abc")).toBeNull();
    expect(parsePercentToBps("")).toBeNull();
    expect(percentText(380)).toBe("3.8");
    expect(percentText(0)).toBe("0");
    expect(percentText(null)).toBe("");
  });
});

describe("decisions", () => {
  it("lets a pending or failed proposal be decided, nothing else", () => {
    expect(isDecidable(proposal())).toBe(true);
    expect(isDecidable(proposal({ status: "failed" }))).toBe(true);
    for (const status of ["approved", "rejected", "auto_applied", "expired", "superseded"] as const) expect(isDecidable(proposal({ status }))).toBe(false);
  });

  it("explains the business rules of the API in plain words", () => {
    const err = (rule: string, status = 409, message = "x") => new ApiError({ code: "CONFLICT", message, status, details: { rule } });
    expect(decisionError(err("proposal_expired"))).toMatch(/expired/);
    expect(decisionError(err("proposal_closed"))).toMatch(/replaced or closed/);
    expect(decisionError(err("proposal_already_decided"))).toMatch(/already decided/);
    expect(decisionError(err("proposal_apply_failed", 409, "Price is above the MRP"))).toBe("Price is above the MRP");
    expect(decisionError(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 }))).toMatch(/permission/);
    expect(isVersionConflict(new ApiError({ code: "VERSION_CONFLICT", message: "x", status: 409 }))).toBe(true);
    expect(isVersionConflict(new Error("x"))).toBe(false);
  });
});

describe("csv export", () => {
  it("quotes commas and quotes, writes prices in rupees and keeps blanks for unknown values", () => {
    const csv = proposalsCsv([proposal()]);
    const [head, row] = csv.split("\r\n");
    expect(head).toContain("Current price");
    expect(row).toContain('"Cotton ""Kurta"", medium"');
    expect(row).toContain("1299.00,1349.50");
    // unknown competitor price and sales change stay empty
    expect(row).toContain(",3.89%,,3.8%,,");
  });

  it("defuses cells that a spreadsheet would run as a formula", () => {
    const csv = proposalsCsv([proposal({ productTitle: "=HYPERLINK(\"x\")" })]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
  });

  it("exports the history with the channel and who changed it", () => {
    const csv = historyCsv([
      { id: 1, variantId: "v1", sku: "KURTA-M", productTitle: "Kurta", accountName: null, actorName: "Asha", marketplaceAccountId: null, field: "base", oldPriceMinor: 100000, newPriceMinor: 110000, source: "manual", ruleId: null, batchId: null, reason: "festive", actorId: "u1", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(csv.split("\r\n")[1]).toBe("2026-10-01T00:00:00.000Z,KURTA-M,Kurta,All channels,Base price,1000.00,1100.00,Manual,Asha,festive");
  });
});
