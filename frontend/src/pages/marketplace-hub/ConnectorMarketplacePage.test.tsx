import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { accounts, card, detail } from "@/test/hubFixtures";
import type { AuthField, DirectoryItem } from "@/types/directory";

const http = vi.hoisted(() => ({ accounts: vi.fn(), directory: vi.fn(), account: vi.fn() }));
vi.mock("@/api/client", () => ({
  unwrap: (res: { data: { data: unknown } }) => res.data.data,
  client: {
    get: (url: string) => {
      if (url.endsWith("/marketplace-hub/accounts")) return http.accounts().then((data: unknown) => ({ data: { data } }));
      if (url.endsWith("/marketplace-hub/directory")) return http.directory().then((data: unknown) => ({ data: { data } }));
      return http.account(url.split("/").pop()).then((data: unknown) => ({ data: { data } }));
    },
  },
}));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn() }));
vi.mock("@/hooks/useProducts", () => ({
  useCatalogStats: () => ({ data: { products: 12, variants: 34, activeProducts: 10, activeVariants: 30 } }),
}));

import ConnectorMarketplacePage from "./ConnectorMarketplacePage";

const field = (key: string, label: string, over: Partial<AuthField> = {}): AuthField => ({ key, label, type: "text", required: true, secret: false, pattern: null, help: null, ...over });
const flow = (over: Partial<DirectoryItem["authFlow"]> = {}): DirectoryItem["authFlow"] => ({ type: "api_key", mode: "credentials", fields: [], redirectFields: [], partnerGated: false, refreshable: false, ...over });

const dir = (over: Partial<DirectoryItem>): DirectoryItem => ({
  id: "x",
  name: "X",
  category: "marketplace",
  description: "",
  logoKey: "x",
  supportedRegions: ["IN"],
  implementation: "ga",
  status: "available",
  statusReason: null,
  accountCount: 0,
  partnerGated: false,
  authFlow: flow(),
  capabilities: [],
  capabilityTags: [],
  readiness: { sandbox: true, live: false, notes: "Sandbox verified." },
  limits: { requestsPerSecond: 5, burst: 10, maxBatchSize: 50 },
  webhooks: false,
  ...over,
});

const ITEMS: DirectoryItem[] = [
  dir({ id: "amazon_in", name: "Amazon India", description: "Amazon orders and listings.", status: "connected", accountCount: 1, capabilityTags: ["listings", "inventory", "orders"], capabilities: ["listings.create", "orders.fetch"] }),
  dir({
    id: "flipkart",
    name: "Flipkart",
    description: "Flipkart seller API.",
    capabilityTags: ["listings", "inventory", "orders"],
    authFlow: flow({ fields: [field("appId", "Application ID"), field("appSecret", "Application secret", { secret: true })] }),
    limits: { requestsPerSecond: 2, burst: 4, maxBatchSize: 20 },
  }),
  dir({ id: "meesho", name: "Meesho", description: "Meesho supplier panel.", partnerGated: true, authFlow: flow({ partnerGated: true }), capabilityTags: ["orders", "returns"] }),
  dir({ id: "snapdeal", name: "Snapdeal", description: "Snapdeal seller API.", status: "unavailable", statusReason: "This integration is not available yet", implementation: "planned", capabilityTags: ["orders"] }),
  dir({ id: "shopify", name: "Shopify", category: "storefront", description: "Shopify store.", capabilityTags: ["listings", "orders", "promotions"], webhooks: true }),
];
const DIRECTORY = { items: ITEMS, summary: { total: 5, connected: 1, needsAttention: 0, available: 3, unavailable: 1 } };

const A = card({ marketplace: "amazon_in", name: "Acme Amazon" });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/marketplace-hub/connectors") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ConnectorMarketplacePage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => screen.getByTestId("loc").textContent;
const cardOf = (name: string) => screen.getByRole("heading", { name, level: 3 }).closest("div.group") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  grant("marketplace_accounts:read", "marketplace_accounts:write");
  http.accounts.mockResolvedValue(accounts([A]));
  http.directory.mockResolvedValue(DIRECTORY);
  http.account.mockResolvedValue(detail({ ...A }));
});

