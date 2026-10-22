import { describe, expect, it } from "vitest";
import { buildChanges, htmlToPlain, isModified, mapFieldErrors, modifiedKeys, plainToHtml, revertField, toFormValues } from "./form";
import type { EditorProduct } from "@/types/productEdit";

const product = (over: Partial<EditorProduct> = {}): EditorProduct => ({
  id: "p1",
  productCode: "TRV-1",
  title: "Bag",
  description: "Text",
  descriptionHtml: "<p>Text</p>",
  brand: null,
  manufacturer: null,
  countryOfOrigin: null,
  categoryId: null,
  hsnCode: null,
  gstRateBps: 1800,
  tags: ["a"],
  dimensions: { length: 50, width: 30, height: 25, unit: "cm" },
  weight: { value: 1.2, unit: "kg" },
  material: null,
  standardCategory: null,
  customAttributes: [],
  productType: "physical",
  status: "active",
  productCodeLocked: true,
  variantCount: 1,
  version: 1,
  createdAt: "",
  updatedAt: "",
  category: null,
  brandRecord: null,
  primaryImage: { state: "none", documentId: null, url: null },
  ...over,
});

describe("edit form helpers", () => {
  it("round-trips the product and sees no change", () => {
    const base = toFormValues(product());
    expect(base.gstPercent).toBe("18");
    expect(base.dimLength).toBe("50");
    expect(modifiedKeys(base, toFormValues(product()))).toEqual([]);
  });

  it("builds only the changed fields in API units and reverts them", () => {
    const base = toFormValues(product());
    const cur = { ...base, title: " New ", gstPercent: "12.5", dimWidth: "31", brand: "  ", tags: ["a", "b"] };
    expect(modifiedKeys(base, cur)).toEqual(["title", "gstPercent", "tags", "dimensions"]);
    const { changes, problems } = buildChanges(base, cur);
    expect(problems).toEqual({});
    expect(changes).toEqual({ title: "New", gstRateBps: 1250, tags: ["a", "b"], dimensions: { length: 50, width: 31, height: 25, unit: "cm" } });
    const back = revertField(revertField(cur, base, "dimensions"), base, "gstPercent");
    expect(isModified(base, back, "dimensions")).toBe(false);
    expect(isModified(base, back, "gstPercent")).toBe(false);
  });

  it("reports input mistakes instead of sending them", () => {
    const base = toFormValues(product());
    const { changes, problems } = buildChanges(base, { ...base, dimLength: "", weight: "abc", gstPercent: "x" });
    expect(problems.dimensions).toMatch(/length, width and height/i);
    expect(problems.weight).toBeTruthy();
    expect(problems.gstPercent).toBeTruthy();
    expect(changes).toEqual({});
  });

  it("clearing dimensions sends null; the description sends html and plain text", () => {
    const base = toFormValues(product());
    const cleared = buildChanges(base, { ...base, dimLength: "", dimWidth: "", dimHeight: "" });
    expect(cleared.changes).toEqual({ dimensions: null });
    const d = buildChanges(base, { ...base, description: "<p>New <b>text</b></p><ul><li>one</li></ul>" });
    expect(d.changes.description).toBe("New text\none");
    expect(d.changes.descriptionHtml).toBe("<p>New <b>text</b></p><ul><li>one</li></ul>");
    expect(buildChanges(base, { ...base, description: "<p><br></p>" }).changes).toEqual({ description: null, descriptionHtml: null });
  });

  it("converts html and plain text safely", () => {
    expect(htmlToPlain('<p>A &amp; B</p><img src=x onerror="alert(1)">')).toBe("A & B");
    expect(plainToHtml("one\n\ntwo <b>")).toBe("<p>one</p><p>two &lt;b&gt;</p>");
  });

  it("category attributes: compares and sends only the attributes of the chosen category, '' clears", () => {
    const cats = [
      { attributeId: "a1", code: "capacity", name: "Capacity", dataType: "number" as const, unit: "L", isRequired: false, options: [], value: 35 },
      { attributeId: "a2", code: "organic", name: "Organic", dataType: "boolean" as const, unit: null, isRequired: false, options: [], value: null },
    ];
    const base = toFormValues(product({ categoryAttributes: cats }));
    expect(base.categoryAttrs).toEqual({ a1: "35", a2: "" });
    expect(modifiedKeys(base, toFormValues(product({ categoryAttributes: cats })))).toEqual([]);

    const cur = { ...base, categoryAttrs: { a1: " 40 ", a2: "true" } };
    expect(modifiedKeys(base, cur)).toEqual(["categoryAttributes"]);
    expect(buildChanges(base, cur).changes).toEqual({ categoryAttributes: [{ attributeId: "a1", value: "40" }, { attributeId: "a2", value: "true" }] });
    expect(buildChanges(base, { ...base, categoryAttrs: { a1: "", a2: "" } }).changes).toEqual({ categoryAttributes: [{ attributeId: "a1", value: null }] });

    // after a category change only the new category's attributes count: a1 is gone, a3 is new
    const scope = new Set(["a2", "a3"]);
    const switched = { ...base, categoryAttrs: { a1: "", a2: "", a3: "wool" } };
    expect(buildChanges(base, switched, scope).changes).toEqual({ categoryAttributes: [{ attributeId: "a3", value: "wool" }] });
    expect(isModified(base, { ...base, categoryAttrs: { a1: "99", a2: "" } }, "categoryAttributes", scope)).toBe(false);
    expect(revertField(cur, base, "categoryAttributes").categoryAttrs).toEqual({ a1: "35", a2: "" });
  });

  it("maps server field paths to the page fields", () => {
    const { byKey, other } = mapFieldErrors({ title: "Too short", gstRateBps: "bad", "dimensions.length": "bad", unknownField: "x", descriptionHtml: "too long", "categoryAttributes[0].value": "must be a number" });
    expect(byKey).toEqual({ title: "Too short", gstPercent: "bad", dimensions: "bad", description: "too long", categoryAttributes: "must be a number" });
    expect(other).toEqual(["unknownField: x"]);
  });
});
