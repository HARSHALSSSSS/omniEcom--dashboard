import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ client: { get, post }, unwrap: (res: { data: { data: unknown } }) => res.data.data }));

import { filterParams, ordersApi } from "./orders.api";

beforeEach(() => vi.clearAllMocks());

describe("orders api requests", () => {
  it("writes filters in the API's filter[...] style and leaves empty ones out", () => {
    expect(filterParams({})).toEqual({});
    expect(filterParams({ tab: "all", q: "" })).toEqual({});
    expect(
      filterParams({ q: "asha", tab: "shipped", marketplace: ["amazon_in", "flipkart"], status: ["dispatched", "in_transit"], slaState: ["at_risk"], payment: "cod" }),
    ).toEqual({
      q: "asha",
      "filter[tab]": "shipped",
      "filter[marketplace]": "amazon_in,flipkart",
      "filter[status]": "dispatched,in_transit",
      "filter[slaState]": "at_risk",
      "filter[payment]": "cod",
    });
  });

  it("writes the fulfillment, attention and date filters under the API's names", () => {
    expect(filterParams({ fulfillment: ["picking", "none"], attention: ["sla_risk", "delayed"], date: "today" })).toEqual({
      "filter[fulfillmentStatus]": "picking,none",
      "filter[attention]": "sla_risk,delayed",
      "filter[date]": "today",
    });
  });

  it("reads the recent activity with a limit and the saved views of the orders screen", async () => {
    get.mockResolvedValue({ data: { data: [] } });
    await ordersApi.activity(5);
    expect(get).toHaveBeenCalledWith("/api/v1/orders/activity", expect.objectContaining({ params: { limit: 5 } }));
    await ordersApi.views();
    expect(get).toHaveBeenLastCalledWith("/api/v1/views", { params: { screen: "orders" } });
  });

  it("asks the ledger for a numbered page with sort, and only sends page 1 implicitly", async () => {
    get.mockResolvedValue({ data: { data: { items: [], page: 2, pageSize: 50, total: 0, pages: 0 } } });
    await ordersApi.ledger({ marketplace: ["flipkart"], sort: "-value", page: 2, pageSize: 50 });
    expect(get).toHaveBeenCalledWith("/api/v1/orders/ledger", expect.objectContaining({ params: { "filter[marketplace]": "flipkart", page: 2, pageSize: 50, sort: "-value" } }));
    await ordersApi.ledger({ page: 1 });
    expect((get.mock.calls[1]?.[1] as { params: object }).params).toEqual({});
  });

  it("downloads the export as a blob with the same filters and takes the file name from the response", async () => {
    get.mockResolvedValue({ data: new Blob(["x"]), headers: { "content-disposition": 'attachment; filename="orders-2026-10-20.csv"' } });
    const file = await ordersApi.exportCsv({ tab: "new", status: ["new"] }, "sla");
    expect(get).toHaveBeenCalledWith("/api/v1/orders/export", { params: { "filter[tab]": "new", "filter[status]": "new", sort: "sla" }, responseType: "blob" });
    expect(file.fileName).toBe("orders-2026-10-20.csv");
  });

  it("transitions with the status, the version and optional tracking; cancels with a reason and code", async () => {
    post.mockResolvedValue({ data: { data: {} } });
    await ordersApi.transition({ id: "o1", status: "dispatched", version: 3, tracking: { number: "T1" } });
    expect(post).toHaveBeenCalledWith("/api/v1/orders/o1/transition", { status: "dispatched", version: 3, tracking: { number: "T1" } });
    await ordersApi.transition({ id: "o1", status: "confirmed", version: 3 });
    expect(post).toHaveBeenLastCalledWith("/api/v1/orders/o1/transition", { status: "confirmed", version: 3 });
    await ordersApi.cancel({ id: "o1", reason: "Out", reasonCode: "out_of_stock" });
    expect(post).toHaveBeenLastCalledWith("/api/v1/orders/o1/cancel", { reason: "Out", reasonCode: "out_of_stock" });
  });

  it("sends bulk actions as {action, ids, params}", async () => {
    post.mockResolvedValue({ data: { data: {} } });
    await ordersApi.bulk("mark_priority", ["a", "b"], { priority: false });
    expect(post).toHaveBeenCalledWith("/api/v1/orders/bulk", { action: "mark_priority", ids: ["a", "b"], params: { priority: false } });
    await ordersApi.bulk("confirm", ["a"]);
    expect(post).toHaveBeenLastCalledWith("/api/v1/orders/bulk", { action: "confirm", ids: ["a"], params: {} });
  });

  it("starts an order sync on the account and reads the job", async () => {
    post.mockResolvedValue({ data: { data: { job: { id: "j1" }, alreadyQueued: false } } });
    await ordersApi.syncOrders("acc1");
    expect(post).toHaveBeenCalledWith("/api/v1/marketplace-accounts/acc1/sync-orders", {});
    get.mockResolvedValue({ data: { data: { id: "j1", status: "running" } } });
    await ordersApi.syncJob("j1");
    expect(get).toHaveBeenLastCalledWith("/api/v1/sync/jobs/j1");
  });

  it("names the connected marketplaces with the marketplace's own name", async () => {
    get.mockImplementation(async (url: string) =>
      url.endsWith("/marketplaces")
        ? { data: { data: [{ code: "amazon_in", displayName: "Amazon India" }] } }
        : { data: { data: [{ id: "a1", marketplace: "amazon_in", displayName: "My store", status: "active" }, { id: "a2", marketplace: "amazon_in", displayName: "Second", status: "paused" }] } },
    );
    const { accounts, options } = await ordersApi.channels();
    expect(options).toEqual([{ code: "amazon_in", name: "Amazon India" }]);
    expect(accounts.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});
