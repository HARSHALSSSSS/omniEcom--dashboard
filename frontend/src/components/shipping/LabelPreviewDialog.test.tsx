import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LabelPreviewDialog } from "./LabelPreviewDialog";
import { saveBlob } from "@/components/products/list/saveBlob";

const api = vi.hoisted(() => ({
  getLabelData: vi.fn(),
}));

vi.mock("@/api/shipping.api", () => ({ shippingApi: api }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: vi.fn() }));

function renderDialog(shipmentId: string | null = "shp_1", onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <LabelPreviewDialog shipmentId={shipmentId} onClose={onClose} />
    </QueryClientProvider>
  );
}

describe("LabelPreviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    api.getLabelData.mockReturnValue(new Promise(() => {}));
    renderDialog("shp_loading");
    expect(screen.getByText("Generating shipping label preview…")).toBeInTheDocument();
  });

  it("renders structured 4x6 thermal shipping label when backend returns text label", async () => {
    const rawContent = [
      "*** SANDBOX COURIER ***",
      "AWB SBX9E2CC14FF4",
      "SHIP SHP-000003 / ORDER ORD-000008",
      "FROM HOME Home Inventory",
      "TO Sandbox Buyer 560001",
      "PREPAID",
      "PKG PKG-000003 600g",
    ].join("\n");

    api.getLabelData.mockResolvedValue({
      shipmentId: "shp_1",
      awb: "SBX9E2CC14FF4",
      format: "text",
      content: rawContent,
    });

    renderDialog("shp_1");

    expect(await screen.findByText("SANDBOX COURIER")).toBeInTheDocument();
    expect(screen.getAllByText("SBX9E2CC14FF4").length).toBeGreaterThan(0);
    expect(screen.getByText("560001")).toBeInTheDocument();
    expect(screen.getByText("PREPAID")).toBeInTheDocument();
    expect(screen.getByText("ORD-000008")).toBeInTheDocument();
    expect(screen.getByText("600g")).toBeInTheDocument();
    expect(screen.getByText("SHP-000003")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print Label" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("downloads text file when download button is clicked for text format", async () => {
    api.getLabelData.mockResolvedValue({
      shipmentId: "shp_1",
      awb: "SBX9E2CC14FF4",
      format: "text",
      content: "RAW TEXT LABEL",
    });

    renderDialog("shp_1");
    const downloadBtn = await screen.findByRole("button", { name: "Download" });
    await userEvent.click(downloadBtn);

    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "label-SBX9E2CC14FF4.txt");
  });

  it("renders embedded PDF iframe when backend returns pdf_base64", async () => {
    api.getLabelData.mockResolvedValue({
      shipmentId: "shp_pdf",
      awb: "DL999888",
      format: "pdf_base64",
      content: "JVBERi0xLjQKJ...",
    });

    renderDialog("shp_pdf");
    expect(await screen.findByTitle("Shipping Label PDF")).toBeInTheDocument();
  });

  it("shows retry button on error", async () => {
    api.getLabelData.mockRejectedValue(new Error("Network failed"));
    renderDialog("shp_err");

    expect(await screen.findByText("Could not load the shipping label.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
