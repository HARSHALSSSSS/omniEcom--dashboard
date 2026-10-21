import { describe, expect, it } from "vitest";
import { buildChanges, mapFieldErrors, modifiedKeys, parseRupees, rupeesText, toFormValues } from "./form";
import type { ListingStudio } from "@/types/listingStudio";

describe("money", () => {
  it("parses rupees to minor units without float drift", () => {
    expect(parseRupees("2899")).toBe(289900);
    expect(parseRupees("2899.5")).toBe(289950);
    expect(parseRupees("0.29")).toBe(29);
    expect(parseRupees("1,299.10")).toBe(129910);
    expect(parseRupees("19.99")).toBe(1999);
    expect(parseRupees("1.005")).toBeNull();
    expect(parseRupees("-3")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
    expect(parseRupees("")).toBeNull();
  });

  it("formats minor units as rupees", () => {
    expect(rupeesText(289900)).toBe("2899.00");
    expect(rupeesText(5)).toBe("0.05");
    expect(rupeesText(null)).toBe("");
  });
});

const s = {
  content: {
    title: { master: "Master", effective: "Channel", overridden: true },
    description: { master: "Desc", effective: "Desc", overridden: false },
    bulletPoints: { master: [], effective: [], overridden: false },
    searchTerms: { master: ["a", "b"], effective: ["a", "b"], overridden: false },
    brand: { master: "B", effective: "B", overridden: false },
  },
  pricing: { priceMinor: 100000, mrpMinor: 150000, variantPriceMinor: 90000, variantMrpMinor: 150000, listingPriceOverride: true, listingMrpOverride: false },
  category: {
    attributes: [
      { key: "size", type: "number", maxLength: null, value: 5 },
      { key: "colour", type: "string", maxLength: 3, value: "Red" },
    ],
  },
} as unknown as ListingStudio;

describe("buildChanges", () => {
  it("is empty for an untouched form", () => {
    const base = toFormValues(s);
    expect(modifiedKeys(base, base)).toEqual([]);
    expect(buildChanges(s, base, base).changes).toEqual({});
  });

  it("sends null when a value goes back to the master", () => {
    const base = toFormValues(s);
    const { changes } = buildChanges(s, base, { ...base, title: "Master", searchTerms: "a, b, c", bullets: [""], price: "900.00" });
    expect(changes).toEqual({ title: null, searchTerms: ["a", "b", "c"], priceMinor: null });
  });

  it("reports problems per field", () => {
    const base = toFormValues(s);
    const { changes, problems } = buildChanges(s, base, { ...base, price: "0", mrp: "x", attrs: { size: "big", colour: "Green" } });
    expect(changes).toEqual({});
    expect(problems).toMatchObject({ price: expect.any(String), mrp: expect.any(String), "attr:size": "Enter a number", "attr:colour": "At most 3 characters" });
  });

  it("converts attribute values and clears with null", () => {
    const base = toFormValues(s);
    const { changes } = buildChanges(s, base, { ...base, attrs: { size: "7.5", colour: "" } });
    expect(changes.attributeOverrides).toEqual({ size: 7.5, colour: null });
  });
});

describe("mapFieldErrors", () => {
  it("maps API paths to inputs", () => {
    const { byKey, other } = mapFieldErrors({ priceMinor: "bad", "attributeOverrides.fit": "wrong", "bulletPoints.0": "long", unknown: "elsewhere" });
    expect(byKey).toEqual({ price: "bad", "attr:fit": "wrong", bulletPoints: "long" });
    expect(other).toEqual(["elsewhere"]);
  });
});
