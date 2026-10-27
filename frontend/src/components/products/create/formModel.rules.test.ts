import { describe, expect, it } from "vitest";
import { mapFieldErrors } from "./formModel";

describe("SKU rule errors from the server", () => {
  it("the Master SKU rule lands on the Master SKU input; a variant path is kept as a message", () => {
    const { byField, rest } = mapFieldErrors({ productCode: "The SKU must follow your SKU formula [BRAND]-[CAT3]-[SEQ6].", "variants.0.sku": "The SKU must be in UPPERCASE." });
    expect(byField.productCode).toMatch(/SKU formula/);
    expect(rest).toEqual(["The SKU must be in UPPERCASE."]);
  });
});
