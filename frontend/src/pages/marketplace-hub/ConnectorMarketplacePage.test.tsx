import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { delhivery, directory, item, shopify } from "@/test/directoryFixtures";

const api = vi.hoisted(() => ({
  directory: vi.fn(),
  readiness: vi.fn(),
  connect: vi.fn(),
  oauthComplete: vi.fn(),
}));
vi.mock("@/api/directory.api", () => ({ directoryApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn() }));

import ConnectorMarketplacePage from "./ConnectorMarketplacePage";

const flipkart = item({
  id: "flipkart",
  name: "Flipkart",
  description: "India marketplace",
  capabilities: ["orders.fetch", "returns.fetch"],
  capabilityTags: ["orders", "returns"],
});
const mock = item();

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/marketplace-hub/connectors"]}>
        <Routes>
          <Route
            path="/marketplace-hub/connectors"
            element={<ConnectorMarketplacePage />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    permissions: ["marketplace_accounts:read", "marketplace_accounts:write"],
  });
  api.directory.mockResolvedValue(
    directory([mock, flipkart, shopify, delhivery]),
  );
});

describe("ConnectorMarketplacePage", () => {
  it("renders the real directory with status and accounts, and no invented ratings or prices", async () => {
    renderPage();
    expect(
      screen.getByRole("status", { name: /loading connectors/i }),
    ).toBeInTheDocument();
    const card = await screen.findByRole("article", { name: "Shopify" });
    expect(within(card).getByText("Connected")).toBeInTheDocument();
    expect(within(card).getByText("2 accounts")).toBeInTheDocument();
    expect(
      screen.queryByText(/reviews|\/mo|Popular|Free Included/i),
    ).not.toBeInTheDocument();
  });

  it("searches and filters by category tabs computed from the data", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("article", { name: "Shopify" });
    expect(
      screen.getByRole("tab", { name: "All connectors (4)" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Storefront (1)" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: "All connectors (4)" }));
    const search = screen.getByRole("textbox", { name: /search connectors/i });
    await user.type(search, "flip");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.getByRole("article", { name: "Flipkart" }),
    ).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText(/no connector matches/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });

  it("disables unavailable connectors and shows the reason", async () => {
    renderPage();
    const card = await screen.findByRole("article", { name: "Delhivery" });
    expect(
      within(card).getByRole("button", { name: "Unavailable" }),
    ).toBeDisabled();
    expect(
      within(card).getByText("This integration is not available yet"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Coming soon")).toBeInTheDocument();
  });

  it("compares up to three connectors over their real capability lists", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("article", { name: "Shopify" });
    for (const name of ["Mock Marketplace", "Flipkart", "Shopify"]) {
      await user.click(
        within(screen.getByRole("article", { name })).getByRole("button", {
          name: "+ Compare",
        }),
      );
    }
    expect(
      within(screen.getByRole("article", { name: "Delhivery" })).getByRole(
        "button",
        { name: "+ Compare" },
      ),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /compare features/i }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("columnheader", { name: "Flipkart" }),
    ).toBeInTheDocument();
    const row = within(dialog)
      .getByText("returns: fetch")
      .closest("tr") as HTMLElement;
    expect(within(row).getAllByLabelText("Supported")).toHaveLength(1);
    expect(within(row).getAllByLabelText("Not supported")).toHaveLength(2);
  });

  it("starts the setup route from Connect", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      within(
        await screen.findByRole("article", { name: "Flipkart" }),
      ).getByRole("button", { name: /connect/i }),
    );
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/marketplace-hub/connect/flipkart",
    );
  });

  it("opens the detail page from Manage", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      within(await screen.findByRole("article", { name: "Shopify" })).getByRole(
        "button",
        { name: "Manage" },
      ),
    );
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/marketplace-hub/connectors/shopify",
    );
  });

  it("is read-only for a viewer, with the reason", async () => {
    useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read"] });
    renderPage();
    const card = await screen.findByRole("article", { name: "Flipkart" });
    expect(
      within(card).getByRole("button", { name: /connect/i }),
    ).toBeDisabled();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });

  it("shows the API error and retries", async () => {
    const user = userEvent.setup();
    api.directory.mockRejectedValueOnce(
      new ApiError({
        code: "INTERNAL",
        message: "Directory is down",
        status: 500,
      }),
    );
    renderPage();
    expect(await screen.findByText("Directory is down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("article", { name: "Shopify" }),
      ).toBeInTheDocument(),
    );
  });
});
