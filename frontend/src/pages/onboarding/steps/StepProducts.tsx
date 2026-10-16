import { useState } from "react";
import {
  FileUp,
  Store,
  Plug,
  Plus,
  ArrowDown,
  Check,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace.store";

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
    <div className="relative w-full min-h-[1044px] bg-[#FFFFFF] flex flex-col justify-start overflow-hidden">
      {/* Atmospheric gradient: clean white at top and left, dark/charcoal at bottom-right matching StepBusiness */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 85% at 90% 95%, rgba(45, 45, 45, 0.42) 0%, rgba(130, 130, 130, 0.28) 32%, rgba(215, 215, 215, 0.12) 60%, rgba(255, 255, 255, 0) 80%), linear-gradient(175deg, #FFFFFF 0%, #FFFFFF 38%, #F7F7F7 58%, #E5E5E5 82%, #CCCCCC 100%)",
        }}
      />

      {/* Main Content Layout matching Figma spec:
          padding: 40px 144px 32px;
          gap: 32px;
          width: 1440px max-w;
      */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-6 sm:px-12 xl:px-[144px] pt-[40px] pb-[32px] flex flex-col gap-[32px]">
        {/* Product introduction: width: 1152px; gap: 16px; */}
        <div className="flex flex-col gap-[16px] w-full">
          <h1 className="text-[32px] sm:text-[38px] lg:text-[40px] font-semibold leading-[1.15] text-[#000000] tracking-[-0.02em]">
            Bring your products into one place.
          </h1>
          <p className="text-[14px] font-normal leading-[1.65] text-[#4A4A4A] max-w-[815px]">
            Import your existing catalog or create products from scratch. We'll keep your core product information centralized so you don't have to enter it again for every marketplace.
          </p>
        </div>

        {/* Import and create workspace: border-top: 1px solid #EDEDED; padding-top: 24px; gap: 32px; */}
        <div className="border-t border-[#EDEDED] pt-[24px] grid grid-cols-1 lg:grid-cols-12 gap-[32px] items-start w-full">
          {/* Column 1: Import existing products (544px on desktop / 6 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-[16px]">
            <div className="flex flex-col gap-[6px]">
              <h2 className="text-[20px] font-semibold leading-[1.5] text-[#000000]">
                Import existing products
              </h2>
              <p className="text-[13px] font-normal leading-[1.5] text-[#4A4A4A]">
                Bring products from a connected marketplace or upload your catalog.
              </p>
            </div>

            {/* Import methods: 3 rows, border-bottom: 1px solid #EDEDED; height: 68px each */}
            <div className="flex flex-col w-full">
              {/* Marketplace import action */}
              <div className="h-[68px] border-b border-[#EDEDED] flex items-center justify-between gap-[16px]">
                <div className="flex items-center gap-[16px] min-w-0">
                  <div className="w-[32px] h-[32px] rounded-[8px] bg-[#F7F7F7] flex items-center justify-center shrink-0">
                    <Store className="w-[18px] h-[18px] text-[#000000] stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold leading-[1.5] text-[#000000] truncate">
                      Import from connected marketplace
                    </span>
                    <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A] truncate">
                      Amazon · 427 products available
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleImport("amazon")}
                  className="w-[128px] h-[40px] px-4 rounded-[8px] border border-[#666666] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
                >
                  {importedRows.includes("amazon") ? "Imported" : "Import catalog"}
                </button>
              </div>

              {/* File upload action */}
              <div className="h-[68px] border-b border-[#EDEDED] flex items-center justify-between gap-[16px]">
                <div className="flex items-center gap-[16px] min-w-0">
                  <div className="w-[32px] h-[32px] rounded-[8px] bg-[#F7F7F7] flex items-center justify-center shrink-0">
                    <FileUp className="w-[18px] h-[18px] text-[#000000] stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold leading-[1.5] text-[#000000] truncate">
                      Upload CSV / Excel
                    </span>
                    <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A] truncate">
                      Already have a product spreadsheet?
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-[128px] h-[40px] px-4 rounded-[8px] border border-[#666666] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
                >
                  Upload file
                </button>
              </div>

              {/* Connect marketplace action */}
              <div className="h-[68px] border-b border-[#EDEDED] flex items-center justify-between gap-[16px]">
                <div className="flex items-center gap-[16px] min-w-0">
                  <div className="w-[32px] h-[32px] rounded-[8px] bg-[#F7F7F7] flex items-center justify-center shrink-0">
                    <Plug className="w-[18px] h-[18px] text-[#000000] stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold leading-[1.5] text-[#000000] truncate">
                      Connect another marketplace
                    </span>
                    <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A] truncate">
                      Products live somewhere else?
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-[160px] h-[40px] px-4 rounded-[8px] border border-[#666666] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
                >
                  Connect marketplace
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Single catalog architecture preview (Center column / 3 cols) */}
          <div className="lg:col-span-3 flex flex-col items-center pt-[8px] gap-[8px] w-full text-center">
            <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
              Existing catalogs
            </span>
            <ArrowDown className="w-3.5 h-3.5 text-[#8A8A8A]" />

            {/* Master product node */}
            <div className="w-[200px] h-[48px] rounded-[8px] bg-[#F7F7F7] border border-[#D9D9D9] flex flex-col justify-center items-center gap-[2px]">
              <span className="text-[12px] font-semibold leading-[15px] text-[#000000]">
                MASTER PRODUCT
              </span>
              <span className="text-[10px] font-normal leading-[12px] text-[#4A4A4A]">
                One source of truth
              </span>
            </div>

            <ArrowDown className="w-3.5 h-3.5 text-[#8A8A8A]" />
            <span className="text-[11px] font-normal leading-[1.5] text-[#4A4A4A]">
              Channel-specific listings
            </span>

            {/* SVG Branch Connector from Figma */}
            <svg
              width="217"
              height="24"
              viewBox="0 0 217 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mt-1"
            >
              <path
                d="M108.5 0V10M0.5 24V10H216.5V24M72.5 10V24M144.5 10V24"
                stroke="#D9D9D9"
              />
            </svg>

            {/* Marketplaces horizontal node connection aligned with the 4 branches */}
            <div className="w-[217px] flex items-center justify-between text-[10px] font-normal leading-[12px] text-[#4A4A4A] pt-1">
              <div className="flex flex-col items-center w-[44px] -ml-[22px]">
                <div className="w-1 h-1 rounded-full bg-[#4A4A4A] mb-1" />
                <span>Amazon</span>
              </div>
              <div className="flex flex-col items-center w-[44px]">
                <div className="w-1 h-1 rounded-full bg-[#4A4A4A] mb-1" />
                <span>Flipkart</span>
              </div>
              <div className="flex flex-col items-center w-[44px]">
                <div className="w-1 h-1 rounded-full bg-[#4A4A4A] mb-1" />
                <span>Meesho</span>
              </div>
              <div className="flex flex-col items-center w-[44px] -mr-[22px]">
                <div className="w-1 h-1 rounded-full bg-[#4A4A4A] mb-1" />
                <span>Shopify</span>
              </div>
            </div>

            <p className="text-[10px] font-normal leading-[1.5] text-[#8A8A8A] max-w-[140px] pt-1">
              Snapdeal, social commerce and future connectors
            </p>
          </div>

          {/* Column 3: Create products (304px on desktop / 4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-[24px]">
            <div className="flex flex-col gap-[6px]">
              <h2 className="text-[20px] font-semibold leading-[1.5] text-[#000000]">
                Create products
              </h2>
              <p className="text-[13px] font-normal leading-[1.5] text-[#4A4A4A]">
                Build your master catalog manually and publish to channels later.
              </p>
            </div>

            {/* Product creation actions */}
            <div className="flex flex-col gap-[12px] w-full max-w-[304px]">
              <button
                type="button"
                className="w-full h-[40px] rounded-[8px] bg-[#000000] text-white flex items-center justify-center gap-2 hover:bg-[#222222] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-white" />
                <span className="text-[12px] font-semibold text-white">
                  Create product
                </span>
              </button>
              <button
                type="button"
                className="w-full h-[40px] rounded-[8px] bg-[#FFFFFF] border border-[#D6D6D6] flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Create multiple products
              </button>
            </div>

            {/* Catalog reassurance */}
            <div className="flex flex-col gap-[6px] max-w-[304px]">
              <span className="text-[12px] font-semibold leading-[1.5] text-[#000000]">
                Create once. List anywhere.
              </span>
              <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
                Your master product stays central. Each channel gets its own listing.
              </p>
            </div>
          </div>
        </div>

        {/* Connected catalogs section: width: 1152px; gap: 12px; */}
        <div className="flex flex-col gap-[12px] w-full pt-4">
          <div className="flex items-center justify-between w-full">
            <h3 className="text-[18px] font-semibold leading-[1.5] text-[#000000]">
              Connected catalogs
            </h3>
            <span className="text-[12px] font-normal leading-[1.45] text-[#4A4A4A]">
              {CATALOGS.length} connected · {totalProducts} products available
            </span>
          </div>

          {/* Catalog table */}
          <div className="w-full rounded-[13px] border border-[#EDEDED] bg-white overflow-hidden shadow-xs">
            {/* Table headings: height: 50px; background: #F7F7F7; border-bottom: 1px solid #EDEDED; */}
            <div className="h-[50px] bg-[#F7F7F7] border-b border-[#EDEDED] flex items-center px-[32px] text-[11px] font-normal text-[#4A4A4A]">
              <span className="w-1/5">Marketplace</span>
              <span className="w-1/5">Products available</span>
              <span className="w-1/5">Last synced</span>
              <span className="w-1/5">Connection status</span>
              <span className="w-1/5 text-right">Import action</span>
            </div>

            {/* Table rows: height: 56px each */}
            <div className="divide-y divide-[#EAEAEA]">
              {CATALOGS.map((row) => {
                const isImported = importedRows.includes(row.id);
                return (
                  <div
                    key={row.id}
                    className="h-[56px] flex items-center px-[32px] text-[12px] hover:bg-neutral-50/50 transition-colors"
                  >
                    <span className="w-1/5 font-semibold text-[#333333]">
                      {row.marketplace}
                    </span>
                    <span className="w-1/5 text-[#333333]">
                      {row.productsAvailable}
                    </span>
                    <span className="w-1/5 text-[#333333] text-[11px]">
                      {isImported ? "Last synced: Just now" : `Last synced: ${row.lastSynced}`}
                    </span>
                    <div className="w-1/5">
                      <div className="inline-flex items-center gap-[5px] h-[26px] px-[8px] bg-white border border-[#EAEAEA] rounded-[4px] text-[11px] text-[#333333]">
                        <CheckCircle className="w-[12px] h-[12px] text-[#333333] stroke-[1.5]" />
                        <span>Connected</span>
                      </div>
                    </div>
                    <div className="w-1/5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleImport(row.id)}
                        className="text-[12px] font-medium text-[#333333] underline hover:text-black cursor-pointer"
                      >
                        {isImported ? "Imported ✓" : "Import →"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Import information / State=Expanded: width: 1152px; background: #F7F7F7; border: 1px solid #EDEDED; border-radius: 12px; padding: 20px; */}
        <div className="w-full rounded-[12px] bg-[#F7F7F7] border border-[#EDEDED] p-[20px] flex flex-col gap-[12px]">
          <button
            type="button"
            onClick={() => setImportInfoOpen(!importInfoOpen)}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <div className="flex items-center gap-[12px]">
              <Info className="w-[16px] h-[16px] text-[#000000] stroke-[1.5]" />
              <span className="text-[13px] font-semibold leading-[1.5] text-[#000000]">
                What we'll import
              </span>
            </div>
            {importInfoOpen ? (
              <ChevronUp className="w-[16px] h-[16px] text-[#000000] stroke-[1.5]" />
            ) : (
              <ChevronDown className="w-[16px] h-[16px] text-[#000000] stroke-[1.5]" />
            )}
          </button>

          {importInfoOpen && (
            <div className="flex flex-col gap-[12px]">
              <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
                We'll attempt to map and match your catalog automatically. You can review anything that needs attention before publishing.
              </p>
              <div className="flex flex-wrap items-center gap-[24px] text-[12px] font-normal text-[#4A4A4A]">
                <div className="flex items-center gap-[6px]">
                  <Check className="w-[12px] h-[12px] text-[#000000] stroke-[1.8]" />
                  <span>Field mapping</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <Check className="w-[12px] h-[12px] text-[#000000] stroke-[1.8]" />
                  <span>SKU matching</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <Check className="w-[12px] h-[12px] text-[#000000] stroke-[1.8]" />
                  <span>Product matching</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <Check className="w-[12px] h-[12px] text-[#000000] stroke-[1.8]" />
                  <span>Variant mapping</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <Check className="w-[12px] h-[12px] text-[#000000] stroke-[1.8]" />
                  <span>Category mapping</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <Check className="w-[12px] h-[12px] text-[#000000] stroke-[1.8]" />
                  <span>Image mapping</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Onboarding footer: border-top: 1px solid #EDEDED; height: 96px; */}
        <div className="border-t border-[#EDEDED] pt-[24px] pb-[16px] flex flex-col sm:flex-row items-center justify-between gap-[16px] w-full">
          <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
            You can import or create products later from your Products workspace.
          </p>

          <div className="flex items-center gap-[16px] shrink-0">
            <button
              type="button"
              onClick={onSkip}
              className="w-[112px] h-[40px] rounded-[8px] bg-[#FFFFFF] border border-[#D6D6D6] flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={onNext}
              className="w-[168px] h-[44px] rounded-[12px] bg-[#0A0A0A] text-white flex items-center justify-center text-[13px] font-semibold hover:bg-[#222222] transition-colors cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
