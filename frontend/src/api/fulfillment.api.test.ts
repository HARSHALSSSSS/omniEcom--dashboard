import { describe, expect, it } from "vitest";
import { exceptionParams, queueParams } from "./fulfillment.api";

describe("fulfillment query params", () => {
  it("uses the filter[...] style and leaves empty values out", () => {
    expect(queueParams({ page: 1, pageSize: 25 })).toEqual({ pageSize: 25 });
    expect(queueParams({ stage: "packing", warehouse: "w1", carrier: "sandbox", priority: "urgent", hasException: false, q: "ORD-1", page: 3, pageSize: 50 })).toEqual({
      "filter[stage]": "packing",
      "filter[warehouse]": "w1",
      "filter[carrier]": "sandbox",
      "filter[priority]": "urgent",
      "filter[hasException]": "false",
      q: "ORD-1",
      page: 3,
      pageSize: 50,
    });
  });

  it("always sends the exception status", () => {
    expect(exceptionParams({ status: "open", page: 1, pageSize: 25 })).toEqual({ "filter[status]": "open", pageSize: 25 });
    expect(exceptionParams({ status: "resolved", warehouse: "w1", q: "x", page: 2, pageSize: 25 })).toEqual({ "filter[status]": "resolved", "filter[warehouse]": "w1", q: "x", page: 2, pageSize: 25 });
  });
});
