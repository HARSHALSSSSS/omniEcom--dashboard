import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, X, XCircle } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useAffectedListings, useChannelSync, useChannelSyncState } from "@/hooks/useInventory";
import { cn } from "@/utils/cn";
import { formatInZone, formatNumber, formatRelativeTime } from "@/utils/format";
import type { ChannelState, ChannelSyncState } from "@/types/inventory";
import { InlineError } from "./inventoryUi";

type ChannelNode = ChannelSyncState["channels"][number];

const LINK = "flex cursor-pointer flex-row items-center gap-1 border-none bg-transparent p-0 pt-2 text-[11px] font-semibold text-[#111111] hover:underline";
const NO_SYNC_REASON = "Syncing channels needs both inventory and listings write access.";

const RING: Record<ChannelState, string> = {
  failed: "bg-red-50/60 ring-1 ring-red-300 shadow-2xs",
  attention: "bg-amber-50/60 ring-1 ring-amber-300 shadow-2xs",
  syncing: "bg-blue-50/60 ring-1 ring-blue-300 shadow-2xs",
  healthy: "bg-emerald-50/60 ring-1 ring-emerald-300 shadow-2xs",
  not_connected: "bg-neutral-50 ring-1 ring-neutral-300 shadow-2xs",
};

function NodeStatus({ node }: { node: ChannelNode }) {
  const last = node.lastSyncAt ? `Last sync: ${formatRelativeTime(node.lastSyncAt)}` : "Last sync: Not reported";
  switch (node.state) {
    case "syncing":
      return (
        <>
          <div className="mb-1 flex flex-row items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[2px] text-[#2563EB]" aria-hidden />
            <span className="text-[12px] font-medium text-[#2563EB]">Syncing</span>
          </div>
          <span className="text-[12px] text-[#737373]">{last}</span>
        </>
      );
    case "attention":
    case "failed": {
      const failed = node.state === "failed";
      const color = failed ? "#DC2626" : "#D97706";
      const Icon = failed ? XCircle : AlertTriangle;
      return (
        <>
          <div className="mb-1 flex flex-row items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 stroke-[2px]" style={{ color }} aria-hidden />
            <span className="text-[12px] font-medium" style={{ color }}>
              {failed ? "Sync failed" : "Attention Required"}
            </span>
          </div>
          <span className="text-[12px] text-[#737373]">{last}</span>
          {node.affectedSkus > 0 && (
            <span className="mt-0.5 text-[12px] font-medium" style={{ color }}>
              {formatNumber(node.affectedSkus)} {node.affectedSkus === 1 ? "SKU" : "SKUs"} affected
            </span>
          )}
        </>
      );
    }
    case "not_connected":
      return <span className="text-[12px] font-medium text-[#737373]">Not connected</span>;
    default:
      return (
        <>
          <div className="mb-1 flex flex-row items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 stroke-[2px] text-[#16A34A]" aria-hidden />
            <span className="text-[12px] font-medium text-[#16A34A]">Healthy</span>
          </div>
          <span className="text-[12px] text-[#737373]">{last}</span>
        </>
      );
  }
}

