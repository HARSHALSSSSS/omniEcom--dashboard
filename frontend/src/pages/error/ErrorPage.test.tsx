import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ErrorPage } from "./ErrorPage";

afterEach(() => cleanup());

describe("ErrorPage", () => {
  it("renders 404 page with expected design elements and navigation links", () => {
    const router = createMemoryRouter(
      [{ path: "/404", element: <ErrorPage notFound status={404} /> }],
      { initialEntries: ["/404"] }
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("Commerce Operating System")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();

    // Check quick links
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Products/ })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: /Orders/ })).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
  });

  it("renders 500 system error view with reload action", () => {
    const handleRetry = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: "/error",
          element: (
            <ErrorPage
              status={500}
              error={new Error("Database connection timed out")}
              onRetry={handleRetry}
            />
          ),
        },
      ],
      { initialEntries: ["/error"] }
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    const reloadBtn = screen.getByRole("button", { name: "Reload" });
    expect(reloadBtn).toBeInTheDocument();

    fireEvent.click(reloadBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("toggles diagnostic details and allows copying metadata", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const router = createMemoryRouter(
      [
        {
          path: "/error",
          element: (
            <ErrorPage
              status={500}
              error={new Error("Custom diagnostic error")}
            />
          ),
        },
      ],
      { initialEntries: ["/error"] }
    );
    render(<RouterProvider router={router} />);

    // Initially diagnostic details are collapsed
    expect(screen.queryByText("Technical metadata")).not.toBeInTheDocument();

    // Expand diagnostics
    const toggleBtn = screen.getByRole("button", { name: /Diagnostic details/ });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("Technical metadata")).toBeInTheDocument();
    expect(screen.getAllByText(/Custom diagnostic error/).length).toBeGreaterThanOrEqual(1);

    // Click Copy button
    const copyBtn = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });

  it("renders safely outside a React Router context without throwing", () => {
    // Render without RouterProvider
    render(<ErrorPage notFound status={404} />);

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the dashboard" })).toHaveAttribute("href", "/");
  });
});

describe("ErrorPage go-back", () => {
  it("goes back through the browser history without needing a router", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    Object.defineProperty(window.history, "length", { value: 3, configurable: true });
    render(<ErrorPage notFound status={404} />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
});
