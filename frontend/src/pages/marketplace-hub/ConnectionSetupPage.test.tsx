import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
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
const resend = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/directory.api", () => ({ directoryApi: api }));
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

    await screen.findByText("My mock is connected");
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

  it("renders the Figma Review step and transitions to Authorize step on clicking Continue to authorization", async () => {
    const user = userEvent.setup();
    renderPage("mock", ""); // step 0 Review
    expect(await screen.findByText("Connection summary")).toBeInTheDocument();
    expect(screen.getByText("Data bridge")).toBeInTheDocument();
    expect(screen.getByText("What will connect")).toBeInTheDocument();
    expect(screen.getByText("Review access")).toBeInTheDocument();
    expect(screen.getByText("Catalog matching")).toBeInTheDocument();
    expect(screen.getByText("Connection status")).toBeInTheDocument();

    const continueButtons = screen.getAllByRole("button", {
      name: /continue to authorization/i,
    });
    expect(continueButtons.length).toBeGreaterThan(0);
    await user.click(continueButtons[0]);

    expect(await screen.findByLabelText(/account name/i)).toBeInTheDocument();
    expect(screen.getByText(/authorize mock marketplace/i)).toBeInTheDocument();
  });

  it("renders the Verify step and transitions to Sync step", async () => {
    const user = userEvent.setup();
    renderPage("mock", "verify");
    expect(await screen.findByText("Account authorized")).toBeInTheDocument();
    expect(screen.getByText("Access confirmed")).toBeInTheDocument();
    expect(screen.getAllByText(/approved/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /start sync/i }));
    expect(await screen.findByText("Ready to sync")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start initial sync/i })).toBeInTheDocument();
  });

  it("renders the Ready step when connection is complete", async () => {
    renderPage("mock", "ready");
    expect(await screen.findByText("Mock Marketplace is connected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage connection/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view products/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view listings/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view sync activity/i })).toBeInTheDocument();
  });
});