describe("directory data", () => {
  it("lists the connectors of the API with their real capabilities and states, and invents nothing", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Flipkart", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("5 connectors · 1 connected")).toBeInTheDocument();
    expect(screen.getByText("Connected channels · 1")).toBeInTheDocument();
    expect(screen.getByText("5 in directory")).toBeInTheDocument();

    const flipkart = within(cardOf("Flipkart"));
    expect(flipkart.getByText("Listings")).toBeInTheDocument();
    expect(flipkart.getByText("Inventory")).toBeInTheDocument();
    expect(flipkart.queryByText("Returns")).not.toBeInTheDocument();
    expect(flipkart.getByText("Available to connect")).toBeInTheDocument();

    const snap = within(cardOf("Snapdeal"));
    expect(snap.getByText("Unavailable")).toBeInTheDocument();
    expect(snap.getByText("This integration is not available yet")).toBeInTheDocument();
    expect(snap.getByRole("button", { name: "View connector" })).toBeInTheDocument();

    // the account of the connected connector supplies the live health line
    expect(within(cardOf("Amazon India")).getByText(/Healthy · Last sync 5 min ago/)).toBeInTheDocument();

    expect(screen.queryByText(/₹|Demo pricing|4\.9|reviews|Social Commerce Explore/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Included in your workspace/).length).toBeGreaterThan(0);
  });

  it("does not add connectors the API does not have", async () => {
    http.directory.mockResolvedValue({ items: [ITEMS[1]], summary: { total: 1, connected: 0, needsAttention: 0, available: 1, unavailable: 0 } });
    http.accounts.mockResolvedValue(accounts([]));
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    expect(screen.queryByRole("heading", { name: "Snapdeal", level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Social/, level: 3 })).not.toBeInTheDocument();
    expect(screen.getByText("1 connector · 0 connected")).toBeInTheDocument();
  });
});

