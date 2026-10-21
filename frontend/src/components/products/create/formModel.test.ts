import { describe, expect, it } from "vitest";
import { emptyValues, formFieldFor, hasContent, mapFieldErrors, toDraftValues, toPreviewValues, valuesFromProduct } from "./formModel";
import { htmlToPlain, isBlankHtml, normalizeLinkUrl, plainLength } from "./richText";
import { savedLabel } from "@/hooks/useProductCreation";
import type { ProductEditor } from "@/types/productCreation";

describe("toDraftValues", () => {
  it("sends blanks as null so a cleared field is cleared on the server", () => {
    const { values, localIssues } = toDraftValues({ ...emptyValues(), title: "  Bag  " });
    expect(values).toMatchObject({ title: "Bag", productType: "physical", productCode: null, categoryId: null, brand: null, material: null, hsnCode: null, gstRateBps: null, dimensions: null, weight: null, description: null, descriptionHtml: null, customAttributes: [] });
    expect(localIssues).toEqual({});
  });

  it("sends dimensions with the chosen unit, weight, gst and the complete attribute rows", () => {
    const { values } = toDraftValues({
      ...emptyValues(),
      title: "Bag",
      dimLength: "50",
      dimWidth: "30,5",
      dimHeight: "25",
      dimUnit: "mm",
      weightValue: "1.2",
      weightUnit: "lb",
      gstRateBps: "1800",
      hsnCode: " 4202 ",
      customAttributes: [
        { name: " Collection ", value: "Travel", confirmed: true },
        { name: "", value: "", confirmed: false },
      ],
    });
    expect(values.dimensions).toEqual({ length: 50, width: 30.5, height: 25, unit: "mm" });
    expect(values.weight).toEqual({ value: 1.2, unit: "lb" });
    expect(values.gstRateBps).toBe(1800);
    expect(values.hsnCode).toBe("4202");
    expect(values.customAttributes).toEqual([{ name: "Collection", value: "Travel", confirmed: true }]);
  });

  it("reports what only the form can see and leaves those fields out of the save", () => {
    const { values, localIssues } = toDraftValues({
      ...emptyValues(),
      title: "Bag",
      dimLength: "50",
      weightValue: "abc",
      description: `<p>${"x".repeat(2001)}</p>`,
      customAttributes: [{ name: "Only name", value: "", confirmed: false }],
    });
    expect(localIssues.dimLength).toMatch(/all three/);
    expect(localIssues.weightValue).toMatch(/number/);
    expect(localIssues.description).toMatch(/2,000 characters \(it has 2,001\)/);
    expect(localIssues.customAttributes).toMatch(/only a name/);
    expect(values).not.toHaveProperty("dimensions");
    expect(values).not.toHaveProperty("weight");
    expect(values).not.toHaveProperty("descriptionHtml", expect.anything());
  });

  it("uses the limit of the form options for the description", () => {
    const { localIssues } = toDraftValues({ ...emptyValues(), description: "<p>12345678901</p>" }, { descriptionMaxChars: 10 } as never);
    expect(localIssues.description).toBeDefined();
  });
});

