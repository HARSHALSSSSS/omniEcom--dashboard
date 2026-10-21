import { describe, expect, it } from "vitest";
import { csvCell, lineTax, minorToInput, orderPrintHtml, parseMinor, parseQty, previewTotals } from "./procurementFormat";
import type { PurchaseOrder } from "@/types/procurement";

describe("money in and out of inputs", () => {
  it("parses rupees to minor units by string, without float drift", () => {
    expect(parseMinor("1250")).toBe(125000);
    expect(parseMinor("1,250.5")).toBe(125050);
    expect(parseMinor("0.07")).toBe(7);
    expect(parseMinor("19.99")).toBe(1999);
    expect(parseMinor("1.10")).toBe(110);
    expect(parseMinor("  42 ")).toBe(4200);
  });
  it("refuses what is not a price", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12.", ".5", "99999999999"]) expect(parseMinor(bad)).toBeNull();
  });
  it("writes minor units back for an input", () => {
    expect(minorToInput(125000)).toBe("1250");
    expect(minorToInput(125050)).toBe("1250.50");
    expect(minorToInput(7)).toBe("0.07");
    expect(parseMinor(minorToInput(1999))).toBe(1999);
  });
  it("whole units only", () => {
    expect(parseQty("12")).toBe(12);
    expect(parseQty("1.5")).toBeNull();
    expect(parseQty("-1")).toBeNull();
    expect(parseQty("400", 365)).toBeNull();
  });
});

describe("totals the way the server computes them", () => {
  it("rounds GST half up per line and adds shipping untaxed", () => {
    expect(lineTax(999, 500)).toBe(50); // 49.95 -> 50
    expect(lineTax(1, 5000)).toBe(1); // 0.5 -> 1
    expect(previewTotals([{ quantity: 100, unitCostMinor: 125000, taxRateBps: 1200 }, { quantity: 50, unitCostMinor: 120000, taxRateBps: 1200 }], 5000)).toEqual({ subtotalMinor: 18_500_000, taxMinor: 2_220_000, shippingMinor: 5000, totalMinor: 20_725_000 });
  });
});

describe("CSV and print output", () => {
  it("quotes cells and defuses spreadsheet formulas", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });

  it("escapes everything the supplier typed in the printable order", () => {
    const po = {
      poNumber: "PO-2026-0001",
      status: "submitted",
      orderDate: "2026-10-01T00:00:00.000Z",
      expectedAt: null,
      currency: "INR",
      subtotalMinor: 100,
      taxMinor: 12,
      shippingMinor: 0,
      totalMinor: 112,
      paymentTerms: null,
      reference: null,
      notes: "<script>alert(1)</script>",
      supplier: { name: "A <b>& B</b>", contactPerson: null, city: null, state: null, gstin: null, email: null, phone: null },
      warehouse: { name: "Main", code: "M" },
      lines: [{ sku: "X<1>", title: "Bag & more", quantityOrdered: 1, unitCostMinor: 100, taxRateBps: 1200, totalMinor: 100 }],
    } as unknown as PurchaseOrder;
    const html = orderPrintHtml(po, "My <Shop>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &lt;b&gt;&amp; B&lt;/b&gt;");
    expect(html).toContain("My &lt;Shop&gt;");
    expect(html).toContain("12%");
  });
});
