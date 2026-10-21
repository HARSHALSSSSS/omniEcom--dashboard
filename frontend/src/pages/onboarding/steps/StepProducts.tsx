import React, { useEffect, useState } from "react";
import {
  FileUp,
  Store,
  Plug,
  Plus,
  ArrowDown,
  Check,
  CheckCircle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { SYNC_JOB_TERMINAL, type CatalogItem, type CatalogOverview } from "@/api/onboarding.api";
import { errorMessage } from "@/api/errors";
import {
  useCatalog,
  useContinueProducts,
  useImportCatalog,
  useRefreshCounts,
  useSkipStep,
  useSyncJob,
} from "@/hooks/useOnboarding";
import { InlineError, Spinner, StepError, StepLoading } from "@/components/onboarding/wizard";
import { useStepStatus, useWizard } from "@/components/onboarding/wizardContext";

const AFTER_SETUP = "Available from your Products workspace once setup is finished.";

const connectionLabel = (c: CatalogItem["connection"]) => (c === "connected" ? "Connected" : c === "needs_attention" ? "Needs attention" : "Not connected");

const formatCount = (item: CatalogItem) =>
  item.productsAvailable === null ? "Not counted" : `${item.productsAvailable.toLocaleString()}${item.productsAvailableIsCapped ? "+" : ""}`;

export const StepProducts: React.FC = () => {
  const catalog = useCatalog();
  if (catalog.isPending) return <StepLoading label="Loading your catalogs" />;
  if (catalog.isError) return <StepError error={catalog.error} onRetry={() => void catalog.refetch()} />;
  return <ProductsView data={catalog.data} refetch={() => void catalog.refetch()} />;
};

const ProductsView: React.FC<{ data: CatalogOverview; refetch: () => void }> = ({ data, refetch }) => {
  const { canWrite, advance, goTo } = useWizard();
  const status = useStepStatus("products");
  const counts = useRefreshCounts();
  const importCatalog = useImportCatalog();
  const cont = useContinueProducts();
  const skip = useSkipStep();
  const [importInfoOpen, setImportInfoOpen] = useState(true);
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [queuedNote, setQueuedNote] = useState<string | null>(null);

  const { items, summary } = data;
  const importable = items.find((i) => i.canImport && i.connection === "connected") ?? null;
  const busy = cont.isPending || skip.isPending;

  const startImport = (item: CatalogItem) => {
    if (!canWrite || importCatalog.isPending) return;
    setQueuedNote(null);
    importCatalog.mutate(item.accountId, {
      onSuccess: (res) => {
        setJobs((j) => ({ ...j, [item.accountId]: res.job.id }));
        if (res.alreadyQueued) setQueuedNote(`An import of ${item.name} is already running.`);
      },
    });
  };

  const failedCounts = counts.data?.failed ?? [];
  const nameOf = (accountId: string) => items.find((i) => i.accountId === accountId)?.name ?? "A marketplace";

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

      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-6 sm:px-12 xl:px-[144px] pt-[40px] pb-[32px] flex flex-col gap-[32px]">
        {/* Product introduction */}
        <div className="flex flex-col gap-[16px] w-full">
          <h1 className="text-[32px] sm:text-[38px] lg:text-[40px] font-semibold leading-[1.15] text-[#000000] tracking-[-0.02em]">
            Bring your products into one place.
          </h1>
          <p className="text-[14px] font-normal leading-[1.65] text-[#4A4A4A] max-w-[815px]">
            Import your existing catalog or create products from scratch. We'll keep your core product information centralized so you don't have to enter it again for every marketplace.
          </p>
        </div>

        {/* Import and create workspace */}
        <div className="border-t border-[#EDEDED] pt-[24px] grid grid-cols-1 lg:grid-cols-12 gap-[32px] items-start w-full">
          {/* Column 1: Import existing products */}
          <div className="lg:col-span-5 flex flex-col gap-[16px]">
            <div className="flex flex-col gap-[6px]">
              <h2 className="text-[20px] font-semibold leading-[1.5] text-[#000000]">Import existing products</h2>
              <p className="text-[13px] font-normal leading-[1.5] text-[#4A4A4A]">
                Bring products from a connected marketplace or upload your catalog.
              </p>
            </div>

            <div className="flex flex-col w-full">
              {/* Marketplace import action */}
              <div className="min-h-[68px] border-b border-[#EDEDED] flex items-center justify-between gap-[16px] py-2">
                <div className="flex items-center gap-[16px] min-w-0">
                  <div className="w-[32px] h-[32px] rounded-[8px] bg-[#F7F7F7] flex items-center justify-center shrink-0">
                    <Store className="w-[18px] h-[18px] text-[#000000] stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold leading-[1.5] text-[#000000] truncate">Import from connected marketplace</span>
                    <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A] truncate">
                      {importable
                        ? `${importable.name} · ${importable.productsAvailable === null ? "count the products first" : `${formatCount(importable)} products available`}`
                        : "Connect a marketplace in the Sales Channels step first"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!importable || !canWrite || importable.importStatus === "importing" || importCatalog.isPending}
                  onClick={() => importable && startImport(importable)}
                  className="w-[128px] h-[40px] px-4 rounded-[8px] border border-[#666666] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importable?.importStatus === "importing" ? "Importing…" : "Import catalog"}
                </button>
              </div>

              {/* File upload action */}
              <div className="min-h-[68px] border-b border-[#EDEDED] flex items-center justify-between gap-[16px] py-2">
                <div className="flex items-center gap-[16px] min-w-0">
                  <div className="w-[32px] h-[32px] rounded-[8px] bg-[#F7F7F7] flex items-center justify-center shrink-0">
                    <FileUp className="w-[18px] h-[18px] text-[#000000] stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold leading-[1.5] text-[#000000] truncate">Upload CSV / Excel</span>
                    <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">Already have a product spreadsheet? {AFTER_SETUP}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  title={AFTER_SETUP}
                  className="w-[128px] h-[40px] px-4 rounded-[8px] border border-[#666666] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] shrink-0 cursor-not-allowed opacity-50"
                >
                  Upload file
                </button>
              </div>

              {/* Connect marketplace action */}
              <div className="min-h-[68px] border-b border-[#EDEDED] flex items-center justify-between gap-[16px] py-2">
                <div className="flex items-center gap-[16px] min-w-0">
                  <div className="w-[32px] h-[32px] rounded-[8px] bg-[#F7F7F7] flex items-center justify-center shrink-0">
                    <Plug className="w-[18px] h-[18px] text-[#000000] stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold leading-[1.5] text-[#000000] truncate">Connect another marketplace</span>
                    <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A] truncate">Products live somewhere else?</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goTo("channels")}
                  className="w-[160px] h-[40px] px-4 rounded-[8px] border border-[#666666] bg-white flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
                >
                  Connect marketplace
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Single catalog architecture preview */}
          <div className="lg:col-span-3 flex flex-col items-center pt-[8px] gap-[8px] w-full text-center">
            <span className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">Existing catalogs</span>
            <ArrowDown className="w-3.5 h-3.5 text-[#8A8A8A]" />

            <div className="w-[200px] h-[48px] rounded-[8px] bg-[#F7F7F7] border border-[#D9D9D9] flex flex-col justify-center items-center gap-[2px]">
              <span className="text-[12px] font-semibold leading-[15px] text-[#000000]">MASTER PRODUCT</span>
              <span className="text-[10px] font-normal leading-[12px] text-[#4A4A4A]">One source of truth</span>
            </div>

            <ArrowDown className="w-3.5 h-3.5 text-[#8A8A8A]" />
            <span className="text-[11px] font-normal leading-[1.5] text-[#4A4A4A]">Channel-specific listings</span>

            <svg width="217" height="24" viewBox="0 0 217 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mt-1" aria-hidden>
              <path d="M108.5 0V10M0.5 24V10H216.5V24M72.5 10V24M144.5 10V24" stroke="#D9D9D9" />
            </svg>

            <ul className="w-[217px] flex items-start justify-around text-[10px] font-normal leading-[12px] text-[#4A4A4A] pt-1" aria-label="Connected marketplaces">
              {items.slice(0, 4).map((i) => (
                <li key={i.accountId} className="flex flex-col items-center min-w-[44px]">
                  <div className="w-1 h-1 rounded-full bg-[#4A4A4A] mb-1" />
                  <span>{i.name}</span>
                </li>
              ))}
            </ul>

            <p className="text-[10px] font-normal leading-[1.5] text-[#8A8A8A] max-w-[160px] pt-1">
              {items.length === 0 ? "Marketplaces you connect will appear here" : "and every marketplace you connect later"}
            </p>
          </div>

          {/* Column 3: Create products */}
          <div className="lg:col-span-4 flex flex-col gap-[24px]">
            <div className="flex flex-col gap-[6px]">
              <h2 className="text-[20px] font-semibold leading-[1.5] text-[#000000]">Create products</h2>
              <p className="text-[13px] font-normal leading-[1.5] text-[#4A4A4A]">
                Build your master catalog manually and publish to channels later.
              </p>
            </div>

            <div className="flex flex-col gap-[12px] w-full max-w-[304px]">
              <button
                type="button"
                disabled
                title={AFTER_SETUP}
                className="w-full h-[40px] rounded-[8px] bg-[#000000] text-white flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
              >
                <Plus className="w-4 h-4 text-white" />
                <span className="text-[12px] font-semibold text-white">Create product</span>
              </button>
              <button
                type="button"
                disabled
                title={AFTER_SETUP}
                className="w-full h-[40px] rounded-[8px] bg-[#FFFFFF] border border-[#D6D6D6] flex items-center justify-center text-[12px] font-semibold text-[#000000] cursor-not-allowed opacity-50"
              >
                Create multiple products
              </button>
              <p className="text-[11px] leading-[1.45] text-[#737373]">{AFTER_SETUP}</p>
            </div>

            <div className="flex flex-col gap-[6px] max-w-[304px]">
              <span className="text-[12px] font-semibold leading-[1.5] text-[#000000]">Create once. List anywhere.</span>
              <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
                Your master product stays central. Each channel gets its own listing.
              </p>
              <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
                In your catalog now: {summary.masterProducts.toLocaleString()} {summary.masterProducts === 1 ? "product" : "products"} · {summary.masterVariants.toLocaleString()} {summary.masterVariants === 1 ? "variant" : "variants"}.
              </p>
            </div>
          </div>
        </div>

        {/* Connected catalogs section */}
        <div className="flex flex-col gap-[12px] w-full pt-4">
          <div className="flex items-center justify-between w-full gap-4 flex-wrap">
            <h3 className="text-[18px] font-semibold leading-[1.5] text-[#000000]">Connected catalogs</h3>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-normal leading-[1.45] text-[#4A4A4A]">
                {summary.connected} connected · {summary.productsAvailable.toLocaleString()} products available
                {!summary.allCounted && summary.connected > 0 ? " (not all counted yet)" : ""}
              </span>
              {summary.connected > 0 && !summary.allCounted && (
                <button
                  type="button"
                  disabled={!canWrite || counts.isPending}
                  onClick={() => counts.mutate(undefined)}
                  className="h-[32px] px-3 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1.5"
                >
                  {counts.isPending && <Spinner />}
                  {counts.isPending ? "Counting…" : "Count products"}
                </button>
              )}
            </div>
          </div>

          {counts.isError && <InlineError error={counts.error} />}
          {failedCounts.length > 0 && (
            <InlineError message={failedCounts.map((f) => `${nameOf(f.accountId)}: ${f.message}`).join(" · ")} />
          )}
          {importCatalog.isError && <InlineError error={importCatalog.error} />}
          {queuedNote && (
            <p role="status" className="text-[12px] text-[#4A4A4A]">
              {queuedNote}
            </p>
          )}

          {items.length === 0 ? (
            <div className="w-full rounded-[13px] border border-dashed border-[#D6D6D6] bg-white px-6 py-10 flex flex-col items-center gap-3 text-center">
              <p className="text-[13px] text-[#4A4A4A]">No marketplace is connected yet, so there is no catalog to import. You can connect one now or add products later.</p>
              <button
                type="button"
                onClick={() => goTo("channels")}
                className="h-[40px] px-4 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 cursor-pointer"
              >
                Go to Sales Channels
              </button>
            </div>
          ) : (
            <div className="w-full rounded-[13px] border border-[#EDEDED] bg-white overflow-x-auto shadow-xs">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="h-[50px] bg-[#F7F7F7] border-b border-[#EDEDED] text-[11px] font-normal text-[#4A4A4A]">
                    <th scope="col" className="w-1/5 pl-[32px] font-normal">Marketplace</th>
                    <th scope="col" className="w-1/5 font-normal">Products available</th>
                    <th scope="col" className="w-1/5 font-normal">Last synced</th>
                    <th scope="col" className="w-1/5 font-normal">Connection status</th>
                    <th scope="col" className="w-1/5 pr-[32px] text-right font-normal">Import action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]">
                  {items.map((row) => (
                    <CatalogRow
                      key={row.accountId}
                      row={row}
                      jobId={jobs[row.accountId] ?? null}
                      canWrite={canWrite}
                      starting={importCatalog.isPending && importCatalog.variables === row.accountId}
                      onImport={() => startImport(row)}
                      onSettled={refetch}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Import information */}
        <div className="w-full rounded-[12px] bg-[#F7F7F7] border border-[#EDEDED] p-[20px] flex flex-col gap-[12px]">
          <button
            type="button"
            aria-expanded={importInfoOpen}
            onClick={() => setImportInfoOpen(!importInfoOpen)}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <div className="flex items-center gap-[12px]">
              <Info className="w-[16px] h-[16px] text-[#000000] stroke-[1.5]" />
              <span className="text-[13px] font-semibold leading-[1.5] text-[#000000]">What we'll import</span>
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
                Imported products wait for your review before they become master products: you can link each one to a product you already have, or create a new one from it.
              </p>
              <div className="flex flex-wrap items-center gap-[24px] text-[12px] font-normal text-[#4A4A4A]">
                {["Field mapping", "SKU matching", "Product matching", "Variant mapping", "Category mapping", "Image mapping"].map((label) => (
                  <div key={label} className="flex items-center gap-[6px]">
                    <Check className="w-[12px] h-[12px] text-[#000000] stroke-[1.8]" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <InlineError error={cont.error ?? skip.error} />

        {/* Onboarding footer */}
        <div className="border-t border-[#EDEDED] pt-[24px] pb-[16px] flex flex-col sm:flex-row items-center justify-between gap-[16px] w-full">
          <p className="text-[12px] font-normal leading-[1.5] text-[#4A4A4A]">
            You can import or create products later from your Products workspace.
          </p>

          <div className="flex items-center gap-[16px] shrink-0">
            {status !== "completed" && (
              <button
                type="button"
                disabled={busy || !canWrite}
                onClick={() => skip.mutate("products", { onSuccess: (state) => advance(state) })}
                className="w-[112px] h-[40px] rounded-[8px] bg-[#FFFFFF] border border-[#D6D6D6] flex items-center justify-center text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {skip.isPending ? "Skipping…" : "Skip for now"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={() => cont.mutate(undefined, { onSuccess: (state) => advance(state) })}
              className="w-[168px] h-[44px] rounded-[12px] bg-[#0A0A0A] text-white flex items-center justify-center gap-1.5 text-[13px] font-semibold hover:bg-[#222222] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cont.isPending && <Spinner />}
              {cont.isPending ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** one marketplace: its real count, connection and the import (a background job we follow until it settles) */
const CatalogRow: React.FC<{
  row: CatalogItem;
  jobId: string | null;
  canWrite: boolean;
  starting: boolean;
  onImport: () => void;
  onSettled: () => void;
}> = ({ row, jobId, canWrite, starting, onImport, onSettled }) => {
  const job = useSyncJob(jobId);
  const jobStatus = job.data?.status;
  const settled = !!jobStatus && SYNC_JOB_TERMINAL.includes(jobStatus);
  const jobRunning = !!jobId && !settled && !job.isError;
  const failed = jobStatus === "failed" || jobStatus === "dead_lettered" || (!jobRunning && row.importStatus === "failed" && !jobId);

  useEffect(() => {
    if (settled) onSettled();
    // run once per settled job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, jobId]);

  const importing = starting || jobRunning || row.importStatus === "importing";
  const progress = job.data?.progress;
  const imported = row.importStatus === "imported" || jobStatus === "succeeded" || jobStatus === "partially_failed";

  let action: string;
  if (importing) action = progress && progress.total > 0 ? `Importing ${progress.done}/${progress.total}…` : "Importing…";
  else if (failed) action = "Import failed · Retry →";
  else if (imported) action = "Imported ✓";
  else action = "Import →";

  return (
    <tr className="h-[56px] text-[12px] hover:bg-neutral-50/50 transition-colors">
      <th scope="row" className="w-1/5 pl-[32px] text-left font-semibold text-[#333333]">
        {row.name}
      </th>
      <td className="w-1/5 text-[#333333]">{formatCount(row)}</td>
      <td className="w-1/5 text-[#333333] text-[11px]">
        {row.lastSyncedAt ? `Last synced: ${new Date(row.lastSyncedAt).toLocaleString()}` : "Not synced yet"}
        {row.importedProducts > 0 && (
          <span className="block text-[#737373]">
            {row.importedProducts.toLocaleString()} imported{row.awaitingReview > 0 ? ` · ${row.awaitingReview.toLocaleString()} to review` : ""}
          </span>
        )}
      </td>
      <td className="w-1/5">
        <div className="inline-flex items-center gap-[5px] h-[26px] px-[8px] bg-white border border-[#EAEAEA] rounded-[4px] text-[11px] text-[#333333]">
          {row.connection === "connected" ? (
            <CheckCircle className="w-[12px] h-[12px] text-[#333333] stroke-[1.5]" />
          ) : (
            <AlertCircle className="w-[12px] h-[12px] text-[#B42318] stroke-[1.5]" />
          )}
          <span>{connectionLabel(row.connection)}</span>
        </div>
      </td>
      <td className="w-1/5 pr-[32px] text-right">
        {row.canImport && row.connection === "connected" ? (
          <button
            type="button"
            disabled={!canWrite || importing}
            onClick={onImport}
            aria-label={`Import the ${row.name} catalog`}
            className="text-[12px] font-medium text-[#333333] underline hover:text-black cursor-pointer disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
          >
            {action}
          </button>
        ) : (
          <span className="text-[11px] text-[#8E8E8E]">{row.connection === "connected" ? "Import not supported" : "Reconnect to import"}</span>
        )}
        {failed && job.data?.error && (
          <span role="alert" className="block text-[10.5px] text-[#B42318]">
            {job.data.error.message}
          </span>
        )}
        {job.isError && (
          <span role="alert" className="block text-[10.5px] text-[#B42318]">
            {errorMessage(job.error)}
          </span>
        )}
      </td>
    </tr>
  );
};
