import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { accounts, card, job } from "@/test/hubFixtures";
import type { SyncStatus } from "@/types/hub";
import {
  connected,
  delhivery,
  directory,
  item,
  sandboxOnly,
  shopify,
} from "@/test/directoryFixtures";

const api = vi.hoisted(() => ({
  directory: vi.fn(),
  readiness: vi.fn(),
  connect: vi.fn(),
  oauthComplete: vi.fn(),
}));
const hub = vi.hoisted(() => ({ accounts: vi.fn(), syncStatus: vi.fn(), startSync: vi.fn(), remove: vi.fn(), jobLogs: vi.fn() }));
const resend = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/directory.api", () => ({ directoryApi: api }));
vi.mock("@/api/hub.api", () => ({ hubApi: hub }));
vi.mock("@/hooks/useProducts", () => ({ useCatalogStats: () => ({ data: undefined }) }));
vi.mock("@/api/auth.api", () => ({ authApi: { resendVerification: resend } }));
vi.mock("@/lib/session", () => ({ refreshShell }));
vi.mock("@/components/marketplace-hub/setup/setupUtils", async (orig) => ({
  ...(await orig<
    typeof import("@/components/marketplace-hub/setup/setupUtils")
  >()),
  redirectBrowser: redirect,
}));

import ConnectionSetupPage from "./ConnectionSetupPage";

const mock = item();
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

function renderPage(code = "mock", stepParam = "authorize") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const path = stepParam
    ? `/marketplace-hub/connect/${code}?step=${stepParam}`
    : `/marketplace-hub/connect/${code}`;
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/marketplace-hub/connect/:id"
            element={<ConnectionSetupPage />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillMock(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/account name/i), "My mock");
  await user.type(screen.getByLabelText(/seller id/i), "S1");
  await user.type(screen.getByLabelText(/api key/i), "sandbox_secret");
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useWorkspaceStore.setState({
    permissions: ["marketplace_accounts:read", "marketplace_accounts:write"],
  });
  api.directory.mockResolvedValue(directory([mock, shopify, delhivery]));
  api.readiness.mockResolvedValue(sandboxOnly);
  refreshShell.mockResolvedValue(undefined);
  useToastStore.setState({ toasts: [] });
  hub.accounts.mockResolvedValue(accounts([]));
  hub.jobLogs.mockResolvedValue({ items: [], nextAfter: null });
});

