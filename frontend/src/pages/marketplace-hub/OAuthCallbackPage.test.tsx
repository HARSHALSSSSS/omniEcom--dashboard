import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { account, connected } from "@/test/directoryFixtures";
import type { PendingOauth } from "@/types/directory";

const api = vi.hoisted(() => ({
  directory: vi.fn(),
  readiness: vi.fn(),
  connect: vi.fn(),
  oauthComplete: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/directory.api", () => ({ directoryApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));

import OAuthCallbackPage from "./OAuthCallbackPage";

const syncOptions = {
  syncCatalog: true,
  syncOrders: true,
  syncInventory: false,
  runFirstSync: true,
};
const pending: PendingOauth = {
  connectorCode: "shopify",
  connectorName: "Shopify",
  accountId: "acc9",
  state: "st-1234567890",
  syncOptions,
  redirectUri: "https://app.example.com/marketplace-hub/oauth/callback",
  returnPath: "/marketplace-hub/connect/shopify",
  startedAt: Date.now(),
};
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

function renderPage(query: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[`/marketplace-hub/oauth/callback${query}`]}
      >
        <Routes>
          <Route
            path="/marketplace-hub/oauth/callback"
            element={<OAuthCallbackPage />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useWorkspaceStore.setState({
    permissions: ["marketplace_accounts:read", "marketplace_accounts:write"],
  });
  refreshShell.mockResolvedValue(undefined);
});

describe("OAuthCallbackPage", () => {
  it("finishes the connection with code and state, shows the steps and clears the pending record", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("hub.pendingOauth", JSON.stringify(pending));
    api.oauthComplete.mockResolvedValue(
      connected({
        account: {
          ...account,
          name: "Redirect store",
          marketplace: "shopify",
          connectorName: "Shopify",
        },
      }),
    );
    renderPage("?code=abc&state=st-1234567890");

    expect(
      await screen.findByText("Redirect store is connected"),
    ).toBeInTheDocument();
    expect(api.oauthComplete).toHaveBeenCalledTimes(1);
    expect(api.oauthComplete).toHaveBeenCalledWith({
      state: "st-1234567890",
      code: "abc",
      redirectUri: pending.redirectUri,
      syncOptions,
    });
    expect(
      screen.getByRole("list", { name: /connection steps/i }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("hub.pendingOauth")).toBeNull();
    expect(refreshShell).toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /go to marketplace hub/i }),
    );
    expect(screen.getByTestId("where")).toHaveTextContent("/marketplace-hub");
  });

  it("passes the seller id that Amazon sends next to the code", async () => {
    sessionStorage.setItem("hub.pendingOauth", JSON.stringify(pending));
    api.oauthComplete.mockResolvedValue(connected());
    renderPage(
      "?spapi_oauth_code=zzz&state=st-1234567890&selling_partner_id=A1B2",
    );
    await screen.findByText(/is connected/i);
    expect(api.oauthComplete).toHaveBeenCalledWith(
      expect.objectContaining({ code: "zzz", externalAccountId: "A1B2" }),
    );
  });

  it("reports a failure from the API and offers to start again", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("hub.pendingOauth", JSON.stringify(pending));
    api.oauthComplete.mockRejectedValue(
      new ApiError({
        code: "BAD_REQUEST",
        message:
          "Invalid or expired authorization state; restart the connection",
        status: 400,
      }),
    );
    renderPage("?code=abc&state=st-1234567890");
    expect(
      await screen.findByText("The connection could not be finished"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/invalid or expired authorization state/i),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("hub.pendingOauth")).toBeNull();
    await user.click(screen.getByRole("button", { name: /start again/i }));
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/marketplace-hub/connect/shopify",
    );
  });

  it("shows a failed connect result with the failing step", async () => {
    sessionStorage.setItem("hub.pendingOauth", JSON.stringify(pending));
    api.oauthComplete.mockResolvedValue(
      connected({
        status: "failed",
        ok: false,
        account: null,
        cleanedUp: false,
        jobs: [],
        steps: [
          {
            name: "authorize",
            ok: false,
            skipped: false,
            message: "invalid_grant",
            durationMs: 40,
          },
        ],
        error: { code: "UPSTREAM_ERROR", message: "invalid_grant" },
      }),
    );
    renderPage("?code=abc&state=st-1234567890");
    expect(
      await screen.findByText(/could not be connected/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("invalid_grant").length).toBeGreaterThan(0);
  });

  it("ignores a response whose state does not match the one that was kept, and does not call the API", async () => {
    sessionStorage.setItem("hub.pendingOauth", JSON.stringify(pending));
    renderPage("?code=abc&state=someone-elses-state");
    expect(
      await screen.findByText("This authorization does not match"),
    ).toBeInTheDocument();
    expect(api.oauthComplete).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("hub.pendingOauth")).toBeNull();
  });

  it("explains when no connection was started in this browser session", async () => {
    renderPage("?code=abc&state=st-1234567890");
    expect(
      await screen.findByText("No connection is waiting to be finished"),
    ).toBeInTheDocument();
    expect(api.oauthComplete).not.toHaveBeenCalled();
  });

  it("shows the marketplace's refusal when the seller denied access", async () => {
    sessionStorage.setItem("hub.pendingOauth", JSON.stringify(pending));
    renderPage(
      "?error=access_denied&error_description=The+seller+declined&state=st-1234567890",
    );
    expect(
      await screen.findByText("Access was not approved"),
    ).toBeInTheDocument();
    expect(screen.getByText("The seller declined")).toBeInTheDocument();
    expect(api.oauthComplete).not.toHaveBeenCalled();
  });

  it("explains an incomplete link", async () => {
    renderPage("");
    expect(
      await screen.findByText("This link is incomplete"),
    ).toBeInTheDocument();
  });
});
