import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./client", () => ({ client, unwrap: (res: { data: { data: unknown } }) => res.data.data }));

import { filterParams, returnsApi } from "./returns.api";

beforeEach(() => {
  vi.clearAllMocks();
  client.get.mockResolvedValue({ data: { data: {} }, headers: {} });
  client.post.mockResolvedValue({ data: { data: {} } });
});

describe("returns api", () => {
  it("writes filters in the filter[...] style and leaves empty ones out", () => {
    expect(filterParams({ q: "abc", tab: "refund_pending", stage: "resolution", marketplace: "shopify", signal: "refunds_pending", inspectionStatus: "passed", refundStatus: "failed", disposition: "damaged" })).toEqual({
      q: "abc",
      tab: "refund_pending",
      "filter[stage]": "resolution",
      "filter[marketplace]": "shopify",
      "filter[signal]": "refunds_pending",
      "filter[inspectionStatus]": "passed",
      "filter[refundStatus]": "failed",
      "filter[disposition]": "damaged",
    });
    expect(filterParams({ tab: "all" })).toEqual({});
    expect(filterParams({ tab: "completed" }, false)).toEqual({});
  });

  it("sends page, size and sort only when they differ from the defaults", async () => {
    await returnsApi.ledger({ page: 1, pageSize: 25, sort: "-refundAmount" });
    expect(client.get.mock.calls[0][1].params).toEqual({ pageSize: 25, sort: "-refundAmount" });
    await returnsApi.ledger({ page: 3, tab: "completed" });
    expect(client.get.mock.calls[1][1].params).toEqual({ tab: "completed", page: 3 });
  });

  it("counts ignore the tab, the summary and insights take the window", async () => {
    await returnsApi.counts({ q: "x", tab: "completed" });
    expect(client.get.mock.calls[0][1].params).toEqual({ q: "x" });
    await returnsApi.summary(90);
    expect(client.get.mock.calls[1][1].params).toEqual({ days: 90 });
    await returnsApi.insights(7);
    expect(client.get.mock.calls[2][1].params).toEqual({ days: 7 });
  });

  it("posts an action to the path of the step", async () => {
    await returnsApi.run({ id: "r1", action: "refund/retry", body: {} });
    expect(client.post).toHaveBeenCalledWith(expect.stringMatching(/\/returns\/r1\/refund\/retry$/), {});
  });

  it("creates a seller return and names the downloaded file", async () => {
    await returnsApi.create({ orderId: "o1", reasonCode: "other", items: [{ orderItemId: "oi1", quantity: 1 }] });
    expect(client.post.mock.calls[0][1]).toMatchObject({ source: "seller", orderId: "o1" });
    client.get.mockResolvedValueOnce({ data: new Blob(["x"]), headers: { "content-disposition": "attachment; filename=\"returns-2026.csv\"" } });
    expect((await returnsApi.exportCsv({ tab: "completed" })).fileName).toBe("returns-2026.csv");
  });
});
