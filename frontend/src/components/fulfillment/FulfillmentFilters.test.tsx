import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FulfillmentFilters } from "./FulfillmentFilters";
import type { FulfillmentUrlState } from "./fulfillmentParams";
import type { CarrierOption, WarehouseOption } from "@/types/fulfillment";

const MOCK_WAREHOUSES: WarehouseOption[] = [
  { id: "wh-1", name: "Home Inventory", code: "WH-1" },
  { id: "wh-2", name: "Mumbai Hub", code: "WH-2" },
];

const MOCK_CARRIERS: CarrierOption[] = [
  { providerCode: "delhivery", name: "Delhivery" },
  { providerCode: "bluedart", name: "BlueDart" },
];

const DEFAULT_STATE: FulfillmentUrlState = {
  tab: "awaiting_pick",
  q: "",
  warehouse: undefined,
  carrier: undefined,
  priority: undefined,
  hasException: undefined,
  exceptionStatus: "open",
  page: 1,
  size: 25,
};

describe("FulfillmentFilters", () => {
  it("renders search and dropdown trigger buttons with design matching other screens", () => {
    render(
      <FulfillmentFilters
        state={DEFAULT_STATE}
        warehouses={MOCK_WAREHOUSES}
        carriers={MOCK_CARRIERS}
        filtered={false}
        onSearch={vi.fn()}
        onWarehouse={vi.fn()}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("Order / SKU / barcode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warehouse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carrier" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Priority" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exceptions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort: SLA: soonest first/ })).toBeInTheDocument();
  });

  it("opens dropdown menu on click, displays options with checkmark on selected, and selects an option", async () => {
    const onWarehouse = vi.fn();
    render(
      <FulfillmentFilters
        state={DEFAULT_STATE}
        warehouses={MOCK_WAREHOUSES}
        carriers={MOCK_CARRIERS}
        filtered={false}
        onSearch={vi.fn()}
        onWarehouse={onWarehouse}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const warehouseBtn = screen.getByRole("button", { name: "Warehouse" });
    await userEvent.click(warehouseBtn);

    // Dropdown menu should be visible
    const menu = screen.getByRole("menu", { name: "Warehouse" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "All warehouses" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Home Inventory" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Mumbai Hub" })).toBeInTheDocument();

    // Select "Mumbai Hub"
    await userEvent.click(screen.getByRole("menuitem", { name: "Mumbai Hub" }));
    expect(onWarehouse).toHaveBeenCalledWith("wh-2");

    // Menu closes after selection
    expect(screen.queryByRole("menu", { name: "Warehouse" })).not.toBeInTheDocument();
  });

  it("displays active label and highlighted border when a filter has a value", () => {
    render(
      <FulfillmentFilters
        state={{
          ...DEFAULT_STATE,
          warehouse: "wh-2",
          priority: "urgent",
        }}
        warehouses={MOCK_WAREHOUSES}
        carriers={MOCK_CARRIERS}
        filtered={true}
        onSearch={vi.fn()}
        onWarehouse={vi.fn()}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const warehouseBtn = screen.getByRole("button", { name: "Warehouse: Mumbai Hub" });
    expect(warehouseBtn).toBeInTheDocument();
    expect(warehouseBtn.className).toContain("border-[#000000]");

    const priorityBtn = screen.getByRole("button", { name: "Priority: Urgent" });
    expect(priorityBtn).toBeInTheDocument();
    expect(priorityBtn.className).toContain("border-[#000000]");

    // Clear filters button should be visible when filtered=true
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("allows selecting 'All warehouses' to clear the filter", async () => {
    const onWarehouse = vi.fn();
    render(
      <FulfillmentFilters
        state={{
          ...DEFAULT_STATE,
          warehouse: "wh-2",
        }}
        warehouses={MOCK_WAREHOUSES}
        carriers={MOCK_CARRIERS}
        filtered={true}
        onSearch={vi.fn()}
        onWarehouse={onWarehouse}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Warehouse: Mumbai Hub" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "All warehouses" }));
    expect(onWarehouse).toHaveBeenCalledWith(null);
  });

  it("closes the dropdown when Escape key is pressed", async () => {
    render(
      <FulfillmentFilters
        state={DEFAULT_STATE}
        warehouses={MOCK_WAREHOUSES}
        carriers={MOCK_CARRIERS}
        filtered={false}
        onSearch={vi.fn()}
        onWarehouse={vi.fn()}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Warehouse" }));
    expect(screen.getByRole("menu", { name: "Warehouse" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Warehouse" })).not.toBeInTheDocument();
  });

  it("omits Carrier dropdown when carriers is null", () => {
    render(
      <FulfillmentFilters
        state={DEFAULT_STATE}
        warehouses={MOCK_WAREHOUSES}
        carriers={null}
        filtered={false}
        onSearch={vi.fn()}
        onWarehouse={vi.fn()}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Carrier" })).not.toBeInTheDocument();
  });

  it("switches to Exception status dropdown when on exceptions tab", async () => {
    const onExceptionStatus = vi.fn();
    render(
      <FulfillmentFilters
        state={{
          ...DEFAULT_STATE,
          tab: "exceptions",
          exceptionStatus: "resolved",
        }}
        warehouses={MOCK_WAREHOUSES}
        carriers={MOCK_CARRIERS}
        filtered={true}
        onSearch={vi.fn()}
        onWarehouse={vi.fn()}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={onExceptionStatus}
        onClear={vi.fn()}
      />
    );

    const btn = screen.getByRole("button", { name: "Exception status: Resolved" });
    expect(btn).toBeInTheDocument();

    await userEvent.click(btn);
    await userEvent.click(screen.getByRole("menuitem", { name: "Dismissed" }));
    expect(onExceptionStatus).toHaveBeenCalledWith("dismissed");
  });

  it("supports sorting dropdown selection", async () => {
    const onSort = vi.fn();
    render(
      <FulfillmentFilters
        state={DEFAULT_STATE}
        warehouses={MOCK_WAREHOUSES}
        carriers={MOCK_CARRIERS}
        filtered={false}
        sort="sla_soonest"
        onSort={onSort}
        onSearch={vi.fn()}
        onWarehouse={vi.fn()}
        onCarrier={vi.fn()}
        onPriority={vi.fn()}
        onException={vi.fn()}
        onExceptionStatus={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const sortBtn = screen.getByRole("button", { name: /Sort: SLA: soonest first/ });
    await userEvent.click(sortBtn);
    await userEvent.click(screen.getByRole("menuitem", { name: "Order: newest first" }));
    expect(onSort).toHaveBeenCalledWith("order_newest");
  });
});
