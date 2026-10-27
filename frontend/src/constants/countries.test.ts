import { describe, expect, it } from "vitest";
import { COUNTRIES, countryCodeFor, countryName, countryOptions, defaultCountryCode } from "./countries";

describe("the one country list", () => {
  it("is complete, with India first", () => {
    expect(COUNTRIES[0]).toEqual({ code: "IN", name: "India" });
    expect(COUNTRIES.length).toBeGreaterThan(240);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const code of ["US", "GB", "CN", "JP", "AE", "BD", "NP", "LK"]) expect(COUNTRIES.some((c) => c.code === code)).toBe(true);
  });

  it("resolves stored values: codes in any case and country names, nothing else", () => {
    expect(countryCodeFor("IN")).toBe("IN");
    expect(countryCodeFor("in")).toBe("IN");
    expect(countryCodeFor("India")).toBe("IN");
    expect(countryName("japan")).toBe("Japan");
    expect(countryCodeFor("Narnia")).toBeNull();
    expect(countryCodeFor("")).toBeNull();
  });

  it("never loses a stored value that is not in the list", () => {
    expect(countryOptions("India")).toHaveLength(COUNTRIES.length);
    const odd = countryOptions("Narnia");
    expect(odd[0]).toEqual({ code: "Narnia", name: "Narnia" });
    expect(odd).toHaveLength(COUNTRIES.length + 1);
  });

  it("an Indian workspace defaults to India, others have no default", () => {
    expect(defaultCountryCode({ currency: "INR" })).toBe("IN");
    expect(defaultCountryCode({ timezone: "Asia/Kolkata" })).toBe("IN");
    expect(defaultCountryCode({ currency: "USD", timezone: "America/New_York" })).toBeNull();
    expect(defaultCountryCode(null)).toBeNull();
  });
});
