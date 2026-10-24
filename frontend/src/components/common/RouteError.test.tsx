import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RouteError } from "./RouteError";

afterEach(() => cleanup());

describe("RouteError", () => {
  it("shows a readable not-found page for an unknown address", () => {
    const router = createMemoryRouter([{ errorElement: <RouteError />, children: [{ path: "/", element: <p>home</p> }, { path: "*", element: <RouteError notFound /> }] }], { initialEntries: ["/no-such-page"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the dashboard" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/Hey developer/)).not.toBeInTheDocument();
  });

  it("shows a calm retry screen when a page crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error("kaboom");
    };
    const router = createMemoryRouter([{ errorElement: <RouteError />, children: [{ path: "/", element: <Boom /> }] }], { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByText("kaboom")).not.toBeInTheDocument();
  });
});
