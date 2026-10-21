import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { setFormatPreferences } from "@/utils/format";
import type { PromotionCampaign } from "@/types/promotions";
import { EMPTY_FORM, campaignFormSchema, formFromCampaign, serverFieldErrors, toCampaignWrite } from "./campaignForm";
import { allowedActions, bpsToInput, describeTerms, isoToLocalInput, localInputToIso, minorToInput, parseBps, parseMinor } from "./promoFormat";

afterEach(() => setFormatPreferences(null));

describe("money and percentage parsing", () => {
  it("turns typed amounts into integer minor units without float drift", () => {
    expect(parseMinor("1499")).toBe(149900);
    expect(parseMinor("1,499.5")).toBe(149950);
    expect(parseMinor("0.07")).toBe(7);
    expect(parseMinor("19.99")).toBe(1999);
    expect(parseMinor("1.234")).toBeNull();
    expect(parseMinor("-5")).toBeNull();
    expect(parseMinor("abc")).toBeNull();
  });

  it("turns percentages into basis points and back", () => {
    expect(parseBps("15")).toBe(1500);
    expect(parseBps("12.5")).toBe(1250);
    expect(parseBps("0.01")).toBe(1);
    expect(parseBps("12.345")).toBeNull();
    expect(bpsToInput(1250)).toBe("12.5");
    expect(bpsToInput(1500)).toBe("15");
    expect(minorToInput(149950)).toBe("1499.5");
    expect(minorToInput(100)).toBe("1");
  });
});

describe("dates in the business time zone", () => {
  it("reads and writes datetime-local values as Asia/Kolkata wall time", () => {
    setFormatPreferences({ timezone: "Asia/Kolkata" });
    expect(localInputToIso("2026-10-25T10:00")).toBe("2026-10-25T04:30:00.000Z");
    expect(isoToLocalInput("2026-10-25T04:30:00.000Z")).toBe("2026-10-25T10:00");
    expect(isoToLocalInput(localInputToIso("2026-12-31T23:59"))).toBe("2026-12-31T23:59");
  });

  it("handles a zone behind UTC and empty or invalid input", () => {
    setFormatPreferences({ timezone: "America/New_York" });
    expect(localInputToIso("2026-01-15T09:00")).toBe("2026-01-15T14:00:00.000Z");
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("not a date")).toBeNull();
    expect(isoToLocalInput(null)).toBe("");
  });
});

describe("campaign form", () => {
  const valid = { ...EMPTY_FORM, name: "Diwali", type: "percentage_discount" as const, percent: "15" };

  it("validates every discount type", () => {
    expect(campaignFormSchema.safeParse(valid).success).toBe(true);
    expect(campaignFormSchema.safeParse({ ...valid, percent: "96" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ ...valid, percent: "" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ ...valid, type: "flat_discount", flat: "0" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ ...valid, type: "flat_discount", flat: "200" }).success).toBe(true);
    expect(campaignFormSchema.safeParse({ ...valid, type: "bogo", buyQuantity: "2", getQuantity: "1" }).success).toBe(true);
    expect(campaignFormSchema.safeParse({ ...valid, type: "bogo", buyQuantity: "2", getQuantity: "" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ ...valid, type: "bundle", buyQuantity: "1", percent: "10" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ ...valid, type: "bundle", buyQuantity: "3", percent: "10" }).success).toBe(true);
  });

  it("rejects an end before the start and a bad code", () => {
    const r = campaignFormSchema.safeParse({ ...valid, startsAt: "2026-10-25T10:00", endsAt: "2026-10-25T09:00" });
    expect(r.success).toBe(false);
    expect(campaignFormSchema.safeParse({ ...valid, code: "a b" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ ...valid, code: "FEST_20" }).success).toBe(true);
  });

  it("builds the request with unused discount fields cleared", () => {
    setFormatPreferences({ timezone: "Asia/Kolkata" });
    const body = toCampaignWrite({ ...valid, code: " fest20 ", budget: "50000", startsAt: "2026-10-25T10:00", endsAt: "2026-11-05T22:00", accountIds: ["a1"] });
    expect(body).toMatchObject({
      name: "Diwali",
      code: "fest20",
      type: "percentage_discount",
      valueBps: 1500,
      valueMinor: null,
      buyQuantity: null,
      getQuantity: null,
      budgetMinor: 5000000,
      minOrderMinor: 0,
      startsAt: "2026-10-25T04:30:00.000Z",
      accountIds: ["a1"],
    });
  });

  it("maps server field errors onto form fields", () => {
    const e = new ApiError({ code: "VALIDATION_ERROR", message: "x", status: 400, details: { issues: [{ path: "valueBps", message: "must be between 1 and 9500 basis points" }] } });
    expect(serverFieldErrors(e)).toEqual([{ field: "percent", message: "must be between 1 and 9500 basis points" }]);
    const dup = new ApiError({ code: "CONFLICT", message: "x", status: 409, details: { rule: "duplicate_code" } });
    expect(serverFieldErrors(dup)[0]?.field).toBe("code");
  });
});

const campaign = (over: Partial<PromotionCampaign> = {}): PromotionCampaign => ({
  id: "c1",
  name: "Sale",
  code: "SALE",
  description: null,
  type: "percentage_discount",
  valueBps: 1250,
  valueMinor: null,
  buyQuantity: null,
  getQuantity: null,
  minOrderMinor: 0,
  budgetMinor: 0,
  currency: "INR",
  status: "draft",
  startsAt: null,
  endsAt: null,
  accountIds: [],
  channels: [],
  spendMinor: 0,
  revenueMinor: 0,
  unitsMoved: 0,
  ordersCount: 0,
  budgetUsedBps: null,
  statsUpdatedAt: null,
  itemCounts: { total: 0, eligible: 0, pending_sync: 0, live: 0, ineligible: 0, ended: 0 },
  endReason: null,
  version: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("campaign helpers", () => {
  it("describes the terms of each type", () => {
    expect(describeTerms(campaign())).toBe("12.5% off");
    expect(describeTerms(campaign({ type: "flat_discount", valueBps: null, valueMinor: 20000 }))).toBe("₹200 off");
    expect(describeTerms(campaign({ type: "bogo", valueBps: null, buyQuantity: 2, getQuantity: 1 }))).toBe("Buy 2 get 1");
    expect(describeTerms(campaign({ type: "bundle", buyQuantity: 3, valueBps: 1000 }))).toBe("Bundle of 3, 10% off");
  });

  it("offers only the lifecycle actions the state allows", () => {
    expect(allowedActions("draft")).toEqual(["schedule", "activate", "cancel"]);
    expect(allowedActions("scheduled")).toEqual(["activate", "cancel"]);
    expect(allowedActions("active")).toEqual(["end"]);
    expect(allowedActions("ended")).toEqual([]);
    expect(allowedActions("cancelled")).toEqual([]);
  });

  it("fills the edit form from a campaign", () => {
    const f = formFromCampaign(campaign({ budgetMinor: 5000000, startsAt: "2026-10-25T04:30:00.000Z" }));
    expect(f).toMatchObject({ percent: "12.5", budget: "50000", flat: "", startsAt: "2026-10-25T10:00" });
  });
});