describe("filters, search and sort in the URL", () => {
  it("searches and keeps the search in the URL", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    await userEvent.type(screen.getByLabelText("Search connectors"), "meesho");
    expect(loc()).toBe("/marketplace-hub/connectors?q=meesho");
    expect(screen.queryByRole("heading", { name: "Flipkart", level: 3 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meesho", level: 3 })).toBeInTheDocument();
  });

  it("a category tab filters by the directory category", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    await userEvent.click(screen.getByRole("button", { name: "Commerce" }));
    expect(loc()).toBe("/marketplace-hub/connectors?tab=commerce");
    expect(screen.getByRole("heading", { name: "Shopify", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Flipkart", level: 3 })).not.toBeInTheDocument();
  });

  it("a category without connectors says so instead of showing invented ones", async () => {
    renderPage("/marketplace-hub/connectors?tab=social");
    expect(await screen.findByText("No connectors match your search.")).toBeInTheDocument();
    expect(screen.getByText(/no connector in this category yet/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(loc()).toBe("/marketplace-hub/connectors");
    expect(await screen.findByRole("heading", { name: "Flipkart", level: 3 })).toBeInTheDocument();
  });

  it("'I need' filters by real capabilities and counts the connectors", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    await userEvent.click(screen.getByRole("button", { name: "I need" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Returns/ }));
    expect(loc()).toBe("/marketplace-hub/connectors?need=returns");
    expect(screen.getByText("1 connector support Returns")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meesho", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Flipkart", level: 3 })).not.toBeInTheDocument();
  });

  it("restores status, availability and sort from the URL", async () => {
    renderPage("/marketplace-hub/connectors?status=available&avail=partner&sort=name");
    expect(await screen.findByRole("heading", { name: "Meesho", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Flipkart", level: 3 })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort: Name A-Z" })).toBeInTheDocument();
  });

  it("sorts by name", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    await userEvent.click(screen.getByRole("button", { name: /Sort: Recommended/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Name A-Z" }));
    expect(loc()).toContain("sort=name");
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names.slice(0, 2)).toEqual(["Amazon India", "Flipkart"]);
  });
});

describe("states", () => {
  it("error with retry", async () => {
    http.directory.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Flipkart", level: 3 })).toBeInTheDocument();
  });

  it("shows a loading state first", async () => {
    http.directory.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(await screen.findByText("Loading connectors...")).toBeInTheDocument();
  });

  it("a viewer can browse and compare but not connect, and is told why", async () => {
    grant("marketplace_accounts:read");
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    expect(screen.getByRole("status")).toHaveTextContent("read-only");
    expect(within(cardOf("Flipkart")).getByRole("button", { name: "Connect" })).toBeDisabled();
    await userEvent.click(within(cardOf("Flipkart")).getByRole("checkbox", { name: "Compare Flipkart" }));
    expect(screen.getByRole("button", { name: /Compare \(1\)/ })).toBeInTheDocument();
  });
});

describe("connect, manage and bookmark", () => {
  it("Connect goes to the connect flow of that connector", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    await userEvent.click(within(cardOf("Flipkart")).getByRole("button", { name: "Connect" }));
    expect(loc()).toBe("/marketplace-hub/connect/flipkart");
  });

  it("Manage opens the hub on that account", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Amazon India", level: 3 });
    await userEvent.click(within(cardOf("Amazon India")).getByRole("button", { name: /Manage/ }));
    expect(loc()).toBe("/marketplace-hub?q=Acme%20Amazon");
  });

  it("bookmarks are kept on this device", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    await userEvent.click(within(cardOf("Flipkart")).getByRole("button", { name: "Bookmark Flipkart" }));
    expect(within(cardOf("Flipkart")).getByRole("button", { name: "Remove Flipkart bookmark" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(window.localStorage.getItem("connector-bookmarks") ?? "[]")).toEqual(["flipkart"]);
  });
});

describe("compare", () => {
  it("compares the real capability matrix, access and limits, and caps at three", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    for (const n of ["Flipkart", "Meesho", "Shopify"]) await userEvent.click(within(cardOf(n)).getByRole("checkbox", { name: `Compare ${n}` }));
    await userEvent.click(within(cardOf("Amazon India")).getByRole("checkbox", { name: "Compare Amazon India" }));
    expect(screen.getByText("You can compare up to 3 connectors at once.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Compare \(3\)/ }));

    const modal = screen.getByText("Compare connectors").closest("div.max-h-\\[90vh\\]") as HTMLElement;
    expect(within(modal).getByText("2 requests/s, burst 4")).toBeInTheDocument();
    expect(within(modal).getAllByText("Included in your workspace").length).toBe(3);
    // Meesho is partner gated: its returns capability "Depends" on approval; reviews are supported by no connector
    const returnsRow = within(modal).getByText("Returns").parentElement as HTMLElement;
    expect(within(returnsRow).getByText("Depends")).toBeInTheDocument();
    expect(within(modal).queryByText(/Demo pricing|₹/)).not.toBeInTheDocument();
    const reviewsRow = within(modal).getByText("Reviews").parentElement as HTMLElement;
    expect(within(reviewsRow).getAllByText("N/A")).toHaveLength(3);

    await userEvent.click(within(modal).getAllByRole("button", { name: "Connect" })[0]);
    expect(loc()).toBe("/marketplace-hub/connect/flipkart");
  });
});

describe("preview drawer", () => {
  it("an available connector shows what you need, the real limits, and Continue needs the acknowledgement", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Flipkart", level: 3 });
    await userEvent.click(within(cardOf("Flipkart")).getByText("Flipkart seller API."));
    const drawer = await screen.findByRole("complementary", { name: "Flipkart connector details" });
    expect(within(drawer).getByText("Application ID")).toBeInTheDocument();
    expect(within(drawer).getByText("Application secret (kept encrypted)")).toBeInTheDocument();
    expect(within(drawer).getByText("2 requests/s, burst 4")).toBeInTheDocument();
    expect(within(drawer).getByText("12 master products · 34 variants")).toBeInTheDocument();
    expect(within(drawer).queryByText(/₹|Demo pricing/)).not.toBeInTheDocument();
    const cont = within(drawer).getByRole("button", { name: "Continue" });
    expect(cont).toBeDisabled();
    await userEvent.click(within(drawer).getByRole("checkbox"));
    await userEvent.click(cont);
    expect(loc()).toBe("/marketplace-hub/connect/flipkart");
  });

  it("an unavailable connector explains why and cannot be connected", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Snapdeal", level: 3 });
    await userEvent.click(within(cardOf("Snapdeal")).getByRole("button", { name: "View connector" }));
    const drawer = await screen.findByRole("complementary", { name: "Snapdeal connector details" });
    expect(within(drawer).getAllByText("This integration is not available yet").length).toBeGreaterThan(0);
    expect(within(drawer).getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("a connected connector shows the real account health and per-entity sync state", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Amazon India", level: 3 });
    await userEvent.click(within(cardOf("Amazon India")).getByText("Amazon orders and listings."));
    const drawer = await screen.findByRole("complementary", { name: "Amazon India connector details" });
    expect(await within(drawer).findByText("A1SELLER")).toBeInTheDocument();
    await waitFor(() => expect(within(drawer).getAllByText(/^Failed/).length).toBeGreaterThan(0));
    expect(within(drawer).queryByText(/Urban Carry/)).not.toBeInTheDocument();
  });
});
