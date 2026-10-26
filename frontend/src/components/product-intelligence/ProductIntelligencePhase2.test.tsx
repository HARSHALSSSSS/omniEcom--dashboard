import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductKpiStrip } from "./ProductKpiStrip";
import { PrioritizedOpportunities } from "./PrioritizedOpportunities";
import { ProductPortfolioCharts } from "./ProductPortfolioCharts";
import { ProductPerformanceTable } from "./ProductPerformanceTable";

describe("ProductKpiStrip", () => {
  it("renders 5 core KPI tiles with formatted numbers", () => {
    render(<ProductKpiStrip />);

    expect(screen.getByText("Commerce performance · 6 illustrative products")).toBeInTheDocument();
    expect(screen.getByText("Net sales")).toBeInTheDocument();
    expect(screen.getByText("₹21.00L")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("1,400")).toBeInTheDocument();
    expect(screen.getByText("Average order value")).toBeInTheDocument();
    expect(screen.getByText("₹1,500")).toBeInTheDocument();
    expect(screen.getByText("Gross margin")).toBeInTheDocument();
    expect(screen.getByText("32.0%")).toBeInTheDocument();
    expect(screen.getByText("Prioritized products")).toBeInTheDocument();
    expect(screen.getByText("3 of 6")).toBeInTheDocument();
  });
});

describe("PrioritizedOpportunities", () => {
  it("renders P1, P2 and P3 opportunity alert cards", () => {
    render(<PrioritizedOpportunities onInspectProduct={vi.fn()} />);

    expect(screen.getByText("Prioritized opportunities")).toBeInTheDocument();
    expect(screen.getByText("P1 · Review first")).toBeInTheDocument();
    expect(screen.getByText("Stock risk")).toBeInTheDocument();
    expect(screen.getByText("Cotton throw")).toBeInTheDocument();

    expect(screen.getByText("P2 · Review margin")).toBeInTheDocument();
    expect(screen.getByText("Margin gap")).toBeInTheDocument();
    expect(screen.getByText("Stoneware dinner set")).toBeInTheDocument();

    expect(screen.getByText("P3 · Review inventory")).toBeInTheDocument();
    expect(screen.getByText("Slow mover")).toBeInTheDocument();
    expect(screen.getByText("Linen cushion")).toBeInTheDocument();
  });

  it("calls onInspectProduct with SKU and title when Inspect product clicked", async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    render(<PrioritizedOpportunities onInspectProduct={onInspect} />);

    const buttons = screen.getAllByRole("button", { name: "Inspect product" });
    await user.click(buttons[0]);
    expect(onInspect).toHaveBeenCalledWith("NL-THR-002", "Cotton throw");
  });
});

describe("ProductPerformanceTable", () => {
  it("renders the 6 products from Figma and the summary totals", () => {
    render(<ProductPerformanceTable onInspectProduct={vi.fn()} />);

    expect(screen.getByText("Product performance")).toBeInTheDocument();
    expect(screen.getByText("6 products · All channels · Illustrative examples")).toBeInTheDocument();
    expect(screen.getByText("Cotton throw")).toBeInTheDocument();
    expect(screen.getByText("Stoneware dinner set")).toBeInTheDocument();
    expect(screen.getByText("Linen cushion")).toBeInTheDocument();
    expect(screen.getByText("Arc table lamp")).toBeInTheDocument();
    expect(screen.getByText("Ceramic vase")).toBeInTheDocument();
    expect(screen.getByText("Bamboo organizer")).toBeInTheDocument();

    expect(screen.getByText("P1 · Stock risk")).toBeInTheDocument();
    expect(screen.getByText("P2 · Margin gap")).toBeInTheDocument();
    expect(screen.getByText("P3 · Slow mover")).toBeInTheDocument();
    expect(screen.getByText("Top seller")).toBeInTheDocument();

    expect(screen.getByText("Showing 6 of 6 products")).toBeInTheDocument();
    expect(screen.getByText("₹21,00,000")).toBeInTheDocument();
  });

  it("filters rows when filter chips or search are used", async () => {
    const user = userEvent.setup();
    render(<ProductPerformanceTable onInspectProduct={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Prioritized 3" }));
    expect(screen.getByText("Cotton throw")).toBeInTheDocument();
    expect(screen.queryByText("Arc table lamp")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search products"), "Linen");
    expect(screen.getByText("Linen cushion")).toBeInTheDocument();
    expect(screen.queryByText("Cotton throw")).not.toBeInTheDocument();
  });
});

describe("ProductPortfolioCharts", () => {
  it("renders Where sales come from distribution and Portfolio at a glance card", () => {
    render(<ProductPortfolioCharts onInspectTopRisk={vi.fn()} />);

    expect(screen.getByText("Where sales come from")).toBeInTheDocument();
    expect(screen.getByText("Arc table lamp")).toBeInTheDocument();
    expect(screen.getByText("28.6%")).toBeInTheDocument();
    expect(screen.getByText("Cotton throw")).toBeInTheDocument();
    expect(screen.getByText("21.4%")).toBeInTheDocument();

    expect(screen.getByText("Two products contribute 50% of net sales.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect Cotton throw" })).toBeInTheDocument();
    expect(screen.getByText("How to read these signals")).toBeInTheDocument();
  });

  it("calls onInspectTopRisk when clicking Inspect Cotton throw", async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    render(<ProductPortfolioCharts onInspectTopRisk={onInspect} />);

    await user.click(screen.getByRole("button", { name: "Inspect Cotton throw" }));
    expect(onInspect).toHaveBeenCalled();
  });
});

