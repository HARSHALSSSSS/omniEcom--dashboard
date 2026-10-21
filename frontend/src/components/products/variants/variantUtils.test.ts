import { describe, expect, it } from "vitest";
import { gridQuery } from "@/api/variants.api";
import type { VariantGridItem, VariantGridParams } from "@/types/variants";
import { diffFromDetail, formFromDetail, payloadFromForm } from "./variantForm";
import { bpsToPercent, buildVariantsCsv, csvCell, isValidGtin, looksLikeBadGtin, minorToRupees, optionSummary, percentToBps, rupeesToMinor } from "./variantUtils";

const base: VariantGridParams = { tab: "all", q: "", options: {}, channel: "", inventory: "", sort: "", page: 1, pageSize: 20 };

describe("money conversion is exact", () => {
  it("rupees to minor units", () => {
    expect(rupeesToMinor("499")).toBe(49900);
    expect(rupeesToMinor("1,299.5")).toBe(129950);
    expect(rupeesToMinor("0.07")).toBe(7);
    expect(rupeesToMinor("19.99")).toBe(1999);
    expect(rupeesToMinor("1.10")).toBe(110);
    expect(rupeesToMinor("0.29")).toBe(29); // 0.29 * 100 = 28.999999999999996 with floats
    expect(rupeesToMinor("12.345")).toBeNull();
    expect(rupeesToMinor("-1")).toBeNull();
    expect(rupeesToMinor("abc")).toBeNull();
    expect(rupeesToMinor("")).toBeNull();
  });

  it("minor units to rupees and GST percent", () => {
    expect(minorToRupees(49900)).toBe("499.00");
    expect(minorToRupees(7)).toBe("0.07");
    expect(minorToRupees(null)).toBe("");
    expect(percentToBps("18")).toBe(1800);
    expect(percentToBps("12.5")).toBe(1250);
    expect(bpsToPercent(1800)).toBe("18");
    expect(bpsToPercent(1250)).toBe("12.5");
    expect(bpsToPercent(1805)).toBe("18.05");
  });
});

describe("barcode validation (never generation)", () => {
  it("checks the GTIN check digit", () => {
    expect(isValidGtin("4006381333931")).toBe(true); // EAN-13
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(isValidGtin("12345")).toBe(false);
    expect(looksLikeBadGtin("4006381333932")).toBe(true);
    expect(looksLikeBadGtin("INTERNAL-1")).toBe(false);
    expect(looksLikeBadGtin("123456")).toBe(false);
  });
});

describe("gridQuery", () => {
  it("sends nothing but paging for the default view", () => {
    expect(gridQuery(base)).toEqual({ page: 1, pageSize: 20 });
  });

  it("uses the filter[...] parameters of the API", () => {
    expect(
      gridQuery({ ...base, q: " navy ", channel: "amazon", inventory: "healthy", sort: "-inventory", page: 3, options: { color: "Black", Size: "L", Material: "Cotton", "bad!": "x" } }),
    ).toEqual({
      page: 3,
      pageSize: 20,
      q: "navy",
      sort: "-inventory",
      "filter[channel]": "amazon",
      "filter[inventory]": "healthy",
      "filter[color]": "Black",
      "filter[option.Size]": "L",
      "filter[option.Material]": "Cotton",
    });
  });

  it("maps the tabs to lifecycle / inventory filters", () => {
    expect(gridQuery({ ...base, tab: "active" })).toMatchObject({ "filter[lifecycle]": "active" });
    expect(gridQuery({ ...base, tab: "low_stock" })).toMatchObject({ "filter[lifecycle]": "active", "filter[inventory]": "low" });
    expect(gridQuery({ ...base, tab: "out_of_stock", inventory: "healthy" })).toMatchObject({ "filter[lifecycle]": "active", "filter[inventory]": "out" });
    expect(gridQuery({ ...base, tab: "draft" })).toMatchObject({ "filter[lifecycle]": "draft" });
    expect(gridQuery({ ...base, tab: "archived" })).toMatchObject({ "filter[lifecycle]": "archived" });
  });
});

describe("CSV export", () => {
  const row = (over: Partial<VariantGridItem> = {}): VariantGridItem => ({
    id: "v1",
    productId: "p1",
    sku: "SKU-1",
    barcode: null,
    name: 'Black / "Big"',
    optionValues: { Color: "Black", Size: "Big" },
    currency: "INR",
    mrpMinor: 59900,
    sellingPriceMinor: 49905,
    status: "active",
    lifecycle: "active",
    stock: { available: 4, threshold: 10, status: "low" },
    channels: [{ code: "amazon", name: "Amazon", listingStatus: "active" }],
    leadTimeDays: 7,
    thumbnailUrl: null,
    version: 1,
    createdAt: "",
    updatedAt: "",
    ...over,
  });

  it("builds a header, one column per option and rupee amounts", () => {
    const csv = buildVariantsCsv([row(), row({ sku: "=cmd()", optionValues: { Color: "Navy" } })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("SKU,Barcode,Variant,Color,Size,MRP,Selling price,Available,Low stock threshold,Stock status,Lifecycle,Channels,Lead time (days)");
    expect(lines[1]).toBe('SKU-1,,"Black / ""Big""",Black,Big,599.00,499.05,4,10,Low stock,Active,Amazon,7');
    expect(lines[2]?.startsWith("'=cmd()")).toBe(true);
  });

  it("neutralises formulas and quotes separators", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });
});

describe("variant form <-> API", () => {
  const detail = {
    id: "v1",
    productId: "p1",
    sku: "A-1",
    barcode: null,
    optionValues: { Color: "Black" },
    currency: "INR",
    mrpMinor: 59900,
    sellingPriceMinor: 49900,
    costPriceMinor: null,
    taxRateBps: 1800,
    weightGrams: 900,
    dimensionsMm: { length: 10, width: 20, height: 30 },
    status: "active" as const,
    version: 5,
    createdAt: "",
    updatedAt: "",
  };

  it("an untouched form produces an empty PATCH", () => {
    expect(diffFromDetail(formFromDetail(detail, null), detail)).toEqual({});
  });

  it("sends only what changed, in minor units, null for cleared values", () => {
    const form = { ...formFromDetail(detail, null), selling: "449.50", mrp: "", length: "", width: "", height: "", tax: "12.5" };
    expect(diffFromDetail(form, detail)).toEqual({ sellingPriceMinor: 44950, mrpMinor: null, dimensionsMm: null, taxRateBps: 1250 });
  });

  it("builds optionValues from filled rows only", () => {
    const form = { ...formFromDetail(detail, null), options: [{ name: " Color ", value: "Red" }, { name: "", value: "" }] };
    expect(payloadFromForm(form).optionValues).toEqual({ Color: "Red" });
    expect(optionSummary({ Size: "L", Color: "Red", Material: "Cotton" })).toBe("Color: Red · Size: L · Material: Cotton");
  });
});
