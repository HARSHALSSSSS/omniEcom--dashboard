import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPanel } from "./NotificationsPanel";
import { useUiStore } from "@/store/ui.store";
import { workspaceApi } from "@/api/workspace.api";

vi.mock("@/api/workspace.api", () => ({ workspaceApi: { notifications: vi.fn() } }));

beforeEach(() => {
  vi.mocked(workspaceApi.notifications).mockResolvedValue({ items: [], nextBefore: null } as never);
  useUiStore.setState({ notificationsPanelOpen: true });
});
afterEach(() => {
  cleanup();
  useUiStore.setState({ notificationsPanelOpen: false });
});

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <NotificationsPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NotificationsPanel keyboard", () => {
  it("is a labelled modal dialog that takes focus and closes on Escape", async () => {
    renderPanel();
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
    expect(useUiStore.getState().notificationsPanelOpen).toBe(false);
  });
});