describe("ConnectionSetupPage", () => {
  it("builds the form from authFlow.fields, masks secrets and says Sandbox honestly", async () => {
    renderPage();
    expect(await screen.findByLabelText(/seller id/i)).toHaveAttribute(
      "type",
      "text",
    );
    expect(screen.getByLabelText(/api key/i)).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByText(/not verified for live use yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
  });

  it("runs the real connect call and shows the real step results and the queued first sync", async () => {
    const user = userEvent.setup();
    api.connect.mockResolvedValue(connected());
    renderPage();
    await fillMock(user);
    await user.click(
      screen.getByRole("button", { name: /connect mock marketplace/i }),
    );

    await screen.findByText("Account authorized");
    const [input, key] = api.connect.mock.calls[0];
    expect(input).toMatchObject({
      marketplace: "mock",
      displayName: "My mock",
      mode: "sandbox",
      credentials: { sellerId: "S1", apiKey: "sandbox_secret" },
      syncOptions: { runFirstSync: true },
    });
    expect(input.redirectUri).toBeUndefined();
    expect(typeof key).toBe("string");

    const steps = screen.getByRole("list", { name: /connection steps/i });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    expect(within(steps).getByText("120 ms")).toBeInTheDocument();
    expect(
      within(steps).getByText("The marketplace accepted the credentials"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("first-sync-summary")).toHaveTextContent(
      "First sync queued for orders, inventory",
    );
    expect(refreshShell).toHaveBeenCalled();
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(
      "sandbox_secret",
    );

    await user.click(
      screen.getByRole("button", { name: /go to marketplace hub/i }),
    );
    expect(screen.getByTestId("where")).toHaveTextContent("/marketplace-hub");
  });

  it("validates dynamically from the field rules and sends nothing while invalid", async () => {
    const user = userEvent.setup();
    renderPage("shopify");
    await user.type(await screen.findByLabelText(/account name/i), "Store");
    await user.type(screen.getByLabelText(/shop domain/i), "not a domain");
    await user.click(screen.getByRole("button", { name: /connect shopify/i }));
    expect(
      await screen.findByText("Shop domain does not look right."),
    ).toBeInTheDocument();
    expect(screen.getByText("Access token is required.")).toBeInTheDocument();
    expect(api.connect).not.toHaveBeenCalled();
  });

  it("requires the account name", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: /connect mock marketplace/i }),
    );
    expect(
      await screen.findByText(/at least 2 characters/i),
    ).toBeInTheDocument();
    expect(api.connect).not.toHaveBeenCalled();
  });

  it("shows a failed attempt with its failing step and that the half-made account was removed", async () => {
    const user = userEvent.setup();
    api.connect.mockResolvedValue(
      connected({
        status: "failed",
        ok: false,
        account: null,
        cleanedUp: true,
        jobs: [],
        steps: [
          {
            name: "create_account",
            ok: true,
            skipped: false,
            message: null,
            durationMs: 3,
          },
          {
            name: "authorize",
            ok: false,
            skipped: false,
            message: "The marketplace rejected these credentials",
            durationMs: 90,
          },
        ],
        error: {
          code: "INVALID_CREDENTIALS",
          message: "The marketplace rejected these credentials",
        },
      }),
    );
    renderPage();
    await fillMock(user);
    await user.click(
      screen.getByRole("button", { name: /connect mock marketplace/i }),
    );

    expect(
      await screen.findByText(/could not be connected/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("The marketplace rejected these credentials").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/nothing is left half set up/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /edit details and retry/i }),
    );
    expect(screen.getByLabelText(/account name/i)).toHaveValue("My mock");
  });

  it("maps the API's per-field problems onto the inputs", async () => {
    const user = userEvent.setup();
    api.connect.mockRejectedValue(
      new ApiError({
        code: "VALIDATION_ERROR",
        message: "Invalid",
        status: 400,
        details: {
          issues: [
            { path: "credentials.sellerId", message: "Seller id is unknown" },
          ],
        },
      }),
    );
    renderPage();
    await fillMock(user);
    await user.click(
      screen.getByRole("button", { name: /connect mock marketplace/i }),
    );
    expect(await screen.findByText("Seller id is unknown")).toBeInTheDocument();
    expect(screen.getByLabelText(/seller id/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("explains an unverified email and offers to resend the verification mail", async () => {
    const user = userEvent.setup();
    resend.mockResolvedValue(undefined);
    api.connect.mockRejectedValue(
      new ApiError({
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email address before connecting a marketplace",
        status: 403,
      }),
    );
    renderPage();
    await fillMock(user);
    await user.click(
      screen.getByRole("button", { name: /connect mock marketplace/i }),
    );
    expect(
      await screen.findByText(/verify your email address/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /resend verification email/i }),
    );
    expect(resend).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/verification link sent/i),
    ).toBeInTheDocument();
  });

  it("redirect connectors: starts with a redirect URI, keeps the state, and sends the browser to the authorization URL", async () => {
    const user = userEvent.setup();
    api.connect.mockResolvedValue(
      connected({
        status: "awaiting_authorization",
        steps: [],
        jobs: [],
        redirect: {
          accountId: "acc9",
          authorizationUrl:
            "https://shop1.myshopify.com/admin/oauth/authorize?state=st-1234567890",
          state: "st-1234567890",
          expiresInSeconds: 600,
        },
      }),
    );
    renderPage("shopify");
    await user.type(
      await screen.findByLabelText(/account name/i),
      "Redirect store",
    );
    await user.click(
      screen.getByRole("radio", { name: /approve access on shopify/i }),
    );
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText(/shop domain/i),
      "shop1.myshopify.com",
    );
    await user.click(
      screen.getByRole("button", { name: /continue to shopify/i }),
    );

    await waitFor(() =>
      expect(redirect).toHaveBeenCalledWith(
        "https://shop1.myshopify.com/admin/oauth/authorize?state=st-1234567890",
      ),
    );
    const [input] = api.connect.mock.calls[0];
    expect(input.credentials).toBeUndefined();
    expect(input.config).toEqual({ shopDomain: "shop1.myshopify.com" });
    expect(input.redirectUri).toMatch(/\/marketplace-hub\/oauth\/callback$/);
    const pending = JSON.parse(
      sessionStorage.getItem("hub.pendingOauth") ?? "{}",
    );
    expect(pending).toMatchObject({
      connectorCode: "shopify",
      accountId: "acc9",
      state: "st-1234567890",
    });
    expect(
      await screen.findByText(/taking you to shopify/i),
    ).toBeInTheDocument();
  });

  it("is read-only for a viewer", async () => {
    useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read"] });
    renderPage();
    expect(await screen.findByText(/view-only access/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect mock marketplace/i }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/account name/i)).toBeDisabled();
  });

  it("answers not found for an unknown connector", async () => {
    renderPage("nope");
    expect(await screen.findByText("Connector not found")).toBeInTheDocument();
  });

  it("is honest about connectors that are not available yet and builds no form", async () => {
    renderPage("delhivery");
    expect(
      await screen.findByText("Delhivery cannot be connected yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This integration is not available yet"),
    ).toBeInTheDocument();
    expect(api.readiness).not.toHaveBeenCalled();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("retries when the directory fails to load", async () => {
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
    expect(await screen.findByLabelText(/account name/i)).toBeInTheDocument();
  });

  it("renders the Review step from the connector's real capabilities and continues to the form", async () => {
    const user = userEvent.setup();
    renderPage("mock", ""); // step 0 Review
    expect(await screen.findByText("Connection summary")).toBeInTheDocument();
    expect(screen.getByText("Data bridge")).toBeInTheDocument();
    expect(screen.getByText("What will connect")).toBeInTheDocument();
    expect(screen.getByText("Review access")).toBeInTheDocument();
    expect(screen.getByText("Catalog matching")).toBeInTheDocument();
    expect(screen.getByText("Connection status")).toBeInTheDocument();
    // the fixture connector offers orders and inventory only: nothing else is claimed
    expect(screen.getAllByText("Not offered by this connector").length).toBeGreaterThan(0);
    // nothing invented: no price, no placeholder catalogue size, no sample company
    expect(screen.queryByText(/₹|Demo pricing|427|1,286|Urban Carry/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Included in your workspace/).length).toBeGreaterThan(0);
    expect(screen.getByText("About this connector")).toBeInTheDocument();
    expect(screen.getByText("5 requests/s, burst 10")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /continue to authorization/i })[0]);
    expect(await screen.findByLabelText(/account name/i)).toBeInTheDocument();
    expect(screen.getByText(/authorize mock marketplace/i)).toBeInTheDocument();
  });

  it("does not jump to a later step from the URL: there is no account yet", async () => {
    renderPage("mock", "ready");
    expect(await screen.findByText("Connection summary")).toBeInTheDocument();
    expect(screen.queryByText("Mock Marketplace is connected.")).not.toBeInTheDocument();
  });
});

