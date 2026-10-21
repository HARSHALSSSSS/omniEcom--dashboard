import { describe, expect, it } from "vitest";
import { base64ToBlob, filterParams, shipmentsParams } from "./shipping.api";

describe("shipping params", () => {
  it("uses the filter[...] style and leaves empty values out", () => {
    expect(filterParams({})).toEqual({});
    expect(filterParams({ q: "DL1", carrier: "Delhivery", status: "in_transit", group: "ndr", warehouseId: "w1", payment: "cod", labelAvailable: false, from: "2026-10-01", to: "2026-10-05" })).toEqual({
      q: "DL1",
      "filter[carrier]": "Delhivery",
      "filter[status]": "in_transit",
      "filter[group]": "ndr",
      "filter[warehouseId]": "w1",
      "filter[payment]": "cod",
      "filter[labelAvailable]": "false",
      "filter[from]": "2026-10-01",
      "filter[to]": "2026-10-05T23:59:59.999Z",
    });
  });

  it("sends page only past the first and always the page size", () => {
    expect(shipmentsParams({ page: 1, pageSize: 25 })).toEqual({ pageSize: 25 });
    expect(shipmentsParams({ page: 3, pageSize: 50, group: "rto" })).toEqual({ page: 3, pageSize: 50, "filter[group]": "rto" });
  });

  it("decodes base64 into a typed blob", async () => {
    const blob = base64ToBlob(btoa("%PDF-1.4"), "application/pdf");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(8);
  });
});
