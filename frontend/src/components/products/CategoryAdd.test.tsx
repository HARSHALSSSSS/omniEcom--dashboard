import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";

const api = vi.hoisted(() => ({ createCategory: vi.fn() }));
vi.mock("@/api/productCreation.api", () => ({ productCreationApi: api }));

import { CategoryAdd } from "./CategoryAdd";

const choices = [
  { id: "c1", label: "Fashion" },
  { id: "c2", label: "  Footwear" },
];

function renderIt(onCreated = vi.fn(), disabled = false) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <CategoryAdd choices={choices} disabled={disabled} onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onCreated, spy };
}
const signIn = (permissions: string[]) =>
  useWorkspaceStore.getState().setSession({
    user: { id: "u1", fullName: "A", email: "a@x.test", businessName: "Nova", role: "owner" },
    permissions,
    shell: { user: { id: "u1", name: "A", initials: "A", roleLabel: "Owner" }, business: { id: "b1", name: "Nova", plan: "free", tier: "starter" }, badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 }, features: {} },
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });

beforeEach(() => {
  api.createCategory.mockReset();
  useWorkspaceStore.getState().clearWorkspace();
  signIn(["categories:write"]);
});

describe("Add category", () => {
  it("is not offered without the permission, or when the form is read-only", () => {
    useWorkspaceStore.getState().clearWorkspace();
    signIn(["products:read"]);
    renderIt();
    expect(screen.queryByRole("button", { name: "Add category" })).toBeNull();
  });

  it("creates a category under a parent, refreshes every category list and selects it", async () => {
    const user = userEvent.setup();
    api.createCategory.mockResolvedValue({ id: "new1", name: "Handloom Sarees", parentId: "c1", path: "fashion/handloom-sarees" });
    const { onCreated, spy } = renderIt();
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.type(screen.getByLabelText("New category name"), "Handloom Sarees");
    await user.selectOptions(screen.getByLabelText("Parent category (optional)"), "c1");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith({ name: "Handloom Sarees", parentId: "c1" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new1"));
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
    expect(keys).toContain('["productCreation","categories"]');
    expect(keys).toContain('["product-edit","categories"]');
  });

  it("refuses an empty name and a duplicate at top level before calling the server, and shows the server's 409", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Enter a category name.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New category name"), "fashion");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(api.createCategory).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("New category name"));
    await user.type(screen.getByLabelText("New category name"), "Fresh");
    api.createCategory.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "dup", status: 409 }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/already exists there/)).toBeInTheDocument();
  });
});