describe("the flow after connecting", () => {
  const user = userEvent.setup();

  const connectNow = async (over: Parameters<typeof connected>[0] = {}) => {
    api.connect.mockResolvedValue(connected(over));
    renderPage();
    await fillMock(user);
    await user.click(screen.getByRole("button", { name: /connect mock marketplace/i }));
    await screen.findByText("Account authorized");
  };
  const status = (over: Partial<SyncStatus>): SyncStatus => ({ accountId: "acc1", state: "idle", progress: null, active: [], latest: [], lastSyncedAt: null, nextSyncAt: null, ...over });

  it("verify shows the real account and test steps; a queued first sync is followed, and Ready appears only when the jobs finished", async () => {
    hub.accounts.mockResolvedValue(accounts([card({ id: "acc1", name: "My mock", marketplace: "mock", stats: { activeListings: 9, pendingOrders: 4, syncedInventoryItems: 8, errorCount: 0 } })]));
    hub.syncStatus
      .mockResolvedValueOnce(status({ state: "syncing", progress: 40, active: [job({ id: "j1", type: "orders", status: "running", progress: { total: 10, done: 4, failed: 0 } }), job({ id: "j2", type: "inventory", status: "queued" })] }))
      .mockResolvedValue(
        status({ latest: [job({ id: "j1", type: "orders", status: "succeeded", progress: { total: 10, done: 10, failed: 0 } }), job({ id: "j2", type: "inventory", status: "succeeded", progress: { total: 5, done: 5, failed: 0 } })], lastSyncedAt: "2026-10-23T10:00:00.000Z" }),
      );
    await connectNow();
    expect(screen.getByText("Access confirmed")).toBeInTheDocument();
    expect(screen.getAllByText("Complete").length).toBeGreaterThan(0); // verification, from the test step
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
    expect(screen.getByText("The marketplace accepted the credentials")).toBeInTheDocument();
    expect(screen.getByText(/This account is already connected/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /review the sync/i }));
    // while the jobs run: in progress, and never "complete"
    expect(await screen.findByText("Sync in progress")).toBeInTheDocument();
    expect(screen.queryByText("Mock Marketplace is connected.")).not.toBeInTheDocument();
    expect(hub.startSync).not.toHaveBeenCalled(); // the connect call had queued it already
    // once the real jobs finished, the flow moves on with their real counts
    expect(await screen.findByText("Mock Marketplace is connected.", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument(); // active listings of the account
    expect(screen.getByText("4")).toBeInTheDocument(); // open orders
    expect(screen.getByText(/10 of 10/)).toBeInTheDocument();
  }, 15000);

  it("without a first sync it asks, starts only the chosen scopes, and follows the new jobs", async () => {
    hub.accounts.mockResolvedValue(accounts([]));
    hub.startSync.mockResolvedValue({ accountId: "acc1", jobs: [{ scope: "orders", job: job({ id: "n1", type: "orders", status: "queued" }), created: true }], skipped: [{ scope: "catalog", reason: "Mock Marketplace does not support importing the catalogue" }] });
    hub.syncStatus.mockResolvedValue(status({ state: "syncing", active: [job({ id: "n1", type: "orders", status: "running", progress: { total: 0, done: 0, failed: 0 } })] }));
    await connectNow({ jobs: [] });
    expect(screen.getByText(/No first sync was queued|No first sync was requested/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start sync/i }));
    expect(await screen.findByText("Ready to sync")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start initial sync/i }));
    expect(hub.startSync).toHaveBeenCalledWith("acc1", ["catalog", "inventory", "orders"]);
    expect(await screen.findByText("Sync in progress")).toBeInTheDocument();
    expect(screen.getByText(/Product catalogue skipped/)).toBeInTheDocument();
  });

  it("a failed job shows the server's reason and a retry that reruns only the failed scope", async () => {
    hub.accounts.mockResolvedValue(accounts([]));
    hub.syncStatus.mockResolvedValue(
      status({
        latest: [job({ id: "j1", type: "orders", status: "failed", error: { code: "UPSTREAM", message: "Marketplace refused the order read" } }), job({ id: "j2", type: "inventory", status: "succeeded", progress: { total: 3, done: 3, failed: 0 } })],
        lastSyncedAt: null,
      }),
    );
    hub.startSync.mockResolvedValue({ accountId: "acc1", jobs: [{ scope: "orders", job: job({ id: "r1", type: "orders", status: "queued" }), created: true }], skipped: [] });
    await connectNow();
    await user.click(screen.getByRole("button", { name: /review the sync/i }));
    expect((await screen.findAllByText("Connection active · Sync needs attention")).length).toBeGreaterThan(0);
    expect(screen.getByText("Marketplace refused the order read")).toBeInTheDocument();
    expect(screen.getByText("No successful sync yet")).toBeInTheDocument();
    hub.syncStatus.mockResolvedValue(status({ state: "syncing", active: [job({ id: "r1", type: "orders", status: "running" })] }));
    await user.click(screen.getByRole("button", { name: /retry sync/i }));
    expect(hub.startSync).toHaveBeenCalledWith("acc1", ["orders"]);
    expect(await screen.findByText("Sync in progress")).toBeInTheDocument();
  });

  it("a sync that finished with failed items says so with the real counts", async () => {
    hub.accounts.mockResolvedValue(accounts([]));
    hub.syncStatus.mockResolvedValue(
      status({ latest: [job({ id: "j1", type: "orders", status: "partially_failed", progress: { total: 20, done: 17, failed: 3 }, failureDetails: [{ ref: "O-9", message: "Order O-9 has no SKU" }] }), job({ id: "j2", type: "inventory", status: "succeeded", progress: { total: 0, done: 0, failed: 0 } })] }),
    );
    await connectNow();
    await user.click(screen.getByRole("button", { name: /review the sync/i }));
    expect(await screen.findByText("Completed with exceptions")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Order O-9 has no SKU/)).toBeInTheDocument();
  });

  it("a viewer cannot start the sync", async () => {
    hub.accounts.mockResolvedValue(accounts([]));
    await connectNow({ jobs: [] });
    useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read"] });
    await user.click(screen.getByRole("button", { name: /start sync/i }));
    expect(await screen.findByRole("button", { name: /start initial sync/i })).toBeDisabled();
  });
});

