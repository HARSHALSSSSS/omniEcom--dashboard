import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { PurchaseOrder } from "@/types/procurement";
import type { VariantGridItem } from "@/types/variants";

// each api is slow on purpose: the second submit arrives while the first request is still in flight
const slow = <T,>(value: T) => vi.fn(() => new Promise<T>((resolve) => setTimeout(() => resolve(value), 40)));

const procurement = vi.hoisted(() => ({ createSupplier: vi.fn(), cancelOrder: vi.fn(), approveOrder: vi.fn() }));
const inventory = vi.hoisted(() => ({ createPreset: vi.fn() }));
const variants = vi.hoisted(() => ({ quickAdjust: vi.fn(), warehouses: vi.fn() }));
const auth = vi.hoisted(() => ({ forgotPassword: vi.fn() }));

vi.mock("@/api/procurement.api", async (orig) => ({ ...(await orig<object>()), procurementApi: { ...((await orig<{ procurementApi: object }>()).procurementApi), ...procurement } }));
vi.mock("@/api/inventory.api", async (orig) => ({ ...(await orig<object>()), inventoryApi: { ...((await orig<{ inventoryApi: object }>()).inventoryApi), ...inventory } }));
vi.mock("@/api/variants.api", async (orig) => ({ ...(await orig<object>()), variantsApi: { ...((await orig<{ variantsApi: object }>()).variantsApi), ...variants } }));
vi.mock("@/api/auth.api", async (orig) => ({ ...(await orig<object>()), authApi: { ...((await orig<{ authApi: object }>()).authApi), ...auth } }));

import { SaveViewDialog } from "@/components/inventory/SavedFilters";
import { SupplierDialog } from "@/components/procurement/SupplierDialog";
import { CancelOrderDialog, DateActionDialog } from "@/components/procurement/PoActionDialogs";
import { StockDialog } from "@/components/products/variants/StockDialog";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";

const order = { id: "po-1", poNumber: "PO-1", version: 3, status: "draft", supplierName: "Acme", warehouseName: "Main", unitsOrdered: 5, unitsReceived: 0, unitsDamaged: 0, unitsOutstanding: 5, expectedAt: null, lines: [] } as unknown as PurchaseOrder;
const variant = { id: "v-1", productId: "p-1", sku: "SKU-1", name: "Blue", stock: { available: 10, threshold: 3, status: "in_stock" }, version: 1 } as unknown as VariantGridItem;

function renderIt(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** two clicks inside one task, before the button can re-render as disabled */
const doubleClick = (el: HTMLElement) =>
  act(() => {
    fireEvent.click(el);
    fireEvent.click(el);
  });

beforeEach(() => {
  [...Object.values(procurement), ...Object.values(inventory), ...Object.values(variants), ...Object.values(auth)].forEach((m) => m.mockReset());
  variants.warehouses.mockResolvedValue([{ id: "w-1", name: "Main", city: null, isDefault: true }]);
});

describe("a double submit sends one request", () => {
  it("Save view (inventory)", async () => {
    inventory.createPreset.mockImplementation(slow({ id: "view-1" }));
    renderIt(<SaveViewDialog open filters={{} as never} sort="" nameOf={() => ""} onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/name/i), "Low stock");
    doubleClick(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(inventory.createPreset).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 120));
    expect(inventory.createPreset).toHaveBeenCalledTimes(1);
  });

  it("Add supplier (procurement)", async () => {
    procurement.createSupplier.mockImplementation(slow({ id: "s-1", name: "Acme Traders", code: "ACME" }));
    renderIt(<SupplierDialog target={{ kind: "create" }} onClose={() => undefined} onSaved={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/Supplier \/ company name/), "Acme Traders");
    doubleClick(screen.getByRole("button", { name: "Add supplier" }));
    await waitFor(() => expect(procurement.createSupplier).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 120));
    expect(procurement.createSupplier).toHaveBeenCalledTimes(1);
  });

  it("Cancel purchase order", async () => {
    procurement.cancelOrder.mockImplementation(slow({ purchaseOrder: { poNumber: "PO-1" }, releasedUnits: 0 }));
    renderIt(<CancelOrderDialog order={order} onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/Reason/), "Wrong supplier");
    doubleClick(screen.getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(procurement.cancelOrder).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 120));
    expect(procurement.cancelOrder).toHaveBeenCalledTimes(1);
  });

  it("Approve purchase order", async () => {
    procurement.approveOrder.mockImplementation(slow({ poNumber: "PO-1", unitsOrdered: 5, warehouseName: "Main" }));
    renderIt(<DateActionDialog order={order} mode="approve" onClose={() => undefined} />);
    doubleClick(await screen.findByRole("button", { name: "Approve and submit" }));
    await waitFor(() => expect(procurement.approveOrder).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 120));
    expect(procurement.approveOrder).toHaveBeenCalledTimes(1);
  });

  it("Adjust variant stock", async () => {
    variants.quickAdjust.mockImplementation(slow({ result: { newAvailable: 12 }, warehouse: { name: "Main" } }));
    renderIt(<StockDialog productId="p-1" variant={variant} mode="adjust" onClose={() => undefined} />);
    await userEvent.type(document.getElementById("sd-qty") as HTMLElement, "2");
    doubleClick(screen.getByRole("button", { name: "Adjust stock" }));
    await waitFor(() => expect(variants.quickAdjust).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 120));
    expect(variants.quickAdjust).toHaveBeenCalledTimes(1);
  });

  it("Forgot password", async () => {
    auth.forgotPassword.mockImplementation(slow(undefined));
    renderIt(<ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@nova.test");
    const submit = screen.getByRole("button", { name: /send|reset|link/i });
    doubleClick(submit);
    await waitFor(() => expect(auth.forgotPassword).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 120));
    expect(auth.forgotPassword).toHaveBeenCalledTimes(1);
  });
});
