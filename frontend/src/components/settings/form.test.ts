import { describe, expect, it } from "vitest";
import { settings } from "@/test/settingsFixtures";
import { buildPatch, isDirty, mapServerErrors, modifiedKeys, tabOf, toForm, validateField } from "./form";

describe("settings form", () => {
  const s = settings();
  const base = toForm(s);

  it("reads every group of the aggregate into the form", () => {
    expect(base).toMatchObject({
      legalName: "Nova Living Brands Pvt Ltd",
      cin: "U74999MH2021PTC368942",
      pincode: "400013",
      numberFormat: "indian",
      bufferPercent: "10",
      lowStockThreshold: "5",
      fulfillmentMethod: "seller",
      warehouseId: "",
      slaMinutes: "45",
      aiEnabled: true,
    });
    expect(base.alerts).toEqual({ dispatchSlaBreach: true, criticalStockouts: true, tokenRenewals: true, syncFailures: true, returns: true });
  });

  it("is clean until something changes, and ignores spacing and the case of codes", () => {
    expect(isDirty(base, { ...base, legalName: "  Nova Living Brands Pvt Ltd  ", cin: "u74999mh2021ptc368942" })).toBe(false);
    expect(modifiedKeys(base, { ...base, displayName: "Nova", alerts: { ...base.alerts, returns: false } })).toEqual(["displayName", "alert:returns"]);
  });

  it("sends only the changed groups with their API names", () => {
    const cur = { ...base, supportEmail: "help@novaliving.test", numberFormat: "international" as const, bufferPercent: "25", fulfillmentMethod: "" as const, warehouseId: "w-1" };
    const built = buildPatch(s, base, cur);
    expect(built.problems).toEqual({});
    expect(built.patch).toEqual({
      business: { businessEmail: "help@novaliving.test" },
      regional: { numberFormat: "international" },
      operations: { defaultInventoryBufferPercent: 25, defaultFulfillmentMethod: null, defaultWarehouseId: "w-1" },
    });
    expect(built.ai).toBeNull();
  });

  it("clears the support email and phone by sending null", () => {
    const withContacts = { ...base, supportEmail: "care@novaliving.test", supportPhone: "+91 22 4920 1800" };
    const built = buildPatch(s, withContacts, { ...withContacts, supportEmail: "  ", supportPhone: "" });
    expect(built.problems).toEqual({});
    expect(built.patch.business).toEqual({ businessEmail: null, phone: null });
  });

  it("never sends the locked currency and time zone", () => {
    const built = buildPatch(s, base, { ...base, currency: "USD", timezone: "UTC" });
    expect(built.patch.regional).toBeUndefined();
  });

  it("clears CIN and PAN with null, upper-cases them, and rebuilds the address without empty parts", () => {
    const built = buildPatch(s, base, { ...base, cin: "", pan: "aabcn8412q", line2: "", city: "Pune" });
    expect(built.patch.business).toEqual({ cin: null, pan: "AABCN8412Q", address: { line1: "402 Peninsula Spire", city: "Pune", state: "Maharashtra", pincode: "400013", country: "IN" } });
  });

  it("maps the two token and sync flags and the SLA window independently", () => {
    const built = buildPatch(s, base, { ...base, slaMinutes: "90", alerts: { ...base.alerts, tokenRenewals: false } });
    expect(built.patch.alerts).toEqual({ dispatchSlaBreach: { thresholdMinutes: 90 }, tokenRenewals: false });
    const both = buildPatch(s, base, { ...base, alerts: { ...base.alerts, dispatchSlaBreach: false, syncFailures: false } });
    expect(both.patch.alerts).toEqual({ dispatchSlaBreach: { enabled: false }, syncFailures: false });
  });

  it("reports the AI switch separately from the PATCH body", () => {
    const built = buildPatch(s, base, { ...base, aiEnabled: false });
    expect(built.ai).toBe(false);
    expect(built.patch).toEqual({});
  });

  it("validates like the API", () => {
    expect(validateField("cin", { ...base, cin: "NOPE" })).toMatch(/CIN/);
    expect(validateField("pan", { ...base, pan: "ABC" })).toMatch(/PAN/);
    expect(validateField("pincode", { ...base, pincode: "012345" })).toMatch(/PIN/);
    expect(validateField("supportEmail", { ...base, supportEmail: "" })).toBeNull(); // optional: a cleared value is sent as null
    expect(validateField("supportEmail", { ...base, supportEmail: "nope" })).toMatch(/valid email/);
    expect(validateField("supportPhone", { ...base, supportPhone: "" })).toBeNull();
    expect(validateField("supportPhone", { ...base, supportPhone: "123" })).toMatch(/7 to 20/);
    expect(validateField("bufferPercent", { ...base, bufferPercent: "101" })).toMatch(/between 0 and 100/);
    expect(validateField("bufferPercent", { ...base, bufferPercent: "1.5" })).toMatch(/whole number/);
    expect(validateField("lowStockThreshold", { ...base, lowStockThreshold: "-1" })).toMatch(/between/);
    expect(validateField("slaMinutes", { ...base, slaMinutes: "4" })).toMatch(/between 5 and 1,440/);
    expect(validateField("slaMinutes", { ...base, slaMinutes: "1440" })).toBeNull();
    const built = buildPatch(s, base, { ...base, bufferPercent: "200" });
    expect(built.problems.bufferPercent).toBeTruthy();
    expect(built.patch.operations).toBeUndefined();
  });

  it("maps API field paths onto inputs and keeps unknown ones aside", () => {
    const { byKey, other } = mapServerErrors({ "business.cin": "invalid CIN", pan: "PAN mismatch", "business.businessEmail": "bad email", "business.address.pincode": "invalid PIN code", "alerts.dispatchSlaBreach.thresholdMinutes": "too small", "operations.defaultWarehouseId": "gone", mystery: "unknown" });
    expect(byKey).toEqual({ cin: "invalid CIN", pan: "PAN mismatch", supportEmail: "bad email", pincode: "invalid PIN code", slaMinutes: "too small", warehouseId: "gone" });
    expect(other).toEqual(["unknown"]);
  });

  it("places fields on their tabs", () => {
    expect(tabOf("pan")).toBe("business");
    expect(tabOf("numberFormat")).toBe("regional");
    expect(tabOf("aiEnabled")).toBe("operations");
    expect(tabOf("slaMinutes")).toBe("notifications");
    expect(tabOf("alert:syncFailures")).toBe("notifications");
  });
});
