import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { useUiStore } from "@/store/ui.store";

afterEach(() => {
  cleanup();
  useUiStore.setState({ mobileNavOpen: false });
});

describe("MobileNavDrawer", () => {
  it("renders navigation groups and closes when a link is clicked", () => {
    useUiStore.setState({ mobileNavOpen: true });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileNavDrawer />
      </MemoryRouter>,
    );

    expect(screen.getByText("[Product Name]")).toBeInTheDocument();
    expect(screen.getByText("Commerce Operating System")).toBeInTheDocument();

    const ordersLink = screen.getByRole("link", { name: /orders/i });
    expect(ordersLink).toBeInTheDocument();

    // Clicking orders link should close the mobile drawer
    fireEvent.click(ordersLink);
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });

  it("links user profile to profile settings and provides sign out", () => {
    useUiStore.setState({ mobileNavOpen: true });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileNavDrawer />
      </MemoryRouter>,
    );

    const profileLink = screen.getByTitle("Profile settings");
    expect(profileLink).toHaveAttribute("href", "/settings/profile");

    const signOutBtn = screen.getByRole("button", { name: "Sign out" });
    expect(signOutBtn).toBeInTheDocument();
  });
});