/** the SKUs whose last push to one account was rejected or differs (GET /inventory/channel-sync/{accountId}/affected) */
export function AffectedDialog({ account, onClose }: { account: { id: string; name: string } | null; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const affected = useAffectedListings(account?.id ?? null, page);
  const data = affected.data;
  return (
    <Dialog open={account !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Affected items{account ? `: ${account.name}` : ""}</DialogTitle>
          <DialogDescription>Products whose last push to this channel was rejected, or whose channel quantity differs from the master stock.</DialogDescription>
        </DialogHeader>
        {affected.isPending && account && <Skeleton className="h-32 w-full" role="status" aria-label="Loading affected items" />}
        {affected.isError && (
          <div className="space-y-2">
            <InlineError message={`The affected items could not be loaded. ${errorMessage(affected.error)}`} />
            <Button variant="outline" size="sm" onClick={() => void affected.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {data && data.items.length === 0 && <p className="text-xs text-muted-foreground">Nothing is out of step on this channel.</p>}
        {data && data.items.length > 0 && (
          <>
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-[#EAEAEA]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9F9F9] text-[#737373]">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Product</th>
                    <th scope="col" className="px-3 py-2 font-medium">Master</th>
                    <th scope="col" className="px-3 py-2 font-medium">On channel</th>
                    <th scope="col" className="px-3 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {data.items.map((it) => (
                    <tr key={it.listingId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-[#111111]">{it.title}</p>
                        <p className="text-[11px] text-[#737373]">{it.sku}</p>
                      </td>
                      <td className="px-3 py-2 font-mono">{formatNumber(it.masterAvailable)}</td>
                      <td className="px-3 py-2 font-mono">{it.channelQuantity === null ? "—" : formatNumber(it.channelQuantity)}</td>
                      <td className="px-3 py-2 text-[#DC2626]">{it.lastError?.message ?? (it.requestedQuantity !== null ? `Wants ${formatNumber(it.requestedQuantity)}` : "Differs from master")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-[#737373]">
              <span aria-live="polite">
                {formatNumber(data.total)} {data.total === 1 ? "item" : "items"}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                  Previous
                </Button>
                <span>
                  Page {data.page} of {Math.max(data.pages, 1)}
                </span>
                <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ChannelConstellationProps {
  /** inventory:write AND listings:write (retrying a sync queues the same job as the marketplace pages) */
  canSync: boolean;
}

/** "Inventory synchronization": master stock, one node per marketplace account, the incident of the picked node and the four operational counters. */
export function ChannelConstellation({ canSync }: ChannelConstellationProps) {
  const state = useChannelSyncState();
  const retry = useChannelSync();
  const [picked, setPicked] = useState<string | null>(null);
  const [affected, setAffected] = useState<{ id: string; name: string } | null>(null);
  const data = state.data;

  const retrying = retry.start.isPending || (retry.start.isSuccess && !retry.settled);
  const nodes = data?.channels ?? [];
  const connected = nodes.filter((n) => n.state !== "not_connected").length;
  const selected = nodes.find((n) => n.channel.accountId === picked);
  const incident = data?.incidents.find((i) => i.channel.accountId === picked);
  const open = (n: ChannelNode) => n.channel.accountId && setAffected({ id: n.channel.accountId, name: n.accountName || n.channel.name });
  const firstWith = (s: ChannelState) => nodes.find((n) => n.state === s);
  const reviewNode = firstWith("attention") ?? firstWith("failed");
  const ops = data?.operations;

  return (
    <section aria-label="Inventory synchronization" className="flex w-full flex-col items-start gap-4">
      <div className="flex w-full flex-row flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[20px] font-semibold tracking-tight text-[#111111]">Inventory synchronization</h2>
        <span className="text-[12px] font-normal text-[#737373]">
          {data?.master.lastUpdateAt ? `Last master inventory update: ${formatInZone(data.master.lastUpdateAt, { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}` : "No master inventory update yet"}
        </span>
      </div>

      {state.isError && !data ? (
        <div className="w-full space-y-2">
          <InlineError message={`The channel state could not be loaded. ${errorMessage(state.error)}`} />
          <Button variant="outline" size="sm" onClick={() => void state.refetch()}>
            Retry
          </Button>
        </div>
      ) : !data ? (
        <Skeleton className="h-24 w-full" role="status" aria-label="Loading channel state" />
      ) : (
        <>
          <div className="relative isolate flex w-full flex-row flex-wrap items-start justify-between gap-y-4 pt-1">
            <div className="absolute left-[170px] right-[20px] top-[18px] z-0 hidden h-[1px] bg-[#E5E5E5] lg:block" />

            <div className="z-10 flex w-[180px] shrink-0 flex-col items-start gap-1 bg-transparent pr-4">
              <div className="mb-0.5 flex flex-row items-center gap-2">
                <Database className="h-4 w-4 stroke-[1.75px] text-[#444444]" aria-hidden />
                <span className="text-[13px] font-semibold text-[#111111]">Master Inventory</span>
              </div>
              <span className="mb-1 text-[14px] font-semibold leading-none text-[#111111]">{formatNumber(data.master.available)}</span>
              <span className="text-[12px] text-[#737373]">Available units · Source of truth</span>
              <span className="text-[12px] text-[#737373]">
                {connected === 0 ? "No marketplace connected" : `One master, ${connected} connected ${connected === 1 ? "channel" : "channels"}`}
              </span>
            </div>

            {nodes.map((n) => {
              const id = n.channel.accountId;
              const on = id !== null && picked === id;
              return (
                <button
                  key={id ?? n.channel.code}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${n.accountName || n.channel.name}: ${n.state}`}
                  onClick={() => setPicked(on ? null : id)}
                  className={cn("z-10 flex min-w-[160px] flex-1 cursor-pointer flex-col items-start gap-1 rounded-lg p-2 px-3 text-left transition-all", on ? RING[n.state] : "hover:bg-white hover:shadow-2xs")}
                >
                  <div className="mb-2 flex flex-row items-center gap-2 bg-[#FAFAFA] pr-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#EAEAEA] bg-white shadow-2xs">
                      <span className="text-[12px] font-semibold text-[#111111]">{n.channel.name.charAt(0)}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-[#111111]">{n.channel.name}</span>
                  </div>
                  {n.accountName && n.accountName !== n.channel.name && <span className="-mt-1 mb-1 text-[11px] text-[#737373]">{n.accountName}</span>}
                  <div className="mb-1 flex w-full flex-row items-center justify-between text-[12px]">
                    <span className="text-[#666666]">Stock</span>
                    <span className="font-medium text-[#111111]">{n.listings === 0 ? "—" : formatNumber(n.sentUnits)}</span>
                  </div>
                  <NodeStatus node={n} />
                </button>
              );
            })}
            {nodes.length === 0 && (
              <p className="z-10 flex-1 self-center text-[12px] text-[#737373]">
                No marketplace is connected yet.{" "}
                <Link to={ROUTES.MARKETPLACE_HUB} className="font-medium text-[#111111] underline">
                  Connect one
                </Link>
              </p>
            )}
          </div>

          {selected && !incident && (
            <p className="m-0 w-full rounded-xl border border-[#EAEAEA] bg-white px-4 py-3 text-[12px] text-[#555555]">
              {selected.accountName || selected.channel.name}: {formatNumber(selected.listings)} live {selected.listings === 1 ? "listing" : "listings"}, {formatNumber(selected.sentUnits)} units last sent.
              {selected.affectedSkus > 0 && (
                <>
                  {" "}
                  <button type="button" onClick={() => open(selected)} className="cursor-pointer border-none bg-transparent p-0 font-semibold text-[#111111] underline">
                    View affected items
                  </button>
                </>
              )}
            </p>
          )}

          {incident && (
            <div className="flex w-full flex-col items-start justify-between gap-4 rounded-xl border border-[#FCA5A5] bg-[#FFFBFB] p-5 shadow-2xs md:flex-row md:items-center" role="alert">
              <div className="flex max-w-[650px] flex-col items-start gap-1.5">
                <div className="flex flex-row flex-wrap items-center gap-2">
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#DC2626]">
                    <X className="h-2.5 w-2.5 stroke-[3px] text-white" aria-hidden />
                  </div>
                  <h3 className="m-0 text-[15px] font-semibold text-[#111111]">{incident.title}</h3>
                  <span className="text-[12px] font-medium text-[#DC2626]">
                    {formatNumber(incident.affected.products)} {incident.affected.products === 1 ? "product" : "products"} affected
                  </span>
                </div>
                <div className="flex flex-col items-start gap-0.5 pt-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">REASON</span>
                  <p className="m-0 text-[13px] font-normal text-[#111111]">{incident.reason}</p>
                </div>
                <p className="m-0 pt-0.5 text-[12px] text-[#737373]">Review affected listings and retry synchronization</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-3">
                {incident.lastFailedAt && <span className="text-[11px] text-[#737373]">Last failed {formatInZone(incident.lastFailedAt, { hour: "numeric", minute: "2-digit", hour12: true })}</span>}
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">AFFECTED</span>
                  <span className="text-[14px] font-semibold text-[#111111]">
                    {formatNumber(incident.affected.skus)} SKUs / {formatNumber(incident.affected.variants)} variants
                  </span>
                </div>
                <div className="flex flex-row items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => selected && open(selected)}
                    className="h-[34px] cursor-pointer rounded-lg border border-[#E5E5E5] bg-white px-3.5 text-[12px] font-medium text-[#111111] transition-colors hover:bg-neutral-50"
                  >
                    View affected items
                  </button>
                  <span title={canSync ? undefined : NO_SYNC_REASON}>
                    <button
                      type="button"
                      disabled={!canSync || retrying}
                      onClick={() => {
                        retry.reset();
                        retry.start.mutate(picked ?? undefined);
                      }}
                      className="flex h-[34px] cursor-pointer flex-row items-center gap-1.5 rounded-lg border border-black bg-black px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5 stroke-[2px]", retrying && "animate-spin")} aria-hidden />
                      <span>Retry sync</span>
                    </button>
                  </span>
                </div>
                <div aria-live="polite" className="text-[11px] text-[#737373]">
                  {retrying && "Retrying the sync..."}
                  {retry.settled && !retrying && "The retry finished. The numbers are refreshed."}
                  {retry.start.isError && <span className="text-[#DC2626]">{errorMessage(retry.start.error, "The sync could not be started.")}</span>}
                </div>
              </div>
            </div>
          )}

          <div className="flex w-full flex-col items-start gap-2.5">
            <div className="flex w-full flex-row items-baseline justify-between">
              <h3 className="m-0 text-[14px] font-semibold text-[#111111]">Sync operational states</h3>
              <span className="text-[11px] text-[#737373]">Live across every connected marketplace account</span>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex min-h-[76px] flex-col items-start justify-between rounded-xl border border-[#EAEAEA] bg-white p-3.5 shadow-2xs">
                <div className="flex flex-row items-center gap-2">
                  <RefreshCw className={cn("h-3.5 w-3.5 stroke-[2px] text-[#2563EB]", (ops?.syncing.channels ?? 0) > 0 && "animate-spin")} aria-hidden />
                  <span className="text-[12px] font-medium text-[#2563EB]">
                    {ops && ops.syncing.channels > 0 ? `Syncing ${formatNumber(ops.syncing.skus)} SKUs...${ops.syncing.progress ? ` (${formatNumber(ops.syncing.progress.done)} of ${formatNumber(ops.syncing.progress.total)})` : ""}` : "No sync running"}
                  </span>
                </div>
                <Link to={ROUTES.MARKETPLACE_HUB_HEALTH} className={LINK}>
                  View progress →
                </Link>
              </div>

              <div className="flex min-h-[76px] flex-col items-start justify-between rounded-xl border border-[#EAEAEA] bg-white p-3.5 shadow-2xs">
                <div className="flex flex-row items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 stroke-[2px] text-[#16A34A]" aria-hidden />
                  <span className="text-[12px] font-medium text-[#16A34A]">{ops?.lastSuccessAt ? `Inventory synced · ${formatRelativeTime(ops.lastSuccessAt)}` : "No successful sync yet"}</span>
                </div>
                <Link to={ROUTES.MARKETPLACE_HUB_HEALTH} className={LINK}>
                  View sync history →
                </Link>
              </div>

              <div className="flex min-h-[76px] flex-col items-start justify-between rounded-xl border border-[#EAEAEA] bg-white p-3.5 shadow-2xs">
                <div className="flex flex-row items-center gap-2">
                  <AlertTriangle className={cn("h-3.5 w-3.5 stroke-[2px]", ops && ops.requireReview.skus > 0 ? "text-[#D97706]" : "text-[#737373]")} aria-hidden />
                  <span className={cn("text-[12px] font-medium", ops && ops.requireReview.skus > 0 ? "text-[#D97706]" : "text-[#737373]")}>
                    {ops && ops.requireReview.skus > 0 ? `${formatNumber(ops.requireReview.skus)} SKUs require review` : "No SKUs need review"}
                  </span>
                </div>
                {ops && ops.requireReview.skus > 0 && reviewNode ? (
                  <button type="button" onClick={() => open(reviewNode)} className={LINK}>
                    Review SKUs →
                  </button>
                ) : (
                  <Link to={ROUTES.MARKETPLACE_HUB_HEALTH} className={LINK}>
                    Review SKUs →
                  </Link>
                )}
              </div>

              <div className="flex min-h-[76px] flex-col items-start justify-between rounded-xl border border-[#EAEAEA] bg-white p-3.5 shadow-2xs">
                <div className="flex flex-row items-center gap-2">
                  <XCircle className={cn("h-3.5 w-3.5 stroke-[2px]", ops && ops.failed.channels > 0 ? "text-[#DC2626]" : "text-[#737373]")} aria-hidden />
                  <span className={cn("text-[12px] font-medium", ops && ops.failed.channels > 0 ? "text-[#DC2626]" : "text-[#737373]")}>
                    {ops && ops.failed.channels > 0 ? `${ops.failed.channels} ${ops.failed.channels === 1 ? "channel" : "channels"} failed to sync` : "No channel failed to sync"}
                  </span>
                </div>
                {ops && ops.failed.channels > 0 && firstWith("failed") ? (
                  <button type="button" onClick={() => open(firstWith("failed") as ChannelNode)} className={LINK}>
                    View failures →
                  </button>
                ) : (
                  <Link to={ROUTES.MARKETPLACE_HUB_HEALTH} className={LINK}>
                    View failures →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <AffectedDialog key={affected?.id ?? "none"} account={affected} onClose={() => setAffected(null)} />
    </section>
  );
}
