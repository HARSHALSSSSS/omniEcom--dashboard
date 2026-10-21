import { describe, it, expect, beforeEach, vi } from "vitest";
import { client } from "./client";
import { catalogApi, filterParams } from "./products";

const get = vi.spyOn(client, "get");
const post = vi.spyOn(client, "post");

const envelope = (data: unknown) => ({ data: { success: true, data, requestId: "r" } });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("catalogApi request params", () => {
  it("sends the catalog filters in the filter[...] style, only what is set", async () => {
    get.mockResolvedValue(envelope({ items: [], page: 1, pageSize: 24, total: 0, pages: 0 }));
    await catalogApi.list({
      q: "bag",
      status: "draft",
      categoryId: "c1",
      channel: "amazon_in",
      inventory: "low",
      productType: "physical",
      needsAttention: true,
      page: 3,
      pageSize: 12,
      sort: "-title",
    });
    expect(get).toHaveBeenCalledWith("/api/v1/products/catalog", {
      params: {
        q: "bag",
        "filter[status]": "draft",
        "filter[categoryId]": "c1",
        "filter[channel]": "amazon_in",
        "filter[inventory]": "low",
        "filter[productType]": "physical",
        "filter[needsAttention]": "true",
        page: 3,
        pageSize: 12,
        sort: "-title",
      },
      signal: undefined,
    });
  });

  it("leaves page 1, the default sort and empty filters out", async () => {
    get.mockResolvedValue(envelope({ items: [], page: 1, pageSize: 24, total: 0, pages: 0 }));
    await catalogApi.list({ page: 1, pageSize: 24, q: "" });
    expect(get.mock.calls[0]?.[1]).toMatchObject({ params: { pageSize: 24 } });
    expect(Object.keys((get.mock.calls[0]?.[1] as { params: object }).params)).toEqual(["pageSize"]);
  });

  it("never sends status or needsAttention to /products/stats", async () => {
    get.mockResolvedValue(envelope({}));
    await catalogApi.stats({ q: "x", status: "active", needsAttention: true, inventory: "out" });
    expect(get.mock.calls[0]?.[1]).toMatchObject({ params: { q: "x", "filter[inventory]": "out" } });
    expect(Object.keys((get.mock.calls[0]?.[1] as { params: object }).params)).toEqual(["q", "filter[inventory]"]);
    expect(filterParams({ status: "active" }, false)).toEqual({});
  });

  it("posts the bulk action with the ids", async () => {
    post.mockResolvedValue(envelope({ action: "archive", summary: { total: 1, succeeded: 1, failed: 0 }, results: [] }));
    await catalogApi.bulk(["a", "b"], "archive");
    expect(post).toHaveBeenCalledWith("/api/v1/products/bulk-actions", { ids: ["a", "b"], action: "archive" });
  });

  it("exports with the catalog filters as a blob and reads the file name", async () => {
    const blob = new Blob(["x"]);
    get.mockResolvedValue({ data: blob, headers: { "content-disposition": 'attachment; filename="products-2026.csv"' } });
    const file = await catalogApi.exportCsv({ status: "active", inventory: "low", sort: "sku" });
    expect(get).toHaveBeenCalledWith("/api/v1/products/export", {
      params: { "filter[status]": "active", "filter[inventory]": "low", sort: "sku" },
      responseType: "blob",
    });
    expect(file).toEqual({ blob, fileName: "products-2026.csv" });
  });

  it("queues the asynchronous export with the filters it understands", async () => {
    post.mockResolvedValue(envelope({ id: "j" }));
    await catalogApi.queueExport({ status: "archived", categoryId: "c", q: "t", channel: "ignored" });
    expect(post).toHaveBeenCalledWith("/api/v1/products/exports", { status: "archived", categoryId: "c", q: "t" });
  });

  it("asks for the user's product views and saves a view for the products screen", async () => {
    get.mockResolvedValue(envelope([]));
    post.mockResolvedValue(envelope({}));
    await catalogApi.views();
    expect(get).toHaveBeenCalledWith("/api/v1/views", { params: { screen: "products" } });
    await catalogApi.createView({ name: "n", filters: { status: "draft" }, sort: null, shared: true });
    expect(post).toHaveBeenCalledWith("/api/v1/views", { screen: "products", name: "n", filters: { status: "draft" }, sort: null, shared: true });
  });

  it("lists each connected marketplace once, named by the marketplace", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/marketplace-accounts")
          ? { data: { data: [{ marketplace: "shopify", displayName: "My store" }, { marketplace: "amazon_in", displayName: "Nova AMZ" }, { marketplace: "amazon_in", displayName: "Second AMZ" }] } }
          : { data: { data: [{ code: "amazon_in", displayName: "Amazon India" }, { code: "shopify", displayName: "Shopify" }] } },
      ),
    );
    expect(await catalogApi.channels()).toEqual([
      { code: "amazon_in", name: "Amazon India" },
      { code: "shopify", name: "Shopify" },
    ]);
  });
});