describe("connect attempts", () => {
  const user = userEvent.setup();

  it("reuses the Idempotency-Key when the same attempt is repeated after a lost request, and uses a new one after the server answered", async () => {
    api.connect.mockRejectedValueOnce(new ApiError({ code: "NETWORK", message: "Could not reach the server", status: 0 }));
    api.connect.mockResolvedValueOnce(connected({ status: "failed", ok: false, account: null, cleanedUp: true, jobs: [], error: { code: "INVALID_CREDENTIALS", message: "Bad keys" } }));
    renderPage();
    await fillMock(user);
    const send = () => user.click(screen.getByRole("button", { name: /connect mock marketplace/i }));
    await send();
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    await send(); // same details again: the same attempt
    expect(await screen.findByText(/could not be connected/i)).toBeInTheDocument();
    expect(api.connect.mock.calls[1][1]).toBe(api.connect.mock.calls[0][1]);
    // the server answered "failed": editing and sending again is a new attempt
    await user.click(screen.getByRole("button", { name: /edit details and retry/i }));
    api.connect.mockResolvedValueOnce(connected());
    await send();
    await screen.findByText("Account authorized");
    expect(api.connect.mock.calls[2][1]).not.toBe(api.connect.mock.calls[0][1]);
  });

  it("shows the real reason of a failure and says the account was cleaned up only when the server says so", async () => {
    api.connect.mockResolvedValue(connected({ status: "failed", ok: false, account: null, cleanedUp: false, jobs: [], error: { code: "UPSTREAM_ERROR", message: "The marketplace is down" } }));
    renderPage();
    await fillMock(user);
    await user.click(screen.getByRole("button", { name: /connect mock marketplace/i }));
    expect(await screen.findByText("The marketplace is down")).toBeInTheDocument();
    expect(screen.queryByText(/nothing is left half set up/i)).not.toBeInTheDocument();
    expect(screen.getByText(/reconnect or delete it there/i)).toBeInTheDocument();
  });

  it("cancelling a redirect authorization removes the account that was prepared and tells the user", async () => {
    api.connect.mockResolvedValue(
      connected({
        status: "awaiting_authorization",
        ok: false,
        account: null,
        jobs: [],
        redirect: { accountId: "pending1", authorizationUrl: "https://shop.example/oauth", state: "s1", expiresInSeconds: 600 },
      }),
    );
    hub.remove.mockResolvedValue({ message: "deleted" });
    renderPage("shopify");
    await user.type(await screen.findByLabelText(/account name/i), "Store");
    await user.click(screen.getByLabelText(/approve access on shopify/i));
    await user.type(screen.getByLabelText(/shop domain/i), "store.myshopify.com");
    await user.click(screen.getByRole("button", { name: /continue to shopify/i }));
    expect(await screen.findByText("Waiting for authorization")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel connection/i }));
    await waitFor(() => expect(hub.remove).toHaveBeenCalledWith("pending1"));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Connection cancelled")).toBe(true));
  });

  it("the existing-connection guard lists the real accounts", async () => {
    hub.accounts.mockResolvedValue(accounts([card({ id: "e1", marketplace: "mock", name: "Live mock", accountIdentifier: "SELLER9" })]));
    renderPage("mock", "");
    expect(await screen.findByText("Existing connection found.")).toBeInTheDocument();
    expect(screen.getByText(/Live mock · SELLER9/)).toBeInTheDocument();
    expect(screen.queryByText(/₹|Demo pricing/)).not.toBeInTheDocument();
  });
});