describe("form <-> product", () => {
  const p = {
    id: "p1",
    productCode: "DRAFT-AAAA1111",
    title: "Bag",
    description: "line one\nline <two>",
    descriptionHtml: null,
    brand: "Urban Carry",
    countryOfOrigin: "IN",
    categoryId: "c1",
    hsnCode: "4202",
    gstRateBps: 1800,
    dimensions: { length: 50, width: 30, height: 25, unit: "cm" },
    weight: { value: 1.2, unit: "kg" },
    material: "Canvas",
    standardCategory: "Bags",
    customAttributes: [{ name: "Collection", value: "Travel", confirmed: true }],
    productType: "digital",
  } as unknown as ProductEditor;

  it("loads a saved product into display units, hiding a generated code", () => {
    const v = valuesFromProduct(p, true);
    expect(v).toMatchObject({ productCode: "", productType: "digital", dimLength: "50", dimUnit: "cm", weightValue: "1.2", weightUnit: "kg", gstRateBps: "1800", categoryId: "c1" });
    expect(v.description).toBe("<p>line one</p><p>line &lt;two&gt;</p>");
    expect(valuesFromProduct(p, false).productCode).toBe("DRAFT-AAAA1111");
  });

  it("round-trips: what was loaded is what would be saved", () => {
    const { values } = toDraftValues(valuesFromProduct({ ...p, descriptionHtml: "<p>Hi</p>" }, false));
    expect(values).toMatchObject({ title: "Bag", brand: "Urban Carry", dimensions: { length: 50, width: 30, height: 25, unit: "cm" }, weight: { value: 1.2, unit: "kg" }, descriptionHtml: "<p>Hi</p>" });
  });

  it("hasContent ignores the defaults only", () => {
    expect(hasContent(emptyValues())).toBe(false);
    expect(hasContent({ ...emptyValues(), brand: "x" })).toBe(true);
    expect(hasContent({ ...emptyValues(), description: "<p><br></p>" })).toBe(false);
  });

  it("builds the readiness preview from unsaved values", () => {
    expect(toPreviewValues({ ...emptyValues(), title: " Bag ", productCode: "TRV-1", customAttributes: [{ name: "a", value: "b", confirmed: false }, { name: "", value: "", confirmed: false }] })).toEqual({
      title: "Bag",
      productCode: "TRV-1",
      categoryId: null,
      productType: "physical",
      brand: null,
      descriptionHtml: null,
      customAttributes: [{ name: "a", value: "b" }],
    });
  });
});

describe("server error mapping", () => {
  it("maps API field names onto form fields", () => {
    expect(formFieldFor("dimensions.height")).toBe("dimHeight");
    expect(formFieldFor("dimensions")).toBe("dimLength");
    expect(formFieldFor("weight.value")).toBe("weightValue");
    expect(formFieldFor("descriptionHtml")).toBe("description");
    expect(formFieldFor("customAttributes.2.name")).toBe("customAttributes");
    expect(formFieldFor("productCode")).toBe("productCode");
    expect(formFieldFor("nope")).toBeNull();
  });

  it("keeps the first message per field and returns the unmapped ones", () => {
    const { byField, rest } = mapFieldErrors({ productCode: "dup", "dimensions.length": "too big", other: "x" });
    expect(byField).toEqual({ productCode: "dup", dimLength: "too big" });
    expect(rest).toEqual(["x"]);
  });
});

describe("rich text helpers", () => {
  it("turns html into plain text with line breaks and bullets", () => {
    expect(htmlToPlain("<p>Water <strong>resistant</strong></p><ul><li>One</li><li>Two</li></ul>")).toBe("Water resistant\n- One\n- Two");
    expect(plainLength("<p>a</p><p>b</p>")).toBe(3);
  });
  it("never executes anything while parsing", () => {
    expect(htmlToPlain('<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>hello')).toBe("hello");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
  it("detects an empty editor", () => {
    expect(isBlankHtml("")).toBe(true);
    expect(isBlankHtml("<div><br></div>")).toBe(true);
    expect(isBlankHtml("<p>x</p>")).toBe(false);
  });
  it("accepts only http(s) and mailto links", () => {
    expect(normalizeLinkUrl("https://a.com/x")).toBe("https://a.com/x");
    expect(normalizeLinkUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(normalizeLinkUrl("example.com/page")).toBe("https://example.com/page");
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("data:text/html,x")).toBeNull();
    expect(normalizeLinkUrl("  ")).toBeNull();
  });
});

describe("savedLabel", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");
  it("says when the draft was last saved", () => {
    expect(savedLabel(null, now)).toBe("Not saved yet");
    expect(savedLabel("2026-10-20T09:59:50Z", now)).toBe("Last saved just now");
    expect(savedLabel("2026-10-20T09:57:00Z", now)).toBe("Last saved 3 min ago");
    expect(savedLabel("2026-10-20T06:00:00Z", now)).toMatch(/^Last saved at /);
  });
});
