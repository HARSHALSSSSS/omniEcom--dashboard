import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderDateDropdown } from "./OrderDateDropdown";

describe("OrderDateDropdown", () => {
  it("renders with default label 'Date' when no date is selected", () => {
    render(<OrderDateDropdown onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Date" })).toBeInTheDocument();
  });

  it("renders with active label when a preset is selected", () => {
    render(<OrderDateDropdown date="today" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Date: Today" })).toBeInTheDocument();
  });

  it("opens the dropdown menu on click and lists presets", async () => {
    const user = userEvent.setup();
    render(<OrderDateDropdown onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Date" }));

    expect(screen.getByRole("dialog", { name: "Order date filter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Any date" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yesterday" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 7 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 30 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom date / range" })).toBeInTheDocument();
  });

  it("selects 'Today' preset and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderDateDropdown onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(onChange).toHaveBeenCalledWith({
      date: "today",
      placedFrom: null,
      placedTo: null,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("selects 'Last 7 days' preset and calls onChange with placedFrom and placedTo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderDateDropdown onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        date: null,
        placedFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/),
        placedTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/),
      })
    );
  });

  it("allows entering and applying a custom date range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderDateDropdown onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(screen.getByRole("button", { name: "Custom date / range" }));

    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    await user.clear(fromInput);
    await user.type(fromInput, "2026-10-01");
    await user.clear(toInput);
    await user.type(toInput, "2026-10-15");

    await user.click(screen.getByRole("button", { name: "Apply Range" }));

    expect(onChange).toHaveBeenCalledWith({
      date: null,
      placedFrom: "2026-10-01T00:00:00.000Z",
      placedTo: "2026-10-15T23:59:59.999Z",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows error if start date is after end date in custom range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderDateDropdown onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(screen.getByRole("button", { name: "Custom date / range" }));

    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    await user.clear(fromInput);
    await user.type(fromInput, "2026-10-20");
    await user.clear(toInput);
    await user.type(toInput, "2026-10-10");

    await user.click(screen.getByRole("button", { name: "Apply Range" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Start date cannot be after end date.");
  });

  it("maintains backward compatibility with accessible native select", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderDateDropdown onChange={onChange} />);

    const nativeSelect = screen.getByLabelText("Date");
    await user.selectOptions(nativeSelect, "today");

    expect(onChange).toHaveBeenCalledWith({
      date: "today",
      placedFrom: null,
      placedTo: null,
    });
  });
});

