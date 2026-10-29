import { ChevronDown, Plus, Upload } from "lucide-react";
import type { VariantsProductHeader } from "@/types/variants";
import { formatNumber } from "@/utils/format";
import { AuthImage } from "./AuthImage";
import { Menu } from "./Menu";

const secondary =
  "box-border flex flex-row justify-center items-center px-4 min-h-[44px] sm:min-h-9 h-auto sm:h-9 gap-2 bg-[#FFFFFF] border border-[#666666] hover:bg-[#F5F5F5] text-[#000000] rounded-[8px] text-[12px] font-semibold leading-[17px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

interface Props {
  header: VariantsProductHeader | undefined;
  loading: boolean;
  canWrite: boolean;
  exporting: boolean;
  onProducts: () => void;
  onProduct: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function VariantsHeader({ header, loading, canWrite, exporting, onProducts, onProduct, onAdd, onImport, onExport }: Props) {
  const title = header?.title ?? (loading ? "Loading…" : "Product");
  const chip = "box-border flex flex-row items-start px-2 py-1 bg-[#FFFFFF] rounded-[4px]";
  const divider = <div className="hidden sm:block w-[1px] h-4 bg-[#EAEAEA]" aria-hidden />;

  return (
    <>
      <div className="w-full flex flex-col gap-5">
        <nav aria-label="Breadcrumb" className="flex flex-row items-center gap-1.5 text-[12px] leading-[17px] text-[#666666]">
          <button type="button" onClick={onProducts} className="hover:text-[#000000] transition-colors cursor-pointer">
            Products
          </button>
          <span aria-hidden>/</span>
          <button type="button" onClick={onProduct} className="hover:text-[#000000] transition-colors cursor-pointer">
            {title}
          </button>
          <span aria-hidden>/</span>
          <span aria-current="page" className="text-[#000000] font-medium">
            Variants
          </span>
        </nav>

        <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 min-w-0 w-full md:w-auto">
            <AuthImage src={header?.imageUrl ?? null} alt={title} className="w-[100px] h-[100px] rounded-[4px] overflow-hidden border border-[#EAEAEA] shrink-0" />
            <div className="flex flex-col items-start gap-1 min-w-0">
              <div className="flex flex-row items-center gap-3">
                <span className="text-[11px] font-normal leading-[16px] uppercase tracking-wider text-[#666666]">MASTER PRODUCT</span>
                <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">Variants</h1>
              </div>
              <p className="text-[12px] font-normal leading-[17px] text-[#666666]">Manage the sellable configurations and SKUs within this product.</p>
            </div>
          </div>

          <div className="relative flex flex-wrap items-center gap-2 self-start sm:self-end md:self-auto shrink-0 w-full sm:w-auto">
            {canWrite && (
              <button
                type="button"
                onClick={onAdd}
                className="box-border flex flex-row justify-center items-center px-4 min-h-[44px] sm:min-h-9 h-auto sm:h-9 gap-2 bg-[#000000] hover:bg-[#222222] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold leading-[17px] transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 text-[#FFFFFF]" aria-hidden />
                <span>Add variant</span>
              </button>
            )}
            {canWrite && (
              <button type="button" onClick={onImport} title="Variants are imported together with products in the product import wizard" className={secondary}>
                <Upload className="h-3.5 w-3.5 text-[#000000]" aria-hidden />
                <span>Import variants</span>
              </button>
            )}
            <Menu
              label="More"
              className={`${secondary} gap-1.5`}
              items={[
                { key: "export", label: exporting ? "Exporting…" : "Export variants CSV", disabled: exporting, onSelect: onExport },
                { key: "product", label: "Return to product details", onSelect: onProduct },
              ]}
            >
              <span>More</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#000000]" aria-hidden />
            </Menu>
          </div>
        </div>
      </div>

      <div className="w-full box-border flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-[#F5F5F5] rounded-[8px] gap-4">
        <div className="flex flex-row items-center gap-4 flex-1 min-w-0 w-full md:w-auto">
          <AuthImage src={header?.imageUrl ?? null} alt="" className="w-[100px] h-[100px] rounded-[4px] overflow-hidden bg-white border border-[#EAEAEA] shrink-0" />
          <div className="flex flex-col items-start gap-1 min-w-0">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] truncate max-w-full">{title}</h2>
            <span className="text-[12px] font-normal leading-[17px] text-[#666666]">{header?.productCode ?? ""}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 w-full md:w-auto">
          {header && (
            <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3" aria-label="Product summary">
              <div className={chip}>
                <span className="text-[11px] leading-[16px] text-[#000000]">
                  {formatNumber(header.variantCount)} {header.variantCount === 1 ? "variant" : "variants"}
                </span>
              </div>
              {divider}
              <div className={chip}>
                <span className="text-[11px] leading-[16px] text-[#000000]">
                  {formatNumber(header.connectedChannels)} {header.connectedChannels === 1 ? "channel" : "channels"}
                </span>
              </div>
              {divider}
              <div className={chip}>
                <span className="text-[11px] leading-[16px] text-[#000000]">{formatNumber(header.availableUnits)} available</span>
              </div>
              {divider}
              <div className={chip}>
                <span className="text-[11px] leading-[16px] text-[#000000]">{formatNumber(header.lowStockVariants)} low stock</span>
              </div>
            </div>
          )}
          <button type="button" onClick={onProduct} className="box-border flex flex-row justify-center items-center px-4 min-h-[44px] sm:min-h-9 h-auto sm:h-9 sm:ml-2 bg-[#FFFFFF] border border-[#666666] hover:bg-[#F5F5F5] rounded-[8px] text-[12px] font-semibold leading-[17px] text-[#000000] transition-colors cursor-pointer">
            View product
          </button>
        </div>
      </div>
    </>
  );
}
