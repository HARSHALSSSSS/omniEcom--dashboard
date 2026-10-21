import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/api/client";
import { AuthThumbnail } from "./AuthThumbnail";

let get: MockInstance<typeof client.get>;

function renderThumb(url: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthThumbnail url={url} alt="Bag" initials="TRV" />
    </QueryClientProvider>,
  );
}

describe("AuthThumbnail", () => {
  beforeEach(() => {
    get = vi.spyOn(client, "get");
    URL.createObjectURL = vi.fn(() => "blob:thumb");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("loads the image through the API client (bearer token) and shows it from an object URL", async () => {
    get.mockResolvedValue({ data: new Blob(["img"], { type: "image/png" }) });
    const { unmount } = renderThumb("/api/v1/documents/d1/content");
    const img = await screen.findByRole("img", { name: "Bag" });
    expect(img).toHaveAttribute("src", "blob:thumb");
    expect(get).toHaveBeenCalledWith("/documents/d1/content", { responseType: "blob" });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb");
  });

  it("shows the placeholder without a request when the product has no image", () => {
    renderThumb(null);
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByText("Image required")).toBeInTheDocument();
  });

  it("falls back to the placeholder when the image cannot be loaded", async () => {
    get.mockRejectedValue(new Error("403"));
    renderThumb("/api/v1/documents/d1/content");
    await waitFor(() => expect(screen.getByText("Image unavailable")).toBeInTheDocument());
  });
});
