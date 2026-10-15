import React, { useState } from "react";
import {
  FileUp,
  Download,
  Plug,
  Plus,
  Layers,
  ArrowDown,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";

interface StepProductsProps {
  onNext: () => void;
  onSkip: () => void;
}

interface CatalogRow {
  id: string;
  marketplace: string;
  productsAvailable: number;
  lastSynced: string;
}

const CATALOGS: CatalogRow[] = [
  {
    id: "amazon",
    marketplace: "Amazon",
    productsAvailable: 427,
    lastSynced: "Not imported",
  },
  {
    id: "flipkart",
    marketplace: "Flipkart",
    productsAvailable: 184,
    lastSynced: "Not imported",
  },
  {
    id: "meesho",
    marketplace: "Meesho",
    productsAvailable: 96,
    lastSynced: "Not imported",
  },
  {
    id: "shopify",
    marketplace: "Shopify",
    productsAvailable: 63,
    lastSynced: "Not imported",
  },
];

export const StepProducts: React.FC<StepProductsProps> = ({
  onNext,
  onSkip,
}) => {
  const { onboardingData, updateOnboardingData } = useWorkspaceStore();
  const [importedRows, setImportedRows] = useState<string[]>(
    onboardingData.importedCatalogs || ["amazon"],
  );
  const [importInfoOpen, setImportInfoOpen] = useState(true);

  const toggleImport = (id: string) => {
    const next = importedRows.includes(id)
      ? importedRows.filter((item) => item !== id)
      : [...importedRows, id];
    setImportedRows(next);
    updateOnboardingData({ importedCatalogs: next });
  };

  const totalProducts = CATALOGS.reduce(
    (acc, row) => acc + row.productsAvailable,
    0,
  );

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0A]">
          Bring your products into one place.
        </h1>
        <p className="text-sm text-[#666666] max-w-3xl leading-relaxed">
          Import your existing catalog or create products from scratch. We'll
          keep your core product information centralized so you don't have to
          enter it again for every marketplace.
        </p>
      </div>

      {/* 3-column actions: Import / Diagram / Create */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Import existing products */}
        <div className="lg:col-span-5 rounded-xl border border-[#E5E7EB] bg-white p-5 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              Import existing products
            </h3>
            <p className="text-xs text-[#666666] mt-0.5">
              Bring products from a connected marketplace or upload your catalog.
            </p>

            <div className="mt-4 space-y-2.5">
              {/* Option 1 */}
              <div className="flex items-center justify-between rounded-lg border border-[#EAEAEA] p-3 hover:bg-neutral-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                    <Download className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#0A0A0A]">
                      Import from connected marketplace
                    </div>
                    <div className="text-[11px] text-[#666666]">
                      Amazon · 427 products available
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleImport("amazon")}
                  className="h-8 text-xs font-semibold border-black"
                >
                  {importedRows.includes("amazon") ? "Imported" : "Import catalog"}
                </Button>
              </div>

              {/* Option 2 */}
              <div className="flex items-center justify-between rounded-lg border border-[#EAEAEA] p-3 hover:bg-neutral-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                    <FileUp className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#0A0A0A]">
                      Upload CSV / Excel
                    </div>
                    <div className="text-[11px] text-[#666666]">
                      Already have a product spreadsheet?
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-black"
                >
                  Upload file
                </Button>
              </div>

              {/* Option 3 */}
              <div className="flex items-center justify-between rounded-lg border border-[#EAEAEA] p-3 hover:bg-neutral-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                    <Plug className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#0A0A0A]">
                      Connect another marketplace
                    </div>
                    <div className="text-[11px] text-[#666666]">
                      Products live somewhere else?
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-black"
                >
                  Connect marketplace
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Architecture preview diagram */}
        <div className="lg:col-span-3 rounded-xl border border-[#E5E7EB] bg-neutral-50/50 p-5 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
            Existing catalogs
          </span>
          <ArrowDown className="h-3.5 w-3.5 text-neutral-400 mb-2" />

          {/* Master product box */}
          <div className="w-full rounded-lg border border-[#D1D5DB] bg-white p-3 shadow-2xs">
            <div className="text-xs font-bold text-[#0A0A0A]">
              MASTER PRODUCT
            </div>
            <div className="text-[10px] text-[#666666]">
              One source of truth
            </div>
          </div>

          <ArrowDown className="h-3.5 w-3.5 text-neutral-400 my-2" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-2">
            Channel-specific listings
          </span>

          <div className="flex items-center justify-center gap-3 text-[10px] font-medium text-neutral-700">
            <span>Amazon</span>
            <span>•</span>
            <span>Flipkart</span>
            <span>•</span>
            <span>Meesho</span>
            <span>•</span>
            <span>Shopify</span>
          </div>
          <p className="text-[10px] text-neutral-400 mt-2">
            Snapdeal, social commerce and future connectors
          </p>
        </div>

        {/* Right: Create products */}
        <div className="lg:col-span-4 rounded-xl border border-[#E5E7EB] bg-white p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#0A0A0A]">
                Create products
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                Build your master catalog manually and publish to channels later.
              </p>
            </div>

            <div className="space-y-2.5">
              <Button
                type="button"
                className="w-full h-10 rounded-lg bg-black text-white hover:bg-neutral-800 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>+ Create product</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 rounded-lg border-[#E5E7EB] text-[#0A0A0A] hover:bg-neutral-50 text-xs font-semibold"
              >
                Create multiple products
              </Button>
            </div>
          </div>

          <div className="border-t border-[#EAEAEA] pt-4 mt-4">
            <h4 className="text-xs font-semibold text-[#0A0A0A]">
              Create once. List anywhere.
            </h4>
            <p className="text-[11px] text-[#666666] mt-1 leading-relaxed">
              Your master product stays central. Each channel gets its own
              listing.
            </p>
          </div>
        </div>
      </div>

      {/* Connected Catalogs Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0A0A0A]">
            Connected catalogs
          </h2>
          <span className="text-xs text-[#666666]">
            {CATALOGS.length} connected · {totalProducts} products available
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EAEAEA] bg-neutral-50/70 text-[#666666] font-semibold">
              <tr>
                <th className="py-3 px-4">Marketplace</th>
                <th className="py-3 px-4">Products available</th>
                <th className="py-3 px-4">Last synced</th>
                <th className="py-3 px-4">Connection status</th>
                <th className="py-3 px-4 text-right">Import action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {CATALOGS.map((row) => {
                const isImported = importedRows.includes(row.id);
                return (
                  <tr key={row.id} className="hover:bg-neutral-50/50">
                    <td className="py-3.5 px-4 font-semibold text-[#0A0A0A]">
                      {row.marketplace}
                    </td>
                    <td className="py-3.5 px-4 text-[#0A0A0A] tabular-nums font-medium">
                      {row.productsAvailable}
                    </td>
                    <td className="py-3.5 px-4 text-[#666666]">
                      {isImported
                        ? "Last synced: Just now"
                        : `Last synced: ${row.lastSynced}`}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Connected</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => toggleImport(row.id)}
                        className={cn(
                          "inline-flex items-center gap-1 font-semibold text-xs",
                          isImported
                            ? "text-emerald-700 hover:text-emerald-800"
                            : "text-black hover:underline",
                        )}
                      >
                        {isImported ? (
                          <>
                            <span>Imported</span>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            <span>Import</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collapsible: What we'll import */}
      <div className="rounded-xl border border-[#E5E7EB] bg-neutral-50/70 p-4 space-y-3">
        <button
          type="button"
          onClick={() => setImportInfoOpen(!importInfoOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-neutral-600" />
            <span className="text-xs font-semibold text-[#0A0A0A]">
              What we'll import
            </span>
          </div>
          {importInfoOpen ? (
            <ChevronUp className="h-4 w-4 text-neutral-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-neutral-500" />
          )}
        </button>

        {importInfoOpen && (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-[#666666]">
              We'll attempt to map and match your catalog automatically. You can
              review anything that needs attention before publishing.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-medium text-[#0A0A0A]">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                <span>Field mapping</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                <span>SKU matching</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                <span>Product matching</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                <span>Variant mapping</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                <span>Category mapping</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                <span>Image mapping</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#EAEAEA] pt-6">
        <p className="text-xs text-[#666666]">
          You can import or create products later from your Products workspace.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onSkip}
            className="h-11 px-6 rounded-lg text-xs font-semibold border-[#E5E7EB] text-[#666666] hover:text-black"
          >
            Skip for now
          </Button>
          <Button
            type="button"
            onClick={onNext}
            className="h-11 px-8 rounded-lg bg-black text-white hover:bg-neutral-800 font-medium text-sm flex items-center gap-2"
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
