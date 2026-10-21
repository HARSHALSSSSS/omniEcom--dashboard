import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return { ...actual, client: http };
});

import { listingsApi, tableParams } from "./listings.api";
import type { ListingRow, ListingsQuery } from "@/types/listing";

const base: ListingsQuery = { tab: "all", sort: "-updatedAt", page: 1, pageSize: 25 };

const item = (id: string, screenStatus: string) => ({ id, table: { screenStatus } }) as unknown as ListingRow;

beforeEach(() => vi.clearAllMocks());

describe("listings api", () => {
  it("sends filters in the filter[...] style and leaves empty ones out", () => {
    expect(tableParams(base)).toEqual({ pageSize: 25, sort: "-updatedAt" });
    expect(tableParams({ ...base, tab: "failed", marketplace: "amazon_in", accountId: "a", status: "active", contentState: "failed", source: "imported", attention: true, q: "kurta", page: 3 })).toEqual({
      "filter[screenStatus]": "failed",
      "filter[marketplace]": "amazon_in",
      "filter[accountId]": "a",
      "filter[status]": "active",
      "filter[contentState]": "failed",
      "filter[source]": "imported",
      "filter[attention]": "true",
      q: "kurta",
      page: 3,
      pageSize: 25,
      sort: "-updatedAt",
    });
    // the not-listed tab is not a screen status the table accepts
    expect(tableParams({ ...base, tab: "not_listed" })["filter[screenStatus]"]).toBeUndefined();
  });

  it("filters the overview by marketplace and account", async () => {
    http.get.mockResolvedValue({ data: { data: { totals: {} } } });
    await listingsApi.overview({ marketplace: "flipkart", accountId: "a" });
    expect(http.get.mock.calls[0]?.[1].params).toEqual({ "filter[marketplace]": "flipkart", "filter[accountId]": "a" });
  });

  it("reads one product's listings from the cursor list with the table block and counts every tab", async () => {
    http.get.mockResolvedValue({ data: { data: [item("1", "live"), item("2", "failed"), item("3", "live")] } });
    const res = await listingsApi.productListings({ ...base, productId: "p1", tab: "live" });
    expect(http.get.mock.calls[0]?.[1].params).toMatchObject({ include: "table", limit: 100, "filter[productId]": "p1" });
    expect(res.items.map((i) => i.id)).toEqual(["1", "3"]);
    expect(res.counts).toMatchObject({ all: 3, live: 2, failed: 1, ready: 0 });
  });

  it("creates a listing and turns a refusal into a failed outcome instead of throwing", async () => {
    http.post.mockResolvedValueOnce({ data: { data: { id: "L" } } });
    expect(await listingsApi.create({ variantId: "v", accountId: "a", label: "SKU" })).toMatchObject({ ok: true, listingId: "L" });
    expect(http.post.mock.calls[0]?.[1]).toEqual({ marketplaceAccountId: "a", variantId: "v" });
    http.post.mockRejectedValueOnce({ response: { status: 409, data: { error: { code: "CONFLICT", message: "Already listed" } } } });
    expect(await listingsApi.create({ variantId: "v", accountId: "a", label: "SKU" })).toMatchObject({ ok: false, message: "Already listed" });
  });
});
