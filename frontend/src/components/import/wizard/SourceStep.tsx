import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { useDownloadTemplate, useImportFromMarketplace, useMarketplaceSources } from "@/hooks/useImport";
import type { ImportSession, MarketplaceSource } from "@/types/import";
import { Alert } from "../ImportStates";
import { importErrorMessage, num } from "../importFormat";
import type { StepProps } from "./stepTypes";
import { BAR_PRIMARY } from "./styles";
import { WizardBar } from "./WizardBar";

const MARKETPLACE_NAMES: Record<string, string> = { amazon: "Amazon", amazon_in: "Amazon", flipkart: "Flipkart", shopify: "Shopify", myntra: "Myntra", meesho: "Meesho" };
const marketplaceName = (s: MarketplaceSource): string => MARKETPLACE_NAMES[s.marketplace] ?? s.displayName;

const ROW_BTN =
  "w-[192px] h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 text-[12px] leading-[18px] font-medium rounded-[5px] bg-white dark:bg-card";
const BLACK_BTN = "w-[192px] h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium rounded-[5px]";

interface Props extends StepProps {
  /** a marketplace import was started: it continues on the mapping step */
  onMarketplaceStarted: (session: ImportSession) => void;
}

/** Step 1: where the products come from. The marketplace option reads GET /imports/marketplace-sources. */
export function SourceStep({ canWrite, goTo, onCancel, onSaveDraft, onMarketplaceStarted }: Props) {
  const sources = useMarketplaceSources();
  const fromMarketplace = useImportFromMarketplace();
  const template = useDownloadTemplate();
  const [picked, setPicked] = useState<string | null>(null);

  const list = useMemo(() => [...(sources.data ?? [])].sort((a, b) => (b.productsAvailable ?? -1) - (a.productsAvailable ?? -1)), [sources.data]);
  const importable = list.filter((s) => s.canImport);
  const chosen = importable.find((s) => s.accountId === picked) ?? importable[0];
  const needsAttention = !chosen ? list[0] : undefined;

  const start = () => {
    if (!chosen) return;
    fromMarketplace.mutate(chosen.accountId, { onSuccess: onMarketplaceStarted });
  };

  const meta = chosen ? `${marketplaceName(chosen)} · ${chosen.productsAvailable === null ? "catalog size unknown" : `${num(chosen.productsAvailable)} products`}` : null;
  const connectLink = buttonVariants({ variant: "outline", className: ROW_BTN });

  return (
    <div className="pt-4">
      {/* Main Section Heading */}
      <div className="mb-8">
        <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">Bring your catalog into one place.</h2>
        <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">Upload a spreadsheet or import products from a connected marketplace.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-12 items-start w-full">
        {/* Left: Where are your products coming from? + 3 Rows (takes all available width) */}
        <div className="flex-1 min-w-0 w-full">
          <h3 className="text-[17px] leading-[26px] font-semibold text-[#000000] dark:text-white">Where are your products coming from?</h3>
          <p className="text-[12px] leading-[18px] font-normal text-[#666666] mt-1 mb-5">Choose how you want to bring products into your catalog.</p>

          {/* Rows List with Clean Horizontal Dividers */}
          <div className="divide-y divide-[#E3E3E3] dark:divide-border border-y border-[#E3E3E3] dark:border-border w-full">
            {/* Option 01: Excel or Csv */}
            <div className="flex items-center justify-between py-6">
              <div className="flex items-start gap-4">
                <span className="w-[42px] shrink-0 text-[11px] leading-[17px] font-medium text-[#666666] pt-1">01</span>
                <div className="space-y-1">
                  <h4 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white">Excel or CSV</h4>
                  <p className="text-[12px] leading-[18px] font-normal text-[#666666]">Import products from an existing spreadsheet.</p>
                  <div className="text-[11px] leading-[17px] font-medium text-[#666666] pt-2">.xlsx, .csv, .tsv</div>
                </div>
              </div>
              <Button onClick={() => goTo("upload")} className={BLACK_BTN}>
                Choose file
              </Button>
            </div>

            {/* Option 02: Connected Marketplace */}
            <div className="flex items-center justify-between py-6">
              <div className="flex items-start gap-4">
                <span className="w-[42px] shrink-0 text-[11px] leading-[17px] font-medium text-[#666666] pt-1">02</span>
                <div className="space-y-1">
                  <h4 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white">Connected marketplace</h4>
                  <p className="text-[12px] leading-[18px] font-normal text-[#666666]">Import products from a marketplace already connected to your workspace.</p>
                  <div className="text-[11px] leading-[17px] font-medium text-[#666666] pt-2">
                    {sources.isLoading ? "Checking your marketplaces…" : meta ?? (needsAttention ? `${marketplaceName(needsAttention)} · needs attention` : "No marketplace connected")}
                  </div>
                  {importable.length > 1 && (
                    <select
                      aria-label="Marketplace account"
                      value={chosen?.accountId ?? ""}
                      onChange={(e) => setPicked(e.target.value)}
                      className="mt-2 h-8 rounded-[4px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card px-2 text-[11px]"
                    >
                      {importable.map((s) => (
                        <option key={s.accountId} value={s.accountId}>
                          {s.displayName} ({marketplaceName(s)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              {chosen ? (
                <Button variant="outline" disabled={!canWrite} loading={fromMarketplace.isPending} onClick={start} className={ROW_BTN}>
                  Import catalog
                </Button>
              ) : (
                <Link to={ROUTES.MARKETPLACE_HUB} className={connectLink}>
                  {needsAttention ? "Open marketplace hub" : "Connect marketplace"}
                </Link>
              )}
            </div>
            {fromMarketplace.isError && (
              <div className="py-3">
                <Alert>{importErrorMessage(fromMarketplace.error, "The catalog could not be imported.")}</Alert>
              </div>
            )}

            {/* Option 03: Request bulk product */}
            <div className="flex items-center justify-between py-6">
              <div className="flex items-start gap-4">
                <span className="w-[42px] shrink-0 text-[11px] leading-[17px] font-medium text-[#666666] pt-1">03</span>
                <div className="space-y-1">
                  <h4 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white">Request bulk product template</h4>
                  <p className="text-[12px] leading-[18px] font-normal text-[#666666]">Download a structured template, add your products, then upload it here.</p>
                </div>
              </div>
              <Button variant="outline" loading={template.isPending && template.variables === "xlsx"} disabled={template.isPending} onClick={() => template.mutate("xlsx")} className={ROW_BTN}>
                Download template
              </Button>
            </div>
            {template.isError && (
              <div className="py-3">
                <Alert>{errorMessage(template.error, "The template could not be downloaded.")}</Alert>
              </div>
            )}
          </div>
        </div>

        {/* Right Rail: Recommended for you & Trust reassurance */}
        <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0 space-y-8">
          <div className="w-full bg-[#F6F6F6] dark:bg-card/40 rounded-[5px] p-6 flex flex-col justify-between">
            <div>
              <div className="text-[11px] leading-[17px] font-medium text-[#666666]">Recommended for you</div>
              <h3 className="text-[20px] leading-[30px] font-semibold text-[#000000] dark:text-white mt-1">{chosen ? `Import from ${marketplaceName(chosen)}` : "Connect a marketplace"}</h3>
              <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-3">
                {chosen
                  ? `${chosen.productsAvailable === null ? "We found your" : `We found ${num(chosen.productsAvailable)} products in your`} connected ${marketplaceName(chosen)} catalog. The system can automatically match common product fields and flag only exceptions.`
                  : "Connect Amazon, Flipkart or another marketplace and the system can pull your catalog in, match common product fields and flag only exceptions."}
              </p>
            </div>

            <div className="pt-6 space-y-3">
              {chosen ? (
                <Button
                  disabled={!canWrite}
                  loading={fromMarketplace.isPending}
                  onClick={start}
                  className="w-full h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium text-[12px] leading-[18px] rounded-[5px]"
                >
                  Use {marketplaceName(chosen)} catalog
                </Button>
              ) : (
                <Link
                  to={ROUTES.MARKETPLACE_HUB}
                  className={buttonVariants({ className: "w-full h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium text-[12px] leading-[18px] rounded-[5px]" })}
                >
                  Connect a marketplace
                </Link>
              )}
              <Button
                variant="outline"
                onClick={() => goTo("upload")}
                className="w-full h-[36px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 font-medium text-[12px] leading-[18px] rounded-[5px]"
              >
                Choose another method
              </Button>

              <div className="w-full h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />

              <p className="text-[12px] leading-[18px] font-normal text-[#666666]">You review the impact before importing.</p>
            </div>
          </div>

          <div className="w-full space-y-2">
            <h4 className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white">Review first. Import with confidence.</h4>
            <p className="text-[12px] leading-[18px] font-normal text-[#666666]">Common fields are matched automatically. Uncertain rows remain yours to decide. Nothing is overwritten until you confirm.</p>
          </div>
        </div>
      </div>

      <WizardBar status="Your catalog stays unchanged until you confirm import." onCancel={onCancel} onSaveDraft={onSaveDraft}>
        <Button onClick={() => goTo("upload")} className={`${BAR_PRIMARY} w-[140px] opacity-35 hover:opacity-100`}>
          Continue →
        </Button>
      </WizardBar>
    </div>
  );
}
