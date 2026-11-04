import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfitDateRangeDropdown } from "./ProfitDateRangeDropdown";

describe("ProfitDateRangeDropdown", () => {
  const defaultProps = {
    preset: "30d" as const,
    range: { from: "2026-10-06", to: "2026-11-04" },
    rangeError: null,
    customFrom: "",
    customTo: "",
    currency: "INR",
    compare: true,
    onPreset: vi.fn(),
    onCustom: vi.fn(),
    onCompare: vi.fn(),
  };

  it("renders the trigger button with the active preset and formatted dates", () => {
    render(<ProfitDateRangeDropdown {...defaultProps} />);

    expect(screen.getByRole("button", { name: /Select date range/i })).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("INR")).toBeInTheDocument();
  });

  it("opens the dropdown menu on click and lists presets", async () => {
    const user = userEvent.setup();
    render(<ProfitDateRangeDropdown {...defaultProps} />);

    const trigger = screen.getByRole("button", { name: /Select date range/i });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Select date range" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 7 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 30 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 90 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Year to date" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom range" })).toBeInTheDocument();
  });

  it("calls onPreset and closes when selecting a standard preset", async () => {
    const user = userEvent.setup();
    const onPreset = vi.fn();
    render(<ProfitDateRangeDropdown {...defaultProps} onPreset={onPreset} />);

    await user.click(screen.getByRole("button", { name: /Select date range/i }));
    await user.click(screen.getByRole("button", { name: "Last 90 days" }));

    expect(onPreset).toHaveBeenCalledWith("90d");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onCustom for Last 7 days", async () => {
    const user = userEvent.setup();
    const onCustom = vi.fn();
    render(<ProfitDateRangeDropdown {...defaultProps} onCustom={onCustom} />);

    await user.click(screen.getByRole("button", { name: /Select date range/i }));
    await user.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(onCustom).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("toggles compare with previous period", async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    render(<ProfitDateRangeDropdown {...defaultProps} onCompare={onCompare} />);

    await user.click(screen.getByRole("button", { name: /Select date range/i }));
    const checkbox = screen.getByRole("checkbox", { name: /Compare with previous period/i });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(onCompare).toHaveBeenCalledWith(false);
  });

  it("allows entering and applying a custom date range", async () => {
    const user = userEvent.setup();
    const onCustom = vi.fn();
    render(<ProfitDateRangeDropdown {...defaultProps} onCustom={onCustom} />);

    await user.click(screen.getByRole("button", { name: /Select date range/i }));
    await user.click(screen.getByRole("button", { name: "Custom range" }));

    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    await user.clear(fromInput);
    await user.type(fromInput, "2026-10-01");
    await user.clear(toInput);
    await user.type(toInput, "2026-10-15");

    await user.click(screen.getByRole("button", { name: "Apply Range" }));
    expect(onCustom).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-15" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows validation error if start date is after end date", async () => {
    const user = userEvent.setup();
    const onCustom = vi.fn();
    render(<ProfitDateRangeDropdown {...defaultProps} onCustom={onCustom} />);

    await user.click(screen.getByRole("button", { name: /Select date range/i }));
    await user.click(screen.getByRole("button", { name: "Custom range" }));

    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    await user.clear(fromInput);
    await user.type(fromInput, "2026-10-20");
    await user.clear(toInput);
    await user.type(toInput, "2026-10-10");

    await user.click(screen.getByRole("button", { name: "Apply Range" }));
    expect(onCustom).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("The start date must not be after the end date.");
  });

  it("applies responsive left-aligned styling on small screen viewports", async () => {
    const originalInnerWidth = window.innerWidth;
    window.innerWidth = 375;
    try {
      const user = userEvent.setup();
      render(<ProfitDateRangeDropdown {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Select date range/i }));
      const dialog = screen.getByRole("dialog", { name: "Select date range" });
      expect(dialog).toBeInTheDocument();
      // Should include left-0 alignment class and responsive width
      expect(dialog.className).toContain("left-0");
      expect(dialog.className).toContain("w-[calc(100vw-2rem)]");
    } finally {
      window.innerWidth = originalInnerWidth;
    }
  });
});

