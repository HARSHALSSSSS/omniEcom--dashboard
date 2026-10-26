import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const refreshShell = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/session", () => ({ refreshShell }));

import { refreshAfterChannelChange, refreshAfterPromotionChange, refreshHubListingCounts, refreshPromotions } from "./channelRefresh";

describe("channel refresh", () => {
  it("a connect/disconnect refreshes Hub, Health, Listings, Pricing, Needs attention and the shell badges", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    refreshAfterChannelChange(qc);
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
    for (const k of ['["hub"]', '["listings"]', '["pricing"]', '["attention"]', '["dashboard"]']) expect(keys).toContain(k);
    expect(refreshShell).toHaveBeenCalled();
  });

  it("a promotions write refreshes Pricing, Listings, Hub counts, Inventory, Needs attention, the dashboard and the badges", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    refreshShell.mockClear();
    refreshAfterPromotionChange(qc);
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
    for (const k of ['["promotions"]', '["listings"]', '["pricing"]', '["inventory"]', '["attention"]', '["dashboard"]', '["hub"]']) expect(keys).toContain(k);
    expect(refreshShell).toHaveBeenCalled();
  });

  it("pricing, listing and stock changes can refresh the promotions numbers", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    refreshPromotions(qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["promotions"] });
  });

  it("a listing write refreshes the hub's listing counts", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    refreshHubListingCounts(qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["hub"] });
  });
});
