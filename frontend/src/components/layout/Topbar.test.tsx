import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Topbar } from "./Topbar";
import { productDetailApi } from "@/api/productDetail.api";
import { ApiError } from "@/api/errors";
import { PRODUCT_ID, activeOverview } from "@/components/products/detail/testFixtures";
import { productDetailKeys } from "@/hooks/useProductDetail";

vi.mock("@/api/productDetail.api", () => ({ productDetailApi: { overview: vi.fn() } }));
const overview = vi.mocked(productDetailApi.overview);

function renderBar(path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Topbar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  overview.mockResolvedValue(activeOverview());
});
afterEach(() => cleanup());

describe("Topbar breadcrumb on a product", () => {
  it("shows the real product title", async () => {
    renderBar(`/products/${PRODUCT_ID}`);
    expect(await screen.findByRole("link", { name: "Weekender Duffel" })).toHaveAttribute("href", `/products/${PRODUCT_ID}`);
    expect(screen.queryByText("Product details")).not.toBeInTheDocument();
    expect(screen.queryByText("Premium Travel Bag")).not.toBeInTheDocument();
    expect(overview).toHaveBeenCalledWith(PRODUCT_ID, expect.anything());
  });

  it("reuses the detail page's cache entry (no second request)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(productDetailKeys.overview(PRODUCT_ID), activeOverview());
    renderBar(`/products/${PRODUCT_ID}`, client);
    expect(await screen.findByRole("link", { name: "Weekender Duffel" })).toBeInTheDocument();
    expect(overview).not.toHaveBeenCalled();
  });

  it("falls back to a neutral label while loading and when the product cannot be read", async () => {
    overview.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "nope", status: 404 }));
    renderBar(`/products/${PRODUCT_ID}`);
    expect(screen.getByRole("link", { name: "Product details" })).toBeInTheDocument();
    await vi.waitFor(() => expect(overview).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Product details" })).toBeInTheDocument();
  });

  it("keeps the title and adds the variants crumb on the variants screen", async () => {
    renderBar(`/products/${PRODUCT_ID}/variants`);
    expect(await screen.findByRole("link", { name: "Weekender Duffel" })).toBeInTheDocument();
    expect(screen.getByText("Variants & SKU Management")).toBeInTheDocument();
  });

  it("does not fetch a product on other screens", () => {
    renderBar("/products");
    renderBar("/products/new");
    expect(overview).not.toHaveBeenCalled();
  });
});
