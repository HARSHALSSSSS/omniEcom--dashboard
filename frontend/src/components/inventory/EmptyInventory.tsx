import { Link } from "react-router-dom";
import { Box, History, Home, Plus, Upload } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { InventoryOverview } from "@/types/inventory";

interface EmptyInventoryProps {
  mode: InventoryOverview["mode"];
  /** the single location of simple mode */
  locationName: string | null;
}

/** "Your inventory starts here": shown when the business has no stock at all (GET /inventory/overview -> ledger.total = 0). */
export function EmptyInventory({ mode, locationName }: EmptyInventoryProps) {
  return (
    <div className="flex w-full max-w-[1152px] flex-col items-start gap-7">
      <div className="box-border flex h-[83px] w-full flex-row items-center gap-3 border-y border-[#EAEAEA] px-0 py-5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
          <Home className="h-5 w-5 stroke-[1.5px] text-[#666666]" aria-hidden />
        </div>
        <div className="flex flex-col items-start gap-1">
          <span className="text-[15px] font-semibold leading-[145%] text-[#000000]">{locationName ?? "Home Inventory"}</span>
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">{mode === "simple" ? "All stock is managed from one location." : "Stock is managed across your warehouses."}</span>
        </div>
      </div>

      <div className="flex w-full flex-col items-start gap-4">
        <div className="flex h-[26px] w-full flex-row items-center justify-between">
          <h2 className="m-0 text-[18px] font-semibold leading-[145%] text-[#000000]">Inventory ledger</h2>
        </div>

        <div className="flex h-10 w-full flex-row items-center justify-between rounded-[6px] bg-[#F5F5F5] px-4 text-[11px] font-normal leading-[145%] text-[#666666]" aria-hidden>
          <span className="w-[120px]">Product</span>
          <span className="w-[100px]">SKU</span>
          <span className="w-[90px]">Available</span>
          <span className="w-[90px]">Reserved</span>
          <span className="w-[90px]">Incoming</span>
          <span className="w-[100px] text-right">Last movement</span>
        </div>

        <div className="flex min-h-[420px] w-full flex-col items-center justify-center gap-4 py-10 text-center">
          <div className="flex h-[74px] w-[74px] items-center justify-center rounded-xl bg-[#F5F5F5]">
            <Box className="h-9 w-9 stroke-[1.5px] text-[#000000]" aria-hidden />
          </div>
          <h3 className="m-0 text-[26px] font-semibold leading-[145%] text-[#000000]">Your inventory starts here</h3>
          <p className="m-0 max-w-[510px] text-[13px] font-normal leading-[145%] text-[#666666]">Import products or add your first product to begin tracking stock.</p>
          <div className="flex flex-row items-center gap-2.5 pt-1">
            <Link to={ROUTES.PRODUCTS_IMPORT} className="box-border flex h-[34px] flex-row items-center justify-center gap-[7px] rounded-lg border border-black bg-black px-3 text-white transition-colors hover:bg-neutral-800">
              <Upload className="h-3.5 w-3.5 stroke-[1.5px]" aria-hidden />
              <span className="text-[12px] font-semibold leading-[145%]">Import products</span>
            </Link>
            <Link to={ROUTES.PRODUCTS_NEW} className="box-border flex h-[34px] flex-row items-center justify-center gap-[7px] rounded-lg border border-[#EAEAEA] bg-white px-3 text-black transition-colors hover:bg-neutral-50">
              <Plus className="h-3.5 w-3.5 stroke-[1.5px] text-[#666666]" aria-hidden />
              <span className="text-[12px] font-normal leading-[145%]">Add product</span>
            </Link>
          </div>
          <span className="text-[11px] font-normal leading-[145%] text-[#666666]">Start with a product catalog, or add one product at a time.</span>
        </div>

        <div className="my-2 h-[1px] w-full bg-[#EAEAEA]" />

        <div className="flex w-full flex-col items-start gap-7 pt-2 md:flex-row">
          {(
            [
              [Box, "Add your products", "Keep each product's SKU and stock in one place."],
              [Home, "Set your available stock", "Begin with the units in Home Inventory."],
              [History, "Track every movement", "Review adjustments and orders in your audit trail."],
            ] as const
          ).map(([Icon, title, text]) => (
            <div key={title} className="flex flex-1 flex-row items-start gap-3">
              <div className="mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center">
                <Icon className="h-[17px] w-[17px] stroke-[1.5px] text-[#666666]" aria-hidden />
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">{title}</span>
                <span className="text-[11px] font-normal leading-[145%] text-[#666666]">{text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
