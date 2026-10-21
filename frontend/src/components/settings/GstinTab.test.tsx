import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";
import { gstin as makeGstin } from "@/test/settingsFixtures";
import type { GstinCheck } from "@/types/settings";

const api = vi.hoisted(() => ({
  gstStates: vi.fn(),
  validateGstin: vi.fn(),
  addGstin: vi.fn(),
  updateGstin: vi.fn(),
  setPrimaryGstin: vi.fn(),
  deleteGstin: vi.fn(),
}));
vi.mock("@/api/settings.api", () => ({ settingsApi: api }));

import { GstinTab } from "./GstinTab";

const KA = "29AABCN8412P1ZX";
const check = (over: Partial<GstinCheck> = {}): GstinCheck => ({ valid: true, gstin: KA, problem: null, stateCode: "29", stateName: "Karnataka", pan: "AABCN8412P", panMatchesBusiness: true, expectedCheckChar: null, ...over });

const mh = makeGstin();
const ka = makeGstin({ id: "g-ka", gstin: KA, stateCode: "29", stateName: "Karnataka", isPrimary: false, tradeName: "Nova Bengaluru", registeredAddress: "Indiranagar, Bengaluru" });
const inactive = makeGstin({ id: "g-tn", gstin: "33AABCN8412P1Z8", stateCode: "33", stateName: "Tamil Nadu", isPrimary: false, status: "inactive", tradeName: null });

function renderTab(gstins = [mh, ka], canWrite = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <GstinTab gstins={gstins} canWrite={canWrite} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.gstStates.mockResolvedValue([
    { code: "27", name: "Maharashtra" },
    { code: "29", name: "Karnataka" },
  ]);
});

describe("GSTIN registrations", () => {
  it("lists the registrations with state, primary and status", () => {
    renderTab([mh, ka, inactive]);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(4);
    const [, first, second, third] = rows as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(within(first).getByText("Maharashtra")).toBeInTheDocument();
    expect(within(first).getByText("Primary")).toBeInTheDocument();
    expect(within(second).getByText("Nova Bengaluru")).toBeInTheDocument();
    expect(within(third).getByText("Inactive")).toBeInTheDocument();
  });

  it("is read-only without write access", () => {
    renderTab([mh, ka], false);
    expect(screen.queryByRole("button", { name: "Add GSTIN" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access/)).toBeInTheDocument();
  });

  it("checks a GSTIN while typing and registers it", async () => {
    const user = userEvent.setup();
    api.validateGstin.mockResolvedValue(check());
    api.addGstin.mockResolvedValue(ka);
    const { invalidate } = renderTab([mh]);
    await user.click(screen.getByRole("button", { name: "Add GSTIN" }));
    const input = await screen.findByLabelText("GSTIN");
    await user.type(input, "29");
    expect(await screen.findByText(/2\/15 characters · Karnataka/)).toBeInTheDocument();
    await user.type(input, KA.slice(2).toLowerCase());
    expect(input).toHaveValue(KA);
    expect(await screen.findByText(/Valid GSTIN · Karnataka \(29\)/)).toBeInTheDocument();
    expect(screen.getByText(/matches your business PAN/)).toBeInTheDocument();
    expect(api.validateGstin).toHaveBeenCalledWith(KA, expect.anything());
    await user.type(screen.getByLabelText("Trade name"), "Nova Bengaluru");
    await user.click(screen.getByRole("button", { name: "Register GSTIN" }));
    await waitFor(() => expect(api.addGstin).toHaveBeenCalledWith({ gstin: KA, legalName: null, tradeName: "Nova Bengaluru", status: "active", notes: null, makePrimary: false }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["settings", "overview"] });
  });

  it("explains an invalid check character and blocks the registration", async () => {
    const user = userEvent.setup();
    api.validateGstin.mockResolvedValue(check({ valid: false, problem: "checksum", expectedCheckChar: "X", stateCode: "29", stateName: "Karnataka" }));
    renderTab([mh]);
    await user.click(screen.getByRole("button", { name: "Add GSTIN" }));
    await user.type(await screen.findByLabelText("GSTIN"), "29AABCN8412P1Z1");
    expect(await screen.findByText(/last character does not match/)).toBeInTheDocument();
    expect(screen.getByText(/should be X/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register GSTIN" })).toBeDisabled();
  });

  it("warns when the PAN inside does not match the business PAN", async () => {
    const user = userEvent.setup();
    api.validateGstin.mockResolvedValue(check({ pan: "AAPFU0939F", panMatchesBusiness: false }));
    renderTab([mh]);
    await user.click(screen.getByRole("button", { name: "Add GSTIN" }));
    await user.type(await screen.findByLabelText("GSTIN"), KA);
    expect(await screen.findByText(/does not match your business PAN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register GSTIN" })).toBeDisabled();
  });

  it("shows the duplicate message from the server", async () => {
    const user = userEvent.setup();
    api.validateGstin.mockResolvedValue(check());
    api.addGstin.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "dup", status: 409, details: { rule: "gstin_duplicate" } }));
    renderTab([mh]);
    await user.click(screen.getByRole("button", { name: "Add GSTIN" }));
    await user.type(await screen.findByLabelText("GSTIN"), KA);
    await screen.findByText(/Valid GSTIN/);
    await user.click(screen.getByRole("button", { name: "Register GSTIN" }));
    expect(await screen.findByText("This GSTIN is already registered for your business.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("edits a registration with its version and marks it inactive", async () => {
    const user = userEvent.setup();
    api.updateGstin.mockResolvedValue({ ...ka, status: "inactive" });
    renderTab([mh, ka]);
    await user.click(screen.getByRole("button", { name: `Edit ${KA}` }));
    await user.selectOptions(await screen.findByLabelText("Status"), "inactive");
    await user.click(screen.getByRole("button", { name: "Save registration" }));
    await waitFor(() =>
      expect(api.updateGstin).toHaveBeenCalledWith("g-ka", { version: 1, legalName: "Nova Living Brands Pvt Ltd", tradeName: "Nova Bengaluru", registeredAddress: "Indiranagar, Bengaluru", status: "inactive", notes: null }),
    );
    expect(api.validateGstin).not.toHaveBeenCalled();
  });

  it("makes a registration primary", async () => {
    const user = userEvent.setup();
    api.setPrimaryGstin.mockResolvedValue({ ...ka, isPrimary: true });
    renderTab([mh, ka]);
    await user.click(screen.getByRole("button", { name: `Make ${KA} the primary GSTIN` }));
    await waitFor(() => expect(api.setPrimaryGstin).toHaveBeenCalledWith("g-ka"));
  });

  it("confirms before deleting and deletes", async () => {
    const user = userEvent.setup();
    api.deleteGstin.mockResolvedValue({ deleted: true });
    renderTab([mh, ka]);
    await user.click(screen.getByRole("button", { name: `Delete ${KA}` }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/is removed from your business/)).toBeInTheDocument();
    expect(api.deleteGstin).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.deleteGstin).toHaveBeenCalledWith("g-ka"));
  });

  it("shows why the primary registration cannot be deleted", async () => {
    const user = userEvent.setup();
    api.deleteGstin.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "no", status: 409, details: { rule: "gstin_primary_required" } }));
    renderTab([mh, ka]);
    await user.click(screen.getByRole("button", { name: `Delete ${mh.gstin}` }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText(/cannot be deactivated or removed while other registrations exist/)).toBeInTheDocument();
  });
});
