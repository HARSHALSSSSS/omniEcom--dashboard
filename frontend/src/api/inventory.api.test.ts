import { describe, it, expect, afterEach, vi } from "vitest";
import { client } from "./client";
import { filterParams, inventoryApi } from "./inventory.api";

afterEach(() => vi.restoreAllMocks());

describe("inventory api", () => {
  it("sends filters in the filter[...] style and leaves empty ones out", () => {
    expect(filterParams({})).toEqual({});
    expect(
      filterParams({ q: "bag", stockStatus: "low_stock", warehouse: "w1", channel: "amazon_in", health: "stockout_risk", signal: "slow_moving", movement: "adjusted", stockMin: 0, stockMax: 20 }),
    ).toEqual({
      q: "bag",
      "filter[stockStatus]": "low_stock",
      "filter[warehouse]": "w1",
      "filter[channel]": "amazon_in",
      "filter[health]": "stockout_risk",
      "filter[signal]": "slow_moving",
      "filter[movement]": "adjusted",
      "filter[stockMin]": 0,
      "filter[stockMax]": 20,
    });
  });

  it("pages and sorts the ledger (page 1 is the default and is not sent)", async () => {
    const get = vi.spyOn(client, "get").mockResolvedValue({ data: { data: { items: [] } } });
    await inventoryApi.ledger({ page: 1, pageSize: 25, sort: "-available" });
    expect(get).toHaveBeenLastCalledWith("/api/v1/inventory/ledger", { params: { pageSize: 25, sort: "-available" }, signal: undefined });
    await inventoryApi.ledger({ page: 3, pageSize: 10, stockStatus: "excess" });
    expect(get.mock.calls.at(-1)?.[1]?.params).toEqual({ "filter[stockStatus]": "excess", page: 3, pageSize: 10 });
  });

  it("asks the allocations of a page of variants in one call", async () => {
    const get = vi.spyOn(client, "get").mockResolvedValue({ data: { data: [] } });
    await inventoryApi.allocations(["a", "b"]);
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ variantIds: "a,b" });
  });

  it("exports with the current filters as an authenticated blob and keeps the server file name", async () => {
    const blob = new Blob(["sku\n"]);
    const get = vi.spyOn(client, "get").mockResolvedValue({ data: blob, headers: { "content-disposition": 'attachment; filename="inventory-2026-10-20.csv"' } });
    const file = await inventoryApi.exportCsv({ stockStatus: "out_of_stock", q: "tee" });
    expect(get).toHaveBeenCalledWith("/api/v1/inventory/export", { params: { q: "tee", "filter[stockStatus]": "out_of_stock" }, responseType: "blob" });
    expect(file).toEqual({ blob, fileName: "inventory-2026-10-20.csv" });
  });

  it("maps the warehouse city out of the address", async () => {
    vi.spyOn(client, "get").mockResolvedValue({ data: { data: [{ id: "w1", code: "DEL", name: "Delhi", address: { city: "Delhi" }, isDefault: true }, { id: "w2", code: "BOM", name: "Mumbai", address: {}, isDefault: false }] } });
    expect(await inventoryApi.warehouses()).toEqual([
      { id: "w1", code: "DEL", name: "Delhi", city: "Delhi", isDefault: true },
      { id: "w2", code: "BOM", name: "Mumbai", city: null, isDefault: false },
    ]);
  });

  it("drives the draft transfer lifecycle and the saved filters", async () => {
    const get = vi.spyOn(client, "get").mockResolvedValue({ data: { data: [{ id: "t1" }] } });
    const post = vi.spyOn(client, "post").mockResolvedValue({ data: { data: { id: "t1" } } });
    const patch = vi.spyOn(client, "patch").mockResolvedValue({ data: { data: { id: "t1" } } });
    const del = vi.spyOn(client, "delete").mockResolvedValue({ data: {} });

    expect(await inventoryApi.transfers("draft")).toEqual([{ id: "t1" }]);
    expect(get).toHaveBeenLastCalledWith("/api/v1/inventory/transfers", { params: { limit: 100, "filter[status]": "draft" }, signal: undefined });
    await inventoryApi.createDraft({ fromWarehouseId: "a", toWarehouseId: "b", items: [{ variantId: "v", quantity: 2 }] });
    expect(post).toHaveBeenLastCalledWith("/api/v1/inventory/transfers", { fromWarehouseId: "a", toWarehouseId: "b", items: [{ variantId: "v", quantity: 2 }] });
    await inventoryApi.updateDraft("t1", { notes: null, version: 1 });
    expect(patch).toHaveBeenLastCalledWith("/api/v1/inventory/transfers/t1", { notes: null, version: 1 });
    await inventoryApi.submitDraft("t1");
    expect(post).toHaveBeenLastCalledWith("/api/v1/inventory/transfers/t1/submit", {});
    await inventoryApi.discardDraft("t1");
    expect(post).toHaveBeenLastCalledWith("/api/v1/inventory/transfers/t1/cancel", {});

    await inventoryApi.presets();
    expect(get).toHaveBeenLastCalledWith("/api/v1/views", { params: { screen: "inventory" } });
    await inventoryApi.createPreset({ name: "n", filters: { q: "x" }, sort: null, shared: false });
    expect(post).toHaveBeenLastCalledWith("/api/v1/views", { screen: "inventory", name: "n", filters: { q: "x" }, sort: null, shared: false });
    await inventoryApi.deletePreset("v1");
    expect(del).toHaveBeenLastCalledWith("/api/v1/views/v1");
  });

  it("reads the keyset feed meta", async () => {
    const get = vi.spyOn(client, "get").mockResolvedValue({ data: { data: [{ id: 1 }], meta: { nextCursor: "c2", hasMore: true } } });
    const page = await inventoryApi.movementsFeed({ type: "inward", warehouseId: "w1" }, "c1");
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ limit: 10, cursor: "c1", "filter[type]": "inward", "filter[warehouseId]": "w1" });
    expect(page).toEqual({ items: [{ id: 1 }], nextCursor: "c2", hasMore: true });
  });
});
